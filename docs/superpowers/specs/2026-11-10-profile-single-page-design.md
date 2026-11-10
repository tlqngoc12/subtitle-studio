# Profile as one page — design

Date: 2026-11-10 · Status: approved in chat, awaiting spec review
Part 1 of 3 (Profile → Photos → Works). Parts 2 and 3: `2026-11-10-photos-design.md`, `2026-11-10-works-design.md`.

## Goal

Replace the three Profile tabs (EmiBonnie, Emi, Bonnie) with **one page** laid out like
https://www.emibonnie-echoes.com/en/about: one section per member, a tall portrait on one side (alternating left and
right), and the member's details on the other side. Admin app and public site look the same, as today.

## Decisions (from the user)

| Topic | Decision |
|---|---|
| Who is on the page | **Emi and Bonnie** (members). EmiBonnie is not a section: its **banner** (6 images today) stays at the top of the page. **Add member / Delete member** exist, so a third person ("Any") can be added later. |
| Existing content | **Moved automatically.** The block system stays, so Emi's and Bonnie's current blocks (FACTS "Personal Information", LINKS "Instagram") keep working with no data migration. |
| Layout reference | emibonnie-echoes.com/en/about (screenshot reviewed in chat). |

## Page layout (`/profiles`, admin and public)

1. Page title `Profile` (`PageHeader`), then the EmiBonnie banner (`FilmStrip`, unchanged; hidden when empty).
2. One `<section id="{slug}">` per member, ordered by `sort_order`. Desktop (≥ 1024 px): two columns, the portrait column
   about 1/3 wide. Odd sections have the portrait on the left, even sections on the right. Below 1024 px: one
   column, portrait first, full width up to 420 px, centred.
3. **Portrait column:** portrait image (rounded, aspect 3:4, `object-fit: cover`; click opens `ImageLightbox`),
   display name (large heading), tagline (muted text, e.g. "Mimi — Emi of EmiBonnie."), then a row of **social
   icons** built from the member's `LINKS` blocks (each item one icon via the existing `BrandIcon`, link opens in a
   new tab, accessible name = item label). With no portrait, a neutral placeholder with the initial is shown.
4. **Details column:** full name as heading (e.g. `ทสร กลิ่นเนียม (Thasorn Klinnium)`), then the member's blocks in
   order, rendered by type:
   - `FACTS` → a **two-column grid** of `Label: value` (one column below 520 px). Block title shown as a small heading
     only when it is not the first block (the first FACTS block reads as the header facts, like the reference).
   - **new `CHIPS`** → small heading (block title) + a wrap of pill chips, one per item (`label` only).
   - `TEXT` → small heading + paragraph(s).
   - `LINKS` → not repeated here (shown as icons in the portrait column).
   - `IMAGE`, `GALLERY`, `EMBED` → rendered as today, full width of the details column.
5. Colours follow the role rules: chips have a neutral border; headings use the text colour; links use `--brand-ink`.

## Data (Flyway V13, `V13__profile_single_page.sql`)

`t_profile` gains:

| Column | Type | Notes |
|---|---|---|
| `kind` | `VARCHAR2(10 CHAR)` NOT NULL, default `'MEMBER'`, check `IN ('GROUP','MEMBER')` | `emibonnie` row set to `GROUP` |
| `sort_order` | `${int}` NOT NULL | emi = 1, bonnie = 2, emibonnie = 0 |
| `tagline` | `VARCHAR2(300 CHAR)` NULL | |
| `full_name` | `VARCHAR2(200 CHAR)` NULL | |
| `portrait_media_id` | `${bigint}` NULL, FK → `t_media` | also used as the avatar in Photos/Works filters, for GROUP too |

`t_profile_block.block_type` check constraint gains `'CHIPS'` (drop and recreate the constraint). `CHIPS` items use
`label` only (1–100 characters, at most 50 items per block); `item_value` and `media_id` must be empty.

Exactly one `GROUP` row exists (the seeded `emibonnie`); the API cannot create or delete GROUP rows.

## API (admin)

Existing block, banner and media endpoints are unchanged. New or changed:

| Method | Path | Body | Result |
|---|---|---|---|
| `GET` | `/api/profiles` | — | `{ group: ProfileDto, members: ProfileDto[] }` (members by `sort_order`). `ProfileDto` gains `kind`, `tagline`, `fullName`, `portraitUrl`, `portraitMediaId`. Replaces the per-tab fetch on the page. |
| `PUT` | `/api/profiles/{slug}/header` | `{ displayName, tagline, fullName, portraitMediaId }` | updated `ProfileDto`. `displayName` 1–100 chars required; `tagline` ≤ 300; `fullName` ≤ 200; blank → NULL; unknown or non-image media → 400 `FieldError`. Works for GROUP too (portrait = filter avatar). |
| `POST` | `/api/profiles` | `{ displayName }` | new MEMBER, slug generated from the name (lowercase ASCII letters/digits, accents removed, `-` between words, max 20, suffix `-2`, `-3` on collision; empty result or the reserved word `order` → `member-N`), `sort_order` = last + 1. 201. |
| `DELETE` | `/api/profiles/{slug}` | — | deletes a MEMBER with its blocks, items, banner rows; unreferenced media cleaned by the existing rule. 409 for GROUP. 204. |
| `PUT` | `/api/profiles/order` | `{ slugs: [...] }` | rewrites members' `sort_order`; must list every member exactly once, else 400. |

`GET /api/profiles/{slug}` stays (used by tests and the editor), now with the new fields.

## Admin editing (on the same page)

- Each member section has the existing per-block toolbar (edit, move, delete) and **Add block** (type list gains
  **Chips**). A **header Edit** button opens an inline form for display name, tagline, full name and portrait
  (`ImagePicker`, same upload path as image blocks).
- The banner keeps its existing editor, now attached to the GROUP row at the top of the page; the GROUP header form
  only edits the avatar (portrait) and display name.
- Page toolbar: **Add member** (asks for a name), and in each member's header menu **Move up / Move down** and
  **Delete member** (confirmation via `useConfirmDialog`, red button).

## Routing and navigation

- `/profiles` renders the single page. `/profiles/:slug` redirects to `/profiles#{slug}` (old shared links keep
  working); the page scrolls to the hash after data loads.
- `ProfileTabs` is deleted. NavBar entry `Profile` unchanged.

## Public site export

- `SiteExporter` writes one `profiles.json` with `{ group, members }` in the public shape (no ids needed for editing),
  plus the portrait images through the existing media export. The old per-slug files are no longer written; the
  public app's `/profiles/:slug` route redirects like the admin one.

## Testing

- Backend: header validation, slug generation (accents, collisions, empty), CHIPS item validation, delete MEMBER vs
  GROUP (409), order validation, export shape. `PersistenceOracleIT` (no new tables; check the new columns and the
  CHIPS check constraint on Oracle).
- Frontend (vitest): page renders group banner + members in order with alternating side class; FACTS grid, CHIPS,
  social icons from LINKS; hash redirect; header edit form; add/delete member flow.
- Manual: Edge headless screenshots at 1440 px and 390 px (iPhone width), admin and public.

## Out of scope

- Coloured chips (e.g. red allergy chips in the reference).
- A "Related" section or per-member works list (Works has its own page).
