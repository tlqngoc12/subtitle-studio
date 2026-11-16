# Wattpad Chapter Images Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep images of Wattpad chapters in place: fetch them, translate the story text inside them, show them in the editor and on the public site, and fetch image-only chapters.

**Architecture:**
- Each image becomes a marker paragraph `[[image:<mediaId>]]` inside `source_text`, `ai_text` and `text_vi`.
- A new table `t_chapter_image` owns the media, so the media garbage collector keeps it. The table also maps the Wattpad URL to the media, so reloads reuse it.
- The text translator sends the images inline with the text.
- The renderer splits at markers.

**Tech Stack:** Spring Boot / JPA / Flyway (Oracle + H2), jsoup, google-genai, Java2D renderer, React + vitest.

**Spec:** `docs/superpowers/specs/2026-11-16-wattpad-chapter-images-design.md`

## Global Constraints

- **Marker format** (exact): a paragraph consisting only of `[[image:<digits>]]`. Regex: `^\[\[image:(\d+)]]$` on the trimmed paragraph.
- **Text-only chapters:** their fetch output, translation request (no image parts), validation and rendering do not change.
- **Image hosts:** only `https` on `wattpad.com` / `*.wattpad.com`. Reuse the host rule of `WattpadNovelService.requireWattpadImageHost`.
- **Size caps:** max image size 10 MB (`novel.max-page-image-size`), resized to a long side of at most 1600 px before going to Gemini, at most 20 images per Gemini request.
- **Error code** for a bad marker set on save: `CHAPTER_IMAGE_MARKERS` (400).
- **Migration:** `V25__chapter_image.sql`, with Oracle + H2 placeholders like the other migrations.
- **Language and attribution:** commits and the PR in English, ending with the Co-Authored-By line. No test deleted or weakened.

## Review Focus

1. **Media garbage collection.** `MediaService.cleanUpOnStartup` deletes media no table references. Chapter images must survive a restart. Test: an image older than `ABANDONED_AFTER` that is referenced by `t_chapter_image` is not returned by `findUnreferencedCreatedBefore`, and `isReferenced` is true.
2. **Reload original on a chapter with images.** The same image URL reuses the same media id, so markers in an existing `text_vi` stay valid. An image removed from Wattpad is unlinked, and its media is deleted if unreferenced.
3. **Deleting a chapter or a novel** removes its `t_chapter_image` rows and deletes the media if it is unreferenced, the same way pages are handled today.
4. **A long chapter with images split into parts** (`max-source-chars`). Each part sends only the images whose markers it contains, and the split never separates a marker from the translated text that follows it. Splitting happens on the source, where markers stand alone, so it is enough that the splitter treats a marker as an ordinary paragraph.
5. **The translator types a marker by hand, or changes a digit.** Save rejects it with `CHAPTER_IMAGE_MARKERS`, and the textarea content is kept unsaved on the client, as with other save errors.

---

### Task 1: Storage: `t_chapter_image` + marker helper + GC awareness

**Files:**
- Create: `src/main/resources/db/migration/V25__chapter_image.sql`. Table `t_chapter_image`:
  - `id` (identity, the same style as other tables);
  - `chapter_id` (FK to `t_chapter`, on delete cascade);
  - `media_id` (FK to `t_media`);
  - `source_url` `VARCHAR2(1000)`;
  - `position` `${int}`;
  - unique `(chapter_id, source_url)`.
- Create: `src/main/java/com/subtitlestudio/novel/ChapterImage.java` (entity) and `ChapterImageRepository.java`.
- Create: `src/main/java/com/subtitlestudio/novel/ImageMarkers.java`:
  - `static String marker(long mediaId)`
  - `static OptionalLong mediaId(String paragraph)`
  - `static List<Long> ids(String text)`, in order
  - `static String strip(String text)`, which removes marker paragraphs and collapses the blank lines left behind
