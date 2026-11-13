# Wattpad per-chapter Fetch & translate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** New novel › From Wattpad shows the chapter list; the novel's Wattpad tab gets one "Fetch & translate" button per chapter (fetch original + start translation), one chapter at a time per novel.

**Architecture:** The preview reuses the `storyWithParts` call it already makes and returns the parts. A new endpoint fetches one part, saves it as a Draft chapter and calls the existing `ChapterTranslationService.start`, behind a per-novel busy guard. The Wattpad tab loads parts from Wattpad once (and on "Check for new chapters"). Row states come from the novel detail (`chapters[].translationStatus`, `notebookStatus`), which `NovelPage` polls every 3 s while busy. **Polling never calls Wattpad.**

**Tech Stack:** Java 21, Spring Boot 3.5, JUnit 5 + Mockito, MockMvc; React + TS + Vite, Vitest + Testing Library.

**Spec:** [docs/superpowers/specs/2026-11-13-wattpad-per-chapter-fetch-design.md](../specs/2026-11-13-wattpad-per-chapter-fetch-design.md)

## Global Constraints

- Never call Wattpad or Gemini inside a DB transaction; tests never call real Wattpad or Gemini (mocks/stubs only).
- Wattpad is called only on Preview, Parts (tab open / "Check for new chapters"), Import and Fetch & translate, and Reload original. **Polling must use `GET /api/novels/{id}` only.**
- One translation per novel at a time: busy = any chapter of the novel `TRANSLATING` **or** `novel.notebookStatus == UPDATING`.
- Error code for busy: `409 NOVEL_TRANSLATION_BUSY`, message "Another chapter of this novel is still translating, or the notebook is updating."
- Admin UI copy in English (as the rest of the Novels admin): "Fetch & translate", "Translate", "Translating…", "Translated", "Next", "Chapters on Wattpad (N)".
- Brand colours only: orange `--brand` for primary actions, purple `--brand-2` for "Next"/info badges, red only for errors.
- `docs/ui/screen-layout.md` applies to the screens touched.
- Commits and PR in English, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; never stage `data/`.

## Review Focus

- Part already imported and `TRANSLATED` → 409 `CHAPTER_ALREADY_TRANSLATED`, no Wattpad call, no Gemini call (Task 2 test).
- Wattpad fetch OK but `start` throws (e.g. Gemini not configured slipped through) → chapter kept with `NONE`, error returned, row shows "Translate" (Task 2 test + Task 4 test).
- Deleted/empty part → 4xx with the existing Import wording, no chapter created (Task 2 test).
- Double click / second tab: second request while the first is `TRANSLATING` → 409 busy, no second chapter (Task 2 test for busy; frontend disables the button on click, Task 4 test).
- Notebook still `UPDATING` after the previous chapter finished → buttons stay disabled until it is `IDLE`/`FAILED` (Task 4 test). A notebook `FAILED` is not busy.

---

### Task 1: Preview returns the chapter list

**Files:**
- Create: `src/main/java/com/subtitlestudio/novel/wattpad/WattpadPreviewPart.java`
- Modify: `src/main/java/com/subtitlestudio/novel/wattpad/WattpadNovelPreview.java`, `WattpadNovelService.java` (`preview`)
- Test: `src/test/java/com/subtitlestudio/novel/wattpad/WattpadNovelServiceTest.java`, `src/test/java/com/subtitlestudio/novel/NovelControllerTest.java`

**Interfaces:**
- Produces: `record WattpadPreviewPart(String partId, String title, int wordCount, Instant modifiedAt, boolean deleted)`; `WattpadNovelPreview` gets a new last component `List<WattpadPreviewPart> parts` (story order). JSON field `parts`.

- [ ] **Step 1: Failing test** `previewListsThePartsInStoryOrder`: stub `storyWithParts` with 3 parts (one `deleted=true`); assert `preview.parts()` has 3 entries in the same order, ids/titles/wordCount/modifiedAt/deleted copied; assert `wattpad.storyWithParts` was called exactly once and `partText` never.
- [ ] **Step 2:** `mvn test -Dskip.npm -Dtest=WattpadNovelServiceTest` → FAIL (no `parts()`).
- [ ] **Step 3:** Add the record and map `parts.parts()` in `preview()`. Fix every other constructor call of `WattpadNovelPreview` (tests, controller tests).
- [ ] **Step 4:** In `NovelControllerTest` extend the existing preview test (or add `previewIncludesParts`) asserting `$.parts[0].partId`.
- [ ] **Step 5:** `mvn test -Dskip.npm -Dtest='WattpadNovelServiceTest,NovelControllerTest'` → PASS.
- [ ] **Step 6: Commit** `feat: return the Wattpad parts in the novel preview`.

