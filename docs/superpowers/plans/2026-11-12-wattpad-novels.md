# Plan — Translated novels from Wattpad

Spec (approved 2026-11-13): `docs/superpowers/specs/2026-11-12-wattpad-novels-design.md`.
Branch `feat/wattpad-novels`, worktree `.claude/worktrees/wattpad-novels`. One PR at the end; Opus reviews the whole
branch once before it goes to the user (no per-task review).

## Rules for every task
- TDD where practical: write or adjust the test first, see it fail, then implement.
- Small commits in English with the session trailers; never `git add -A`; never commit
  `frontend/tsconfig.tsbuildinfo`.
- Backend task done = `mvn test` green. Frontend task done = `npx vitest run` green (file count equals
  `find src -name "*.test.ts*" | wc -l`) and `npx tsc -b --noEmit` clean.
- Never touch the main checkout or the real `./data`; the app at :8080 has real data — GET only.
- Network: only the Task 1 spike calls Wattpad (a few GETs on story 396487502). Gemini is never called for real.
- Conventions (CLAUDE.md): media files only via `MediaStorage.locate`; new `Media` references need a MediaFiler
  rule; admin English, public Vietnamese via `useT()`; mobile-first `min-width`; `lib/dates.ts`; `--z-*`; orange =
  action, purple = state; 44px touch targets on coarse pointers.

## Task 1 — Wattpad client: parts and part text
Files: `fanfic/WattpadClient.java`, `fanfic/WattpadStory.java` (or new records), new `novel/wattpad/WattpadText.java`,
`pom.xml` (Jsoup, pinned version), tests + fixtures under `src/test/resources/wattpad/`.
- `storyWithParts(storyId)` → story fields already used by Fanfic plus `language.name` and `parts` (id, title,
  wordCount, createDate, modifyDate, deleted) in story order.
- `partText(partId)` → raw HTML from `apiv2/storytext?id=`; if the spike shows paging, loop `&page=2,3…` until empty.
- Spike (real GETs): the longest part of story 396487502 — compare text length with `wordCount`, test `page=2`.
  Record the result in the spec's Feasibility section.
- `WattpadText.toPlain(html)`: `<p>` → paragraphs separated by one blank line; `<br>` → newline; entities decoded;
  images and other tags dropped; trim; collapse 3+ newlines.
Done when: fixture tests cover parts JSON, short part, `<br>`, entities, `<img>` paragraph, empty/locked answer,
paging (if any); the real-endpoint finding is written down.

## Task 2 — Flyway V20 + entities + validation
Files: `db/migration/V20__wattpad_novels.sql`, `novel/Novel.java`, `novel/Chapter.java`, new
`novel/NovelSourceType.java`, `NovelRequest`, `NovelValidator`, `NovelDetail`, `NovelSummary`, `ChapterDetail`,
`NovelRepository`, `ChapterRepository`.
- Columns exactly as the spec's Data section (Oracle syntax, existing placeholder style, unique constraints).
- Request/validator: `sourceType`, `sourceLanguage` (th|en, default th), `wattpadStoryId`, `authorPermission`;
  WATTPAD requires `authorPermission=true` and a story id → field errors in the existing shape.
- DTOs expose the new novel fields and, on chapters, `sourceText`, `wattpadPartId`, `sourceFetchedAt`.
- Finders: `NovelRepository.findByWattpadStoryId`, `ChapterRepository.findByNovelIdAndWattpadPartId`.
Done when: H2 migration test passes, validator tests cover the WATTPAD rules, existing novel tests unchanged and green.

## Task 3 — Preview and create from Wattpad
Files: `novel/NovelController.java`, `novel/NovelService.java`, new `novel/wattpad/WattpadNovelService.java`
(preview + create helpers), `web/ApiExceptionHandler.java`.
- `POST /api/novels/wattpad/preview {url}`: reuse `WattpadLink` parsing and the Fanfic error messages; returns title,
  author, description, tags, completed, languageName, guessed `sourceLanguage` (Thai → th, else en), partCount,
  coverUrl, `existingNovelId`.
- Create (existing `POST /api/novels` with `sourceType=WATTPAD`): stores the source fields; downloads the cover via
  the Fanfic cover path → `MediaService` (cover lands in `novels/covers` through MediaFiler); duplicate
  `wattpad_story_id` → 409 with a clear message.
Done when: tests with a fake client cover preview, existing-novel detection, create with cover, duplicate 409, bad link.

## Task 4 — Parts list, import, reload original, page guard
Files: `novel/wattpad/WattpadNovelService.java`, `novel/ChapterService.java`, `novel/ChapterController.java`,
new `ChapterTextSourceException`, `web/ApiExceptionHandler.java`.
- `GET /api/novels/{id}/wattpad/parts` → parts in story order with `importedChapterId` (null when not imported).
- `POST /api/novels/{id}/wattpad/import {partIds}` → for each selected part in story order: fetch text, create a
  DRAFT chapter (next chapter number and sort order, title = part title, `source_text`, `wattpad_part_id`,
  `source_fetched_at`); skip already imported; collect per-part failures; pause ~500 ms between requests with
  `fanfic/Sleeper`. Result `{imported:[{partId, chapterId}], skipped:[partId], failed:[{partId,title,reason}]}`.
