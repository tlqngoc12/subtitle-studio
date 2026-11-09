# Wide reader bar, seamless pages and small polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (or subagent-driven-development). TDD per task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Ten user-requested changes, approved in chat on 2026-11-09 (scope below).

**Architecture:** Frontend (`frontend/src`) plus `NovelRenderer` (Java). No API or schema change, no migration.

**Spec (approved):**

| # | Where | Change |
|---|---|---|
| 1 | Public reader, sticky icon bar (`pages/public/ReaderBar.tsx`) | The bar spans the **full width of the page column**, the same width as the images (`var(--reader-width)`), and follows A−/A+. **Left:** an icon link `←` (lucide `ArrowLeft`, tooltip and aria-label `Về trang truyện`, to `/novels/<slug>`) and, next to it, two lines: the **novel title** (bold, one line, ellipsis) and below it `publicChapterName` (e.g. `Chương 5` or the label), **without the chapter title**, smaller and muted. **Right:** `‹ › Mục lục Cài đặt` unchanged. Hide-on-scroll behaviour unchanged. |
| 2 | `NovelRenderer` | Remove the footer text `Ch. N · k/n` and its band. Pages 2+ have almost no top or bottom margin (about 8–16 px of paper), so consecutive images read as one continuous strip. Page 1 keeps the heading and its top margin. Lines must never be cut at the edge of an image: keep the existing page-break logic, just with the new margins. The diagonal watermark stays. Bump `VERSION` to 4. |
| 3 | Featured banner, fact `Cập nhật` | Format `dd/MM/yyyy` (e.g. `09/11/2026`), same `Asia/Ho_Chi_Minh` timezone. |
| 4 | Featured banner, covers | Clicking **any** cover opens **that novel's page** (`/novels/<slug>`; make covers links, accessible name `<title>`). To browse, add two small icon buttons `‹` / `›` (aria-labels `Truyện trước` / `Truyện sau`, with `Tip`) next to the `01 / 05` counter; they change the current novel and restart the 6 s timer. Pause, hover/focus pause and reduced-motion rules unchanged. |
| 5 | Breadcrumbs (`components/Breadcrumbs.tsx`) | Prettier: small text (`--step--1`), muted links, thin muted `ChevronRight` separators (≈14 px), current item ink and semibold, links turn brand orange on hover/focus with no underline until hover, items truncate with ellipsis on narrow screens (current item keeps priority), comfortable spacing above and below. |
| 6 | Public novel page, chapter list | One **continuous bordered box** (radius as cards), compact rows (≈40 px, smaller text), thin dividers between rows, no gaps; hover background; keep the `Check` (Đã đọc) icon and the `Đang đọc` badge. Desktop (≥ 760 px) with more than 12 chapters: two columns inside the box (reading order goes down the first column, then the second). |
| 7 | Admin chapter page (`pages/ChapterPage.tsx`) | **Number** (narrow) · **Chapter label** (narrow, about 200–240 px) · **Chapter title** (fills the rest) on **one row**; wraps on narrow screens (Title on its own line). Info tooltips unchanged. |
| 8 | Toasts (`AppToaster`) | The close button sits at the **right** of the toast (top-right corner), via sonner options if 2.0.8 has one, else CSS on its close-button element. Admin and public. |
| 9 | Public novel page | When the novel has a description: two tabs (Radix Tabs, existing `tabs__*` styles), **`Giới thiệu`** first (selected by default, the description with line breaks kept) then **`Danh sách chương`**. Without a description: no tabs, just the chapter list with its heading. The selected tab is kept in the URL (`?tab=chapters`) so Back returns to it. |
| 10 | Vietsub › Manage Vietsub | Space between the search/Filter toolbar and the top border of the video list (e.g. 12–16 px margin), so the toolbar no longer touches the list's line. |

## Global Constraints

- Branch `feature/novel-page-checks`: first `git checkout feature/novel-page-checks`, then `git merge --ff-only main` (main is at 5b41961). Never push, merge into main, or deploy.
- Brand colours orange `#F39A42` / purple `#D9A1D9`, red only for errors/delete; icons only from `lucide-react`; tooltips with `Tip`; Radix already in the project; no new packages; reuse classes and CSS tokens; dark-mode safe.
- Public Novels copy in Vietnamese (`publicNames.ts`); admin copy in English.
- Reader copy guards keep working; the bar stays outside `.reader`.
- Tests: `cd frontend && npx vitest run`, `npx tsc -b --noEmit`; Java: `mvn test -Dskip.npm` (read the Maven summary line). Stage by path; never `git add -A`; never stage `frontend/tsconfig.tsbuildinfo` or `.claude/`.
- One commit per task; messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Renderer: no footer text drawn; pages 2+ start within ~16 px of the top; no text line crosses an image edge; page count for a long text does not grow compared with VERSION 3 — test in Task 1.
2. Banner: each cover is a link to its own novel; `‹`/`›` change the current novel and reset the timer; auto-advance rules unchanged — tests in Task 2.
3. Novel page tabs: default `Giới thiệu`; `?tab=chapters` opens the list; no description → no tablist — tests in Task 3.
4. Reader bar: shows novel title + `Chương N` (no chapter title) and the back link; width follows `--reader-width` — tests in Task 2.

---

### Task 1: Renderer — seamless pages

**Files:** `NovelRenderer.java` + `NovelRendererTest.java`.
- [ ] Failing tests (Review Focus 1) → implement → `mvn test -Dskip.npm` → commit `feat(novel): chapter images join into one continuous strip (no page footer)`.

### Task 2: Reader bar, banner, breadcrumbs, toast close button

**Files:** `ReaderBar.tsx`, `ReaderPage.tsx`, `FeaturedNovels.tsx`, `publicNames.ts` (date), `Breadcrumbs.tsx`, `AppToaster.tsx`, `styles.css`, tests.
- [ ] Failing tests: items 1, 3, 4, 8 and Review Focus 2 and 4 (breadcrumb styling is CSS: assert class names/structure only) → implement → vitest + tsc → commit `feat(novel): full-width reader bar with the novel title, cover links in the banner, nicer breadcrumbs; toast close on the right`.

### Task 3: Novel page tabs + compact chapter list; admin chapter row; Manage Vietsub spacing

**Files:** `PublicNovelPage.tsx`, `ChapterPage.tsx`, `VietsubPage.tsx` / `VietsubList.tsx` (whichever owns the spacing), `styles.css`, tests.
- [ ] Failing tests: Review Focus 3; chapter list in one container with read/current marks; admin Number/Label/Title share one row container → implement → vitest + tsc → commit `feat(novel): description and chapter tabs, compact chapter list; label and title on one row; space under the Vietsub toolbar`.

### Task 4: Docs

- [ ] `PROGRESS.md` 2026-11-09 entry (these ten items; renderer `VERSION` 4 → **Publish again**; not deployed). Commit `docs: wide reader bar and polish in PROGRESS`.