- Modify: `src/main/java/com/subtitlestudio/profile/MediaRepository.java`. Add `isUsedByChapterImage`, include it in `isReferenced`, and add `not exists (select ci from ChapterImage ci where ci.media = m)` to `findUnreferencedCreatedBefore`.
- Modify: `ChapterService.delete` and the novel delete path in `NovelService`, to collect chapter image media ids and call `mediaService.deleteIfUnreferenced`, like pages.
- Tests: `ImageMarkersTest`, `MediaRepository` test (Review Focus 1), `ChapterServiceTest` delete case (Review Focus 3), and `PersistenceOracleIT` (the table exists and cascade works).

- [ ] **Step 1: Write the failing tests.**
  - `ImageMarkersTest`:
    - `marker(42)` → `[[image:42]]`;
    - `mediaId("  [[image:42]] ")` → 42;
    - `mediaId("see [[image:42]]")` → empty;
    - `ids("a\n\n[[image:1]]\n\nb\n\n[[image:2]]")` → `[1, 2]`;
    - `strip` of that text → `"a\n\nb"`.
  - Media GC test as in Review Focus 1.
  - Delete test as in Review Focus 3.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `mvn test`, and the Oracle IT with `mvn verify -Poracle -Dskip.npm`. Expected: pass.
- [ ] **Step 5:** Commit `feat: chapter image table and image markers`.

### Task 2: Fetch keeps images

**Files:**
- Modify: `src/main/java/com/subtitlestudio/novel/wattpad/WattpadText.java`. Add `static Parsed parse(String html)` returning `record Parsed(String text, List<String> imageUrls)`. `text` holds a placeholder paragraph `[[image-url:<index>]]` at each `<img>` position:
  - `<img>` inside a block becomes its own paragraph, splitting the surrounding text if needed;
  - an `<img>` without `src` is ignored.

  `toPlain` stays, as `parse(html).text()` with the placeholders removed, for any caller that must not change.
- Modify: `src/main/java/com/subtitlestudio/fanfic/WattpadClient.java`. Add `byte[] downloadImage(String url)`: Wattpad host only, at most 10 MB, image content check through `ImageSniffer`.
- Modify: `src/main/java/com/subtitlestudio/novel/wattpad/WattpadNovelService.java`. Change all three paths that call `toPlain` today (import ~186, reload ~213, fetch-next ~294):
  1. Call `parse`.
  2. For each URL: if this chapter already has a `ChapterImage` with that `source_url`, reuse its media. Otherwise download and `mediaService.store`.
  3. Replace each placeholder with `ImageMarkers.marker(mediaId)`. A failed download in a chapter that also has text removes that placeholder and increments `skippedImages`.
  4. A chapter whose text after this has no non-marker text and no markers → `EMPTY`, as today. An image-only chapter where every download failed → a new `WattpadPartProblemException` reason `IMAGES_FAILED`, with the message "Wattpad images for this part could not be downloaded."
  5. Save the `ChapterImage` rows (positions in marker order).
  6. On reload, delete rows whose URL is gone and `deleteIfUnreferenced` their media (Review Focus 2).
- Modify: the fetch and import result DTOs, adding `int skippedImages` (default 0) so the UI can say "N image(s) could not be downloaded". Frontend: show it in the existing success toast when it is above 0.
- Tests:
  - `WattpadTextTest`:
    - a fixture `wattpad-part-1631821143.html` containing the real 4 `<p data-media-type="image">` elements (copy the real response, but shorten the `src` values) → 4 placeholders and 4 URLs, no other text;
    - a mixed fixture (text, image, text) → the placeholder sits between the 2 paragraphs.
  - `WattpadNovelServiceTest`:
    - an image-only part is created with 4 markers and 4 `ChapterImage` rows;
    - a mixed part with 1 failed download gives `skippedImages` 1 and no placeholder left;
    - an image-only part with all downloads failing → `IMAGES_FAILED`;
    - reload reuses the media id for the same URL;
    - a non-Wattpad image host is never downloaded.

- [ ] **Step 1:** Write the failing tests above.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `mvn test`. Expected: pass, and the existing Wattpad tests are unchanged.
- [ ] **Step 5:** Commit `feat: keep images when fetching Wattpad chapters`.

### Task 3: Translation sends images, keeps markers

