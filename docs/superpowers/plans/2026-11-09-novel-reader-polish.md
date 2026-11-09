# Novel reader polish (public Novels + toast + renderer) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (or subagent-driven-development). TDD per task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make the public Novels pages comfortable for Vietnamese readers, centre the toasts, and keep the blank lines a translator types. Scope approved in chat on 2026-11-09.

**Architecture:** Frontend only (`frontend/src`, React + TS), except `NovelRenderer` (Java) for blank lines. No API or schema change, no migration. Public pages run on the static Cloudflare site: reader preferences live in `localStorage`, always wrapped in try/catch, and the page must work without it.

**Spec (approved):**

| # | Where | Change |
|---|---|---|
| 1 | `components/AppToaster.tsx` (admin + public) | Toasts in the **centre of the screen**, both horizontally and vertically (sonner 2.0.8: `position="top-center"` + an `offset`/`mobileOffset` top of about `calc(50vh - 40px)`, or equivalent CSS). Keep `closeButton` and `duration={4000}`. |
| 2 | `novel/render/NovelRenderer.java` | Draw the text as typed: each empty line in the chapter text adds one blank line (`lineHeight`) of space. Consecutive non-empty lines stay paragraphs with today's 0.35 gap. Leading and trailing blank lines are ignored. Bump `VERSION` to 2 so cached images are redrawn on the next Publish. |
| 3 | Public naming | New helpers (e.g. in `pages/public/publicNames.ts`): `publicChapterName(no, label)` returns the label or `Chương N`; `publicChapterLabel(no, title, label)` returns `Chương N: title` / `Ngoại truyện 1: title`. Used everywhere in public Novels (reader select, list, buttons, alt, tab title). The admin keeps `chapterName`/`chapterLabel` ("Chapter"). |
| 4 | `ReaderPage` head (fixes "chapter name shown 3 times" and "select next to a short title") | The `h1` stays but is `visually-hidden`, because the drawn image already shows the name. Below the back link sits one **toolbar**: `‹ Chương trước` · chapter `<select>` (grows to fill) · `Chương sau ›`, plus a display row (item 9). The select's label is visually hidden (`Danh sách chương`). It wraps on narrow screens: select on its own full-width row, buttons below. |
| 5 | Loading / layout shift | While the chapter loads: `Đang tải chương…`. Images: CSS `aspect-ratio: auto 1080 / 1600` (no jump before load); first image `loading="eager"`, the rest `lazy`. |
| 6 | End of chapter | After the images: if there is a next chapter, a large button/card `Chương sau` with the next chapter's `publicChapterLabel`, plus a small `‹ Chương trước` link. On the last published chapter: a box `Bạn đã đọc hết các chương đã đăng.` with a link `Về trang truyện`. This replaces the bottom Previous/Next row. |
| 7 | Reading progress (`localStorage`) | Opening a chapter stores `{ chapterNo }` under `novel-progress:<slug>` and adds the number to `novel-read:<slug>` (JSON array). Novel page: if the stored chapter is still published, the primary button is `Đọc tiếp: <publicChapterLabel>` with a secondary `Đọc từ đầu`; otherwise `Bắt đầu đọc`. Chapter list: read chapters get a lucide `Check` icon and a muted style; the stored one gets the badge `Đang đọc`. |
| 8 | Night mode | Images get `filter: invert(0.88) hue-rotate(180deg)` (combined with the existing blur when hidden). Default: on when the app theme is dark (same rule as the CSS tokens), off when light. A toggle button `Chế độ đêm` (lucide `Moon`/`Sun`, `aria-pressed`) overrides the default and is stored in `reader-night` (`on`/`off`). |
| 9 | Text size | Buttons `A−` / `A+` (aria-labels `Chữ nhỏ hơn` / `Chữ lớn hơn`, disabled at the ends) switch the reader width between 600 / 760 / 900 px (default 600). Stored in `reader-width`. On screens narrower than the width, images stay 100% wide. `.reader-page` max-width grows so 900 fits. |
| 10 | Keyboard | `←` / `→` (no modifier, focus not in a select/input/textarea) open the previous / next chapter. |
| 11 | Tab title | Reader: `Chương 5: Mưa · <novel title>`; novel page: `<novel title>`; novel list: `Truyện`. Restore the previous `document.title` on unmount. Public Novels pages only. |
| 12 | Continuous pages | No gap between images; round only the first image's top corners and the last image's bottom corners. |
| 13 | Vietnamese copy, public Novels only (`PublicNovelsPage`, `PublicNovelPage`, `ReaderPage`) | `Novels` → `Truyện`; `Loading list…` → `Đang tải…`; empty state `Chưa có truyện nào. Quay lại sau nhé.`; `Loading novel…` → `Đang tải truyện…`; `Author` → `Tác giả`; `Status` → `Trạng thái`; `Translation` → `Bản dịch`; tags aria `Thể loại`; `Original book` → `Truyện gốc`; `Chapters` → `Danh sách chương`; `Back to Novels` → `Về danh sách truyện`; back link fallback `Về trang truyện`; status labels `Đang ra` (ONGOING) / `Hoàn thành` (COMPLETED); count `N chương`; error titles shown as `Không tải được. Vui lòng thử lại sau.` (keep the hint if any); hidden-window note `Nội dung tạm ẩn khi cửa sổ không hoạt động.`; print note `Không hỗ trợ in trang này.`; image alt `Chương 5, trang 1/3`. The admin UI stays English. |

