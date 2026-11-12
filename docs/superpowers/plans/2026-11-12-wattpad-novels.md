# Plan — Translated novels from Wattpad

Spec (approved 2026-11-13, revised): `docs/superpowers/specs/2026-11-12-wattpad-novels-design.md`.
Branch `feat/wattpad-novels`, worktree `.claude/worktrees/wattpad-novels`. One PR at the end; Opus reviews the whole
branch once before it goes to the user (no per-task review).

Principle: Wattpad novels ARE Novels. Reuse the existing Novels entities, services, form (`NovelForm`), pages,
publish/render/export and public pages. New code exists only for (a) getting the story and its chapters from Wattpad
and (b) translating a chapter from text.

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
- Existing screenshot-novel behaviour and tests must stay unchanged.

## Task 1 — Wattpad client: parts and part text
Files: `fanfic/WattpadClient.java`, `fanfic/WattpadStory.java` (or new records), new `novel/wattpad/WattpadText.java`,
`pom.xml` (Jsoup, pinned version), tests + fixtures under `src/test/resources/wattpad/`.
- `storyWithParts(storyId)` → story fields already used by Fanfic plus `language.name` and `parts` (id, title,
  wordCount, createDate, modifyDate, deleted) in story order.
- `partText(partId)` → raw HTML from `apiv2/storytext?id=`; if the spike shows paging, loop `&page=2,3…` until empty.
- Spike (real GETs): the longest part of story 396487502 — compare text length with `wordCount`, try `page=2`.
  Record the result in the spec's Feasibility section.
- `WattpadText.toPlain(html)`: `<p>` → paragraphs separated by one blank line; `<br>` → newline; entities decoded;
  images and other tags dropped; trim; collapse 3+ newlines. Scene-break lines (`***`, `* * *`) are kept as their own
  paragraph.
Done when: fixture tests cover parts JSON, short part, `<br>`, entities, `<img>` paragraph, scene break, empty/locked
answer, paging (if any); the real-endpoint finding is written down.

## Task 2 — Flyway V20 + entities + validation
Files: `db/migration/V20__wattpad_novels.sql`, `novel/Novel.java`, `novel/Chapter.java`, new
`novel/NovelSourceType.java`, `NovelRequest`, `NovelValidator`, `NovelDetail`, `ChapterDetail`, `NovelRepository`,
`ChapterRepository`.
- Columns exactly as the spec's Data section: `t_novel.source_type`, `source_language`, `wattpad_story_id` (unique);
  `t_chapter.source_text`, `wattpad_part_id` (unique per novel), `source_fetched_at`. No permission column.
- Request/validator: `sourceType` (default SCREENSHOTS), `sourceLanguage` (th|en, default th), `wattpadStoryId`
  (required for WATTPAD) → field errors in the existing shape. Existing fields (`originalAuthor`, `sourceUrl`, …)
  unchanged.
- DTOs expose the new novel fields and, on chapters, `sourceText`, `wattpadPartId`, `sourceFetchedAt`.
- Finders: `NovelRepository.findByWattpadStoryId`, `ChapterRepository.findByNovelIdAndWattpadPartId`.
Done when: H2 migration test passes; validator tests cover the WATTPAD rules; existing novel tests green.

## Task 3 — Preview and create from Wattpad
Files: `novel/NovelController.java`, `novel/NovelService.java`, new `novel/wattpad/WattpadNovelService.java`,
`web/ApiExceptionHandler.java`.
- `POST /api/novels/wattpad/preview {url}`: reuse `WattpadLink` parsing and the Fanfic error messages; returns title,
  author, description, tags, completed, languageName, guessed `sourceLanguage` (Thai → th, else en), partCount,
  coverUrl, storyUrl, `existingNovelId`.
- Create uses the existing `POST /api/novels` with `sourceType=WATTPAD`, `wattpadStoryId` and the usual fields
  (`originalAuthor` = author, `sourceUrl` = story URL); the cover comes from the story: add an optional
  `coverUrl` handled only for WATTPAD (download via the Fanfic cover path → `MediaService`, filed to
  `novels/covers` by MediaFiler; only Wattpad image hosts accepted). Duplicate `wattpad_story_id` → 409 with a clear
  message.
Done when: tests with a fake client cover preview, existing-novel detection, create with cover, duplicate 409, bad
link, non-Wattpad cover host rejected.

## Task 4 — Parts list, import, reload original, page guard
Files: `novel/wattpad/WattpadNovelService.java`, `novel/ChapterService.java`, `novel/ChapterController.java`,
`novel/NovelController.java`, new `ChapterTextSourceException`, `web/ApiExceptionHandler.java`.
- `GET /api/novels/{id}/wattpad/parts` → parts in story order with `importedChapterId` (null when not imported).
- `POST /api/novels/{id}/wattpad/import {partIds}` → for each selected part in story order: fetch text, create a
  DRAFT chapter through the existing chapter-creation code (next chapter number and sort order, title = part title)
  plus `source_text`, `wattpad_part_id`, `source_fetched_at`; skip already imported; collect per-part failures;
  pause ~500 ms between requests with `fanfic/Sleeper`. Result
  `{imported:[{partId, chapterId}], skipped:[partId], failed:[{partId,title,reason}]}`.
