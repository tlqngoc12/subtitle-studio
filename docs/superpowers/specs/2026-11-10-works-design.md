# Works menu — design

Date: 2026-11-10 · Status: approved in chat, awaiting spec review
Part 3 of 3. Depends on part 1 (profiles as filter avatars) and part 2 (WebP re-encoding helper, NavBar order).

## Goal

A **Works** menu listing official works (films, series, MVs, concerts, ads…) as a poster grid with a detail page,
like https://www.emibonnie-echoes.com/en/works and its detail pages (screenshots reviewed in chat). The admin enters
cover, release date, category, links (pilot, trailer, X page, IG page, any number of other links with icon and
caption), and the people involved: for a film, the actor's avatar + character name; for an MV, the singer's avatar.

## Decisions (from the user)

| Topic | Decision |
|---|---|
| Categories | **Fixed** main categories like the reference: Film & TV, Performance, Music, Variety Show, Advertisement, Ceremony, Interview, Fashion. A free-text **subcategory** (Drama, OST, Concert, Magazine…). |
| People filter | All / EmiBonnie / Emi / Bonnie (the profiles from part 1, with their portraits). |
| People in a work | A reusable **people directory** (name + avatar), so an actor's avatar is uploaded once. |

## Data (Flyway V15, `V15__works.sql`)

`t_person` — `id`, `name VARCHAR2(100 CHAR)` NOT NULL unique (case-insensitive check in Java), `avatar_media_id`
NULL FK → `t_media`, `created_at`.

`t_work`:

| Column | Type | Notes |
|---|---|---|
| `id` | `${bigint}` PK | |
| `title` | `VARCHAR2(200 CHAR)` NOT NULL | |
| `cover_media_id` | `${bigint}` NULL FK → `t_media` | no cover → gradient placeholder (brand orange → purple) |
| `release_date` | `DATE` NULL | NULL shows "Coming Soon" |
| `category` | `VARCHAR2(20 CHAR)` NOT NULL, check `IN ('FILM_TV','PERFORMANCE','MUSIC','VARIETY','ADVERTISEMENT','CEREMONY','INTERVIEW','FASHION')` | |
| `subcategory` | `VARCHAR2(50 CHAR)` NULL | |
| `profile_id` | `${bigint}` NULL FK → `t_profile` | the badge on the card and the people filter |
| `description` | `VARCHAR2(2000 CHAR)` NULL | short synopsis, shown on the detail page |
| `created_at`, `updated_at` | timestamps | |

`t_work_link` — `id`, `work_id` FK ON DELETE CASCADE, `position ${int}`, `kind VARCHAR2(10 CHAR)` check
`IN ('PILOT','TRAILER','X','INSTAGRAM','OTHER')`, `label VARCHAR2(60 CHAR)` NOT NULL, `url VARCHAR2(500 CHAR)` NOT
NULL, `icon VARCHAR2(30 CHAR)` NULL (NULL = detect from the URL).

`t_work_credit` — `id`, `work_id` FK ON DELETE CASCADE, `position ${int}`, `person_id` FK → `t_person`,
`role VARCHAR2(40 CHAR)` NULL, `character_name VARCHAR2(100 CHAR)` NULL.

Indexes on `t_work (release_date)`, `t_work_link (work_id, position)`, `t_work_credit (work_id, position)`,
`t_work_credit (person_id)`. `PersistenceOracleIT` gains the four tables.

## Rules

- Links: `url` must be `http(s)`; at most 20 per work; at most one each of `PILOT`, `TRAILER`, `X`, `INSTAGRAM`.
  Default labels: Pilot, Trailer, X, Instagram. `icon`, when set, must be one of the known icon keys (below).
- Credits: at most 30 per work; the same person at most once. `character_name` is kept only when
  `category = FILM_TV` (cleared on save otherwise). Role suggestions in the UI: Lead, Supporting, Guest, Cameo
  (Film & TV); Singer, Featuring, Vocal, MV cast (Music); free text accepted for any category.
- Cover and avatars: same upload and re-encoding as Photos (WebP, long edge ≤ 1600 px; avatars ≤ 400 px).
- Deleting a person used by any credit → 409 `PERSON_IN_USE` listing the work titles.
- Sorting: works with no release date first (Coming Soon), then `release_date` desc, then id desc.

## Link icons

