# Hardening & performance pass: design

Date: 2026-11-16. Source: the whole-project review on 2026-11-16. The user asked for every item, except one: the off-disk backup of `data/media` and `data/prompts` is skipped for now.

## Why

Subtitle Studio runs on one Windows machine, and the user is its only operator. The review found four kinds of problems:
- Other devices on the LAN, and any web page open in the user's browser, can trigger actions in the app.
- The Novels screens get slower as more chapters are added.
- The container's memory use has no limit.
- The public reader site makes guests on phones download about 1 MB of JS first.

None of these is a visible bug yet. All of them grow with use.

## Goals

1. **Only this machine can reach the app.**
   - In `docker-compose.yml`, change `"8080:8080"` to `"127.0.0.1:8080:8080"`.
   - The user confirmed they never open the app from another device.
2. **Pages on other sites cannot use the API.** Add a servlet filter on `/api/**`:
   - **Host:** every request whose `Host` header is not `localhost` or `127.0.0.1` (any port) gets `403`. This blocks DNS rebinding.
   - **Origin:** a request that is not `GET`/`HEAD`/`OPTIONS` and has an `Origin` header gets `403` unless the Origin is `http://localhost:<any port>` or `http://127.0.0.1:<any port>`. This blocks CSRF. Same-origin requests and requests from the Vite dev server (5173) still work. A request with no `Origin` (curl, tests, the Docker healthcheck) is allowed.
   - **Error body:** ProblemDetail with code `FORBIDDEN_ORIGIN`.
   - No Spring Security, no login.
3. **The Novels list and the novel page stop loading chapter text.**
   - **The list.** Today `NovelService.list()` loads every chapter entity of every novel, with its 3 CLOBs (`text_vi`, `ai_text`, `source_text`), only to count chapters. It was measured at 0.61 s for 3 novels / 100 chapters, against 0.017 s for `/api/videos`. Replace it with one aggregate query per request: chapter count, published count and max `publishedAt`, grouped by novel.
   - **`setFeatured`** uses the same summary and must use the same aggregate.
   - **The novel page.** `NovelService.detail()` builds `ChapterSummary` rows from full chapter entities, and calls `pages.countByChapterId` once per chapter (N+1). Change both:
     - read the chapter rows through a projection without the CLOB columns;
     - get the page counts from one grouped query.
   - **Suspect-page check.** It may keep reading page texts if `SuspectPages` needs the content. The builder may switch it to lengths computed in SQL if the results stay identical.
   - **Other callers.** Any other place that loads all chapters of a novel only for ids, numbers or statuses should use the projection too. This includes `WattpadNovelService` (next chapter number) and `NotebookService` line ~144. `ChapterTranslationService.previousText` must stop loading every earlier chapter's CLOBs just to find the nearest complete one.
   - **Target.** `/api/novels` and `/api/novels/{id}` return exactly the same JSON as before.
4. **Bounded memory.**
   - Add `JAVA_TOOL_OPTIONS=-XX:MaxRAMPercentage=60 -XX:+ExitOnOutOfMemoryError` (or the same in the ENTRYPOINT) and `mem_limit: 2g` for `subtitle-studio` in compose.
   - Chapter screenshot upload (`POST /api/chapters/{id}/pages`) no longer calls `getBytes()` on every file before processing. Files are read and processed one at a time, from the multipart temp files, so peak memory is about one image rather than the whole request (up to 300 MB).
   - Behaviour and responses are unchanged.
5. **Lighter frontend.**
   - **Lazy routes.** Every route page in `App.tsx` and `PublicApp.tsx` loads with `React.lazy` + `Suspense`, using a small fallback that matches the existing loading style.
   - **Visible on first paint.** The public home and reader must not flash empty: the fallback keeps the layout shell (header) visible.
   - **Bundle report.** Record the initial-chunk size before and after in the PR description. Use `rollup-plugin-visualizer` as a dev dependency only if it is needed to find heavy imports.
   - **Heavy imports.** Heavy libraries used only on some pages (`react-markdown`, `@dnd-kit/*`, `yet-another-react-lightbox`, `react-day-picker`, `diff`) must end up outside the initial chunk.
