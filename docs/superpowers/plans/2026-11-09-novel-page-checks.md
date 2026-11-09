# Novel page checks (rotate, landscape warning, AI source text) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop Gemini from silently mistranslating chapters: let the user rotate sideways page photos, warn about landscape pages before translating, and have Gemini return the Thai text it read so pages whose translation is much shorter than their source get flagged.

**Architecture:** Backend (Spring Boot, package `com.subtitlestudio.novel`) gains page rotation (new media file per rotation), a per-page landscape flag read from the image header, a `source_th` column filled by Gemini in the same request as the translation, and a `SuspectPages` rule comparing translation/source length ratios against the novel's median. Frontend (`frontend/src`, React + TS) shows rotate buttons, badges, a translate-time confirm, a warning line, the source text in the lightbox and a badge in the chapter list.

**Tech Stack:** Java 21 / Spring Boot / JPA / Flyway (Oracle + H2), Gemini via `GeminiCaller`, React + Vite + Vitest, lucide-react, yet-another-react-lightbox, Radix (existing `Tip`, `useConfirmDialog`).

**Spec:** the root cause and the confirmed scope are in this plan (no separate spec). Root cause: chapters 17 (pages 14–22), 18 and 19 were uploaded as phone photos rotated 90° (3264×2448, no EXIF); Gemini (`gemini-3.5-flash-lite` after 503s) read the sideways Thai badly and invented text, which passed every existing check (pages present, Vietnamese, not blank).

## Global Constraints

- UI copy in English; content stays Vietnamese/Thai. Icons from `lucide-react` only (`RotateCcw`, `RotateCw`, `TriangleAlert`, `Copy`).
- Brand colors: orange `#F39A42` for the Landscape badge, purple `#D9A1D9` for the "May be incomplete" badge; red only for errors/delete.
- Flyway: new file `V8__chapter_page_source.sql` only; never edit V1–V7. SQL must run on Oracle and H2 (MODE=Oracle).
- Rotation and other page changes are refused on Published chapters with the existing `ChapterPublishedException` (`CHAPTER_PUBLISHED`, 409) and while translating (`ChapterTranslationInProgressException`) — reuse `ChapterService.structural(id)`.
- Rotating does **not** clear a page's translation or source.
- Still exactly one Gemini request per batch; the notebook updater, Publish and the public site are unchanged.
- Chapters translated before this change have no source and are **never** flagged.
- Do not deploy. Do not `git add -A` (tsc build info); add files by path. Run `mvn test -Dskip.npm` for Java and `npx vitest run` in `frontend/` for the UI (do not run `npm ci` in the main repo while a Vite dev server holds `node_modules`).
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. A PNG or WebP page rotated → still a valid image the app serves and Gemini can read (rotated output is written as JPEG for JPEG/WebP input, PNG for PNG input) — test in Task 1.
2. Rotating a page whose media is also used elsewhere (same file uploaded twice) → the other page keeps the old image (`deleteIfUnreferenced`) — test in Task 1.
3. Gemini omits `source` or returns it blank for a page → the page's translation is still accepted, source stored as null, page not flagged — test in Task 2.
4. Resume after a FAILED run (only missing pages re-sent) → kept pages keep their stored source — test in Task 2.
5. Novel with fewer than 5 pages that have a source → fixed ratio floor is used, not a median of 1–4 values — test in Task 2.

---

### Task 1: Page rotation and landscape flag (backend)

**Files:**
- Create: `src/main/java/com/subtitlestudio/novel/PageRotator.java`, `RotateDirection.java`, `RotateRequest.java`, `PageImageSize.java`
- Modify: `ChapterPage.java` (add `setMedia(Media)`), `ChapterService.java`, `ChapterController.java`, `PageDto.java`
- Test: `src/test/java/com/subtitlestudio/novel/PageRotatorTest.java`, `ChapterServiceTest.java`, `ChapterControllerTest.java`

