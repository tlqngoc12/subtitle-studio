# Hardening & Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the browser-borne and LAN attack paths, stop the Novels screens from loading chapter CLOBs, bound memory, shrink the initial JS, harden the public site, rate-limit read counts, and split two oversized files.

**Architecture:**
- A servlet filter guards `/api/**`.
- JPQL projections and aggregate queries replace entity loads where only metadata is needed.
- Uploads are read lazily, one file at a time.
- `React.lazy` code-splits routes.
- `_headers` carries the CSP.
- The Pages Function dedupes reads through the Workers Cache API.

**Tech Stack:** Spring Boot 3 / JPA / Flyway (Oracle + H2), React 19 + Vite + vitest, Cloudflare Pages Functions.

**Spec:** `docs/superpowers/specs/2026-11-16-hardening-performance-design.md`

## Global Constraints

- No existing endpoint's JSON changes (same fields, same values, same order of list items).
- No DB migration.
- No test deleted or weakened. Compare with `git diff --numstat origin/main -- src/test frontend/src/**/*.test.*`:
  - deletions only where a test moved file or changed `getBy` → `findBy` for lazy routes;
  - the total test count must not drop.
- `npm run dev` (Vite on 5173, proxy `/api` → 8080) must keep working.
- Error bodies are ProblemDetail with a `code` property, like the rest of `ApiExceptionHandler`.
- Commits, PR titles and descriptions are in English.
- UI colours: cam `#F39A42`, tím `#D9A1D9`.

## Review Focus

1. **A Vite dev request.** POST from `Origin: http://localhost:5173`, `Host: localhost:5173` (through the proxy) → allowed.
2. **Origin `null`** (sandboxed iframe, `file://`) on a POST → 403. A missing Origin → allowed.
3. **A novel with 0 chapters.** The list shows `chapterCount 0`, `publishedCount 0`, `lastPublishedAt null`. It must still be listed: use a LEFT JOIN or a separate default.
4. **A chapter with 0 pages** on the novel page → `pageCount 0`. It must not be missing from the grouped count map.
5. **CSP on the public site.** The Trailer tab iframe (`youtube-nocookie`), YouTube thumbnails (`i.ytimg.com`) on Vietsub list/watch, `/api/reads` fetch and fonts all load. There are no console CSP violations.

Each item has a test in its owning task below, except 5, which is the Playwright check in Task 6.

---

## PR A: branch `feat/hardening-performance` (Tasks 1–7)

### Task 1: Bind to localhost + `/api/ping` healthcheck

**Files:**
- Modify: `docker-compose.yml`. Change the ports entry to `"127.0.0.1:8080:8080"` and add `mem_limit: 2g` to `subtitle-studio`. Also add `JAVA_TOOL_OPTIONS: "-XX:MaxRAMPercentage=60 -XX:+ExitOnOutOfMemoryError"` (Task 4 depends on it; doing it here keeps compose edits in one commit).
- Create: `src/main/java/com/subtitlestudio/web/PingController.java`, with `@GetMapping("/api/ping") ResponseEntity<Void>` returning `204`.
- Modify: `Dockerfile` HEALTHCHECK to `curl -fsS http://localhost:8080/api/ping > /dev/null || exit 1`.
- Test: `src/test/java/com/subtitlestudio/web/PingControllerTest.java`

- [ ] **Step 1:** Write the test `ping_returns_204_with_no_body`: MockMvc `GET /api/ping` → `status().isNoContent()` and an empty body.
- [ ] **Step 2:** Run `mvn -q test -Dtest=PingControllerTest`. Expected: FAIL (404).
- [ ] **Step 3:** Implement the controller, then make the compose and Dockerfile edits.
- [ ] **Step 4:** Run the test again. Expected: PASS. Run `docker compose config` and confirm the output shows `host_ip: 127.0.0.1`, `mem_limit` and `JAVA_TOOL_OPTIONS`.
- [ ] **Step 5:** Commit `feat: bind app to localhost, add /api/ping healthcheck, cap container memory`.

### Task 2: Origin/Host guard filter

