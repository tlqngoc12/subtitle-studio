# Novels UI review, batch 1 — design

Date: 2026-11-14. Branch: `feat/novels-ui-review`. Size: small-to-medium (frontend + one public JSON field).

## Why

A screenshot review (Edge, 1280 px and 390 px, light and dark) of admin and public Novels found layout bugs and weak spots. The user picked items 1, 3, 4, 5, 6 of the review (item 2, Wattpad titles with a repeated number, is out). The user also noticed that "7/7 chương" means nothing to a reader: the number after the slash is the chapters *added to the app* (drafts included), not the original's total, which the app does not know for screenshot novels. Decision **(a)**: show only the published chapter count.

## Changes

### 1. Navbar on phones: the current section is always fully visible (all pages, admin and public)

Seen on the user's iPhone (Safari): on a novel page the bar showed "Vietsub Profile Works Photo…" and the current "Novels" pill was off-screen. Edge does not reproduce it. `NavBar.tsx` centres the current link with `scrollIntoView({ inline: 'center' })`, which Safari does not apply reliably to a horizontal scroller inside a sticky header.

- Replace `scrollIntoView` with an explicit `nav.scrollLeft` that centres `[aria-current="page"]` within the nav (clamped to `0..scrollWidth-clientWidth`). Run it on mount, on route change, on resize, and once more after `document.fonts.ready` (widths change when the web font arrives). Never scroll the page itself.
- The edge fades (`data-fade-start/-end`, mask) grow from 14 px to 32 px so a half-cut word ("e", "ofile") fades out instead of looking broken.
- Tests: a unit test with a stubbed layout (`scrollWidth`, `clientWidth`, `offsetLeft`/`offsetWidth` of the current link) asserts `scrollLeft` is set to centre the current link and clamped at both ends, and that `scrollIntoView` is not called; it re-runs after `document.fonts.ready` resolves. CSS test: the fade length is 32px.

### 3. End of chapter: one primary button

`pages/public/ReaderPage.tsx` `.reader__end-nav`: **Chương sau** stays `button button--primary`; **Chương trước** becomes a plain `button` (orange outline). Test: the previous link does not have `button--primary`, the next link does.

### 4. Card stats on phones: one compact line (Translated and Fanfic cards, admin and public)

```
phone (≤ 520 px), today                 phone, new
┌──────────────────────────┐            ┌──────────────────────────┐
│ ▤ Chương    │ 👁 Lượt đọc │            │ ▤ 7 chương · 👁 3 lượt đọc │
│ 7           │ 3          │            │ · 📅 14/11/2026            │
│ 📅 Cập nhật               │            └──────────────────────────┘
│ 14/11/2026               │
└──────────────────────────┘
```

- `Stat` (`components/fanfics/FanficCard.tsx`) gets an optional `unit?: string` ("chương", "lượt đọc", "bình chọn"; admin: "chapters", "published", "reads", "votes"; none for dates and reading time).
- From 521 px up, nothing changes (label above value, dividers).
- On phones the stats are one wrapping inline row: icon + value + unit, items separated by a `·`; the label is visually hidden (still read by screen readers, so each stat keeps its full name). Mobile-first CSS: the compact row is the default, the current grid moves under `@media (min-width: 521px)`.
- Tests: each stat still has its label text in the DOM; the unit is rendered; CSS: base `.fanfic-card__stats` is inline/flex-wrap, the grid is inside `min-width: 521px`, and `.fanfic-stat__label` text is visually hidden below 521 px.

### 5. Card list in two columns from 1024 px (Translated and Fanfics, admin and public)

`.fanfic-list` becomes `grid-template-columns: repeat(2, minmax(0, 1fr))` at `@media (min-width: 1024px)`, and `.fanfic-card` drops its `max-width: 760px` there. Below 1024 px: one column as today. Test: CSS rule.

### 6. Public novel page

```
desktop, new
┌────────┐  My Grumpy Vampire [EmiBonnie]
│ cover  │  Tác giả  Bukanemiamily     Trạng thái  Đang ra
│        │  Số chương  7                Cập nhật  14/11/2026
│        │  Emi là một ma cà rồng đã sống qua hàng thế kỷ, kiêu ngạo, khó
│        │  tính và cực kỳ cáu kỉnh. Thế nhưng, kể từ khi bị tước đi đôi…
└────────┘  Xem thêm ▾
            👁 2 lượt đọc
            [ Bắt đầu đọc ] [🔖]      ← tooltip "Thêm vào tủ sách"
            [↗ Truyện gốc]

Danh sách chương ─────────────────────────────── (orange heading bar)
Chương 7: Nụ cười hiếm hoi            [✦ Mới]        14/11/2026
Chương 6: Hai kẻ xa lạ dưới mái nhà dột               12/11/2026
```

- **Description in the hero**, clamped to 3 lines with a **Xem thêm / Thu gọn** toggle (`aria-expanded`, shown only when the text is actually clamped: compare `scrollHeight` > `clientHeight`; in tests, stub them). The **Giới thiệu** tab is removed. Tabs remain only when there is a trailer (`Danh sách chương | Trailer`); without a trailer the chapter list is a plain section headed by `<h2 className="history__heading">Danh sách chương</h2>`.
- **Facts** add **Số chương** (count of published chapters, i.e. `novel.chapters.length`) and **Cập nhật** (`formatInstant` of the newest chapter `publishedAt`; row hidden when no chapter has a date).
- **Shelf button**: no visible text; wrap it in `<Tip label=…>` with the same text as its `aria-label` ("Thêm vào tủ sách" / "Đã lưu vào tủ sách"). Test with `expectTooltip`.
- **Chapter list**: each row shows its publish date (`formatInstant`, muted, right) and a **Mới** badge for chapters published in the last 7 days (`badge badge--done` with a `Sparkles` icon, per the badge-icon rule). Dates and badge are omitted when `publishedAt` is missing (files published before this change).
- **Backend**: `publish/PublicNovelDetail.PublicChapterRef` gains `Instant publishedAt` (from `t_chapter.published_at`); `NovelExporter` fills it; frontend `data/novelTypes.ts` chapter ref gains `publishedAt?: string | null`. Allowlist rule: add the field to both the Java record and the TS type; extend the exporter test that pins the chapter-ref fields. No migration.

### Chapter count (decision a)

- Public `NovelCard` "Chương" value = `publishedCount` (no `/total`); banner (`FeaturedNovels`, via `publicChapterProgress`) shows the same; rename/replace `publicChapterProgress` accordingly. Admin card keeps Chapters and Published as separate stats (meaningful for the admin).
- `totalChapters` stays in the JSON (unused by the public UI; harmless).

## Non-goals

Item 2 (Wattpad titles). Admin items 7–10 of the review. Showing the original's total chapter count (future option b: store Wattpad's part count; option c: an admin-entered total).

## Done when

`npx vitest run`, `npx tsc -b`, `mvn test` (backend change) green; `mvn verify -Poracle -Dskip.npm` not needed (no SQL change). `PROGRESS.md` log entry; `CLAUDE.md`: note the nav centring rule (explicit `scrollLeft`, not `scrollIntoView`), the compact phone stats, 2-column card list from 1024 px, and "public chapter count = published only". A Publish is needed for the public JSON field.