## Global Constraints

- New branch `feature/novel-reader-polish` from `main` (main is at `1d85047`, not pushed). Never push, merge or deploy.
- Brand colours orange `#F39A42` / purple `#D9A1D9`, red only for errors/delete; icons only from `lucide-react`; reuse existing classes (`button`, `badge`, `visually-hidden`, `field`, `alert`) and CSS tokens, and add dark-mode-safe styles.
- Keep the copy guards (`useCopyGuard`, shield, blur) working. The new buttons sit outside `.reader` so they stay clickable.
- `localStorage` access always in try/catch (private mode, blocked storage).
- Tests: `cd frontend && npx vitest run`, `npx tsc -b --noEmit`; Java: `mvn test -Dskip.npm`. Stage by path, never `git add -A`, never stage `frontend/tsconfig.tsbuildinfo` or `.claude/`.
- One commit per task; messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Blank lines: `"a\n\nb"` is taller than `"a\nb"`; `"a\n\n\nb"` is taller again; leading/trailing blank lines change nothing — test in Task 1.
2. Toast centred on desktop and mobile; no admin test broken.
3. The `localStorage` throwing on read/write → reader and novel page still render, defaults used — test in Task 3.
4. Stored progress pointing to an unpublished chapter → `Bắt đầu đọc`, no broken link — test in Task 3.
5. Arrow keys inside the chapter `<select>` do not navigate twice — test in Task 2.

---

### Task 1: Toast position + blank lines in the renderer

**Files:** `frontend/src/components/AppToaster.tsx` (+ CSS if needed), `src/main/java/com/subtitlestudio/novel/render/NovelRenderer.java`, `NovelRendererTest` (or the existing renderer test).

- [ ] Failing tests: renderer — page-1 content height (or the y of the last line / page count with a long text) grows for `a\n\nb` vs `a\nb`, and for three newlines vs two; leading/trailing blank lines give the same result as without; `VERSION == 2`. AppToaster — renders sonner with the centre configuration (assert the props/attributes you set).
- [ ] Implement, run `mvn test -Dskip.npm` + vitest + tsc, commit `feat: centre the toasts; reader images keep the blank lines typed in a chapter`.

### Task 2: Reader page — toolbar, naming, loading, end of chapter, keys, tab title, continuous pages, Vietnamese copy

**Files:** `pages/public/ReaderPage.tsx`, `pages/public/PublicNovelPage.tsx`, `pages/public/PublicNovelsPage.tsx`, new `pages/public/publicNames.ts` (+ test), `styles.css`, their tests.

- [ ] Failing tests: `publicChapterName/Label` (number, label, title); reader shows `Đang tải chương…` before the chapter resolves; only one visible chapter name outside the images (the select's selected option), h1 visually hidden; toolbar buttons `Chương trước`/`Chương sau` link to the right chapters; end card shows next chapter's label, or the "đã đọc hết" box on the last one; `ArrowRight` navigates to next, `ArrowLeft` to prev, not when the select has focus; `document.title` set and restored; first image `loading="eager"`; novel page and list texts in Vietnamese (status, count, headings).
- [ ] Implement, run vitest + tsc, commit `feat(novel): Vietnamese public reader with one chapter toolbar, end-of-chapter next, arrow keys and tab titles`.

### Task 3: Reading progress, night mode, text size

**Files:** new `pages/public/readerPrefs.ts` (localStorage helpers + tests), `ReaderPage.tsx`, `PublicNovelPage.tsx`, `styles.css`, tests.

- [ ] Failing tests: opening a chapter stores progress and read list; novel page shows `Đọc tiếp: …` + `Đọc từ đầu` with stored progress, `Bắt đầu đọc` without or when the stored chapter is gone; read chapters marked, current one `Đang đọc`; `localStorage` throwing → pages still render with defaults; night toggle flips `aria-pressed` and the reader class, persisted; A−/A+ change the width step, disabled at the ends, persisted.
- [ ] Implement, run vitest + tsc, commit `feat(novel): remember the reading position, night mode and text size in the public reader`.

### Task 4: Docs

- [ ] Add a 2026-11-09 entry to `PROGRESS.md` (reader polish; images need **Publish again** for the blank-line change; not deployed). Commit `docs: novel reader polish in PROGRESS`.