### Task 2: `POST /api/novels/{id}/wattpad/parts/{partId}/fetch-translate`

**Files:**
- Create: `src/main/java/com/subtitlestudio/novel/NovelTranslationBusyException.java`, `src/main/java/com/subtitlestudio/novel/ChapterAlreadyTranslatedException.java`
- Modify: `ChapterTranslationService.java` (extract readiness check), `wattpad/WattpadNovelService.java`, `NovelController.java`, `web/ApiExceptionHandler.java`, `ChapterRepository.java`
- Test: `WattpadNovelServiceTest.java`, `NovelControllerTest.java`, the existing `ChapterTranslationService` test (keep green)

**Interfaces:**
- Consumes: `ChapterService.addFromSource(long novelId, String title, String sourceText, String wattpadPartId, Instant fetchedAt): long`, `ChapterTranslationService.start(long chapterId): ChapterDetail`, `WattpadClient.storyWithParts`, `WattpadClient.partText`, `WattpadText.toPlain`.
- Produces:
  - `ChapterRepository.existsByNovelIdAndTranslationStatus(long novelId, ChapterTranslationStatus status): boolean`
  - `ChapterTranslationService.requireReady(Novel novel): void`: throws `GeminiNotConfiguredException` / `UnknownProfileException` exactly as `start` does today. `start` calls it instead of its inline checks (same behaviour).
  - `WattpadNovelService.fetchAndTranslate(long novelId, String partId): ChapterDetail`
  - `NovelController`: `@PostMapping("/{id}/wattpad/parts/{partId}/fetch-translate") @ResponseStatus(ACCEPTED)` → `ChapterDetail`
  - `ApiExceptionHandler`: `NovelTranslationBusyException` → 409 `NOVEL_TRANSLATION_BUSY`; `ChapterAlreadyTranslatedException` → 409 `CHAPTER_ALREADY_TRANSLATED` ("This chapter is already translated. Use Translate again on the chapter page.").

`fetchAndTranslate` order (no `@Transactional` on the method; Wattpad calls outside any transaction, like `importParts`):
1. `wattpadStoryOf(novelId)` (existing: 404 / not-Wattpad errors).
2. Busy: `existsByNovelIdAndTranslationStatus(novelId, TRANSLATING)` or the novel's `notebookStatus == UPDATING` → throw `NovelTranslationBusyException`.
3. `translation.requireReady(novel)`.
4. Already imported (`chapters.findByNovelIdAndWattpadPartId`): `TRANSLATED` → `ChapterAlreadyTranslatedException`; otherwise `return translation.start(chapter.getId())` (no Wattpad call).
5. Find the part in `storyWithParts(storyId).parts()`: missing → the existing "This part is not in the story." error as a 404/400 (reuse an existing exception if one fits; otherwise create `WattpadPartNotFoundException` → 404 `WATTPAD_PART_NOT_FOUND`); `deleted` → 409 `WATTPAD_PART_DELETED` "This part was deleted on Wattpad."; empty text → 409 `WATTPAD_PART_EMPTY` with the existing `NO_TEXT` wording. `WattpadUnavailableException` propagates (existing 502 handler).
6. `addFromSource(...)` then `translation.start(chapterId)`. If `start` throws, let it propagate; the chapter stays (status `NONE`).

- [ ] **Step 1: Failing tests** in `WattpadNovelServiceTest` (inject a mocked `ChapterTranslationService`; add it to the constructor):
  - `fetchAndTranslateImportsThenStarts`: not imported → `partText` called once, `addFromSource` with the part's title/plain text/partId, then `start(newId)`; returns `start`'s result.
  - `fetchAndTranslateRefusesWhileAChapterIsTranslating`: `existsBy…(TRANSLATING)` true → `NovelTranslationBusyException`; `verifyNoInteractions` on `partText`, `addFromSource`, `start`.
  - `fetchAndTranslateRefusesWhileNotebookUpdates`: notebook `UPDATING` → busy, same verifies. Notebook `FAILED` → not busy (proceeds).
  - `fetchAndTranslateChecksReadinessBeforeFetching`: `requireReady` throws `GeminiNotConfiguredException` → propagates, no `partText`, no `addFromSource`.
  - `fetchAndTranslateOnImportedChapterOnlyTranslates`: imported with `NONE` and with `FAILED` → `start(existingId)`, no `partText`.
  - `fetchAndTranslateRefusesTranslatedChapter`: imported `TRANSLATED` → `ChapterAlreadyTranslatedException`, no `start`.
  - `fetchAndTranslateDeletedOrEmptyPart`: deleted → `WATTPAD_PART_DELETED` exception, empty text → `WATTPAD_PART_EMPTY` exception; `addFromSource` never called.
  - `fetchAndTranslateKeepsChapterWhenStartFails`: `start` throws → exception propagates, `addFromSource` was called once (chapter kept).
