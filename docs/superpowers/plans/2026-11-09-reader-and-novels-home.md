# Reader bar, Novels home, Vietsub filter button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (or subagent-driven-development). TDD per task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Eight user-requested changes, approved in chat on 2026-11-09 (scope below).

**Architecture:** Mostly frontend (`frontend/src`). Backend: `NovelRenderer` margins; public export gains two fields on `PublicNovelSummary`; the "add Vietsub" endpoint is removed if nothing else uses it. No migration.

**Spec (approved):**

| # | Where | Change |
|---|---|---|
| 1 | Vietsub › Manage Vietsub (`VietsubPage`) | Replace the All · AI · Manual tab-style buttons with **one `Filter` button** (lucide `ListFilter`) next to the search box. It opens a Radix popover/dropdown (reuse the Radix primitives already in the project) with the choices All / AI / Manual (radio semantics, current one checked). While filtered the button reads `Filter: AI` / `Filter: Manual` and has the brand border. `?source=ai|manual` URL behaviour unchanged. |
| 2 | Vietsub | **Remove "Add Vietsub"**: `VietsubForm` and its use on Manage Vietsub (update the masthead lede, it must no longer mention adding), the `Add Vietsub` links in the empty states of `VietsubListPage` and `WatchPage`, the `addVietsub`-style API client function, and the backend endpoint + service method + tests **only if nothing else uses them** (Get Engsub's Vietsub flow, Replace, Download, Delete stay). Report what was removed. |
| 3 | Public reader, end of chapter | `‹ Chương trước` and `Chương sau ›` become **two buttons of the same style and size** (outlined/secondary, not the orange primary), side by side (prev left, next right; a missing one leaves its slot empty). Remove the big next-chapter card. Last chapter: keep the `Bạn đã đọc hết các chương đã đăng.` box + `Về trang truyện`. |
| 4 | Public › Playlists (playlist page / cards with video titles) | Long video titles **wrap and clamp to 2 lines with an ellipsis** (`overflow-wrap: anywhere`, `-webkit-line-clamp: 2`), never overflow the card border. Check every public playlist view that shows video titles. |
| 5 | `NovelRenderer` | Less blank paper between pages: page top margin `TOP` from 110 → about 56 on pages 2+ (page 1 keeps room for the heading, ~110), footer area `FOOTER` 120 → about 64, footer text `Ch. N · k/n` kept and vertically centred in it. Bump `VERSION` to 3. |
| 6 | Public reader top | Remove the orange prev/next buttons, the chapter `<select>` and the night/size row. Add a **sticky icon bar** at the top of the reader (just under the site's sticky top bar): icon buttons `‹` (`Chương trước`), `›` (`Chương sau`), `Mục lục` (lucide `List`), `Cài đặt` (lucide `Settings`), each with the existing Radix `Tip` tooltip and the same `aria-label`; disabled (not hidden) when there is no prev/next. **Hide on scroll down, show on scroll up** (and always shown near the top of the page, while a popover is open, and when focus is inside the bar); respect `prefers-reduced-motion` (no slide animation). `Mục lục` opens a popover/sheet with the chapter list (`publicChapterLabel`, current one marked `Đang đọc`, read ones with `Check`), scrollable, current item scrolled into view; picking one navigates and closes it. `Cài đặt` opens a popover with `Chế độ đêm` (toggle, `aria-pressed`) and `A−` / `A+` (same widths and `readerPrefs` storage as today). Arrow keys ←/→ keep working. |
| 7 | Breadcrumbs | Reader: `Novels › <novel title> › <publicChapterName>` (first two are links, last is the current page, `aria-current="page"`), inside `<nav aria-label="Breadcrumb">` with lucide `ChevronRight` separators; replaces the `← <novel title>` back link. Novel page: `Novels › <novel title>`. Long titles truncate with ellipsis on narrow screens. |
| 8 | Public › Novels (`PublicNovelsPage`) | **Top: featured banner** (all public novels ordered by latest published chapter, newest first, max 5). Left: status badge (`Đang ra` / `Hoàn thành`), title (large), divider, facts `Chương` (`x/y`), `Tác giả` (if any), `Cập nhật` (`dd-MM-yyyy` of the latest published chapter), buttons `Đọc từ đầu` (first published chapter) — or `Đọc tiếp: <publicChapterName>` when `readerPrefs` has progress for that novel — plus an icon button ⓘ (lucide `Info`, tooltip `Thông tin truyện`) linking to the novel page. Right: the covers fanned (current in front and larger, neighbours rotated and behind; clicking a neighbour selects it), counter `01 / 05`, pause/play button (`aria-label` `Tạm dừng` / `Tiếp tục`), auto-advance every 6 s, paused on hover/focus, **no auto-advance with `prefers-reduced-motion`**. Background follows the theme tokens with the current cover blurred behind (low opacity). Mobile (≤ 760px): cover on top, info below, no fan. Novels without a cover use the existing empty-cover placeholder. **Below: section `Mới cập nhật`** with a `Xem tất cả` link, showing the small cards (cover + title + status + `x/y chương`), latest 6 by latest published chapter. **`/novels/all`**: new public route listing every novel with the same small cards (heading `Tất cả truyện`, breadcrumb `Novels › Tất cả truyện`). Tab titles: `Truyện` / `Tất cả truyện`. |
| 8b | Public export data | `PublicNovelSummary` gains `int totalChapters` (all chapters of the novel, drafts included) and `Instant lastPublishedAt` (max `publishedAt` of its published chapters). Frontend types (`data/novelTypes.ts`) and the in-app public data source updated. `y` in `x/y` = `totalChapters`. |

## Global Constraints

- Branch `feature/novel-page-checks`: first `git checkout feature/novel-page-checks` and `git merge --ff-only main` (main is at cf48745). Never push, merge into main, or deploy.
- Brand colours orange `#F39A42` / purple `#D9A1D9` (the reference image's pink button becomes our orange primary), red only for errors/delete; icons only from `lucide-react`; tooltips with the existing `Tip`; Radix for popovers/menus (already a dependency — no new packages without asking); reuse existing classes and CSS tokens; dark-mode safe.
- Public Novels copy stays Vietnamese (helpers in `pages/public/publicNames.ts`); admin copy stays English. The breadcrumb root label is `Novels` as the user wrote.
- Copy guards on the reader (`useCopyGuard`, shield, blur) keep working; the bar and popovers sit outside `.reader`.
- `localStorage` only through `readerPrefs.ts` (try/catch).
- Tests: `cd frontend && npx vitest run`, `npx tsc -b --noEmit`; `mvn test -Dskip.npm` for backend changes. Stage by path; never `git add -A`; never stage `frontend/tsconfig.tsbuildinfo` or `.claude/`.
- One commit per task; messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Removing Add Vietsub must not remove anything Get Engsub, Replace, Download or Delete still call — grep every caller before deleting; backend tests still pass.
2. Reader bar: hidden only after scrolling down past the bar; shown on scroll up, at the top, while a popover is open or focus is inside; ←/→ still navigate; no navigation when focus is in the TOC list — tests in Task 3.
3. Banner auto-advance stops with `prefers-reduced-motion`, on pause, on hover/focus; timers cleared on unmount — tests with fake timers in Task 4.
4. `totalChapters` counts drafts; `lastPublishedAt` ignores unpublished chapters; novels with one published chapter still appear — backend test in Task 4.
5. Renderer: page 2+ starts higher than before; footer still drawn; page count for a long text does not increase — test in Task 1.

---

### Task 1: Renderer margins + playlist title overflow

**Files:** `NovelRenderer.java` (+ test), public playlist component(s) + `styles.css` (+ a render test that the title element has the clamp class).
- [ ] Failing tests → implement → `mvn test -Dskip.npm` + vitest + tsc → commit `fix: less blank paper between chapter pages; long playlist video titles wrap inside the card`.

### Task 2: Vietsub filter button + remove Add Vietsub

**Files:** `pages/VietsubPage.tsx`, `components/VietsubForm.tsx` (delete if unused), `VietsubListPage.tsx`, `WatchPage.tsx`, `api/*`, backend controller/service/tests for the add endpoint (only if unused elsewhere), `styles.css`, tests.
- [ ] Failing tests: Filter button opens the menu; choosing AI sets `?source=ai` and the label `Filter: AI`; All clears it; `?source=manual` restores the label; no `YouTube link` form and no `Add Vietsub` text anywhere in the app's pages.
- [ ] Implement → full backend + frontend suites → commit `feat(vietsub): one Filter button in Manage Vietsub; remove Add Vietsub`.

### Task 3: Reader — sticky icon bar, TOC, settings, breadcrumbs, end buttons

**Files:** `pages/public/ReaderPage.tsx`, `PublicNovelPage.tsx` (breadcrumb), new small components under `components/novel/` or `pages/public/` (e.g. `ReaderBar.tsx`, `Breadcrumbs.tsx`), `styles.css`, tests.
- [ ] Failing tests: bar buttons with aria-labels and tooltips; prev/next disabled at the ends; TOC lists chapters, marks current/read, navigates and closes; settings toggle night + A−/A+ persist via `readerPrefs`; bar gets the hidden state after a scroll down and loses it on scroll up / at top / with an open popover; breadcrumbs on reader and novel page; end-of-chapter buttons same class, no next card; arrows still navigate.
- [ ] Implement → vitest + tsc → commit `feat(novel): reader icon bar that hides while reading, table of contents, settings and breadcrumbs`.

### Task 4: Novels home — export fields, featured banner, Mới cập nhật, /novels/all

**Files:** `publish/PublicNovelSummary.java`, `publish/NovelExporter.java` (or where summaries are built) + tests, `frontend/src/data/novelTypes.ts` + the in-app data source, `pages/public/PublicNovelsPage.tsx`, new `pages/public/FeaturedNovels.tsx` (or similar), new `/novels/all` page + route in `PublicApp.tsx`, `styles.css`, tests.
- [ ] Failing tests: Review Focus 4 (backend); banner shows the newest novel first with `x/y`, author, `Cập nhật` date; `Đọc tiếp` with stored progress else `Đọc từ đầu`; ⓘ links to the novel; counter and pause; auto-advance after 6 s with fake timers, not with reduced motion, not when paused; `Mới cập nhật` shows ≤ 6 cards with `x/y chương` and a `Xem tất cả` link to `/novels/all`; `/novels/all` lists all with breadcrumb.
- [ ] Implement → full backend + frontend suites → commit `feat(novel): featured banner, Mới cập nhật and all-novels page on the public Novels home`.

### Task 5: Docs

- [ ] `PROGRESS.md` 2026-11-09 entry (these eight items; renderer VERSION 3 → **Publish again**; Add Vietsub removed; not deployed). Commit `docs: reader bar, Novels home and Vietsub filter in PROGRESS`.
