# Novels › Translated (admin + public): Fanfics-style cards, search/filter/sort, banner picks, Tủ sách row (design)

Date: 2026-11-14 · Status: approved 2026-11-14

## Why

The admin Novels › Translated tab is a grid of narrow cards (~250px) of uneven height: long titles are cut, "2 chapters ·
2 published" wraps, and the cards sit packed on the left. The Fanfics tab next to it has wide horizontal cards, a stats
row, search, a status filter, a sort and a "…" menu. The user wants both tabs to look and work alike, and wants to
choose by hand which novels the public Novels page's fanned banner shows. Today it is always the 5 most recently
updated novels. The public "Truyện dịch" tab gets the same cards and toolbar, and its shelf becomes one compact row
with a full shelf page. A UI/UX review of the shared toolbar (2026-11-14) found a few issues that are fixed here too.

## Decisions (from the user)

1. Cards look like the Fanfics cards (option A).
2. Search, filter and sort like Fanfics.
3. A "…" menu on each card adds the novel to the banner or removes it. Adding when 5 are already picked shows an alert.
4. Banner rule (option A): the public banner shows the **picked** novels (at most 5), ordered as today (latest
   published chapter first). When **none** is picked, it falls back to today's rule (the 5 most recently updated), so
   the banner is never empty.
5. The two existing novels ("Be My Sugar!" and "My Grumpy Vampire [EmiBonnie]") start as picked.
6. The public "Truyện dịch" tab is redesigned like the Fanfics tab, with a one-row Tủ sách and a `/novels/shelf` page.
7. The "banner full" alert uses `useConfirmDialog`, extended with an alert-only mode.
8. The shared toolbar fixes from the UI/UX review are in scope (they also change Fanfics and Works).
9. Everything ships in PR #30 (branch `fix/novel-cta-rows`).

## Non-goals

- No drag-and-drop ordering of the banner (option C was not chosen).
- No change to the public novel page, the reader or the novel/chapter editors.
- Fanfics keeps its behaviour. Only the toolbar pieces it shares change (extracted for reuse, plus the visual fixes
  below).
- Filter/sort state is not kept in the URL (Fanfics keeps it in component state; do the same).
- No change to which novels exist on the public site: a novel still needs at least one published chapter.

## Design

### Data

- Flyway **V22** (check that V21 is still the latest): `t_novel.featured` NUMBER(1) NOT NULL DEFAULT 0, then
  `UPDATE t_novel SET featured = 1` (all existing novels; today exactly the two above). Works on Oracle and H2.
- `Novel.featured` (boolean). New novels start with `featured = false`.

### Backend

- `NovelSummary` (admin list) gains `featured`, `createdAt`, `lastPublishedAt` (latest `published_at` among its
  chapters, null if none), `originalAuthor` and `description` (for search and the card text). `NovelService.list()`
  already loads each novel's chapters to count them; compute `lastPublishedAt` from that same list (no extra query).
- `PUT /api/novels/{id}/featured` with body `{featured: boolean}` returns the updated `NovelSummary`.
  - Picking when 5 other novels are already picked → 409 `BANNER_FULL` with the message "The banner already has 5
    novels. Remove one first." A novel that is already picked can be re-saved.
  - `featured` is stored on its own: no change to `updatedAt` (so the "Newest update" order does not jump).
    `updatedAt` only moves through `Novel.touch()` (no JPA hook), so `setFeatured` simply does not call it.
- Publish: `PublicNovelSummary` gains `featured`, `createdAt` and `description`. `NovelExporter` exports them as is.

### Public site

- `PublicNovelsPage`: `featured = byLatestUpdate(novels.filter(n => n.featured)).slice(0, 5)`. If that list is empty,
  use today's `byLatestUpdate(novels).slice(0, 5)`. A picked novel with no published chapter is simply not on the site.
- `data/novels.json` from an older publish has no `featured`. Treat missing as false, so the fallback applies until the
  next Publish.

### Admin Translated tab (`NovelsPage.tsx`)

- **Card** (new `components/novel/NovelCard.tsx`, styled after `FanficCard`): cover on the left; title (not cut to one
  word, at most 2 lines); status badge (Ongoing / Completed, as today); a stats row with Chapters, Published, Reads
  ("–" when unknown) and Updated (date); a short description, clamped like Fanfics. A purple **"On banner"** badge when
  picked. If picked but no chapter is published: muted hint "Not on the site until a chapter is published". The whole
  card links to `/novels/{id}` as today; the "…" button sits above the link (same pattern as `FanficMenu`).
- **"…" menu** (Radix dropdown like `FanficMenu`): "Add to banner" / "Remove from banner".
  - When 5 are already picked, "Add to banner" stays clickable and shows an alert instead of calling the API:
    title "Banner is full", text "The banner already has 5 novels. Remove one before adding another.", one "OK"
    button. The API's 409 shows the same text (as an error toast) if it happens anyway.
  - **`useConfirmDialog` alert mode:** a new option `alertOnly?: boolean` in `ConfirmOptions`. It hides Cancel, shows
    only the confirm button (`confirmLabel`, here "OK") and puts focus on it; Esc and OK both resolve the promise.
    Confirm-mode behaviour and its tests stay unchanged.
  - Success toast: "Added to banner" / "Removed from banner".