**Interfaces:**
- Produces:
  - `enum RotateDirection { LEFT, RIGHT }` (LEFT = 90° counter-clockwise).
  - `record RotateRequest(RotateDirection direction)`.
  - `PageRotator` (`@Component`): `byte[] rotate(Path image, RotateDirection direction)`; PNG in → PNG out, JPEG/WebP in → JPEG quality 0.92 out; output width = input height.
  - `PageImageSize` (static): `static boolean landscape(Path image)` — reads only the header via `ImageIO.getImageReaders(...).getWidth(0)/getHeight(0)`; true when width > height; false when unreadable.
  - `PageDto(long id, int position, String mediaUrl, String textVi, String source, boolean landscape, boolean suspect)` — Task 1 passes `source = null`, `suspect = false`; Task 2 fills them.
  - `ChapterService.rotatePage(long chapterId, long pageId, RotateDirection d): List<PageDto>` and `rotatePages(long chapterId, RotateDirection d): List<PageDto>` (all pages).
  - `POST /api/chapters/{id}/pages/{pageId}/rotate` body `RotateRequest` → `List<PageDto>`; `POST /api/chapters/{id}/pages/rotate` body `RotateRequest` → `List<PageDto>`. Missing/invalid direction → 400.

- [ ] **Step 1: Write failing tests**
  - `PageRotatorTest.rotatesJpegRightSwappingSides`: 300×200 JPEG (use `TestImages`) → result decodes to 200×300; a red pixel at top-left of input ends at top-right for RIGHT, bottom-left for LEFT.
  - `PageRotatorTest.pngStaysPng`: PNG in → bytes start with PNG signature.
  - `ChapterServiceTest.rotatePageStoresNewMediaKeepsText`: page with `textVi="x"` → after `rotatePage(.., RIGHT)` the DTO's `mediaUrl` differs, `textVi` still `"x"`, `landscape` flips from true to false for a 300×200 upload.
  - `ChapterServiceTest.rotatePageRefusedWhenPublished`: throws `ChapterPublishedException`.
  - `ChapterServiceTest.rotateKeepsSharedMediaForOtherPage`: two pages sharing one media; rotate one → the other page's `mediaUrl` unchanged and its file still exists.
  - `ChapterServiceTest.rotatePagesRotatesEveryPage`: 3 landscape pages → all `landscape == false`.
  - `ChapterControllerTest.rotateEndpoints`: both POSTs return 200 with the page list; `{}` body → 400.
- [ ] **Step 2: Run** `mvn test -Dskip.npm -Dtest='PageRotatorTest,ChapterServiceTest,ChapterControllerTest'` → new tests FAIL (compile errors count).
- [ ] **Step 3: Implement** the interfaces above. `rotatePage`: `structural(id)`, find page in chapter (`PageNotFoundException`), `media.load(mediaId).path()` → `PageRotator.rotate` → `mediaService.store(originalName, bytes)` → `page.setMedia(new)` → `touch(c)` → flush → `mediaService.deleteIfUnreferenced(List.of(oldId))`. `pageDtos` fills `landscape` with `PageImageSize.landscape(path)`.
- [ ] **Step 4: Run** the same command → PASS; then `mvn test -Dskip.npm` → all PASS.
- [ ] **Step 5: Commit** `feat(novel): rotate page images and flag landscape pages`.

### Task 2: Gemini source text and suspect pages (backend)

**Files:**
- Create: `src/main/resources/db/migration/V8__chapter_page_source.sql`, `src/main/java/com/subtitlestudio/novel/SuspectPages.java`
- Modify: `TranslatedPage.java`, `GeminiChapterTranslator.java`, `PageTextOutput.java`, `ChapterTranslationService.java`, `ChapterPage.java`, `ChapterPageRepository.java`, `ChapterService.java`, `ChapterSummary.java`, the code that builds `ChapterSummary` (`NovelService`)
- Test: `SuspectPagesTest.java`, `GeminiChapterTranslatorTest.java`, `PageTextOutputTest.java`, `ChapterTranslationServiceTest.java`, `ChapterServiceTest.java`, `NovelServiceTest.java`

