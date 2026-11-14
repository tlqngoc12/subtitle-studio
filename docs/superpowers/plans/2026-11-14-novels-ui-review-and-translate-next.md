# Novels UI review batch 1 + Wattpad "Fetch & translate next" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the phone navbar, reader end buttons, card stats and list layout, enrich the public novel page, show only published chapter counts, and let the admin start the next Wattpad chapter from the chapter page.

**Architecture:** Mostly frontend in shared components (every page follows); two backend additions: `publishedAt` on the public chapter ref, and `POST /api/novels/{id}/wattpad/next/fetch-translate`.

**Tech Stack:** Java 21 / Spring Boot 3.5 / JUnit 5 + Mockito; React + TypeScript / Vitest + RTL.

**Specs (read both first):**
- `docs/superpowers/specs/2026-11-14-novels-ui-review-design.md` (tasks 1–5)
- `docs/superpowers/specs/2026-11-14-wattpad-translate-next-design.md` (tasks 6–7)

## Global Constraints

- Branch `feat/novels-ui-review` (checked out). One commit per task, message English, ending `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. No push, no PR.
- TDD every task: test → see it fail for the right reason → implement → green.
- Admin strings English; public strings Vietnamese (`useT` / literal Vietnamese in public pages). Code comments English. `Locale.ROOT` in Java formatting.
- Dates via `lib/dates.ts` (`formatInstant`); icons lucide with `className="icon icon--sm" aria-hidden="true"`; tooltips via `<Tip>`; tests use `expectTooltip`, `fakeFetch`, `src/test/css.ts`.
- CSS mobile-first: base = phone, then `min-width: 521px` / `761px` / `1024px` only. No `height`/`padding` on button selectors in component CSS.
- Every orange `badge--done` / purple `badge--progress` starts with an icon (`styles/badgeIcons.test.ts`).
- Wattpad: never called inside a DB transaction; tests use the stub client, never real Wattpad. Polling never calls the parts endpoint.
- Edit with the editor tools, not Python/sed rewrites. Leave nothing running in the background.
- Frontend from `frontend/`: `npx vitest run`, `npx tsc -b`. Backend from repo root: `mvn -q test -Dskip.npm`, counts from `target/surefire-reports/*.txt`.

## Review Focus

1. A public `novels/<slug>.json` published before this change (no `publishedAt`): the novel page must render with no dates, no "Mới", no "Cập nhật" row — Task 5 test.
2. Navbar when the current link is the first or last item: `scrollLeft` clamps to 0 / max — Task 2 test.
3. "Fetch & translate next" clicked while the current chapter has unsaved text: confirm first; cancel = no request — Task 7 test.
4. A Wattpad story whose remaining parts are all deleted: 409 `WATTPAD_NOTHING_NEXT`, no chapter created — Task 6 test.
5. Phone card stats with a long value (`12.3M lượt đọc`, `18h 3m`): the row wraps between items, never inside one — Task 4 CSS (`white-space: nowrap` on each item).

---

### Task 1: `publishedAt` on the public chapter ref

**Files:** `src/main/java/com/subtitlestudio/publish/PublicNovelDetail.java`, `NovelExporter.java` (where `PublicChapterRef` is built), `src/test/java/com/subtitlestudio/publish/SiteExporterTest.java` (or the test that pins chapter-ref fields), `frontend/src/data/novelTypes.ts`.

**Interfaces — Produces:** `PublicChapterRef(int chapterNo, String title, String label, Instant publishedAt)`; TS chapter ref `publishedAt?: string | null`.

- [ ] Test: exported `novels/<slug>.json` chapter entries contain `publishedAt` equal to the chapter's `published_at` (ISO instant), and still no chapter text or internal fields.
- [ ] Run → FAIL. Implement. Run `mvn -q test -Dskip.npm` → green.
- [ ] Commit `feat: publish date on public chapter refs`.

### Task 2: Navbar centres the current section on phones

**Files:** `frontend/src/components/NavBar.tsx`, `NavBar.css`, `NavBar.test.tsx`.

**Interfaces — Produces:** exported pure helper `centredScrollLeft(item: { offsetLeft: number; offsetWidth: number }, nav: { clientWidth: number; scrollWidth: number }): number` = clamp(`offsetLeft + offsetWidth/2 - clientWidth/2`, 0, `scrollWidth - clientWidth`), rounded.

- [ ] Tests: `centredScrollLeft` for a middle item, first item (→ 0), last item (→ max). Component test: with stubbed `offsetLeft/offsetWidth/clientWidth/scrollWidth`, `nav.scrollLeft` is set after mount and set again after `document.fonts.ready` resolves (stub `document.fonts`), and `Element.prototype.scrollIntoView` is never called (spy). CSS: both fade masks use `32px`.
- [ ] Run → FAIL. Implement (replace `scrollIntoView`; re-run on route change, resize, `document.fonts.ready`; keep the fade data attributes updated). Run full vitest + tsc.
- [ ] Commit `fix: navbar centres the current section with scrollLeft (Safari)`.

### Task 3: One primary button at the end of a chapter

**Files:** `frontend/src/pages/public/ReaderPage.tsx`, `ReaderPage.test.tsx`.

- [ ] Test: in `.reader__end` (region "Hết chương"), link "Chương sau" has class `button--primary`; link "Chương trước" has class `button` and not `button--primary`.
- [ ] FAIL → implement → green. Commit `fix: only Chuong sau is primary at the end of a chapter`.

### Task 4: Card stats (phone line, units), 2-column list, published-only count

**Files:** `frontend/src/components/fanfics/FanficCard.tsx` (`Stat`), `FanficCard.css`, `FanficsTab.css` (`.fanfic-list`), `components/novel/NovelCard.tsx`, `pages/public/publicNames.ts` (+ `FeaturedNovels.tsx`), their tests.

**Interfaces — Produces:** `Stat({ icon, label, value, unit? }: { icon: LucideIcon; label: string; value: string; unit?: string })`; `publicChapterCount(n: { publishedCount: number }): string` replaces `publicChapterProgress` (returns `String(publishedCount)`).

- [ ] Tests:
  - FanficCard public: units "chương", "lượt đọc", "bình chọn" rendered; labels still in the DOM. Admin: "chapters", "reads", "votes".
  - NovelCard public: Chương value is `7` (not `7/8`) for `publishedCount: 7, totalChapters: 8`; units "chương", "lượt đọc". Admin keeps Chapters and Published as separate stats, with units "chapters", "published", "reads".
  - FeaturedNovels: chapter fact shows `7`, not `7/7`.
  - CSS: base `.fanfic-card__stats` is `display: flex` with `flex-wrap: wrap`; the label/divider grid is inside `@media (min-width: 521px)`; `.fanfic-stat__label` text is visually hidden below 521 px (icon stays visible); `.fanfic-stat` has `white-space: nowrap`; a `·` separator between items below 521 px only; `@media (min-width: 1024px)` sets `.fanfic-list` to `repeat(2, minmax(0, 1fr))` and `.fanfic-card` `max-width: none`.
- [ ] FAIL → implement (hide only the label *text*: wrap it in a span so the icon can move before the value on phones; unit spans hidden from 521 px) → full vitest + tsc green.
- [ ] Commit `feat: compact card stats on phones, two-column card list, published chapter count`.

### Task 5: Public novel page — facts, shelf tooltip, chapter dates and "Mới"

**Files:** `frontend/src/pages/public/PublicNovelPage.tsx`, `PublicNovelPage.css`, `PublicNovelPage.test.tsx`.

**Interfaces — Consumes:** `publishedAt?: string | null` on chapter refs (Task 1).

- [ ] Tests (fixed clock via `vi.setSystemTime`):
  - facts show "Số chương" = number of chapters and "Cập nhật" = `formatInstant` of the newest `publishedAt`;
  - each chapter row shows its date;
  - "Mới" badge (with an svg) on chapters published within 7 days, not on older ones;
  - JSON without `publishedAt`: no dates, no "Mới", no "Cập nhật" row;
  - shelf button: `expectTooltip(button, 'Thêm vào tủ sách')`, and after clicking `'Đã lưu vào tủ sách'`;
  - the Giới thiệu tab is still there.
- [ ] FAIL → implement (`badge badge--done` + `Sparkles` for "Mới"; date muted, right-aligned; `<Tip>` around the shelf button) → green.
- [ ] Commit `feat: novel page shows chapter count, last update, chapter dates and Moi`.

### Task 6: Backend `POST /api/novels/{id}/wattpad/next/fetch-translate`

**Files:** `src/main/java/com/subtitlestudio/novel/wattpad/WattpadNovelService.java`, `novel/NovelController.java`, new `novel/wattpad/WattpadNothingNextException.java`, `web/ApiExceptionHandler.java`, `WattpadNovelServiceTest.java`, the controller slice test.

**Interfaces — Produces:** `ChapterDetail WattpadNovelService.fetchAndTranslateNext(long novelId)`; 409 `WATTPAD_NOTHING_NEXT` (message "Every Wattpad part is already translated."); reuse `NovelNotWattpadException` (409 `NOVEL_NOT_WATTPAD`).

- [ ] Tests (stub client): first part with no chapter → fetched, created, started; an earlier part whose chapter is `FAILED` wins over a later missing part and its text is **not** fetched; deleted parts and `TRANSLATED` chapters are skipped; all done (or only deleted left) → `WattpadNothingNextException`, no chapter created; busy → `NovelTranslationBusyException` before any text fetch; `storyWithParts` called exactly once per call. Controller: 202 + body; 409 codes.
- [ ] FAIL → implement (busy/ready checks first as in `fetchAndTranslate`; refactor the shared part→chapter logic into a private method taking the resolved `WattpadPart` so the list is fetched once) → `mvn -q test -Dskip.npm` green.
- [ ] Commit `feat: fetch and translate the next Wattpad part in one call`.

### Task 7: Frontend "Fetch & translate next"

**Files:** `frontend/src/api/novels.ts`, `lib/errors.ts`, `pages/ChapterPage.tsx`, `pages/NovelPage.tsx`, their tests.

**Interfaces — Consumes:** Task 6 endpoint. **Produces:** `fetchTranslateNext(novelId: number): Promise<ChapterDetail>`.

- [ ] Tests per spec "Frontend" list:
  - **Chapter page:**
    - the button shows only when `wattpadPartId !== null && nextChapterId === null`;
    - dirty text → confirm first; cancel → no POST;
    - success → one POST, `toast.info('Translation started', { description: title })`, navigation to `/novels/:id/chapters/:newId`;
    - 409 `NOVEL_TRANSLATION_BUSY` → error toast, no navigation;
    - disabled with a tooltip while the chapter is `TRANSLATING`.
  - **Chapters tab:** Wattpad novel → "Fetch & translate next", no "Add chapter"; screenshot novel → "Add chapter", no "Fetch & translate next".
  - `errors.ts` has a message for `WATTPAD_NOTHING_NEXT`.
- [ ] FAIL → implement → full vitest + tsc green.
- [ ] Commit `feat: Fetch & translate next on the chapter page and the Chapters tab`.

### Task 8: Docs and final checks

- [ ] `CLAUDE.md`:
  - Frontend: navbar centring rule (explicit `scrollLeft`, not `scrollIntoView`; fades 32 px).
  - Compact phone card stats with units; 2-column card list from 1024 px.
  - "Public chapter count = published chapters only (`publicChapterCount`)".
  - Public chapter refs carry `publishedAt`; "Mới" = published within 7 days.
  - Wattpad section: `POST /api/novels/{id}/wattpad/next/fetch-translate`, the "next part" rule shared with the Wattpad tab's Next badge, `WATTPAD_NOTHING_NEXT`, and no "Add chapter" for Wattpad novels.
- [ ] `PROGRESS.md`: one Vietnamese log entry at the end of section 7 (before `## 9.`) linking both specs and this plan; note "cần Publish lại để có ngày đăng chương".
- [ ] Run `npx vitest run`, `npx tsc -b`, `mvn -q test -Dskip.npm`; report real counts.
- [ ] Commit `docs: Novels UI review and translate-next`.

---

## Added 2026-11-14 (approved by the user after tasks 1–8)

### Task 9: Notebook field limits and cleaning leaked text

**Spec:** `docs/superpowers/specs/2026-11-14-notebook-field-limits-design.md` (read it; its "Tests" section is the test list).

**Files:**
- `src/main/java/com/subtitlestudio/novel/NotebookMerger.java` (limits, `check`, sanitizing old content)
- `NotebookText.java`
- `NotebookService.java` (view)
- `GeminiNotebookUpdater.java` (`SYSTEM_RULES` line; schema `maxLength` if the `Schema` builder has it)
- their tests under `src/test/java/com/subtitlestudio/novel/`

**Interfaces — Produces:** `static NotebookContent NotebookMerger.sanitize(NotebookContent content)`. It is pure and idempotent: it drops `sourceName` values longer than 120 chars (sets them to null), and drops glossary/addressing entries over their limits. It is used by the view, `NotebookText`, and the old side of `merge`.

- [ ] Tests per the spec → FAIL → implement → `mvn -q test -Dskip.npm` green. Logs and messages carry only field names and lengths, never content.
- [ ] Commit `fix: notebook name and glossary limits; drop leaked text on read`.

### Task 10: Chapter auto-save every 15 minutes

**Files:** `frontend/src/pages/ChapterPage.tsx` (`AUTO_SAVE_MS`), `ChapterPage.test.tsx`.

- [ ] Test: rename "auto-saves after 3 minutes…" to "…15 minutes…". Assert that `AUTO_SAVE_MS === 900_000`, that nothing is saved at `AUTO_SAVE_MS - 1000`, and that it is saved at `AUTO_SAVE_MS`. FAIL → set `AUTO_SAVE_MS = 900_000` → green.
- [ ] Commit `feat: chapter auto-save every 15 minutes`.

### Task 11: Docs for tasks 9–10

- [ ] `CLAUDE.md`, Novels notebook (package `novel` line or the Novels bullet): the field limits (name 80, sourceName 120, glossary source/target 120, note 300, addressing from/to 80, rule 300) and "content is sanitized on read (`NotebookMerger.sanitize`)".
- [ ] `PROGRESS.md`: add both to this branch's log entry. Mention "tự lưu chương mỗi 15 phút (trước là 3 phút)" and the sổ tay cleanup, with the measured lengths from the spec.
- [ ] Run `npx vitest run`, `npx tsc -b`, `mvn -q test -Dskip.npm`; report the real counts.
- [ ] Commit `docs: notebook limits and 15-minute auto-save`.
