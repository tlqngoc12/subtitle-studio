# Fanfics (Wattpad) in Novels — design

Date: 2026-11-11 · Status: approved in chat, awaiting spec review

## Goal

The admin pastes a Wattpad story link; the app reads the story's public data and lists fanfics like Wattpad story
cards, inside the Novels menu, in the admin app and on the public site. Clicking a story opens it on Wattpad.

## Feasibility (spike, 2026-11-11)

A plain `GET https://www.wattpad.com/api/v3/stories/{id}?fields=…` (curl default user agent, no login) returns 200
JSON for `https://www.wattpad.com/story/396487502-the-way-she-warmed-me-emibonnie`: title, `user.username`,
`description`, `cover` (`https://img.wattpad.com/cover/{id}-256-k….jpg`; the `-512-` variant also exists, ~73 KB),
`readCount` 51029, `voteCount` 2167, `commentCount`, `numParts` 28, `completed`, `tags`, `language`, `createDate`,
`modifyDate`, `lastPublishedPart.createDate`, and `parts(wordCount)` (sum 15,739 words). Wattpad's displayed reading
time "1h 8m" = 15,739 / 230 words per minute ≈ 68 min.

## Decisions (from the user)

| Topic | Decision |
|---|---|
| Place | **Inside Novels**: tabs **Translated** (today's novels) and **Fanfics**; URL `/novels?tab=fanfics` (admin and public). No new nav entry. |
| Card | Like the Wattpad card the user showed: **cover · title · Complete/Ongoing badge · four stat columns Reads | Votes | Parts | Time · description (3 lines)**. No author line, no tags, **no Mature badge**. |
| Click | Opens the story on Wattpad in a new tab. |
| Tools | Search (title, author, tags; accent-insensitive), status filter All / Completed / Ongoing, sort Newest update (default) / Most read / Most voted / Recently added, admin Refresh per story and Refresh all. |
| Data entry | Paste link → Fetch → preview → Save. No manual fields. |

## Data (Flyway, next free number — V18 if the Photos `post_url` rename took V17)

`t_fanfic`:

| Column | Type | Notes |
|---|---|---|
| `id` | `${bigint}` PK, sequence step 50 | |
| `wattpad_id` | `VARCHAR2(20 CHAR)` NOT NULL unique | story id |
| `url` | `VARCHAR2(500 CHAR)` NOT NULL | canonical `https://www.wattpad.com/story/{id}` |
| `title` | `VARCHAR2(300 CHAR)` NOT NULL | |
| `author` | `VARCHAR2(100 CHAR)` | `user.username` (kept for search) |
| `description` | `CLOB` | |
| `tags` | `VARCHAR2(2000 CHAR)` | space-separated, for search only |
| `cover_media_id` | `${bigint}` FK `t_media` | 512 px cover stored like other images |
| `cover_source_url` | `VARCHAR2(500 CHAR)` | to skip re-downloading an unchanged cover |
| `read_count`, `vote_count`, `part_count`, `word_count` | `${bigint}` NOT NULL | |
| `completed` | `${int}` (0/1) NOT NULL | |
| `story_updated_at` | `TIMESTAMP(6) WITH TIME ZONE` | `lastPublishedPart.createDate`, else `modifyDate` |
| `fetched_at`, `created_at` | `TIMESTAMP(6) WITH TIME ZONE` NOT NULL | |

`MediaRepository.isReferenced` and `findUnreferencedCreatedBefore` gain the fanfic cover (CLAUDE.md rule).
`PersistenceOracleIT` table list gains `T_FANFIC`.

## Wattpad client

- `WattpadClient.fetch(String storyId): WattpadStory` using Spring `RestClient`/`HttpClient`: base
  `https://www.wattpad.com/api/v3/stories/{id}?fields=id,title,url,cover,description,readCount,voteCount,numParts,completed,tags,user(username),modifyDate,lastPublishedPart(createDate),parts(wordCount)`;
  header `User-Agent: SubtitleStudio` (no personal data); connect/read timeout 10 s.
- Called only on Add, Refresh, Refresh all — never on a schedule or on page views. Refresh all runs sequentially
  with 500 ms between stories.
- Cover: replace `-256-` with `-512-` in the cover URL (fall back to the original URL on 404), download, store with
  `MediaService.storeResized(name, bytes, 512)`.
- Link parsing `WattpadLink.storyId(String)`: hosts `wattpad.com`, `www.wattpad.com`, `m.wattpad.com`; path
  `/story/{digits}` optionally followed by `-slug`; query/fragment ignored. Chapter links (`/{digits}-slug` without
  `/story/`) → error "Use the story link (wattpad.com/story/…), not a chapter link."
- Errors → API: invalid link 400 (`url`); Wattpad 404/400 → 404 `FANFIC_NOT_FOUND` "Story not found or not public.";
  timeout/5xx/network → 502 `WATTPAD_UNAVAILABLE` "Wattpad did not answer. Try again later."; duplicate → 409
  `FANFIC_EXISTS` with the existing title.

## API (admin)

| Method | Path | Notes |
|---|---|---|
| `POST` | `/api/fanfics/preview` | `{ url }` → `FanficDto` built from Wattpad without saving (cover URL is Wattpad's) |
| `POST` | `/api/fanfics` | `{ url }` → fetch again, store cover, save; 201 |
| `GET` | `/api/fanfics` | all, sorted by `story_updated_at` desc (client sorts for the other options) |
| `POST` | `/api/fanfics/{id}/refresh` | refetch stats/text/cover; 200 updated dto |
| `POST` | `/api/fanfics/refresh` | refresh all; `{ updated, failed: [{ id, title, message }] }` |
| `DELETE` | `/api/fanfics/{id}` | 204, cover cleaned if unreferenced |

`FanficDto(id, url, title, author, description, tags[], coverUrl, readCount, voteCount, partCount, wordCount,
readingMinutes, completed, storyUpdatedAt, fetchedAt, createdAt)`; `readingMinutes = round(wordCount / 230)`.

## UI

**Novels page:** tabs `Translated | Fanfics` (shared tabs style), selection in `?tab=`; default Translated. Public
Novels home gets the same tabs (Translated keeps today's banner/sections).

**Fanfics tab:**
- Toolbar: `SearchBar` · status segmented (All / Completed / Ongoing) · sort `Select` (Newest update, Most read, Most
  voted, Recently added) · admin `Refresh all` (M) and `Add fanfic` (M primary). Phones: search full width, the rest
  wraps.
- Card (one per row, max width ~760 px, list gap 16 px), whole card is `<a href={url} target="_blank" rel="noopener
  noreferrer">`:
  - cover left, aspect 2:3, width 120 px (96 px below 520 px), radius 8 px, subtle shadow;
  - title 20 px / 700 (2-line clamp);
  - badge `Complete` (purple fill `--brand-2`, dark text) or `Ongoing` (neutral outline);
  - stats row of four columns separated by thin vertical dividers, each = lucide icon + label (13 px muted) on top,
    value (16 px / 700) below: `Eye` Reads, `Star` Votes, `List` Parts, `BookOpen` Time. Numbers compact and
    truncated like Wattpad, never rounded up (`51K`, `2.1K` for 2,167, `28`, `12.3M`); time
    `1h 8m` / `45m`;
  - description 15 px, 3-line clamp, `white-space: pre-line` collapsed to the clamp.
  - Admin: a `⋯` menu (outside the link) with Refresh and Delete.
- Footer note (13 px muted): "Stats from Wattpad, updated {latest fetchedAt as 11 Nov 2026} · Stories © their
  authors".
- Empty state; skeleton list while loading; stagger reveal per the design system.
- **Add fanfic dialog:** `Field` "Wattpad story link" + `Fetch` (S); shows the card preview; `Cancel` / `Save`;
  errors per the client section.

## Public export

`data/fanfics.json` = `FanficDto[]` with public cover URLs; the public app reads it through `ReadSource` and shows
the tab read-only.

## Testing

- Backend: `WattpadLink` table test (story links with/without slug, `m.` host, query, chapter link, other hosts incl.
  `wattpad.com.evil.com`); `WattpadClient` against a stub HTTP server (MockRestServiceServer or a local
  `HttpServer`) with a recorded JSON fixture of the spike response (trimmed), 404, timeout; service add/duplicate/
  refresh (cover re-download only when the URL changed)/refresh-all with one failure/delete + media reference;
  export shape. Tests never call the real Wattpad.
- Frontend: tabs via `?tab=`, card renders stats/compact numbers/time/badge, search/filter/sort, admin dialog
  fetch→preview→save and error messages, read-only public view.
- Manual: add the sample story on a local H2 copy, screenshots 1440/390 compared with the user's Wattpad card.

## Out of scope

Scheduled refresh, author/tag display, chapter lists, reading inside the app, Mature badge.
