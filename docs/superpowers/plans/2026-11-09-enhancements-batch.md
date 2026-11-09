# Enhancements batch (Vietsub search, autoplay, Novels save/order/model) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eight user-requested enhancements, approved in chat on 2026-11-09 (scope table copied below).

**Architecture:** Mostly frontend (`frontend/src`, React + TS). Backend (`com.subtitlestudio`) changes: a chapter reading order (`t_chapter.sort_order`) separate from `chapter_no`, and the Gemini model that is translating / translated (Novels and Vietsub) via a listener on `GeminiCaller` plus stored columns. One Flyway file **V9** holds every schema change of this batch.

**Tech Stack:** Spring Boot / JPA / Flyway (Oracle + H2 MODE=Oracle), React + Vite + Vitest + Testing Library, lucide-react, sonner (`toast`), Radix `Tip`, dnd-kit (already used by playlists), YouTube IFrame API.

**Spec (approved scope):**

| # | Where | Change |
|---|---|---|
| 1 | Vietsub › Videos (`VietsubPage` + `VietsubList`, "Manage Vietsub") | Search box like Vietsub list (accent-insensitive via `lib/search.ts` `matchesSearch`, title/channel); filter chips **All · AI · Manual**; sort **AI first, then Manual; inside each group newest `viUpdatedAt` first**; pagination after filtering; `q` and `source` (`ai`/`manual`) kept in the URL. |
| 2 | Vietsub › Videos rows | Remove the **Watch Video** button (row click still opens the watch page). `VideoList` (Get Engsub) keeps its button. |
| 3 | Watch page in a playlist | Bug: next video loads but does not play (Edge and Safari). Cause: the player is destroyed and a new iframe created per video; the new iframe has no user activation so unmuted autoplay is blocked. Fix: keep one `YT.Player` per container and switch with `loadVideoById(id)` (autoplay wanted) or `cueVideoById(id)` (not wanted). Page fullscreen must stay on. |
| 4 | Novels › chapter page and novel info form | After Save: toast `Chapter saved` / `Novel saved`. Chapter page: **Ctrl+S / ⌘S** saves (preventDefault); auto-save every **3 minutes** while there are unsaved changes (toast `Auto-saved`); skipped while translating, locked or invalid. |
| 5 | Novels › chapter, fields Order / Chapter label | Remove the hint lines under the inputs; put an info icon (lucide `Info`) next to each label with a `Tip`. Rename "Order" to **"Number"**. Tooltips: Number = `The chapter's link number. Drag chapters in the list to change the reading order.`; Label = `Shown instead of the number, e.g. Ngoại truyện 1, Special.` |
| 6 | Novels › chapter, Chapter title | Number + Label share one compact row; **Title gets its own full-width row**. |
| 7 | Novels › novel › Chapters tab | Drag and drop (dnd-kit, like the playlist edit page) plus **↑ / ↓** buttons per row. Stored in `t_chapter.sort_order`; `chapter_no` never changes when reordering, so Published chapters, public links and the notebook stay valid. New chapters go last. Chapter list, Previous/Next and the public site follow `sort_order`. Notebook versions and the "previous chapter" text sent to Gemini keep using `chapter_no`. |
| 8 | Novels › chapter + Get Engsub › Vietsub | While translating: `Translating with <model>…`, updated as soon as a fallback model is tried. After: `Translated by <model>` stored in DB (`t_chapter.translation_model`, `video.translation_model`). Chapter list row: `Tip` with the model. Old data: nothing shown. |

## Global Constraints

- Work on the existing branch `feature/novel-page-checks` (do not create another). Do not merge, push or deploy; do not touch Docker/Oracle.
- One migration file: `src/main/resources/db/migration/V9__chapter_order_and_translation_model.sql` (V8 exists). Must run on Oracle and H2 MODE=Oracle. Backfill `sort_order = chapter_no` then make it NOT NULL. Use the `${int}` placeholder like V5.
- UI copy English; brand colors orange `#F39A42` / purple `#D9A1D9`, red only for errors/delete; icons only from `lucide-react`; toasts via `sonner` (existing `AppToaster`).
- Multiple models used in one chapter run (batches) → store the distinct models in order of use joined by `, `.
- Tests: `mvn test -Dskip.npm`; `cd frontend && npx vitest run`; typecheck `npx tsc -b --noEmit` — never stage `frontend/tsconfig.tsbuildinfo`; stage by path, never `git add -A`.
- Commit per task; messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Reorder request missing a chapter id, with a duplicate, or with an id of another novel → 400, nothing changed — test in Task 3.
2. Chapter added after a reorder → appears last (`sort_order = max + 1`), even when its `chapter_no` is smaller than others — test in Task 3.
3. Auto-save timer firing while a translation started from another tab (chapter `TRANSLATING`) or with an invalid number → no request sent — test in Task 2.
4. Autoplay off in a playlist → next video is cued, not played; first video opened without `state.autoplay` does not play — test in Task 1.
5. Translation failing on every model → stored `translation_model` unchanged from before, active model cleared (no stale "Translating with …") — test in Task 4.