**Files:**
- Create: `src/main/java/com/subtitlestudio/web/LocalOriginFilter.java`. It is a `OncePerRequestFilter` registered for `/api/*` through a `FilterRegistrationBean` in the same file or in `web/WebConfig.java`.
- Test: `src/test/java/com/subtitlestudio/web/LocalOriginFilterTest.java` (full `@SpringBootTest` + MockMvc, so registration is covered).

**Rules (from the spec):**
- `host = request.getHeader("Host")`, or `request.getServerName()` if that is null. Strip the port. Allowed: `localhost`, `127.0.0.1`. Anything else → 403.
- If the method is not `GET`/`HEAD`/`OPTIONS` and an `Origin` header is present, it must match `^http://(localhost|127\.0\.0\.1)(:\d+)?$`. Anything else → 403, including the literal `null`.
- The 403 body is a ProblemDetail: `type` about:blank, `title` "Forbidden", `detail` "Request from another site was blocked.", property `code` = `FORBIDDEN_ORIGIN`, content type `application/problem+json`. Write it with the app's `ObjectMapper`.

- [ ] **Step 1: Write the failing tests.**
  - `get_with_foreign_host_is_403`: `GET /api/ping`, header `Host: evil.example` → 403, `$.code` = `FORBIDDEN_ORIGIN`.
  - `get_with_localhost_host_any_port_is_allowed`: `Host: localhost:8080` and `Host: 127.0.0.1:5173` → 204.
  - `post_with_foreign_origin_is_403`: `POST /api/publish`, `Origin: https://evil.example` → 403.
  - `post_with_null_origin_is_403`: `Origin: null` → 403.
  - `post_from_vite_dev_origin_passes_filter`: `POST /api/publish`, `Origin: http://localhost:5173`, `Host: localhost:5173` → status is not 403 (whatever the controller answers).
  - `post_without_origin_passes_filter`: no Origin → status is not 403.
  - `non_api_paths_are_not_filtered`: `GET /` with `Host: evil.example` → status is not 403.
- [ ] **Step 2:** Run `mvn -q test -Dtest=LocalOriginFilterTest`. Expected: FAIL.
- [ ] **Step 3:** Implement the filter as described above.
- [ ] **Step 4:** Run the class, then the whole `mvn test`. Expected: all pass. If an existing test sends a foreign Host or Origin, report it instead of changing its assertion.
- [ ] **Step 5:** Commit `feat: block cross-site and DNS-rebinding requests to /api`.

### Task 3: Novel list / detail without chapter CLOBs

**Files:**
- Modify: `src/main/java/com/subtitlestudio/novel/ChapterRepository.java`
- Modify: `src/main/java/com/subtitlestudio/novel/ChapterPageRepository.java`
- Modify: `src/main/java/com/subtitlestudio/novel/NovelService.java` (`list`, `setFeatured`, `detail`)
- Modify: `src/main/java/com/subtitlestudio/novel/NotebookService.java` (~line 144)
- Modify: `src/main/java/com/subtitlestudio/novel/wattpad/WattpadNovelService.java` (~line 283)
- Modify: `src/main/java/com/subtitlestudio/novel/ChapterTranslationService.java` (`previousText`)
- Modify: the class holding `shown(Chapter)` (`models` in `NovelService`), adding an overload that takes the projection.
- Test: `src/test/java/com/subtitlestudio/novel/NovelServiceTest.java` (add) and `src/test/java/com/subtitlestudio/oracle/PersistenceOracleIT.java` (add one IT for the new queries).

**Interfaces (produces):**
- `record NovelChapterStats(long novelId, long chapters, long published, Instant lastPublishedAt)` in `novel/`.
- `ChapterRepository`:
  - `@Query("select new ...NovelChapterStats(c.novel.id, count(c), sum(case when c.publishStatus = PUBLISHED then 1 else 0 end), max(case when c.publishStatus = PUBLISHED then c.publishedAt end)) from Chapter c group by c.novel.id") List<NovelChapterStats> chapterStats()`
  - `NovelChapterStats chapterStats(long novelId)`: the same for one novel. It returns null when there are no chapters; the caller treats that as 0/0/null.