Frontend `LinkIcon` extends the existing `BrandIcon` host table (simple-icons): YouTube, X, Instagram, TikTok,
Facebook, Netflix, Spotify, Apple Music, Line, Threads; unknown hosts (including iQIYI, WeTV, Viu, which
simple-icons does not have) use lucide `Link2`. The editor's icon
select lists these keys plus `auto`. `PILOT` / `TRAILER` links on YouTube show the YouTube icon.

## API (admin)

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/works` | list for the grid: `{ id, title, coverUrl, releaseDate, category, subcategory, profile: slug|null }` |
| `GET` | `/api/works/{id}` | full: + `description`, `links[]`, `credits[] { person { id, name, avatarUrl }, role, characterName }` |
| `POST` / `PUT` | `/api/works`, `/api/works/{id}` | JSON body with everything, links and credits replaced as a whole (lists are small); cover by `coverMediaId` from the existing media upload |
| `DELETE` | `/api/works/{id}` | 204, media cleanup by the existing rule |
| `GET` / `POST` | `/api/people` | directory list (name order) / create `{ name, avatarMediaId }` |
| `PUT` / `DELETE` | `/api/people/{id}` | edit / delete (409 when in use) |

## Pages (admin and public)

**`/works`**
- `PageHeader` "Works" + "n works".
- Filter rows: people avatars (All, EmiBonnie, Emi, Bonnie) like Photos; below, a pill bar of categories (`All` +
  the 8), selected pill orange (action colour), horizontally scrollable on phones. URL keeps `?who=&cat=`.
- Grid: 4 columns ≥ 1024 px, 3 ≥ 760 px, 2 below. Card: cover (aspect 4:5, rounded, badge with the profile name
  top-right), then date (`24 Apr 2027` or `Coming Soon`), title (2 lines max), chips category + subcategory. The
  whole card links to the detail page. No paging (≈ 150 works): all cards, images lazy-loaded.

**`/works/:id`**
- `← Back` (to `/works` keeping the filters when coming from there).
- Desktop: cover left (~320 px), right: chips (category in purple tint, subcategory neutral), title (large), date,
  a row of **link buttons** (icon + label + external-link glyph, open in a new tab), description.
  Phone: cover on top, full width up to 360 px.
- If a `TRAILER` link is a YouTube URL: an embedded player below (16:9, `youtube-nocookie.com`, loaded on click via
  a poster to keep the page light).
- **People** section (heading "Cast" for Film & TV, "Artists" for Music, "People" otherwise): cards with round
  avatar, name, role chip, and `as {character}` when set. Wraps; 2 per row on phones.

## Admin editing

- `/works` header: **Add work** → `/works/new`; each card in the admin app shows an `Edit` icon button.
- Edit page `/works/:id/edit` (and `/works/new`): cover picker, title, release date (empty = Coming Soon),
  category select, subcategory input with suggestions taken from existing values of that category, badge profile
  select, description.
  - **Links:** quick-add buttons `+ Pilot`, `+ Trailer`, `+ X`, `+ Instagram` (each disabled once present) and
    `+ Link`; each row: icon select (auto by default, shows the detected icon), label, URL, remove; drag to reorder
    (dnd-kit, already in the project).
  - **People:** `+ Person` opens a combobox searching the directory with "Create '{name}'" at the end (creating asks
    for an optional avatar); each row: avatar, name, role (input with suggestions), character (only for Film & TV),
    remove, drag to reorder.
  - Save → toast; Delete work (confirm).
- **People directory** management: a `People` dialog from the Works page header (list with avatar, rename, change
  avatar, delete when unused).

## Navigation and public export

- NavBar becomes `Get Engsub | Vietsub | Profile | Works | Photos | Novels` (admin) and the matching public set.
- `SiteExporter` writes `works.json` (grid list) and `works/{id}.json` (detail), and the covers and avatars. The
  public app gets `/works` and `/works/:id` (read-only, no edit buttons).

## Testing

- Backend: link rules (kinds once, URL scheme, icon keys, limits), credit rules (duplicates, character cleared for
  non-film), sorting with NULL dates, person delete 409, CRUD replace of lists, export shape.
- Frontend: filters and URL, card date/Coming Soon, detail sections and headings per category, icon detection,
  editor quick-add disabling, character field visibility, people combobox create flow.
- Manual: screenshots 1440 px and 390 px of grid, a film detail and an MV detail, admin and public.

## Out of scope

- "Related Schedules" and "More" tabs of the reference; per-person pages; importing works from other sites.