- `POST /api/chapters/{id}/reload-original`: Draft only (`CHAPTER_PUBLISHED` 409 otherwise); refetch and replace
  `source_text`, update `source_fetched_at`; translation untouched.
- Page endpoints (upload, reorder, rotate, delete, per-page text) → 409 `CHAPTER_TEXT_SOURCE` when the chapter has
  `source_text`.
Done when: tests cover ordering, numbering after existing chapters, skip, failure isolation, reload rules, the 409s.

## Task 5 — Translation from text (whole chapter)
Files: new `novel/TextChapterTranslator.java`, new `novel/GeminiTextChapterTranslator.java`, shared Gemini code
extracted from `GeminiChapterTranslator.java` where clean, `novel/ChapterTranslationService.java`, new
`novel/TextSplitter.java`, config property for the pre-split limit in `SubtitleStudioProperties` (default 60,000).
- Default: one Gemini request with the whole `source_text` → whole Vietnamese chapter (`{ "text": "…" }`). Prompt:
  profile, novel title, chapter name, notebook text, `previousText` (same 4,000-char tail), source language named;
  Thai-specific rules only for Thai.
- Cut-off detection per the spec: `finishReason = MAX_TOKENS`, unparseable/truncated JSON, or fewer than ~40% of the
  source's paragraphs in the answer → the translator reports "incomplete" (a typed result/exception, not a failure).
- `TextSplitter`: split in two at the scene break closest to the middle, else the paragraph boundary closest to the
  middle; never inside a paragraph. Recursive halves up to depth 3 (≤ 8 parts), then fail with a clear message.
  Pre-split when the source exceeds the configured limit.
- Later parts carry the tail (~1,500 chars) of the previous part's source and translation as context with a
  "continue seamlessly, do not repeat" instruction.
- Same model list, fallback on 503/429, `onTrying` reporting, status/model/time updates as the page path.
- Thai source: an answer with >30% Thai characters → ask once more (reuse the existing ratio helper).
- Success: `text_vi` = parts joined with a blank line, `edited_after_translation=false`, status TRANSLATED. Failure:
  FAILED with the user message; nothing partial saved. The page (screenshot) path is unchanged.
Done when: tests cover the one-request path, prompt contents for th and en, MAX_TOKENS → split at a scene break,
no scene break → paragraph split, recursion limit, pre-split limit, context carry-over, fallback, Thai retry,
failure, Translate again overwriting an edited text.

## Task 6 — Frontend admin (reusing Novels screens)
Files: `frontend/src/api/novels.ts`, `pages/NovelNewPage.tsx`, `components/novel/NovelForm.tsx`,
`pages/NovelPage.tsx`, `pages/ChapterPage.tsx`, `components/fanfics/FanficMenu.tsx`, co-located CSS, tests.
- New novel: a source choice Screenshots | From Wattpad above the existing `NovelForm`. From Wattpad: link field +
  Fetch (40px, loading, inline errors) → prefill `NovelForm` (title, Original author, description, tags, status,
  Original book link, cover preview from the story); `NovelForm` gains one field, **Source language**
  (Thai/English), shown for Wattpad (default from the preview). `existingNovelId` → message + "Open" link instead
  of Save. `?wattpad=<url>` preselects From Wattpad and auto-fetches. Screenshot flow unchanged.
- Novel page (WATTPAD novels only): a "Wattpad chapters" section — rows with checkbox, title, word count, modify date
  (`formatInstant`), imported badge linking to the chapter; "Select all new"; Import (loading, result toast, failures
  list); "Check for new chapters" reloads. The rest of the page (details, chapter list, notebook…) is unchanged.
- Chapter page with `sourceText`: hide the page grid/upload/rotate; "Original" panel (read-only, language label,
  scrollable, keeps paragraphs) beside the existing "Chapter text" from 760px, stacked below; "Reload original"
  (Draft, confirm dialog). Translate / Translate again (confirm when edited) / Publish exactly as today.
- Fanfic card menu: "Translate this story" → `/novels/new?wattpad=<url>`, or "Open translation" when a novel with
  that Wattpad id exists.
- Public pages: no change (verify the public novel page shows "Truyện gốc" for a Wattpad novel via an existing or
  new test using fixture data).
Done when: tests cover each flow with the fake API; existing screenshot-novel tests stay green.

## Task 7 — Docs, full verification, PR
- Update the spec with the spike finding and any deviations; CLAUDE.md (novel sources, text translation, Wattpad
  endpoints); PROGRESS.md entry.
- Run: `mvn test`, `mvn verify -Poracle -Dskip.npm` (confirm Testcontainers, never the production schema),
  `npx vitest run` (file count check), `npx tsc -b --noEmit`.
- Push; `gh pr create --base main` in English: summary, migration V20, how tested (numbers per suite), deploy notes
  (backup DB before deploy; Publish only after a Wattpad novel has published chapters). Do not merge or deploy.
- Hand back to Opus for the whole-branch review.