**Files:**
- Modify: `TextChapterPrompt`, adding `List<PromptImage> images` (`record PromptImage(long mediaId, String mimeType, byte[] bytes)`, already resized), empty for text-only chapters.
- Modify: `ChapterTranslationService`, where it builds the text prompt for each part:
  - collect `ImageMarkers.ids(partSource)` and load each media resized to 1600 px (through `MediaService`/`ImageResizer`);
  - if there are more than 20, fail with `TranslationFailedException` "This chapter part has more than 20 images.";
  - strip markers from `previousText` (`ImageMarkers.strip`).
- Modify: `GeminiTextChapterTranslator`:
  - When `images` is not empty, add after the source text, for each image, `Part.fromText("Ảnh " + marker + ":")` followed by `Part.fromBytes(bytes, mimeType)`.
  - Add the image rules to `SYSTEM_RULES`, only when images are present (otherwise the prompt is byte-identical to today):
    - copy every `[[image:N]]` line unchanged in place;
    - after a marker, translate only the story text inside that image (descriptions, messages, letters), not logos or the book title;
    - nothing after the marker when the image has no such text.
  - Validation:
    - compute `sourceParagraphs` and `sourceChars` on `ImageMarkers.strip(source)`;
    - skip the share, ratio and ending checks when the stripped source is blank;
    - add the check `ImageMarkers.ids(answer).equals(ImageMarkers.ids(source))`, which otherwise throws `TextIncompleteException("Gemini's answer lost an image.")`.
- Modify: `NotebookService` input and `NovelProfileAnalyzer` / `NovelCorrections` input: pass texts through `ImageMarkers.strip`.
- Tests: `GeminiTextChapterTranslatorTest`.
  - `image_parts_follow_the_text_in_marker_order`.
  - `text_only_prompt_is_unchanged`: compare the system instruction and parts with a golden string taken from the current code before the change.
  - `answer_missing_a_marker_is_incomplete`.
  - `image_only_source_passes_validation`: the source is 4 markers, and the answer is 4 markers plus text after 3 of them.
  - `ChapterTranslationServiceTest`: more than 20 images fails clearly; `previousText` has no markers.

- [ ] **Step 1:** Write the failing tests above. Capture the golden text-only prompt from `main` first.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `mvn test`. Expected: pass.
- [ ] **Step 5:** Commit `feat: translate text inside Wattpad chapter images`.

### Task 4: Save guard

**Files:**
- Modify: `ChapterService.update`. When the request changes `textVi` and the chapter has `ChapterImage` rows or `source_text` markers, `ImageMarkers.ids(textVi)` must contain exactly the chapter's image media ids:
  - the same multiset;
  - order free, since the translator may move an image.

  Otherwise throw `ChapterImageMarkersException` → 400 `CHAPTER_IMAGE_MARKERS`, with the detail "Keep every [[image:…]] line of this chapter unchanged."
