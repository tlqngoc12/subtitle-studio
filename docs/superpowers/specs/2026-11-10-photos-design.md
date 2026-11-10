# Photos menu — design

Date: 2026-11-10 · Status: approved in chat, awaiting spec review
Part 2 of 3. Depends on part 1 (`2026-11-10-profile-single-page-design.md`): uses `t_profile` rows (GROUP + MEMBER)
and their portraits as filter avatars.

## Goal

A **Photos** menu showing Instagram posts as a bento grid, like
https://www.emibonnie-echoes.com/en/multimedia/photos. Each tile shows the **first image of the post**; clicking a
tile opens the post on Instagram in a new tab. The admin adds posts by pasting the post link and uploading the image.

## Decisions (from the user)

| Topic | Decision |
|---|---|
| Image source | **Admin uploads the first image** (file picker, drag-and-drop or Ctrl+V). The server does not fetch from Instagram (it is blocked without login, and Instagram CDN links expire). |
| Storage | Same as profile images: `t_media` + `./data/media/{uuid}.webp`, served by `/api/media/{id}`, copied to Cloudflare Pages on Publish. Re-encoded to **WebP, long edge ≤ 1600 px**. `./data/media` is not in git. |
| Fields | Instagram link, image, **title**, **date** (+ optional end date), **source** (Official / Media / Fan), **people** (filter), **photo count** badge. |

## Data (Flyway V14, `V14__photos.sql`)

`t_photo_post`:

| Column | Type | Notes |
|---|---|---|
| `id` | `${bigint}` PK | sequence `t_photo_post_seq`, step 50 |
| `instagram_url` | `VARCHAR2(300 CHAR)` NOT NULL, unique | normalised (below) |
| `media_id` | `${bigint}` NOT NULL FK → `t_media` | |
| `title` | `VARCHAR2(200 CHAR)` NOT NULL | |
| `taken_on` | `DATE` NOT NULL | |
| `taken_until` | `DATE` NULL | ≥ `taken_on` |
| `source` | `VARCHAR2(10 CHAR)` NOT NULL, check `IN ('OFFICIAL','MEDIA','FAN')` | |
| `photo_count` | `${int}` NULL | 1–99; NULL hides the badge |
| `created_at`, `updated_at` | `TIMESTAMP(6) WITH TIME ZONE` NOT NULL | |

The image size that drives the tile shape is read from `t_media.width` / `height` (added in part 1 for every
resized upload).

`t_photo_post_profile` (`post_id` FK ON DELETE CASCADE, `profile_id` FK, PK on both). Index on
`t_photo_post (taken_on DESC, id DESC)`.

`PersistenceOracleIT.onlyFlywayCreatesTables` gains both tables.

## Validation

- **Instagram link:** accepted hosts `instagram.com`, `www.instagram.com`, `m.instagram.com`; path
  `/{p|reel|tv}/{code}` with an optional `/{username}` before it; query and fragment dropped. Stored as
  `https://www.instagram.com/{p|reel|tv}/{code}/`. Anything else → 400 on field `instagramUrl`. Same normalised link
  already stored → 409 `PHOTO_POST_EXISTS` with the existing post's title.
- **Image:** JPEG, PNG or WebP (existing `ImageSniffer`), ≤ 10 MB (existing limit). Re-encoded by part 1's `ImageResizer`
  (lossy WebP, long edge capped at 1600 px, never upscaled) through `POST /api/media?maxSide=1600`.
- Title 1–200 chars trimmed; dates as `yyyy-MM-dd`; `takenUntil` before `takenOn` → 400; unknown profile slug → 400.

## API (admin)

| Method | Path | Body | Result |
|---|---|---|---|
| `GET` | `/api/photos` | — | all posts, newest `taken_on` first (then id desc): `{ id, instagramUrl, imageUrl, width, height, title, takenOn, takenUntil, source, photoCount, profiles: [slug] }` |
| `POST` | `/api/photos` | JSON: `mediaId` (uploaded first with `POST /api/media?maxSide=1600`) + fields above, `profiles` as slugs | 201 + post; a media without width/height (not resized) → 400 `mediaId` |
| `PUT` | `/api/photos/{id}` | same JSON | post; a different `mediaId` deletes the old media if unreferenced |
| `DELETE` | `/api/photos/{id}` | — | 204; media cleaned by the existing rule |

The list is returned whole (hundreds of rows at most); paging is done in the browser.

## Page `/photos` (admin and public)

- `PageHeader` "Photos" + subtitle "Official, media and fan photos".
- **Filter row:** avatar buttons `All`, then the GROUP profile and the members (portrait as a round avatar, name
  under it); the selected one gets a purple ring (`--brand-2`). Filtering keeps posts tagged with that profile.
  Selection kept in the URL (`?who=emi`).
- **Bento grid:** CSS grid, 4 columns ≥ 1024 px, 3 ≥ 760 px, 2 below; `grid-auto-rows: 200px`
  (160 px below 760 px); `grid-auto-flow: dense`. Tile shape from the image ratio `r = height / width`:
  `r ≥ 1.2` → 1 column × 2 rows; `r ≤ 0.8` → 2 columns × 1 row; otherwise 1 × 1. The image fills the tile
  (`object-fit: cover`, lazy-loaded).
- **Tile overlay:** top-left chips `Official`/`Media`/`Fan` and `n photos` (dark translucent background, white text);
  bottom gradient with the title (2 lines max) and the date (`9 Nov 2026`, or `31 Oct 2026 – 1 Nov 2026`).
- **Click:** the whole tile is an `<a href={instagramUrl} target="_blank" rel="noopener noreferrer">`, accessible
  name = title.
- **Load more:** 24 tiles at first, a `Load more` button adds 24.
- Empty state uses the existing `EmptyState`.

## Admin editing

- `Add post` button in the page header opens a Radix Dialog: Instagram link, image drop zone (click to pick, drag
  and drop, or Ctrl+V while the dialog is open; shows a preview), title, date, optional end date, source (segmented
  buttons), people (toggle avatars), photo count. Save → toast; errors shown per field.
- Each tile in the admin app has a small `⋯` menu (top-right, outside the link) with **Edit** (same dialog, image
  optional) and **Delete** (confirm dialog).

## Navigation and public export

- NavBar (admin and public): `Get Engsub | Vietsub | Profile | Works | Photos | Novels` (Works arrives in part 3;
  this part adds Photos only).
- `SiteExporter` writes `photos.json` (same shape, no admin-only data) and the images; the public app gets the
  `/photos` route and nav entry.

## Testing

- Backend: link normalisation table test (p/reel/tv, username prefix, m. host, query, invalid), duplicate 409,
  re-encode size cap and no upscale, date rule, CRUD, media cleanup, export.
- Frontend: tile shape class from ratio, filter by `?who`, load more, overlay text and date range format, dialog
  validation and paste handler.
- Manual: screenshots 1440 px and 390 px, admin and public.

## Out of scope

- Fetching images from Instagram automatically; multiple images per post; a lightbox (clicking goes to Instagram).
