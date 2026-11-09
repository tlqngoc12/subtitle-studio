# Profile banner and novel trailer — design

Date: 2026-11-09 · Status: approved in chat (layout and image source), awaiting spec review

## Goal

Each profile (EmiBonnie, Emi, Bonnie) can show a **banner of fanned images, centred in the frame**, at the top of its Profile page, in the admin app and on the public site. It is styled like the Novels featured banner. The images are uploaded for the banner only, with no captions.

## Decisions (from the user)

| Topic | Decision |
|---|---|
| Look | Images **fanned like the Novels banner**: the current image in front and larger, neighbours rotated behind. **Centred in the frame.** The profile name stays the page title above the banner. |
| Images | **Uploaded separately for the banner** and managed in the profile's Edit mode. Maximum **8** per profile. |
| Captions | **No visible caption.** Each image has an **alt text** (`Mô tả ảnh` / "Image description"), typed when the image is uploaded. It is **optional**: at most 200 characters, trimmed, and an empty value is stored as NULL. It is used only as the image's accessible name (`alt`) on the banner and in the lightbox. It can be edited later in Edit mode. **When it is empty:**<ul><li>the `<img>` gets `alt=""`;</li><li>the clickable item that opens the lightbox gets the neutral name `Ảnh k/n` (no profile name);</li><li>the lightbox image gets the same `Ảnh k/n` name.</li></ul> |
| Click on an image | **Opens a lightbox** with `‹ ›` to browse the banner images. Esc, ✕ or an overlay click closes it. |
| No images | No banner at all. The page looks as it does today. |

## Data

- New table `t_profile_banner_image` in Flyway **V10** (`V10__profile_banner.sql`, Oracle + H2 MODE=Oracle, `${bigint}`/`${int}` placeholders, `T_` prefix, sequence in steps of 50, like V5):
  - `id ${bigint}` PK
  - `profile_id ${bigint}` NOT NULL FK → profile table
  - `media_id ${bigint}` NOT NULL FK → media table
  - `position ${int}` NOT NULL, gapless 1..n per profile; no unique constraint, because reordering rewrites the positions (same reason as `t_chapter_page`)
  - `alt_text VARCHAR2(200 CHAR)` NULL (optional)
  - `created_at` timestamp NOT NULL
- **Delete behaviour:**
  - Deleting a banner image removes its row. Its media is cleaned up the same way the app already does for profile image blocks; follow the existing rule and do not invent a new one.
  - Deleting a profile, if that is possible, removes its banner rows.

## API (admin)

Follows the existing profile and block endpoints: their style, validation errors (`FieldError`, 400), not-found handling (404), and the same image sniffing and size limit as profile images.

| Method | Path | Body | Result |
|---|---|---|---|
| `POST` | `/api/profiles/{slug}/banner` | `{ mediaId, altText }` (media uploaded first through the existing media upload) | the new list. 400 when the profile already has 8 images, when `mediaId` is unknown or not an image, or when `altText` is longer than 200 characters (field `altText`; blank or missing means none) |
| `PUT` | `/api/profiles/{slug}/banner/{imageId}` | `{ altText }` | the new list. 400 when `altText` is over 200 characters; blank clears it; 404 if the image belongs to another profile |
| `DELETE` | `/api/profiles/{slug}/banner/{imageId}` | none | the new list (positions gapless). 404 if the image belongs to another profile |
| `PUT` | `/api/profiles/{slug}/banner/order` | `{ imageIds: [...] }` | the new list. 400 if an id is missing, duplicated or belongs to another profile; nothing changes |

- The profile DTO (admin and the public export) gains `banner: [{ id, mediaUrl, altText }]`, in position order (`altText` may be null).
- **Public export:** banner images are copied and served exactly like the other profile images. No new copy logic beyond what profile media already uses.

## Frontend

### Shared `FanCarousel` (extracted from `FeaturedNovels`)

- **Props:** `items: { key, src, alt, href?, onOpen? }[]`, plus an optional `label` used as the region's accessible name.
- **Behaviour moved from `FeaturedNovels` unchanged:**
  - fanned layout (current in front and larger, neighbours rotated, scaled and dimmed)
  - auto-advance every 6 s
  - pause and play button
  - pauses on hover and focus
  - no auto-advance with `prefers-reduced-motion`
  - `‹ ›` buttons with `Tip`, counter `01 / 05`, timers cleared on unmount
  - on narrow screens (≤ 760 px) only the current image shows
- **Click on an item:**
  - with `href`, the item is a router `Link` (the Novels banner: cover → novel page)
  - with `onOpen`, it is a button (the Profile banner: open the lightbox)
- **Layout:**
  - The fan **centres itself** in its container; the controls sit centred below it.
  - `FeaturedNovels` keeps its two-column layout (info left, fan right) by placing `FanCarousel` in its right column.
  - The Novels banner must look and behave exactly as today. Its existing tests stay green, moved or adapted to the shared component.
- **Single image:** no timer, no arrows, no counter, no pause button.

### `ProfileBanner`

- **Rendered:** on the Profile page, under the profile title, in admin and public. Only when `banner.length > 0`.
- **Contents:** `FanCarousel` with `onOpen` → `ImageLightbox`.
- **Theme:** colours follow the theme tokens. A flat surface with a 1 px `--rule` border and `--radius-frame`. No gradient; no shadow on the images (see the UI rules in `CLAUDE.md`).

### Shared `ImageLightbox`