- `POST /api/chapters/{id}/reload-original`: Draft only (`CHAPTER_PUBLISHED` 409 otherwise); refetch and replace
  `source_text`, update `source_fetched_at`; translation untouched.
- Page endpoints (upload, reorder, rotate, delete, per-page text) → 409 `CHAPTER_TEXT_SOURCE` when the chapter has
  `source_text`.
Done when: tests cover ordering, numbering after existing chapters, skip, failure isolation, reload rules, the 409s.

## Task 5 — Translation from text
Files: new `novel/TextChapterTranslator.java`, new `novel/GeminiTextChapterTranslator.java`, shared Gemini code
extracted from `GeminiChapterTranslator.java` where it is clean to share, `novel/ChapterTranslationService.java`,
new `novel/TextChunks.java`.
- Chunking: split `source_text` on paragraph boundaries into chunks ≤ 12,000 chars (a single longer paragraph is split
  on sentence ends, then hard-cut as a last resort).
- Prompt per chunk: profile, novel title, chapter name, notebook text, `previousText` (same 4,000-char tail),
  `carryOver` (tail of the previous chunk's translation), source language named (Thai/English); Thai-specific rules
  only for Thai. Answer JSON `{ "text": "…" }`, non-empty.
- Same model list, fallback on 503/429, `onTrying` model reporting, status/model/time updates as the page path.
- Thai source: a chunk answer with >30% Thai characters counts as untranslated → ask that chunk again once (reuse the
  existing ratio helper).
- Success: `text_vi` = chunks joined with a blank line, `edited_after_translation=false`, status TRANSLATED.
  Failure: FAILED with the user message; nothing partial saved.
- The page (screenshot) path is unchanged.
Done when: tests cover chunking edge cases, prompt contents for th and en, multi-chunk carry-over, fallback, Thai
guard retry, failure, Translate again overwriting an edited text (the confirmation is a UI concern).

## Task 6 — Export
Files: `publish/NovelExporter.java`, `publish/PublicNovelDetail.java`, `publish/PublicNovelSummary.java` (if the list
needs it), `frontend/src/data/novelTypes.ts`.
- Add `sourceType`, `originalAuthor`, `sourceUrl`, `authorPermission` where not already exported. Chapter rendering
  and files unchanged (they already use `ChapterText.of`).
Done when: exporter tests assert the fields for a WATTPAD novel and that a screenshot novel's JSON is unchanged apart
from the new fields' defaults.

## Task 7 — Frontend admin
Files: `frontend/src/api/novels.ts`, `pages/NovelNewPage.tsx`, `pages/NovelPage.tsx`, `pages/ChapterPage.tsx`,
`components/fanfics/FanficMenu.tsx`, co-located CSS, tests next to each.
- New novel: source switch Screenshots | From Wattpad (Radix tabs or segmented buttons consistent with the app);
  link field + Fetch (40px, loading, inline errors); prefill; source language Select (Thai/English); permission
  checkbox required for Wattpad; `existingNovelId` → message + "Open" link instead of Save; `?wattpad=<url>`
  preselects and auto-fetches.
- Novel page (WATTPAD only): "Wattpad chapters" section — rows with checkbox, title, word count, modify date
  (`formatInstant`), imported badge linking to the chapter; "Select all new"; Import (loading, result toast, failures
  list); "Check for new chapters" reloads. Screenshot novels unchanged.
- Chapter page with `sourceText`: hide the page grid/upload/rotate; "Original" panel (read-only, language label,
  scrollable, preserves paragraphs) beside "Chapter text" from 760px, stacked below; "Reload original" (Draft,
  confirm dialog). Translate / Translate again (confirm when edited) / Publish as today.
- Fanfic card menu: "Translate this story" → `/novels/new?wattpad=<url>`, or "Open translation" when a novel with
  that Wattpad id exists (from the novels list).
Done when: tests cover each flow with the fake API; existing screenshot-novel tests stay green.

## Task 8 — Frontend public
Files: `pages/public/PublicNovelPage.tsx` (+ CSS, test).
- WATTPAD novels: "Tác giả: {author}", link "Bản gốc trên Wattpad ↗" (new tab, `rel="noopener noreferrer"`), and
  "Đã được tác giả cho phép dịch" when `authorPermission`. Screenshot novels: unchanged.
Done when: tests cover both kinds.

## Task 9 — Docs, full verification, PR
- Update the spec with the spike finding and any deviations; CLAUDE.md (novel sources, text translation, Wattpad
  endpoints); PROGRESS.md entry.
- Run: `mvn test`, `mvn verify -Poracle -Dskip.npm` (confirm Testcontainers, never the production schema),
  `npx vitest run` (file count check), `npx tsc -b --noEmit`.
- Push; `gh pr create --base main` in English: summary, migration V20, how tested (numbers per suite), deploy notes
  (backup DB before deploy; Publish only after a Wattpad novel has published chapters). Do not merge or deploy.
- Hand back to Opus for the whole-branch review.