- [ ] **Step 2:** run `mvn test -Dskip.npm -Dtest=WattpadNovelServiceTest` → FAIL.
- [ ] **Step 3:** implement repository method, exceptions, `requireReady` extraction, `fetchAndTranslate`, controller endpoint, handler mappings.
- [ ] **Step 4:** `NovelControllerTest`: `fetchTranslateReturns202` (`$.translationStatus` = `TRANSLATING`), `fetchTranslateBusyIs409` (`$.code` = `NOVEL_TRANSLATION_BUSY`, matching how other tests read the problem code).
- [ ] **Step 5:** `mvn test -Dskip.npm` (whole backend) → PASS. Report the counts.
- [ ] **Step 6: Commit** `feat: fetch and translate one Wattpad part per request, one at a time per novel`.

### Task 3: Frontend API and errors

**Files:**
- Modify: `frontend/src/api/novels.ts`, `frontend/src/lib/errors.ts`
- Test: `frontend/src/lib/errors.test.ts` (or the existing errors test file)

**Interfaces:**
- Produces:
  - `export interface WattpadPreviewPart { partId: string; title: string; wordCount: number; modifiedAt: string | null; deleted: boolean }`; `WattpadNovelPreview.parts: WattpadPreviewPart[]`
  - `export async function fetchAndTranslateWattpadPart(novelId: number, partId: string): Promise<ChapterDetail>`: `POST /api/novels/${novelId}/wattpad/parts/${encodeURIComponent(partId)}/fetch-translate`
  - `errorMessage` cases: `NOVEL_TRANSLATION_BUSY` → title "Another chapter is still translating", hint "Wait for it (and the notebook update) to finish."; `CHAPTER_ALREADY_TRANSLATED`, `WATTPAD_PART_DELETED`, `WATTPAD_PART_EMPTY`, `WATTPAD_PART_NOT_FOUND` with the backend wording.
- `importWattpadParts` stays exported (unused by UI after Task 4; remove only if nothing imports it).

- [ ] **Step 1:** failing test: `errorMessage` of an `ApiError` with code `NOVEL_TRANSLATION_BUSY` returns the title above.
- [ ] **Step 2:** `cd frontend && npx vitest run src/lib` → FAIL.
- [ ] **Step 3:** implement.
- [ ] **Step 4:** same command → PASS.
- [ ] **Step 5: Commit** `feat: client for per-chapter Wattpad fetch and translate`.

### Task 4: Wattpad tab with per-row actions and polling

**Files:**
- Modify: `frontend/src/components/novel/WattpadParts.tsx`, `WattpadParts.css`, `frontend/src/pages/NovelPage.tsx`
- Create: `frontend/src/lib/useNovelPolling.ts`
- Test: `frontend/src/components/novel/WattpadParts.test.tsx` (rewrite for the new behaviour)

**Interfaces:**
- Consumes: `listWattpadParts`, `fetchAndTranslateWattpadPart`, `NovelDetail` (`chapters[].id/translationStatus`, `notebookStatus`), `POLL_INTERVAL_MS` from `lib/useTranslationPolling.ts`.
- Produces:
  - `useNovelPolling(novelId: number, active: boolean, onUpdate: (n: NovelDetail) => void): void`: `getNovel` every `POLL_INTERVAL_MS` while `active` (same shape as `useChapterPolling`; errors ignored until the next tick).
  - `WattpadParts({ novel, onChanged }: { novel: NovelDetail; onChanged: () => void })`. `NovelPage` passes its `novel` and `reloadNovel`. `NovelPage` calls `useNovelPolling(novelId, busy, setNovel)` with `busy = novel.chapters.some(c => c.translationStatus === 'TRANSLATING') || novel.notebookStatus === 'UPDATING'` (polls on every tab, so the chapter list updates too).

Behaviour:
- Remove the checkboxes, "Select all new" and Import. Keep "Check for new chapters" and the parts list (title, words, date, Deleted badge).
- Row state from `importedChapterId` → the matching `novel.chapters` entry:
  - not imported, not deleted → button **Fetch & translate**
  - imported `NONE`/`FAILED` → button **Translate** (FAILED also shows the existing failed badge style)
  - `TRANSLATING` → text "Translating…" (no button)
  - `TRANSLATED` → badge **Translated** linking to `/novels/{id}/chapters/{chapterId}`