**Interfaces:**
- Consumes: `PageDto` 7-field record from Task 1.
- Produces:
  - V8: `ALTER TABLE t_chapter_page ADD (source_th CLOB);` with the usual header comment.
  - `ChapterPage.getSourceTh()/setSourceTh(String)` (`@Lob @Column(name = "source_th")`).
  - `record TranslatedPage(int page, String text, String source)` plus `TranslatedPage(int page, String text)` (source null).
  - `SuspectPages`: `static final int MIN_SOURCE_CHARS = 100; static final int MIN_SAMPLES = 5; static final double SHARE_OF_MEDIAN = 0.6; static final double FIXED_FLOOR = 0.5;`
    `static double ratio(String text, String source)` (text length / source length after strip);
    `static Double novelMedian(List<ChapterPage> novelPages)` — median ratio over pages with text and source ≥ `MIN_SOURCE_CHARS`; null when fewer than `MIN_SAMPLES`;
    `static boolean suspect(String text, String source, Double novelMedian)` — false when source null/blank or shorter than `MIN_SOURCE_CHARS` or text blank; else `ratio < (novelMedian == null ? FIXED_FLOOR : SHARE_OF_MEDIAN * novelMedian)`.
  - `ChapterPageRepository.findByChapterNovelId(long novelId): List<ChapterPage>`.
  - `ChapterSummary` gains trailing `int suspectPages`.

- [ ] **Step 1: Write failing tests**
  - `SuspectPagesTest`: median of ratios {1.0,1.1,1.2,0.9,1.0} = 1.0 → text/source 0.55 suspect, 0.65 not; with 4 samples `novelMedian` is null and 0.45 suspect, 0.55 not; source of 99 chars → never suspect; null source → never suspect.
  - `GeminiChapterTranslatorTest`: schema's page item requires `page`, `text`, `source`; JSON `{"pages":[{"page":1,"text":"Xin chào","source":"สวัสดี"}]}` → `TranslatedPage(1,"Xin chào","สวัสดี")`; `SYSTEM_RULES` contains `"source"`.
  - `PageTextOutputTest.missingSourceStillValid`: page with text and no source → valid, source null; blank source → null.
  - `ChapterTranslationServiceTest.savesSource`: translator returns source → `ChapterPage.getSourceTh()` equals it; `resumeKeepsSourceOfKeptPages`: FAILED chapter with page 1 text+source kept, page 2 re-sent → page 1 source unchanged.
  - `ChapterServiceTest.detailFlagsSuspectPage`: novel with ≥5 normal pages (ratio ≈1.0) plus one page text 40% of source → that `PageDto.suspect` true, `source` returned.
  - `NovelServiceTest.summaryCountsSuspectPages`: chapter list row `suspectPages == 1`.
- [ ] **Step 2: Run** `mvn test -Dskip.npm -Dtest='SuspectPagesTest,GeminiChapterTranslatorTest,PageTextOutputTest,ChapterTranslationServiceTest,ChapterServiceTest,NovelServiceTest'` → FAIL.
- [ ] **Step 3: Implement.** Schema: add `"source"` STRING property, `required("page","source","text")`. Add to `SYSTEM_RULES` (Vietnamese, same style) two rules: `"source" là toàn bộ chữ Thái đọc được trong ảnh của trang, chép đủ từng dòng theo thứ tự, không tóm tắt.` and `"text" phải dịch đủ mọi câu có trong "source", không bỏ câu nào.` Also: `Ảnh có thể bị xoay; hãy đọc theo đúng hướng chữ.` `PageTextOutput.check` carries source (stripped, blank → null) into valid pages. `ChapterTranslationService` keeps a `Map<Integer,String> sources` beside `texts` (also from `ChapterPartlyTranslatedException.done()`), and `save`/`saveFailed` set `sourceTh` for pages they write; kept pages untouched. `ChapterService.pageDtos` computes `novelMedian` once per call and fills `source`/`suspect`; summaries count suspect pages using one `novelMedian` per novel.
- [ ] **Step 4: Run** the same command → PASS; then `mvn test -Dskip.npm` → all PASS.
- [ ] **Step 5: Commit** `feat(novel): Gemini returns the Thai it read; flag pages translated much shorter than their source`.