- **Toolbar** (same component and layout as Fanfics):
  - search box "Search novels" (title, original author, slug; accent-insensitive like Fanfics);
  - status chips All / Completed / Ongoing;
  - sort: Newest update (`lastPublishedAt ?? updatedAt`, newest first, as today), Most read (reads from
    `/api/novels/reads`, unknown last), Recently added (`createdAt`), Title A–Z;
  - "New novel" button stays.
  Filter/sort state lives in component state, like Fanfics.
- Empty states: no novels at all (today's text); nothing matches the search/filter ("No novels match.").
- Layout follows `docs/ui/screen-layout.md` and the brand colours (orange actions, purple "On banner"/selected chips).

### Public "Truyện dịch" tab (user decisions: redesign like the Fanfics tab)

The public home tab (`PublicNovelsPage`, `/novels`) becomes, top to bottom:
1. **Banner xoè** (unchanged component, new picking rule above).
2. **Tủ sách** (only when the reader has saved novels): a heading "Tủ sách" with a **"Xem tất cả"** link on the right,
   and ONE row of compact items (cover + title, linking to the novel; the reading progress "Đang đọc Chương N" if any).
   The row never wraps: it shows as many items as fit the width (phones: as many as fit, no horizontal scroll), the
   rest are reached through "Xem tất cả". "Xem tất cả" opens the new page **`/novels/shelf`** ("Tủ sách", breadcrumb
   Novels › Tủ sách) listing every saved novel with the same cards as the list below, in shelf order.
   - The link shows the count, **"Xem tất cả (N)"**, so the reader knows more novels are on the shelf.
   - Items that do not fit must be fully hidden, not only clipped: `visibility: hidden` (or not rendered), so Tab
     and screen readers never reach an invisible link.
3. **Toolbar** like the public Fanfics tab, in Vietnamese: search "Tìm truyện" (title, original author, tags;
   accent-insensitive with `normalizeForSearch`); chips Tất cả / Hoàn thành / Đang ra; sort Mới cập nhật (default),
   Đọc nhiều nhất (reads from `useReadCounts`, unknown last), Mới thêm, Tên A–Z.
4. **Every public novel** as Fanfics-style cards: the same `NovelCard` as the admin tab, in read-only mode (Vietnamese
   labels, no "…" menu): cover, title, status (Hoàn thành / Đang ra), stats (Lượt đọc, Chương, Cập nhật), short
   description. Empty result: "Không tìm thấy truyện nào."
- Removed: the "Mới cập nhật" section and its "Xem tất cả" link. `/novels/all` redirects to `/novels` (keep old links
  working); `PublicAllNovelsPage` and its tiles go away if nothing else uses them.
- "Mới thêm" needs the creation time: `PublicNovelSummary` gains `createdAt` (exported by `NovelExporter`). Old
  `novels.json` without it sorts those novels last for that sort only.
- Reuse one toolbar component and the filtering/sorting helpers for admin Translated, the public tab and Fanfics where
  the options match, with labels from `useT` as Fanfics does; one `NovelCard` for admin and public.

### Shared toolbar fixes (UI/UX review, 2026-11-14)

These change the shared `FilterPills`, the sort select and the search placeholder, so Fanfics and Works change too.

1. **One "selected" style for the app: solid purple.** Unselected pills **keep the orange border** (user's choice,
   2026-11-14). The selected pill today has a faint purple fill (28%) and looks *weaker* than the orange ones. It
   becomes the same as the NavBar pill and the active pagination link: background `var(--brand-2)`, text
   `var(--on-brand)`, bold. Measured contrast: text 7.96:1 (light) / 8.84:1 (dark); a 40% tint would give the fill
   only 1.32:1 (light) / 2.41:1 (dark) against the surface. In the light theme solid `--brand-2` is only 1.89:1 on
   `--paper` (under the 3:1 non-text minimum), so the selected pill **and the NavBar pill** get a 1px
   `var(--brand-2-ink)` border (#8e4f8e, 5.33:1; in dark it equals `--brand-2`, so dark looks unchanged). The
   active pagination link already uses `--brand-2` and gets the same `--brand-2-ink` border, so all three match.
2. **Chip touch size.** Pills are 32px (`--control-s`). At ≤520px use `--control-m` (40px). Keep the 8px gap.
3. **Sort has a visible cue.** Add the lucide `ArrowUpDown` icon at the start of the sort select (decorative,
   `aria-hidden`); the hidden "Sắp xếp"/"Sort" label stays as the accessible name.
4. **Search placeholder says what it searches.** Fanfics: "Tìm theo tên, tác giả…" / "Search by title, author…";
   Translated: "Tìm theo tên, tác giả, thẻ…" / "Search by title, author, slug…". The `aria-label` stays short
   ("Tìm truyện", "Search novels", …).

## Left to the builder

- Whether to extract a shared toolbar/search component from `FanficsTab` or reuse it as is. Prefer reuse over copy.
- The exact stats icons (lucide, as Fanfics uses).
- Tests: the V22 migration (column + existing rows set to 1, on H2), the featured endpoint (toggle, 409 at 5, re-save
  allowed, `updatedAt` unchanged), the exporter fields, the public banner rule (picked only; fallback when none; missing
  field = false; picked novels all absent from the public JSON → fallback), `useConfirmDialog` alert mode (no Cancel,
  focus on OK), shelf row (hidden items not focusable, count in the link), the toolbar fixes (selected pill solid
  `--brand-2` with `--on-brand` text and `aria-pressed`), and the card/menu/toolbar component behaviour.