- `record ChapterRow(long id, int chapterNo, String title, String label, ChapterTranslationStatus translationStatus, String translationError, String translationModel, ChapterPublishStatus publishStatus)`, plus `ChapterRepository.findRowsByNovel(long novelId)`. It is JPQL `select new ...ChapterRow(...)` ordered by `sortOrder asc, chapterNo asc`, with no CLOB columns.
- `ChapterRepository.maxPublishedChapterNo(long novelId)` → `Integer` (null if none).
- `ChapterRepository.findIdsBefore(long novelId, int chapterNo)` → `List<Long>`, ordered by `chapterNo desc`.
- `ChapterPageRepository.countPerChapter(long novelId)` → `List<Object[]>` or a small record `(long chapterId, long count)`, grouped by chapter.

**Steps:**
- [ ] **Step 1: Write the failing tests** in `NovelServiceTest` (H2 `@DataJpaTest` or `@SpringBootTest`, whichever the file already uses). They pin the JSON-relevant values:
  - `list_counts_chapters_without_loading_texts`: novel A has 3 chapters, 2 PUBLISHED with `publishedAt` t1 < t2. Novel B has 0 chapters. Expect A `chapterCount 3`, `publishedCount 2`, `lastPublishedAt t2`, and B present with `0`, `0`, `null` (Review Focus 3).
  - `detail_page_counts_include_chapters_without_pages`: chapter X has 2 pages, Y has 0 → `pageCount` 2 and 0, same order as before (Review Focus 4).
  - `detail_rows_match_previous_shape`: build the list with the old code path in the test (entity → `ChapterSummary`) and compare `equals` with the new result on the same fixture.
- [ ] **Step 2:** Run them. Expected: compile failure or FAIL.
- [ ] **Step 3: Implement.**
  - `list()`: one `chapterStats()` call → `Map<Long, NovelChapterStats>`; a missing entry means `0, 0, null`.
  - `setFeatured`: `chapterStats(id)`.
  - `detail()`: `findRowsByNovel` + `countPerChapter`. Keep `findByChapterNovelId` for `SuspectPages` (it needs page texts), unless swapping to lengths keeps `SuspectPagesTest` and the new tests identical.
  - `NotebookService` and `WattpadNovelService`: use `maxPublishedChapterNo`.
  - `previousText`: iterate `findIdsBefore`, `findById` each, stop at the first complete one.