---

### Task 1: Vietsub search/filter/sort, no Watch button, autoplay fix (frontend only)

**Files:** Modify `frontend/src/pages/VietsubPage.tsx`, `frontend/src/components/VietsubList.tsx`, `frontend/src/lib/vietsub.ts`, `frontend/src/player/useYouTubePlayer.ts`, `frontend/src/player/youtube.ts` (add `loadVideoById(id: string): void; cueVideoById(id: string): void` to `YTPlayer`). Tests: `VietsubPage.test.tsx`, `lib/vietsub.test.ts` (create if missing), the existing `useYouTubePlayer` / `WatchPage` tests.

**Interfaces — Produces:** `sortVietsub<T extends { viSource: 'AUTO' | 'MANUAL' | null; viUpdatedAt: string | null }>(videos: T[]): T[]` in `lib/vietsub.ts` (AUTO first, then MANUAL, newest first inside each); `withVietsub` keeps filtering `viCueCount > 0` and uses `sortVietsub`.

- [ ] **Step 1: Failing tests:** `sortVietsub` orders `[M new, A old, A new, M old]` → `[A new, A old, M new, M old]`; Vietsub page: typing `cafe` matches title `Café`; chip `AI` hides MANUAL rows; `?q=x&source=manual` restores both; no element with accessible name starting `Watch Video` in Manage Vietsub; `useYouTubePlayer`: changing `videoId` with autoplay true calls `loadVideoById(newId)` on the same player (constructor called once), with autoplay false calls `cueVideoById(newId)`; first mount without autoplay passes `autoplay: 0`.
- [ ] **Step 2: Run** `npx vitest run` → new tests FAIL.
- [ ] **Step 3: Implement.** Search/chips reuse the `.searchbar` markup and the tab/chip styles already in `VietsubListPage`. In `useYouTubePlayer`, create the player once per container (effect on `[container]`), keep the current id in a ref; a second effect on `[videoId]` calls `loadVideoById`/`cueVideoById` when the player is ready (if not ready yet, the constructor's `videoId` is used), resets `currentMs`, sets state `loading` and `stateFor` as today. Destroy only on unmount.
- [ ] **Step 4: Run** vitest + tsc → PASS.
- [ ] **Step 5: Commit** `feat(vietsub): search, AI/Manual filter and sort in Manage Vietsub; drop its Watch button; playlist autoplay keeps one player`.

### Task 2: Novels chapter page — toasts, Ctrl+S, auto-save, tooltips, wide title (frontend only)

**Files:** Modify `frontend/src/pages/ChapterPage.tsx`, `frontend/src/pages/NovelPage.tsx` (toast `Novel saved` after `updateNovel`), CSS for the chapter form rows. Tests: `ChapterPage.test.tsx`, `NovelPage.test.tsx`.

**Interfaces — Produces:** constant `AUTO_SAVE_MS = 180_000` exported from `ChapterPage.tsx` (or `lib/`), used by tests with fake timers.

- [ ] **Step 1: Failing tests:** Save click → `toast.success('Chapter saved')` (mock `sonner`); Ctrl+S with changes → `updateChapter` called once, default prevented; Ctrl+S without changes → not called; after editing text and advancing fake timers by `AUTO_SAVE_MS` → saved and `Auto-saved` toast; no auto-save when chapter `translationStatus === 'TRANSLATING'` or Number empty; hint texts no longer rendered as paragraphs but available as tooltips (info buttons with aria-labels `About Number`, `About Chapter label`); label text `Number`; novel form Save → `Novel saved`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (reuse the existing `save()`; one interval while `dirty`, cleared on unmount/clean). **Step 4: Run** vitest + tsc → PASS.
- [ ] **Step 5: Commit** `feat(novel): save toasts, Ctrl+S and 3-minute auto-save; field help as tooltips; full-width chapter title`.

### Task 3: Chapter reading order (backend + frontend)

**Files:** Create V9 (whole file, all three columns: `t_chapter.sort_order`, `t_chapter.translation_model VARCHAR2(200 CHAR)`, `video.translation_model VARCHAR2(200 CHAR)`), `ChapterOrderRequest.java`. Modify `Chapter.java`, `ChapterRepository.java`, `ChapterService.java`, `NovelService.java`, `NovelController.java` (or `ChapterController`), `publish/NovelExporter.java`, `Video.java` (column only, used in Task 4), `frontend/src/api/novels.ts`, `frontend/src/components/novel/ChapterList.tsx`. Tests: `ChapterServiceTest`, `NovelServiceTest`, controller test, `NovelExporter` test, `ChapterList`/`NovelPage` tests.

**Interfaces — Produces:**
- `Chapter.getSortOrder()/setSortOrder(int)`; `ChapterRepository.findByNovelIdOrderBySortOrderAscChapterNoAsc(long novelId)`.
- `record ChapterOrderRequest(List<Long> chapterIds)`; `PUT /api/novels/{novelId}/chapters/order` → `List<ChapterSummary>`; invalid list → 400 (reuse an existing 400 exception style, e.g. `InvalidChapterException` with field `chapterIds`). Allowed regardless of publish status; refused only for none.
- Replace `findByNovelIdOrderByChapterNo` by the sort-order query in: chapter list (`NovelService`), prev/next (`ChapterService.detail`), public export (`NovelExporter`). Keep `chapter_no` ordering for `ChapterService.add` numbering and `ChapterTranslationService.previousText`.
- Frontend: `reorderChapters(novelId: number, chapterIds: number[]): Promise<ChapterSummary[]>`; `ChapterList` rows sortable (dnd-kit, drag handle `GripVertical` like `PageRow`) + `Move up` / `Move down` buttons (`ArrowUp`/`ArrowDown`, disabled at ends), optimistic update, revert + error on failure.

- [ ] **Step 1: Failing tests:** reorder `[c3,c1,c2]` → list order c3,c1,c2 and `chapterNo` values unchanged; reorder with missing/duplicate/foreign id → 400; new chapter after reorder is last; prev/next follow sort order; export lists chapters in sort order; UI Move up calls `reorderChapters` with swapped ids; drag end calls it with `arrayMove` result.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `mvn test -Dskip.npm` + vitest + tsc → PASS.
- [ ] **Step 5: Commit** `feat(novel): reading order separate from chapter number, drag or move chapters`.

### Task 4: Show and store the translating model (Novels + Vietsub)

**Files:** Modify `translate/GeminiCaller.java`, `novel/ChapterTranslator.java`, `novel/GeminiChapterTranslator.java`, `novel/ChapterTranslationService.java`, `novel/ChapterDetail.java`, `novel/ChapterSummary.java`, `translate/GeminiTranslator.java`, `translate/GeminiTranslatorImpl.java`, `translate/TranslationService.java`, `video/Video.java`, `video/VideoDto.java`, frontend `api/novels.ts`, `api/client.ts`, `pages/ChapterPage.tsx`, `components/novel/ChapterList.tsx`, `components/VietsubStatus.tsx`. Tests alongside each.

**Interfaces — Produces:**
- `GeminiCaller.generate(List<Part> parts, GenerateContentConfig config, Consumer<String> onTrying)` — calls `onTrying.accept(model)` before each model attempt; the 2-arg overload delegates with a no-op.
- `ChapterTranslator.translate(ChapterPrompt prompt, Consumer<String> onTrying)` with `default List<TranslatedPage> translate(ChapterPrompt p) { return translate(p, m -> {}); }`; `TranslatedPage` list result plus the answering model: `GeminiChapterTranslator` reports the answering model through a second callback or returns it — choose `record ChapterTranslation(List<TranslatedPage> pages, String model)` only if simpler; otherwise record the last `onTrying` value that succeeded (the caller's `Answer.model()`).
- `ChapterTranslationService`: `ConcurrentHashMap<Long, String> activeModel`; cleared in `finally`. On success store distinct answering models (`, `-joined) in `Chapter.translationModel`. On failure leave the stored value.
- `ChapterDetail` and `ChapterSummary` gain `String translationModel` = active model while `TRANSLATING`, else stored value (may be null).
- Vietsub: same pattern — `GeminiTranslator.translate(..., Consumer<String> onTrying)` default overload, `TranslationService` active map + `Video.translationModel` stored on success, `VideoDto.translationModel`.
- UI: chapter page meta `Translating with <model>…` (or `Translating…` when null) / `Translated by <model>`; ChapterList status badge `Tip` `Translated by <model>`; `VietsubStatus` `Translating with Gemini (<profile>, <model>)…` and `Translated by <model>` for AUTO Vietsub.

- [ ] **Step 1: Failing tests:** `GeminiCallerTest`: first model 503 → `onTrying` receives `[m1, m2]`; chapter service: translator calls `onTrying("gemini-x")` and blocks (latch) → `get(id).translationModel() == "gemini-x"` while TRANSLATING; success with two batches answered by `a`, `b` → stored `"a, b"`; failure → stored value unchanged and active cleared; Vietsub `TranslationService` same two cases; UI tests for the three texts.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `mvn test -Dskip.npm` + vitest + tsc → PASS.
- [ ] **Step 5: Commit** `feat: show which Gemini model is translating and store the one that did (Novels, Vietsub)`.

### Task 5: Docs

- [ ] Add a dated 2026-11-09 entry to `PROGRESS.md` for these eight items (V9, autoplay fix needs a manual check on Edge/Safari after deploy, not deployed). Commit `docs: enhancements batch in PROGRESS`.