6. **Security headers on the public site.** `PublicSiteBundle.headers()` adds to `/*`:
   - `X-Content-Type-Options: nosniff`
   - `Referrer-Policy: strict-origin-when-cross-origin`
   - `Content-Security-Policy`, with these directives:
     - `default-src 'self'`
     - `img-src 'self' data: https://i.ytimg.com`
     - `frame-src https://www.youtube-nocookie.com https://www.youtube.com`
     - `style-src 'self' 'unsafe-inline'`
     - `script-src 'self'`
     - `connect-src 'self'`
     - `font-src 'self'`
     - `frame-ancestors 'none'`
     - `base-uri 'self'`
     - `form-action 'none'`

   The builder must check every external origin the public pages really use, and add any that is missing. The headers are tested on the built public site with Playwright before the PR: home, novel page with the Trailer tab, reader, video page, member profile. The console must show no CSP errors.
7. **Read counts cannot be pumped.**
   - `reads-post.js` counts one opening per (client IP from `CF-Connecting-IP`, slug) per 10 minutes. It uses the Workers Cache API (`caches.default`) with a synthetic key, and the IP is hashed with SHA-256 before it goes into the key.
   - A repeated hit returns `204` without writing to D1.
   - The cache is per data centre, so this is best-effort. That is accepted.
8. **Light healthcheck.**
   - Add `GET /api/ping` → `204`.
   - The Dockerfile `HEALTHCHECK` uses it instead of `/api/videos`, which sends a 29 KB list every 30 s.
9. **Refactor (no behaviour change).**
   - Split `frontend/src/pages/ChapterPage.tsx` (756 lines) into focused components or hooks in `frontend/src/components/chapter/`.
   - Split `ApiExceptionHandler` (514 lines) by feature area into several `@RestControllerAdvice` classes, or into helper classes it delegates to. Every existing error code, status and message must stay the same.
   - Existing tests must pass without changing their assertions. Moving test files to follow the code is allowed.

## Non-goals

- Login or user accounts.
- Off-disk backup of `data/media` / `data/prompts` (postponed by the user).
- A UI redesign. A visual review by browser screenshots can come later as its own task.
- Changing API shapes, the DB schema or the public site's look.

## Anti-goals (would count as failure even if it "works")

- Any JSON response of an existing endpoint changes.
- The Vite dev server (`npm run dev` on 5173) can no longer call the API.
- The public site shows a blank page or broken trailer or images because of the CSP.
- Tests are deleted or weakened to make the refactor pass. The test-file numstat must show no lost tests.

## Approaches

- **Security.** Two options were considered: a small Origin/Host filter, or Spring Security with a login. The filter was chosen. The app is local-only once it binds to 127.0.0.1, so a login only adds friction, and the filter closes the browser-borne attacks.
- **Performance.** Two options were considered: JPA projections with aggregate queries, or making CLOB fields lazy with Hibernate bytecode enhancement. Projections were chosen. Enhancement changes build tooling and the behaviour of every entity, while projections are local and testable.
- **Read-count limiting.** Two options were considered: a Cloudflare dashboard Rate Limiting rule, or dedupe inside the function. The function was chosen. It ships with Publish, so nothing has to be configured by hand.

## Delivery

There are two independent PRs, both branched from `main`. They touch disjoint files and are not stacked:
- **PR A `feat/hardening-performance`:** goals 1–8.
- **PR B `refactor/split-chapter-page-and-errors`:** goal 9.

Each PR runs the full backend tests, the Oracle IT, the frontend tests and the build. PR A also runs the Playwright check of the public site with the new CSP. Deploying happens only after the user OKs, as usual.

## Left to the builder

- Projection style (interface or record constructor in JPQL).
- Where the filter lives (`web/` package).
- The fallback component.
- How `ChapterPage` / `ApiExceptionHandler` are split, as long as there is no behaviour change.