- "Next" = the first non-deleted part in story order whose state is not `TRANSLATED`. Its button is `button--primary` and it shows a purple "Next" badge; other buttons are plain `button button--s`.
- All buttons are disabled while busy (same `busy` rule) and while a click's request is pending.
- Clicking a row that is after an untranslated, non-deleted part opens a confirm (`window.confirm` is acceptable if the codebase already uses it; otherwise the existing confirm dialog component): "<Next title> is not translated yet. The notebook will not know about it. Translate <this title> anyway?". Cancel → no request.
- Success: `toast.success("Translating <title>…")`, then `onChanged()` and reload parts (to get the new `importedChapterId`). Error: `toast.error` with `errorMessage(e).title` (busy uses the Task 3 copy).

- [ ] **Step 1: Failing tests** (mock `api/novels`):
  - `showsFetchAndTranslateForNewParts`, `marksTheFirstUntranslatedPartAsNext`
  - `fetchAndTranslateCallsApiAndRefreshes`: click → `fetchAndTranslateWattpadPart(novelId, partId)` called once, `onChanged` called; the button is disabled while pending (double click → 1 call).
  - `disablesAllButtonsWhileAChapterTranslates` and `…whileNotebookUpdates`; `notebookFailedIsNotBusy`.
  - `asksBeforeTranslatingOutOfOrder`: cancel → no API call; confirm → API called.
  - `importedNoneShowsTranslate`, `translatedShowsLinkBadge`.
  - `keepsChapterRowAfterStartFailure`: API rejects → error toast, row (after `onChanged` with a `NONE` chapter) shows "Translate".
- [ ] **Step 2:** `cd frontend && npx vitest run src/components/novel/WattpadParts.test.tsx` → FAIL.
- [ ] **Step 3:** implement `useNovelPolling`, `WattpadParts`, `NovelPage` wiring, CSS (follow `screen-layout.md`; buttons wrap under the title on phones; no overflow at 390px).
- [ ] **Step 4:** same command → PASS; then `npx vitest run src/pages/NovelPage*` → PASS.
- [ ] **Step 5: Commit** `feat: fetch and translate Wattpad chapters one by one from the Wattpad tab`.

### Task 5: Chapter list on New novel › From Wattpad

**Files:**
- Create: `frontend/src/components/novel/WattpadPreviewParts.tsx`, `WattpadPreviewParts.css`
- Modify: `frontend/src/pages/NovelNewPage.tsx`
- Test: `frontend/src/components/novel/WattpadPreviewParts.test.tsx`

**Interfaces:**
- Consumes: `WattpadPreviewPart[]` (Task 3).
- Produces: `WattpadPreviewParts({ parts }: { parts: WattpadPreviewPart[] })`: read-only section, heading "Chapters on Wattpad (N)", hint "Create the novel, then fetch and translate chapters one by one in the Wattpad tab.", rows with title, `wordCount.toLocaleString('en-US')` words, `formatInstant(modifiedAt)`; deleted parts muted with a "Deleted" badge. No buttons, no checkboxes. Empty list → "Wattpad lists no parts for this story."
- `NovelNewPage` renders it under the `NovelForm` when `preview && preview.existingNovelId == null`, and keeps navigating to `/novels/{id}?tab=wattpad` after Create.

- [ ] **Step 1:** failing tests: `listsPartsReadOnly` (3 rows, no buttons/checkboxes, heading count 3), `marksDeletedParts`, `emptyList`.
- [ ] **Step 2:** `npx vitest run src/components/novel/WattpadPreviewParts.test.tsx` → FAIL.
- [ ] **Step 3:** implement and wire into `NovelNewPage`.
- [ ] **Step 4:** PASS; then `npm test` (full) and `npm run build` → PASS. Report counts.
- [ ] **Step 5: Commit** `feat: show the Wattpad chapter list on New novel`.

### Task 6: Docs, PR

**Files:** `CLAUDE.md` (the "Truyện từ Wattpad" bullet: new endpoint, busy rule, polling uses `GET /api/novels/{id}` only, Import no longer in the UI), `PROGRESS.md` (new entry, Vietnamese with full diacritics), spec status line → "approved 2026-11-13".

- [ ] **Step 1:** update the docs.
- [ ] **Step 2:** `mvn test -Dskip.npm` and `cd frontend && npm test && npm run build` → all PASS.
- [ ] **Step 3: Commit** `docs: per-chapter Wattpad fetch and translate`, push `feat/wattpad-per-chapter`, `gh pr create --base main` (summary, how to test with exact results, links to spec and plan, body ends with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`). Do not merge.