- [ ] **Step 4:** Run `mvn test`. Expected: all pass. Then `mvn -Poracle-it verify` (the same command PR #38 used for Oracle IT); the new `PersistenceOracleIT` case runs `chapterStats()`, `findRowsByNovel`, `countPerChapter` on Oracle. Expected: pass.
- [ ] **Step 5:** Commit `perf: load novel list and page metadata without chapter CLOBs`.

### Task 4: Stream chapter screenshot uploads

**Files:**
- Modify: `src/main/java/com/subtitlestudio/novel/NamedImage.java`
- Modify: `src/main/java/com/subtitlestudio/novel/ChapterController.java` (`addPages`)
- Modify: `src/main/java/com/subtitlestudio/novel/ChapterService.java` (`addPages`)
- Test: `src/test/java/com/subtitlestudio/novel/ChapterServiceTest.java` (add)

**Interface:**
- `NamedImage` keeps `new NamedImage(String name, byte[] bytes)` and `bytes()`, so existing tests compile unchanged.
- It gains `long size()`, `byte[] head(int n)` (first n bytes, for sniffing) and a factory `static NamedImage of(MultipartFile f)` that reads from `f.getInputStream()` only when `head`/`bytes` is called.
- The record can wrap a small content interface; the shape is the builder's call.

**Behaviour:**
- The validation pass uses `size()` (reject when > `maxImageBytes`, `MediaTooLargeException`) and `sniffer.sniff(head(32))`.
- The store pass calls `bytes()` per file, inside the loop, so only one file's bytes are live at a time.
- Error order and messages stay the same.

- [ ] **Step 1: Write the failing tests.**
  - `addPages_reads_each_file_only_when_storing`: use a counting `NamedImage` (via the content interface) over 3 images, and assert that full reads happen once per file during storing, and that validation used only `head`.
  - `addPages_rejects_oversize_by_size_without_reading`: a size above the limit → `MediaTooLargeException`, and 0 full reads.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. The controller maps `files` with `NamedImage::of` and no longer calls `getBytes()`.
- [ ] **Step 4:** Run `mvn test`. Expected: all pass, including the existing `ChapterControllerTest` multipart tests.
- [ ] **Step 5:** Commit `perf: read chapter screenshots one at a time on upload`.

### Task 5: Lazy routes in both apps

**Files:**
- Modify: `frontend/src/App.tsx`, `frontend/src/PublicApp.tsx`
- Create: `frontend/src/components/RouteFallback.tsx` (+ `.css` if needed). It is a minimal `role="status"` with a visually-hidden "Đang tải…" and the existing skeleton/spinner style. The NavBar and footer stay rendered outside `<Suspense>`, so the shell never flashes empty.
- Test: `frontend/src/App.test.tsx`, `frontend/src/PublicApp.test.tsx`. Only `getBy*` → `await findBy*` where a lazy page now resolves asynchronously.

**Steps:**
- [ ] **Step 1:** Record the baseline. Run `npm run build` and `npm run build -- --mode public`, and note the size of the largest initial JS chunk for each, from the Vite output.
- [ ] **Step 2:** Convert every page import in both route tables to `const X = lazy(() => import('./pages/X'))`. For named exports like `ProfileRedirect`, use `.then(m => ({ default: m.ProfileRedirect }))`. Wrap `<Routes>` in `<Suspense fallback={<RouteFallback />}>`.
- [ ] **Step 3:** Run `npx vitest run`. Fix only the async lookups that broke, then run again. Expected: the same test count, all pass.
- [ ] **Step 4:** Build both again. Check with `npx vite-bundle-visualizer`, or by grepping the initial chunk, that `react-markdown`, `@dnd-kit`, `yet-another-react-lightbox`, `react-day-picker` and `diff` are not in the entry chunk. If one is (for example, imported by NavBar), move that import behind the lazy page. Record the after sizes for the PR.
- [ ] **Step 5:** Commit `perf: code-split routes in admin and public apps`.

### Task 6: Public site security headers + CSP

**Files:**
- Modify: `src/main/java/com/subtitlestudio/publish/PublicSiteBundle.java` (`headers(boolean)`)
- Test: the existing `PublicSiteBundleTest` (or create it next to the class)

**Header block for `/*`** (always; noindex is still added only when `!indexable`):
```
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Content-Security-Policy: default-src 'self'; img-src 'self' data: https://i.ytimg.com; frame-src https://www.youtube-nocookie.com https://www.youtube.com; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'none'
```
Cloudflare `_headers` allows one `/*` block. Merge the noindex line into it rather than writing two `/*` blocks.

- [ ] **Step 1: Write the failing tests.**
  - `headers_include_csp_and_nosniff_for_all_paths`: the file contains exactly one `/*` block with the 3 headers above.
  - `noindex_stays_in_same_block_when_not_indexable`.
  - `indexable_site_has_no_noindex`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. Then grep `frontend/src` (pages/components reachable from `PublicApp`) for every external URL used at runtime: `img src`, `iframe`, `fetch`. Add any origin missing from the CSP, and list each one in the PR description.
- [ ] **Step 4: Playwright check** (Review Focus 5).
  1. Produce a local copy of the public site with the generated `_headers`, the same way Publish builds it, but without uploading. Use the existing exporter, from a test helper or a temporary `@SpringBootTest` that writes to a scratch dir. The scratch dir and any helper stay out of the commit unless the helper is a reusable test.
  2. Serve it with `npx wrangler@4.151.3 pages dev <dir> --port 8788`, which applies `_headers`.
  3. With Playwright, open `/novels`, a novel page plus its Trailer tab, a reader chapter, `/vietsub/list`, a watch page and `/profiles`.
  4. Collect console messages. Expected: no `Content-Security-Policy` violations, and images, the iframe and fonts visible.
  5. Put screenshots or the console summary in the PR.
- [ ] **Step 5:** Commit `feat: security headers and CSP for the public site`.

### Task 7: Dedupe read counts per IP + slug

**Files:**
- Modify: `src/main/resources/public-functions/reads-post.js`
- Test: `frontend/src/publicFunctions.test.ts` (it already loads these functions)

**Behaviour:**
- Before writing, compute `key = new Request('https://reads-dedupe.invalid/' + slug + '/' + hex(sha256(ip)))`, where `ip = request.headers.get('CF-Connecting-IP') ?? ''`.
- If `await caches.default.match(key)` hits, return `204` without D1.
- Otherwise do the D1 upsert, then `caches.default.put(key, new Response('1', { headers: { 'Cache-Control': 'max-age=600' } }))`.
- If `caches` is undefined (tests or local), skip the dedupe.
- Cache errors never block counting: catch them and count.

- [ ] **Step 1: Write the failing tests.**
  - `second_post_from_same_ip_and_slug_within_window_does_not_write`: mock `caches.default` with a Map-backed match/put; two posts → D1 `run` is called once, both return 204.
  - `different_ip_counts_again`.
  - `different_slug_counts_again`.
  - `cache_failure_still_counts`: `match` throws → D1 is written.
  - `ip_is_not_stored_in_plain_text`: the key URL does not contain the raw IP.
- [ ] **Step 2:** Run `npx vitest run src/publicFunctions.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement with `crypto.subtle.digest('SHA-256', …)`.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat: count a novel read once per visitor per 10 minutes`.

### PR A wrap-up
- [ ] **Run the full checks:**
  - `mvn test` and the Oracle IT;
  - `cd frontend && npx vitest run && npm run build && npm run build -- --mode public`;
  - the numstat check from Global Constraints.
- [ ] **Docs.** Update `PROGRESS.md` (one entry) and `CLAUDE.md`/`README.md` wherever they mention port 8080 being reachable, the healthcheck, or the Docker memory settings. Commit `docs: hardening & performance pass`.
- [ ] **Open the PR.** `git push -u origin feat/hardening-performance`, then `gh pr create --base main`. The description lists:
  - the test totals;
  - the bundle sizes before and after;
  - the measured `/api/novels` time before and after (`curl -w %{time_total}` against a local run, with the same data);
  - the CSP Playwright result;
  - the links to the spec and this plan.

---

## PR B: branch `refactor/split-chapter-page-and-errors` (Task 8)

Branch it from `main` independently of PR A. Its files do not overlap with PR A's, except `PROGRESS.md`; if PR A merges first, rebase on main.

### Task 8: Split `ChapterPage.tsx` and `ApiExceptionHandler`

**Files:**
- Modify: `frontend/src/pages/ChapterPage.tsx`. Move cohesive parts (for example the polling/state hook, the page list/upload panel, the text editor panel, the header/actions) into `frontend/src/components/chapter/*.tsx` and `frontend/src/lib/useChapter*.ts`. `ChapterPage.tsx` keeps its default export and URL params, and should end up well under 300 lines.
- Modify: `src/main/java/com/subtitlestudio/web/ApiExceptionHandler.java`. Split by area into `@RestControllerAdvice` classes in `web/` (for example `NovelErrors`, `VideoErrors`, `ProfileErrors`, `PublishErrors`, `CommonErrors`), or keep one advice that delegates to per-area helper classes. Pick whichever avoids ordering ambiguity between overlapping exception types (if any handler relies on a superclass/subclass match, keep the pair in one class). `ProblemDetail` building stays shared in one helper.
- Tests: existing ones only. Moving a test file next to moved code is allowed; assertions stay as they are.

**Steps:**
- [ ] **Step 1: Pin the error mapping.** Before touching the handler, generate a list of every `@ExceptionHandler` exception type → (status, `code`) from the current class, and write `ApiErrorMappingTest`. For each type, a parameterized test throws it from a test controller and asserts the status and `code`. Run it. Expected: PASS against the old code.
- [ ] **Step 2:** Split the handler. Run `ApiErrorMappingTest` and then the full `mvn test`. Expected: all pass.
- [ ] **Step 3:** Split `ChapterPage.tsx`. Run `npx vitest run` (same count, all pass) and `npm run build`.
- [ ] **Step 4:** Check the numstat: no test lines removed except moved files, and moved files show the same content.
- [ ] **Step 5:** Commit in two parts: `refactor: split ApiExceptionHandler by area` and `refactor: split ChapterPage into components`. Then push and `gh pr create --base main` with the test totals and links.

---

## After both PRs
Opus reviews each whole branch, the user approves, then Sonnet merges. Deploy happens only when the user says so. Deploying PR A changes the port binding and the memory limit, so the deploy step must use `docker compose up -d --no-build subtitle-studio` after the build, as usual.
