# Novels Translated tab redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fanfics-style cards with search/filter/sort for Novels › Translated (admin and public), banner picks chosen by hand (max 5), and a one-row Tủ sách on the public tab.

**Architecture:** A `featured` flag on `t_novel` (V22) toggled by a new endpoint and exported to the public JSON; the public banner prefers picked novels. One shared `NovelCard` + toolbar/filter helpers serve the admin tab (with a "…" menu), the public tab and a new `/novels/shelf` page.

**Tech Stack:** Java 21, Spring Boot 3.5, Flyway (Oracle + H2), JUnit 5; React + TS, Vitest.

**Spec:** [docs/superpowers/specs/2026-11-14-novels-translated-tab-design.md](../specs/2026-11-14-novels-translated-tab-design.md)

## Global Constraints

- Work on branch `fix/novel-cta-rows` (PR #30), as the user asked. Never stage `data/`.
- Banner limit 5; error code `BANNER_FULL` (409), message "The banner already has 5 novels. Remove one first."
- Toggling `featured` must not change `t_novel.updated_at`.
- Admin copy English; public copy Vietnamese (`useT` where the component is shared, like Fanfics). Brand colours: orange actions, purple "On banner"/selected chips; red only for errors.
- `docs/ui/screen-layout.md` applies. Reuse Fanfics pieces (`SearchBar`, chips, sort select, `normalizeForSearch`, card/menu patterns) instead of copying them.
- Commits English, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01XPHWqyurVDfuumuV9psv9g`.

## Review Focus

- 5 picked + "Add to banner" → alert in the UI, no API call; the API alone also answers 409 (Task 2 + Task 4 tests).
- Re-saving `featured=true` on a picked novel when 5 are picked → 200, not 409 (Task 2 test).
- Public `novels.json` from an older publish (no `featured`, no `createdAt`, no `description`) → banner falls back, sorts don't crash, cards render (Task 5 test).
- Picked novels that are all unpublished (absent from the public JSON) → fallback banner, not an empty one (Task 5 test).
- Tủ sách row with more saved novels than fit → one row only, hidden items not focusable, "Xem tất cả (N)" opens `/novels/shelf` with all of them (Task 6 test).
- Toolbar fixes change Fanfics and Works too: their tests stay green and the selected pill reads stronger than the orange unselected ones (Task 4a).

---

### Task 1: V22 `featured` column

**Files:** Create `src/main/resources/db/migration/V22__novel_featured.sql` (header comment like V7/V21). Modify `src/main/java/com/subtitlestudio/novel/Novel.java`. Test: a migration test like `V21MigrationTest`; check `PersistenceOracleIT` lists/columns if it asserts columns.

**Interfaces:** Produces `Novel.isFeatured(): boolean`, `Novel.setFeatured(boolean)`.

- [ ] Failing test: after migrating, existing `t_novel` rows have `featured = 1`; a row inserted afterwards without the column gets `0`.
- [ ] SQL: `ALTER TABLE t_novel ADD (featured NUMBER(1) DEFAULT 0 NOT NULL);` then `UPDATE t_novel SET featured = 1;`
- [ ] Map the field; `mvn test -Dskip.npm -Dtest='V22*'` PASS. Commit `feat: featured flag on novels (V22, existing novels picked)`.

### Task 2: Admin summary fields and the featured endpoint

**Files:** Modify `NovelSummary.java`, `NovelService.java` (`list`, new `setFeatured`), `NovelController.java`, `web/ApiExceptionHandler.java`; create `novel/BannerFullException.java`. Tests: `NovelServiceTest` (or the service test class in use), `NovelControllerTest`.

**Interfaces:**
- `NovelSummary` gains `boolean featured, Instant createdAt, Instant lastPublishedAt, String originalAuthor, String description` (keep existing components and the secondary constructor working).
- `NovelService.setFeatured(long id, boolean featured): NovelSummary`: when turning on and the novel is not yet picked, count picked novels; ≥ 5 → `BannerFullException`. Must not touch `updatedAt`: it only moves through `Novel.touch()` (no JPA hook), so just do not call `touch()`.
- `list()`: compute `lastPublishedAt` from the chapter list it already loads per novel; no extra query.
- `PUT /api/novels/{id}/featured` body `{featured}` → 200 `NovelSummary`; 404 for an unknown id; 409 `BANNER_FULL`.

- [ ] Failing tests: toggle on/off; 6th pick → 409 with code `BANNER_FULL`; re-saving a picked novel at 5 → 200; `updatedAt` unchanged after a toggle; `list()` returns `featured`, `createdAt`, `lastPublishedAt` (max `published_at` of published chapters, null if none).
- [ ] Implement; `mvn test -Dskip.npm -Dtest='Novel*Test'` PASS. Commit `feat: pick novels for the public banner (max 5)`.

### Task 3: Export `featured`, `createdAt`, `description`

**Files:** `publish/PublicNovelSummary.java`, `publish/NovelExporter.java`, `frontend/src/data/novelTypes.ts` (optional fields `featured?: boolean; createdAt?: string; description?: string | null`). Test: `NovelExporterTest`.

- [ ] Failing test: exported summary carries `featured`, `createdAt`, `description`. Implement. Full `mvn test -Dskip.npm` PASS (report counts). Commit `feat: export banner picks and creation time to the public site`.

### Task 4a: Shared toolbar fixes and `useConfirmDialog` alert mode

**Files:** Modify `frontend/src/components/ui/FilterPills.css` (+ test if needed), `frontend/src/components/useConfirmDialog.tsx` (+ `.css`, test), `frontend/src/components/fanfics/FanficsTab.tsx` (+ `.css`, test). Extract the toolbar (search + `FilterPills` + sort `Select`) from `FanficsTab` into a shared component (e.g. `components/ui/ListToolbar.tsx`) that Task 4 and Task 5 reuse; Fanfics behaviour and tests stay green.

- `FilterPills`: unselected pills keep the orange `.button` border (user's choice); selected pill = solid `background: var(--brand-2)`, `color: var(--on-brand)`, bold, `border-color: var(--brand-2-ink)` (same as NavBar); at `max-width: 520px` pill height `var(--control-m)`.
- Sync the "selected" style: `components/NavBar.css` `.nav__pill` gets `border: 1px solid var(--brand-2-ink)` (use `box-sizing: border-box`; the pill is `position: absolute; inset: 0`, so no layout shift), and `components/Pagination.css` `.pager__link--active` gets `border-color: var(--brand-2-ink)`. In dark, `--brand-2-ink` = `--brand-2`, so dark looks the same. Run `src/components/NavBar* src/components/Pagination*` tests too.
- Sort select: decorative lucide `ArrowUpDown` icon (`aria-hidden`) at its start; hidden label stays the accessible name.
- Search placeholder: Fanfics "Search by title, author…" / "Tìm theo tên, tác giả…" (`aria-label` unchanged).
- `ConfirmOptions.alertOnly?: boolean`: no Cancel button, focus on the confirm button, Esc or OK resolve; confirm mode unchanged.

- [ ] Failing tests: alert mode renders one button with focus on it and resolves on OK/Esc; existing confirm tests still pass; Fanfics toolbar still filters/sorts through the extracted component.
- [ ] Implement; `npx vitest run src/components/ui src/components/useConfirmDialog* src/components/fanfics src/pages/WorksPage*` PASS. Commit `refactor: shared list toolbar, clearer filter pills and an alert-only dialog`.

### Task 4: Shared card and the admin Translated tab

**Files:** Create `frontend/src/components/novel/NovelCard.tsx` (+ `.css`, `.test.tsx`), `frontend/src/components/novel/NovelMenu.tsx`, `frontend/src/lib/novelList.ts` (+ test). Modify `frontend/src/pages/NovelsPage.tsx` (+ test), `frontend/src/api/novels.ts` (`NovelSummary` fields, `setNovelFeatured(id, featured): Promise<NovelSummary>`), `frontend/src/lib/errors.ts` (`BANNER_FULL`). Use the toolbar from Task 4a.

**Interfaces:**
- `novelList.ts`: `type NovelSort = 'updated' | 'read' | 'added' | 'title'`; `type NovelStatusFilter = 'all' | 'completed' | 'ongoing'`; `filterNovels<T extends NovelListItem>(items: T[], query: string, status: NovelStatusFilter): T[]` (title, author, tags/slug via `normalizeForSearch`); `sortNovels<T>(items: T[], sort: NovelSort, reads: Record<string, number> | null): T[]` (updated = `lastPublishedAt ?? updatedAt` desc; read desc, unknown last; added = `createdAt` desc, missing last; title = `localeCompare` vi, A–Z). `NovelListItem` = the fields both admin `NovelSummary` and public `PublicNovelSummary` share (title, slug, novelStatus, updatedAt, lastPublishedAt?, createdAt?, originalAuthor?, tags?).
- `NovelCard({ novel, href, reads, menu, labels })`: cover left, title (2-line clamp), status badge, stats row (admin: Chapters / Published / Reads / Updated; public: Chương / Lượt đọc / Cập nhật), description clamp, purple "On banner" badge when `featured` (admin only), muted "Not on the site until a chapter is published" when featured and `publishedCount === 0` (admin only). Card links to `href`; `menu` sits above the link like `FanficCard`.
- `NovelMenu({ novel, pickedCount, onChange })`: "Add to banner" / "Remove from banner". When adding with `pickedCount >= 5`, call `confirm({ alertOnly: true, title: 'Banner is full', description: 'The banner already has 5 novels. Remove one before adding another.', confirmLabel: 'OK' })` and call no API. Success toasts "Added to banner" / "Removed from banner"; API errors via `errorMessage`.
- `NovelsPage`: toolbar (search label "Search novels", placeholder "Search by title, author, slug…", chips All / Completed / Ongoing, sort Newest update / Most read / Recently added / Title A–Z, "New novel" button), cards, empty "No novels match." State in component state like Fanfics (not the URL).

- [ ] Failing tests: `novelList` filter/sort cases (including missing `createdAt` last, unknown reads last, accent-insensitive search); `NovelCard` admin vs public labels and the "On banner"/unpublished hint; `NovelMenu` alert at 5 with no API call, add/remove call `setNovelFeatured`; `NovelsPage` search + chip + sort narrow and reorder the list.
- [ ] Implement; `npx vitest run src/lib src/components/novel src/pages/NovelsPage* src/components/fanfics` PASS. Commit `feat: Fanfics-style Translated tab with search, filter, sort and banner menu`.

### Task 5: Public tab: banner rule, toolbar and cards

**Files:** Modify `frontend/src/pages/public/PublicNovelsPage.tsx` (+ test, + `.css`), `frontend/src/PublicApp.tsx` (route `/novels/all` → `<Navigate to="/novels" replace />`). Delete `PublicAllNovelsPage.tsx` and its tiles/CSS if nothing else imports them (grep first).

**Interfaces:** `bannerNovels(novels: PublicNovelSummary[]): PublicNovelSummary[]` in `pages/public/publicNames.ts`: `byLatestUpdate(novels.filter(n => n.featured)).slice(0, 5)`, else `byLatestUpdate(novels).slice(0, 5)`.

Layout top to bottom: banner (`bannerNovels`), Tủ sách row (Task 6), toolbar from Task 4a (Vietnamese: label "Tìm truyện", placeholder "Tìm theo tên, tác giả, thẻ…", Tất cả / Hoàn thành / Đang ra, Mới cập nhật / Đọc nhiều nhất / Mới thêm / Tên A–Z), all novels as `NovelCard` (public labels, no menu), empty "Không tìm thấy truyện nào." The "Mới cập nhật" section and its link are removed.

- [ ] Failing tests: `bannerNovels` picks only featured; falls back when none featured and when the JSON has no `featured`; the page renders all novels as cards and no "Mới cập nhật" heading; search/chip/sort work; `/novels/all` redirects to `/novels`.
- [ ] Implement; targeted vitest PASS. Commit `feat: public Truyện dịch tab like Fanfics, banner uses picked novels`.

### Task 6: Tủ sách row and `/novels/shelf`

**Files:** Create `frontend/src/pages/public/ShelfRow.tsx` (+ css, test), `frontend/src/pages/public/PublicShelfPage.tsx` (+ test). Modify `PublicNovelsPage.tsx`, `PublicApp.tsx` (route `/novels/shelf`).

- `ShelfRow({ novels })`: heading "Tủ sách" + link "Xem tất cả (N)" (N = all saved novels) to `/novels/shelf`; ONE row of compact items (cover + title + "Đang đọc Chương N" from `readProgress` when set), never wrapping, no horizontal scroll. Items that do not fit must not be reachable by Tab or screen readers: measure the row with a `ResizeObserver` and render only the items that fit (preferred), or hide the overflow rows with `visibility: hidden`. Clipping alone (`overflow: hidden`) is not enough. Hidden when the shelf is empty.
- `PublicShelfPage`: breadcrumb Novels › Tủ sách, title "Tủ sách", every saved novel (shelf order) as `NovelCard`; empty state "Chưa có truyện nào trong tủ sách."

- [ ] Failing tests: row hidden with an empty shelf; "Xem tất cả (N)" links to `/novels/shelf` with the right N; items beyond the measured width are not rendered/focusable (mock `ResizeObserver`); the shelf page lists all saved novels in shelf order. (Visual one-row behaviour: check in a screenshot, see Task 7.)
- [ ] Implement; targeted vitest PASS. Commit `feat: one-row Tủ sách with a full shelf page`.

### Task 7: Verify, docs, PR

- [ ] Screenshots (headless Edge, as in PR #30): admin `/novels` at 1280x900; public `/novels` at 1200x800 and 390x844 with a seeded shelf of 8 novels (temporary mock JSON in `frontend/public/data` + localStorage seed, deleted afterwards, never committed). Save to the scratchpad as `translated-admin.png`, `translated-public-desktop.png`, `translated-public-phone.png`. Check: cards even, Tủ sách one row, nothing overflows at 390px, unselected pills orange-bordered, selected pill clearly purple, sort icon visible. Also screenshot public Fanfics at 390x844 (`fanfics-toolbar-phone.png`) to show the toolbar fixes.
- [ ] `CLAUDE.md`: banner rule (picked, max 5, fallback), `PUT /api/novels/{id}/featured`, `/novels/all` → `/novels`, `/novels/shelf`. `PROGRESS.md` entry (Vietnamese). Spec status → approved 2026-11-14. Commit the spec and plan too.
- [ ] `mvn test -Dskip.npm`, `cd frontend && npm test && npm run build`, each in the background with a log, polled. Report counts (known frontend load flakes: VietsubPage, HomePage, titleClamp, WorkEditPage, BlockEditor, PhotosPage; re-run alone).
- [ ] Push `fix/novel-cta-rows`; `gh pr edit 30`: new title covering everything, body sections for this feature (keep the CTA-rows and Data sections and the final Generated-with line). Do not merge.