- **Built on:** Radix Dialog.
- **Contents:** the image at large size (`object-fit: contain`, max 90vw × 85vh), `‹ ›` (`Ảnh trước` / `Ảnh sau`, also ←/→ keys), counter `k / n`, ✕ (`Đóng`).
- **Behaviour:** Esc and an overlay click close it, and focus returns to the opened image. The page behind is inert.
- **Reuse:** if the chapter page already has its own lightbox, reuse the new component there only if this is trivial; otherwise leave it and note it.

### Edit mode — "Banner" section

- **Placement:** in the profile's Edit mode, above the blocks.
- **Contents:**
  - a heading `Banner`
  - a grid of thumbnails in order
  - an **Add image** flow: choose the file with the existing `ImagePicker`, optionally type an **Image description** (label `Image description (optional)`, hint `Read by screen readers; not shown on the page.`, max 200), then `Add`. The `Add` button is enabled once a file is chosen. The whole flow is disabled with the hint `Up to 8 images` when there are 8.
  - under each thumbnail, its description in an editable field (save on blur or Enter, with the same validation; an error is shown under the field)
  - **drag and drop** reorder (dnd-kit, like playlists and pages), plus `Move left` / `Move right` icon buttons
  - **Delete** (danger icon button, confirm dialog)
- **Updates:** optimistic for reorder, reverted with an error `Alert` on failure. Admin copy is in English.

## Errors and edge cases

| Case | Behaviour |
|---|---|
| Upload of a non-image or a file that is too large | The existing media error message |
| A 9th image | 400 from the API; the button is already disabled |
| Banner image missing on the public site (broken URL) | The image shows the existing empty-cover placeholder style; the carousel keeps working |
| Profile with no banner | No banner element in the DOM |

## Testing

- **Backend:**
  - add, delete and reorder, with positions kept gapless
  - the limit of 8
  - alt text optional: trimmed, blank stored as NULL, at most 200 characters on add and on edit; blank on edit clears it
  - reorder with a missing, duplicate or foreign id gives 400 and nothing changes
  - a foreign image id on delete gives 404
  - the profile DTO includes the banner in order
  - the public export includes the banner images
  - the migration runs on H2 (the test suite)
- **Frontend:**
  - `FanCarousel` covers the behaviour moved from `FeaturedNovels`, plus the `href` and `onOpen` modes
  - the Novels banner tests still pass
  - `ProfileBanner` renders only with images. An image's `alt` is its alt text, or `""` when it has none, in which case the clickable item is named `Ảnh k/n`. A click opens the lightbox.
  - `ImageLightbox` navigation, keys, close and focus return
  - the Edit banner section covers add (with and without a description), editing and clearing the description, the limit, reorder (buttons and drag), delete with confirm, and revert on failure
- **Checks:**
  - contrast test unchanged and green
  - `mvn test -Dskip.npm`, vitest, tsc, `npm run build` and `npm run build:public`

## Part 2 — Novel trailer tab

Approved in chat on 2026-11-09. It ships together with the banner, in the same migration **V10**.

| Topic | Decision |
|---|---|
| Admin field | Novels › Details gets a new optional field **Trailer** (`Trailer (YouTube link)`). It accepts `youtube.com/watch?v=…`, `youtu.be/…`, `/shorts/…` and `/embed/…`, with or without `www`/`m`. The server extracts the 11-character **video id** with the existing YouTube URL parsing (`UrlParser`, as used for videos and profile embeds) and stores only the id. An invalid or non-YouTube link gives 400 with field `trailerUrl`. Blank clears it. The admin form shows the stored trailer as `https://youtu.be/<id>`. |
| Data | `t_novel.trailer_video_id VARCHAR2(11 CHAR)` NULL, in V10. `NovelDetail` (admin) and `PublicNovelDetail` (public export) gain `trailerVideoId`, which may be null. |
| Public novel page tabs | Order **Giới thiệu · Danh sách chương · Trailer**. A tab exists only when it has content: Giới thiệu needs a description, Trailer needs a trailer id, Danh sách chương is always present. The default tab is still **Danh sách chương**. The URL names only the non-default tab (`?tab=intro`, `?tab=trailer`); an unknown or unavailable tab falls back to the list. With no description and no trailer there is no tablist, as today. |
| Embed | `https://www.youtube-nocookie.com/embed/<id>` in an `<iframe>` with `title="Trailer: <novel title>"`, `allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"`, `allowfullscreen`, `loading="lazy"` and `referrerpolicy="strict-origin-when-cross-origin"`. Responsive 16:9 (`aspect-ratio: 16 / 9`, width 100%, max the content width), radius `--radius-frame`, no shadow. The iframe is rendered **only while the Trailer tab is open**, so YouTube is not loaded with the page. |
| Copy | The public site in Vietnamese (`Trailer` as the tab name). The admin in English. |

**Testing:**
- Backend: URL forms accepted and the id stored; invalid and non-YouTube links rejected with 400; blank clears; the detail and the public export carry `trailerVideoId`.
- Frontend:
  - the admin field shows the stored link and the save errors
  - tab presence for every combination of description and trailer
  - `?tab=trailer` opens the trailer tab, and falls back to the list when there is no trailer
  - the iframe exists only while the tab is open and has the nocookie `src` and `title`

## Out of scope

- Visible captions.
- Video in the banner.
- Cropping images in the browser.
- A banner anywhere other than the Profile page.
- Trailers from sources other than YouTube; autoplay of the trailer.