### Task 3: Frontend

**Files:**
- Modify: `frontend/src/api/novels.ts`, `frontend/src/components/novel/PageRow.tsx`, `frontend/src/pages/ChapterPage.tsx`, `frontend/src/components/novel/ChapterList.tsx`, the CSS file holding `.page-thumb` styles, `frontend/src/test/novelFixtures.ts`
- Test: `frontend/src/pages/ChapterPage.test.tsx`, `frontend/src/api/novels.test.ts`, the ChapterList test (or `NovelPage.test.tsx` if that is where it is covered)

**Interfaces:**
- Consumes: endpoints and DTO fields from Tasks 1–2.
- Produces: `PageDto` gains `source: string | null; landscape: boolean; suspect: boolean`; `ChapterSummary` gains `suspectPages: number`; `rotatePage(chapterId, pageId, direction: 'LEFT' | 'RIGHT'): Promise<PageDto[]>`, `rotatePages(chapterId, direction): Promise<PageDto[]>`.

UI (exact copy):
- `PageRow`: buttons `Rotate left` / `Rotate right` (`RotateCcw`/`RotateCw`, `Tip` labels same text, aria-label `Rotate page N left|right`); badge `Landscape` (orange) when `landscape`; badge `May be incomplete` (purple) when `suspect`.
- Pages section header (Draft only): buttons `Rotate all left` / `Rotate all right`.
- Translate / Translate again: when any page is landscape, `confirm({ title: 'Landscape pages', description: 'N page(s) are landscape — Gemini reads sideways text poorly. Translate anyway?', confirmLabel: 'Translate anyway' })` before the existing flow; cancelling sends nothing.
- Above the Chapter text box (Draft and Published): when suspect pages exist, a line with `TriangleAlert`: `Pages 4, 12 may be incomplete` (singular `Page 4 may be incomplete`), each number a button opening the lightbox at that page.
- Lightbox: Captions plugin (`yet-another-react-lightbox/plugins/captions`) with `title` `Page N` and `description` = `Source read by AI:\n<source>` when present; a toolbar button `Copy source` (`Copy` icon) copying the current slide's source via `navigator.clipboard.writeText`, hidden when no source.
- `ChapterList`: when `suspectPages > 0`, a purple badge `⚠ N` with `Tip` `N page(s) may be incomplete`.

- [ ] **Step 1: Write failing tests** (Vitest + Testing Library, mock API as existing tests do):
  - `rotate right calls rotatePage and shows returned pages`;
  - `rotate all left calls rotatePages`;
  - `landscape page asks before translating; cancel does not call translateChapter`;
  - `suspect pages show warning line "Pages 2, 3 may be incomplete"`;
  - `badges Landscape and May be incomplete render`;
  - `chapter list shows ⚠ 2 for suspectPages 2`;
  - `novels.test.ts`: `rotatePage` POSTs `/api/chapters/1/pages/5/rotate` with `{"direction":"RIGHT"}`.
- [ ] **Step 2: Run** `cd frontend && npx vitest run` → new tests FAIL.
- [ ] **Step 3: Implement** per the UI list; update fixtures with the new fields.
- [ ] **Step 4: Run** `npx vitest run` and `npx tsc -b --noEmit` (or the project's typecheck script) → PASS; do not stage `tsconfig.tsbuildinfo`.
- [ ] **Step 5: Commit** `feat(novel): rotate buttons, landscape and incomplete-page warnings, AI source in lightbox`.

### Task 4: Docs

- [ ] Add a short entry to `PROGRESS.md` (root cause found 2026-11-09, what shipped, V8, not deployed; chapters 17–19 need Unpublish → rotate → Translate again after 15:00 VN). Commit `docs: page checks in PROGRESS`.