- Modify: the error advice for novels (`web/NovelErrors.java`, after the PR #39 split) and the frontend error messages map (`frontend/src/lib/errors.ts` or wherever codes map to Vietnamese text). The message is "Giữ nguyên mọi dòng [[image:…]] của chương này."
- Tests:
  - `ChapterServiceTest`: a removed marker → exception; an unknown id → exception; a moved marker → ok; a chapter without images → no check.
  - Controller test: 400 and the code.
  - `ApiErrorMappingTest`: add the new case.

- [ ] **Steps 1–5:** failing tests, then implement, then run `mvn test` and `npx vitest run`, then commit `feat: refuse chapter saves that drop image markers`.

### Task 5: Editor: images in the original panel, marker-aware alignment

**Files:**
- Modify: `frontend/src/lib/chapterText.ts`. Add `export function imageMarkerId(paragraph: string): number | null` (same regex) and `export function alignParagraph(source: string[], translated: string[], index: number): number`.
  - Markers are anchors. Paragraphs between two anchors map by offset within that segment, clamped to the segment.
  - Any translated paragraphs right after a marker that the source does not have (the image text) map to the marker's own index. The image segment in the source is just the marker, so translated paragraphs before the next source paragraph count from the source's next paragraph backwards.
  - Algorithm: walk both lists by segment (between markers). Within a segment of `s` source and `t` translated paragraphs, translated offset `k` maps to `min(k, s - 1)` when `s > 0`. If `s == 0` (only image text), it maps to the marker before it.
- Modify: `frontend/src/components/novel/OriginalPanel.tsx`. A paragraph that is a marker renders `<img src="/api/media/<id>" alt="Ảnh trong chương" loading="lazy" class="chapter-original__img">` instead of text. It is still a `<p>` wrapper, so indices stay the same.
- Modify: `frontend/src/components/chapter/ChapterTextEditor.tsx` (or the hook that computes `activeParagraph`) to use `alignParagraph`.
- CSS: `.chapter-original__img { display:block; max-width:100%; height:auto; border-radius: var(--radius-control); }`.
- Tests:
  - `chapterText.test.ts`, `alignParagraph` cases:
    - no markers: identity, clamped;
    - `[A, M1, B]` vs `[a, M1, x, y, b]`: `x` and `y` map to M1's index, `b` maps to B;
    - an image-only chapter.
  - `OriginalPanel.test.tsx`: a marker paragraph renders an `img` with that src, and the active highlight still works on it.

- [ ] **Steps 1–5:** failing tests, then implement, then run `npx vitest run` and `npm run build`, then commit `feat: show chapter images in the original panel`.

### Task 6: Public render inserts images

**Files:**
- Modify: `src/main/java/com/subtitlestudio/novel/render/RenderInput.java`. Add `Function<Long, BufferedImage> images`. It may return null for a missing image; the renderer then skips that marker and logs a warning.
- Modify: `NovelRenderer.render`. When a paragraph is a marker:
  1. End the current page if it has lines.
  2. Emit one page that is the image scaled to `format.width()` (keep the aspect ratio; the height is the scaled height, not `format.height()`), with the same watermark call as text pages.
  3. Continue the text on a new page.

  A chapter without markers renders byte-identically to today.
- Modify: `RenderCache`, so the cache hash covers the input text, which already includes the marker ids. Images are immutable per id, so no extra hashing is needed. Confirm this and leave a comment.
- Modify: `publish/NovelExporter.java` (~line 101). Pass `id -> mediaService.loadImage(id)`. Add the `MediaService.loadImage(long)` helper if it is missing; it reads with `ImageIO`, which supports WebP through `webp-imageio`.
- Tests: `NovelRendererTest`.
  - `text_image_text_renders_in_order`: 3+ images, the middle one with the image's width scaled to the format width.
  - `no_marker_output_unchanged`: compare the page count and pixel hash with the current output, on a fixture text.
  - `missing_image_is_skipped`.

- [ ] **Steps 1–5:** failing tests, then implement, then run `mvn test`, then commit `feat: draw Wattpad chapter images on the public site`.

### Wrap-up
- [ ] **Full checks:**
  - `mvn test` (report the final `Tests run` line);
  - `mvn verify -Poracle -Dskip.npm`;
  - `cd frontend && npx vitest run && npm run build && npm run build -- --mode public`.
- [ ] **Numstat:** `git diff --numstat origin/main` on test files shows no lost tests.
- [ ] **Manual check** (without touching the running Docker app or its data):
  1. Start the app from the branch on another port (`--server.port=8090`) with the H2 dev profile and a scratch data dir (`SUBTITLESTUDIO_DATADIR=<scratch>`).
  2. Create a Wattpad novel for story *Room 520 "I Love You"*, then import or fetch part 1631821143. Expect 4 images in the original panel.
  3. If `GEMINI_API_KEY` is available in the environment, translate it, and confirm the 3 character cards get Vietnamese text below the markers. If not, say so.
  4. Export or render it once, and confirm the image order.
  5. Report the screenshots you can take, or describe what you saw.
- [ ] **Docs and PR:** add a `PROGRESS.md` entry and a `CLAUDE.md` note about the marker format and `t_chapter_image`. Then push branch `feat/wattpad-chapter-images` and run `gh pr create --base main`, linking the spec and plan. Do not merge.
