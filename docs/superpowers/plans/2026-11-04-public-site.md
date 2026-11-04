# Public site (Publish to Cloudflare Pages) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nút **Publish** trong app xuất bản chỉ đọc (Vietsub list + playlist, trang xem, Profile) thành trang tĩnh và deploy lên Cloudflare Pages bằng `wrangler`.

**Architecture:** Backend package `com.subtitlestudio.publish`: `SiteExporter` (JSON + ảnh theo allowlist) → `PublicSiteBundle` (bản build public trong jar + `_redirects`/`_headers`/`robots.txt`) → `WranglerClient` (tiến trình con) điều phối bởi `PublishService` chạy nền. Frontend: một codebase, hai bản build; các trang public đọc dữ liệu qua `ReadSource` (API hoặc JSON tĩnh) lấy từ `SiteContext`.

**Tech Stack:** Java 21, Spring Boot 3.5, JUnit 5/AssertJ/Mockito; React 19 + Vite + TypeScript, Vitest + RTL; Cloudflare `wrangler` CLI (Node) trong image Docker.

**Spec:** [docs/superpowers/specs/2026-11-04-public-site-design.md](../specs/2026-11-04-public-site-design.md)

## Global Constraints

- Làm trên worktree `../subtitle-studio-public-site`, nhánh `public-site`, tách từ `main` hiện tại; merge khi xong.
- TDD từng task; trước khi báo xong chạy toàn bộ `mvn -q test -Dskip.npm` (backend) và/hoặc `cd frontend && npm test` (frontend).
- Không thêm migration (không bảng mới).
- Dữ liệu public theo **allowlist**: `PublicVideo` = `id, title, channel, durationSec, thumbnailUrl, viCueCount, viUpdatedAt, viSource`; không bao giờ có `subLang, subSource, cueCount, fetchedAt, translationStatus, translationError, translationProfile`, Engsub, `.srt`, hồ sơ dịch.
- Chân trang (đúng chữ): `Vietsub by @byZenQN · All videos are the property of their original creators · Updated <year>` (year từ `data/site.json`).
- `indexable` mặc định `false`: meta `<meta name="robots" content="noindex, nofollow">`, header `X-Robots-Tag: noindex, nofollow`, `robots.txt` = `User-agent: *` + `Disallow: /`. `true`: không meta, không header, `robots.txt` = `User-agent: *` + `Allow: /`.
- `CLOUDFLARE_API_TOKEN` không bao giờ xuất hiện trong log, message exception, `toString()` hay commit; chỉ truyền qua env của tiến trình con.
- `ProcessBuilder` dùng list argument, không qua shell; đọc stdout/stderr song song; hết timeout → `destroyForcibly()`.
- Chuỗi giao diện và message tiếng Anh; comment/Javadoc tiếng Anh (CLAUDE.md).
- Version cố định (không `^`), thư viện/CLI đã phát hành ≥ 2 tuần.

## Review Focus

1. **Ảnh Profile được tham chiếu nhưng file đã mất trên đĩa** → Publish vẫn xong, ảnh bị bỏ qua, có WARN. (Task 1, `skipsMissingImageFileWithWarning`)
2. **wrangler in lại token trong stderr khi lỗi** → message lỗi và log không chứa token. (Task 3, `neverLeaksTokenFromWranglerOutput`)
3. **Bấm Publish lần 2 khi đang chạy, hoặc app restart giữa chừng** → 409 `PUBLISH_IN_PROGRESS`; thư mục tạm cũ bị dọn khi khởi động. (Task 4, `rejectsSecondStartWhilePublishing`, `cleansLeftoverTempDirsOnStartup`)
4. **Khách mở link cũ tới video/playlist/profile đã bị gỡ** → trang hiện thông báo "not found" như app, không trắng trang. (Task 5, `staticSourceMapsMissingFilesToNotFoundCodes`)
5. **Khách vừa mở trang ngay sau Publish** → thấy dữ liệu mới (`/data/*` `no-cache`), còn `/assets/*`, `/media/*` cache dài. (Task 2, `headersCacheAssetsButNotData`)

---

### Task 1: `SiteExporter` (dữ liệu public theo allowlist)

**Files:**
- Create (package `com.subtitlestudio.publish`): `PublicVideo.java`, `PublicPlaylistSummary.java`, `PublicPlaylistDetail.java`, `SiteExporter.java`
- Test: `src/test/java/com/subtitlestudio/publish/SiteExporterTest.java`

**Interfaces:**
- Consumes: `SubtitleService.list(): List<Video>`, `VietsubService.getCues(String): List<ViCue>`, `PlaylistService.list(null): List<PlaylistSummary>`, `PlaylistService.get(long): PlaylistDetail`, `ProfileService.list(): List<ProfileSummary>`, `ProfileService.get(String): ProfileDto`, `MediaRepository.findById`, `Media.getStorageKey()/getContentType()`, `ImageType.fromContentType`, `SubtitleStudioProperties.mediaDir()`, `ObjectMapper`.
- Produces:
  - `record PublicVideo(String id, String title, String channel, Integer durationSec, String thumbnailUrl, int viCueCount, Instant viUpdatedAt, ViSource viSource)` + `static PublicVideo from(VideoDto)`.
  - `record PublicPlaylistSummary(long id, String name, String description, int videoCount, String thumbnailUrl, Instant updatedAt)`; `record PublicPlaylistDetail(long id, String name, String description, Instant updatedAt, List<PublicVideo> videos)`.
  - `SiteExporter` (`@Component`): `void export(Path dir, Instant publishedAt)` ghi các file spec mục 4.

- [ ] **Step 1: Test** — `SiteExporterTest` (`@SpringBootTest` + `@ActiveProfiles("test")` + `@DynamicPropertySource` data-dir tạm, như `ProfileServiceTest`; dữ liệu tạo qua repository/service; export vào `@TempDir`):
  - `exportsOnlyVideosWithVietsubNewestFirst`: 3 video (2 có Vietsub, cập nhật khác giờ; 1 không) → `data/videos.json` có 2 phần tử theo `viUpdatedAt` giảm dần.
  - `videoFilesNeverContainInternalFields`: đọc `data/videos.json` và `data/videos/<id>.json` dạng chuỗi → không chứa `"subLang"`, `"subSource"`, `"cueCount"`, `"fetchedAt"`, `"translationStatus"`, `"translationError"`, `"translationProfile"`; có `"viSource":"AUTO"`.
  - `videoFileHasVietsubCues`: `data/videos/<id>.json` = `{video, vietsub:[{startMs,endMs,text}]}` đúng thứ tự; text tiếng Việt + chữ Thái + emoji giữ nguyên (đọc lại bằng UTF-8).
  - `exportsPlaylistsInOrder`: playlist 2 video → `data/playlists.json` (`videoCount` 2, `thumbnailUrl` video đầu, không có `containsVideo`) và `data/playlists/<id>.json` theo `position`.
  - `rewritesProfileMediaUrlsAndCopiesOnlyUsedImages`: Profile có khối IMAGE dùng ảnh A; ảnh B không dùng → `data/profiles/emi.json` có `"mediaUrl":"/media/<keyA>.png"`, không còn `/api/media/`; `media/<keyA>.png` tồn tại, ảnh B không được chép.
  - `skipsMissingImageFileWithWarning` (`OutputCaptureExtension`): xoá file ảnh A trên đĩa → export không ném lỗi, không có `media/<keyA>.png`, log có `WARN` nhắc media id.
  - `writesSiteJson`: `data/site.json` = `{"publishedAt":"2026-11-04T10:00:00Z","year":2026}`.
- [ ] **Step 2: Chạy** `mvn -q test -Dskip.npm -Dtest=SiteExporterTest` → FAIL (class chưa có).
- [ ] **Step 3: Implement.** JSON không pretty-print, UTF-8. Thứ tự video giống `withVietsub` của frontend (`viUpdatedAt` giảm dần). Playlist: lọc video `viCueCount > 0`, `videoCount` = số còn lại, `thumbnailUrl` của video đầu còn lại (null nếu rỗng). Profile: duyệt `blocks[].mediaId` và `items[].mediaId`, tra `Media` → `/media/<storageKey>.<ext>`; thiếu file → bỏ qua và `log.warn("Media {} is missing on disk; left out of the public site", id)`.
- [ ] **Step 4: Chạy** test → PASS; toàn bộ `mvn -q test -Dskip.npm` → PASS.
- [ ] **Step 5: Commit** — `git commit -m "Export the public read-only data (allowlisted JSON and used images)"`

### Task 2: `PublicSiteBundle` (bản build public + file cấu hình Pages)

**Files:**
- Create: `src/main/java/com/subtitlestudio/publish/PublicSiteBundle.java`
- Create (test resources): `src/test/resources/public-site/public.html` (`<!doctype html><html><head><title>Subtitle Studio</title></head><body><div id="root"></div></body></html>`), `src/test/resources/public-site/assets/app.js` (`console.log(1);`)
- Test: `src/test/java/com/subtitlestudio/publish/PublicSiteBundleTest.java`

**Interfaces:**
- Produces: `PublicSiteBundle` (`@Component`): `void writeTo(Path dir, boolean indexable)` — chép `classpath:public-site/**` (giữ cấu trúc; `public.html` → `index.html`), sinh `_redirects`, `_headers`, `robots.txt`; `indexable=false` chèn meta robots ngay sau `<head>` của `index.html`. Ném `IllegalStateException("The public site build is missing from the app (classpath:public-site/public.html)")` khi không có `public.html`.

- [ ] **Step 1: Test** —
  - `copiesBuildAndRenamesEntryToIndex`: có `index.html`, `assets/app.js`; không có `public.html`.
  - `redirectsEverythingToTheSpa`: `_redirects` = `/* /index.html 200\n`.
  - `headersCacheAssetsButNotData`: `_headers` chứa khối `/assets/*` và `/media/*` với `Cache-Control: public, max-age=31536000, immutable`; khối `/data/*` với `Cache-Control: no-cache`.
  - `noindexByDefault` (`indexable=false`): `index.html` chứa `<meta name="robots" content="noindex, nofollow">`; `_headers` có khối `/*` với `X-Robots-Tag: noindex, nofollow`; `robots.txt` = `User-agent: *\nDisallow: /\n`.
  - `indexableSiteHasNoRobotsBlock` (`true`): không meta, không `X-Robots-Tag`; `robots.txt` = `User-agent: *\nAllow: /\n`.
- [ ] **Step 2: Chạy** → FAIL. **Step 3: Implement** — đọc classpath bằng `PathMatchingResourcePatternResolver("classpath:public-site/**")`. **Step 4: Chạy** → PASS + toàn bộ backend.
- [ ] **Step 5: Commit** — `git commit -m "Bundle the public build with Pages redirects, headers and robots.txt"`

### Task 3: Cấu hình Publish + `WranglerClient`

**Files:**
- Modify: `SubtitleStudioProperties.java` (thêm `@Valid @NotNull Publish publish`), `src/main/resources/application.yml`, `src/test/resources/application-test.yml` (nếu cần giá trị test)
- Create (package `publish`): `WranglerClient.java`, `WranglerClientImpl.java`, `PublishFailedException.java`
- Test: `src/test/java/com/subtitlestudio/publish/FakeWrangler.java`, `WranglerClientImplTest.java`, `src/test/java/com/subtitlestudio/config/PublishPropertiesTest.java`

**Interfaces:**
- Produces:
  - `record Publish(String cloudflareApiToken, String cloudflareAccountId, String project, boolean indexable, @NotBlank String wranglerPath, @NotNull Duration timeout)` trong `SubtitleStudioProperties`; `boolean configured()` (3 giá trị đầu không trống); `String url()` = `"https://" + project + ".pages.dev"`; `toString()` không chứa token.
  - `application.yml`: `subtitle-studio.publish.cloudflare-api-token: ${CLOUDFLARE_API_TOKEN:}`, `cloudflare-account-id: ${CLOUDFLARE_ACCOUNT_ID:}`, `project: ${SUBTITLESTUDIO_PUBLISH_PROJECT:}`, `indexable: ${SUBTITLESTUDIO_PUBLISH_INDEXABLE:false}`, `wrangler-path: ${SUBTITLESTUDIO_PUBLISH_WRANGLER_PATH:wrangler}`, `timeout: 5m`.
  - `interface WranglerClient { void deploy(Path dir); }` — ném `PublishFailedException(String userMessage)` (có `userMessage()`).
  - `WranglerClientImpl(SubtitleStudioProperties)` + package-private `WranglerClientImpl(List<String> baseCommand, SubtitleStudioProperties.Publish settings)`; lệnh = `baseCommand + ["pages","deploy", dir, "--project-name", project, "--branch", "main"]`; env thêm `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.
  - Thông báo lỗi (đúng chữ): `"Cloudflare rejected the API token."` (stderr chứa `Authentication error` hoặc `[code: 10000]`), `"Cloudflare Pages project \"<project>\" was not found."` (`Project not found` hoặc `[code: 8000007]`), `"Could not reach Cloudflare."` (`ENOTFOUND`, `ECONNRESET`, `fetch failed`), `"Publishing timed out."`, `"Could not start wrangler."` (IOException khi start), còn lại `"Cloudflare Pages deploy failed (exit <n>)."`.

- [ ] **Step 1: Test** —
  - `PublishPropertiesTest`: `configured()` false khi thiếu một trong ba; `url()`; `toString()` không chứa token mẫu `"cf-secret-123"`; mặc định `indexable=false`, `timeout=5m`, `wranglerPath="wrangler"` (bind từ `application.yml` bằng `@SpringBootTest` + `@ActiveProfiles("test")`).
  - `FakeWrangler` (main Java, chế độ `-Dfake.mode=`): `ok` (ghi args + giá trị env `CLOUDFLARE_ACCOUNT_ID` và độ dài `CLOUDFLARE_API_TOKEN` vào file `-Dfake.out=<path>`, exit 0), `auth` (stderr `✘ [ERROR] Authentication error [code: 10000]` + in token ra stderr, exit 1), `missing` (stderr `Project not found [code: 8000007]`, exit 1), `network` (stderr `fetch failed ENOTFOUND`, exit 1), `other` (exit 7), `sleep` (ngủ 30 s).
  - `WranglerClientImplTest`: `passesArgumentsAndEnvironment` (args đúng thứ tự, account id đúng, token có độ dài đúng); `mapsAuthenticationError`; `neverLeaksTokenFromWranglerOutput` (`OutputCaptureExtension`; chế độ `auth`: `userMessage()`, `getMessage()` và log không chứa `"cf-secret-123"`); `mapsMissingProject`; `mapsNetworkError`; `mapsOtherExitCode` (`"Cloudflare Pages deploy failed (exit 7)."`); `timesOut` (timeout 1 s → `"Publishing timed out."`, tiến trình bị huỷ); `reportsMissingBinary` (baseCommand trỏ file không tồn tại → `"Could not start wrangler."`).
- [ ] **Step 2: Chạy** → FAIL. **Step 3: Implement** theo Interfaces; đọc stdout/stderr bằng 2 virtual thread, giữ tối đa 64 KB mỗi luồng để phân loại; không log output; log `WARN "wrangler exited with {}"` (chỉ exit code).
- [ ] **Step 4: Chạy** → PASS + toàn bộ backend.
- [ ] **Step 5: Commit** — `git commit -m "Publish settings and a wrangler client for Cloudflare Pages deploys"`

### Task 4: `PublishService` + `PublishController`

**Files:**
- Create (package `publish`): `PublishService.java`, `PublishStatus.java`, `PublishController.java`, `PublishInProgressException.java`, `PublishNotConfiguredException.java`, `PublishConfig.java` (bean `publishExecutor`, virtual thread per task, như `TranslationConfig`)
- Modify: `web/ApiExceptionHandler.java`
- Test: `PublishServiceTest.java`, `PublishControllerTest.java`

**Interfaces:**
- Consumes: `SiteExporter.export(Path, Instant)` (Task 1), `PublicSiteBundle.writeTo(Path, boolean)` (Task 2), `WranglerClient.deploy(Path)`, `PublishFailedException.userMessage()`, `Publish.configured()/url()/indexable()` (Task 3), `Clock`.
- Produces:
  - `record PublishStatus(String status, boolean configured, Instant lastPublishedAt, String url, String error)`; `status` ∈ `"IDLE" | "PUBLISHING" | "DONE" | "FAILED"`; `url` null khi chưa cấu hình.
  - `PublishService`: `PublishStatus status()`, `PublishStatus start()` (đồng bộ: kiểm tra cấu hình → `PublishNotConfiguredException`; đang chạy → `PublishInProgressException`; chuyển `PUBLISHING`, đẩy việc vào `publishExecutor`, trả trạng thái); `@EventListener(ApplicationReadyEvent) void cleanUpLeftovers()` xoá `{data-dir}/publish-tmp`.
  - Việc nền: tạo `{data-dir}/publish-tmp/<uuid>/` → export → bundle → deploy → `DONE` + `lastPublishedAt = clock.instant()`, `error = null`; `PublishFailedException` → `FAILED` + `userMessage`; `RuntimeException` khác → `FAILED` + `"Could not publish: <SimpleName>."` + `log.warn`; luôn xoá thư mục tạm.
  - `POST /api/publish` → 202 + `PublishStatus`; `GET /api/publish` → 200 + `PublishStatus`. Mã lỗi: `PUBLISH_IN_PROGRESS` 409, `PUBLISH_NOT_CONFIGURED` 503.

- [ ] **Step 1: Test** — `PublishServiceTest` (unit: `SiteExporter`, `PublicSiteBundle`, `WranglerClient` mock; executor giữ việc lại để kiểm tra trạng thái giữa chừng, như `TestExecutor` trong `TranslationServiceTest`; `MutableClock`; data-dir `@TempDir`):
  - `notConfiguredRefusesToStart`; `startsAndReportsPublishing`; `rejectsSecondStartWhilePublishing`;
  - `successMarksDoneWithTime` (status `DONE`, `lastPublishedAt` = clock, `url` = `https://fans.pages.dev`);
  - `wranglerFailureMarksFailedWithMessage`; `unexpectedErrorMarksFailedGeneric`;
  - `passesIndexableToBundle`; `alwaysDeletesTempDir` (thành công và thất bại);
  - `cleansLeftoverTempDirsOnStartup`; `canPublishAgainAfterFailure`.
  - `PublishControllerTest` (`@WebMvcTest`): 202 + body; 409 `PUBLISH_IN_PROGRESS`; 503 `PUBLISH_NOT_CONFIGURED`; `GET`.
- [ ] **Step 2: Chạy** → FAIL. **Step 3: Implement.** **Step 4: Chạy** → PASS + toàn bộ backend.
- [ ] **Step 5: Commit** — `git commit -m "Publish service and API: one background publish at a time"`

### Task 5: Frontend `ReadSource` + `SiteContext` (trang dùng được cả hai nguồn)

**Files:**
- Create: `frontend/src/data/types.ts`, `frontend/src/data/apiSource.ts`, `frontend/src/data/staticSource.ts`, `frontend/src/data/SiteContext.tsx`, `frontend/src/data/staticSource.test.ts`
- Modify: `frontend/src/pages/VietsubListPage.tsx`, `frontend/src/pages/WatchPage.tsx`, `frontend/src/lib/usePlaylistMode.ts`, `frontend/src/pages/ProfilePage.tsx`, `frontend/src/components/PlaylistPanel.tsx`, `PlaylistHeader.tsx`, `PlaylistChips.tsx` (kiểu dữ liệu), `frontend/src/lib/vietsub.ts` (generic theo kiểu có `viCueCount`/`viUpdatedAt`)
- Test: `frontend/src/pages/ProfilePage.test.tsx`, `WatchPage.test.tsx`, `VietsubListPage.test.tsx` (bổ sung case read-only)

**Interfaces:**
- Produces:
  - `types.ts`: `type PublicVideo = Pick<VideoDto, 'id'|'title'|'channel'|'durationSec'|'thumbnailUrl'|'viCueCount'|'viUpdatedAt'|'viSource'>`; `type PublicPlaylistSummary = Omit<PlaylistSummary, 'containsVideo'>`; `type PublicPlaylistDetail = Omit<PlaylistDetail, 'videos'> & { videos: PublicVideo[] }`; `interface ReadSource` đúng 7 hàm của spec mục 5.
  - `apiSource: ReadSource` (bọc hàm sẵn có trong `api/client.ts`, `api/playlists.ts`, `api/profiles.ts`).
  - `createStaticSource(base = '/'): ReadSource` — `fetch` `${base}data/...`; file `data/videos/<id>.json` tải một lần (cache trong Map) cho `getVideo` + `getVietsub`; HTTP 404 → `new ApiError(404, 'VIDEO_NOT_FOUND' | 'PLAYLIST_NOT_FOUND' | 'PROFILE_NOT_FOUND', ...)`; lỗi mạng → `ApiError(0, 'NETWORK', ...)`.
  - `SiteContext.tsx`: `interface Site { source: ReadSource; readOnly: boolean; homePath: string }`; `SiteProvider`; `useSite(): Site` — **mặc định** `{ source: apiSource, readOnly: false, homePath: '/' }` (test cũ không cần bọc provider).
  - Các trang đọc qua `useSite().source`; khi `readOnly`: Profile ẩn **Edit** (và mọi thanh công cụ sửa), Vietsub list/trang xem ẩn link **Add Vietsub** trong `EmptyState` (chỉ còn câu "No videos with Vietsub yet."/"This video has no Vietsub yet.").

- [ ] **Step 1: Test** —
  - `staticSource.test.ts` (`vi.stubGlobal('fetch')` trả theo path): `readsVideosAndPlaylists`; `loadsVideoFileOnceForVideoAndVietsub` (2 lời gọi → 1 fetch `/data/videos/abc.json`); `staticSourceMapsMissingFilesToNotFoundCodes` (404 cho video/playlist/profile → `ApiError.code` tương ứng); `networkFailureIsNetworkError`.
  - `ProfilePage.test.tsx`: `readOnlyHidesEditing` (render trong `SiteProvider` read-only với nguồn giả → không có nút "Edit").
  - `VietsubListPage.test.tsx`, `WatchPage.test.tsx`: `readOnlyEmptyStateHasNoAddLink` (không có link "Add Vietsub"); `usesTheSiteSource` (nguồn giả, không gọi `fetch` tới `/api`).
- [ ] **Step 2: Chạy** `cd frontend && npm test` → FAIL. **Step 3: Implement** (đổi import trực tiếp `listVideos/getPlaylist/...` sang `useSite().source`; giữ nguyên hành vi app quản trị). `npm run build` kiểm tra kiểu: các trang public chỉ dùng trường của `PublicVideo`.
- [ ] **Step 4: Chạy** `npm test` → PASS (toàn bộ, gồm test cũ); `npm run build` → OK.
- [ ] **Step 5: Commit** — `git commit -m "Read public pages through a site context (API or static JSON)"`

### Task 6: `PublicApp`, bản build public, chân trang

**Files:**
- Create: `frontend/public.html`, `frontend/src/main.public.tsx`, `frontend/src/PublicApp.tsx`, `frontend/src/PublicApp.test.tsx`, `frontend/src/components/SiteFooter.tsx`, `frontend/src/pages/NotFoundPage.tsx`
- Modify: `frontend/vite.config.ts` (mode `public`: `build.rollupOptions.input = 'public.html'`, `outDir = '../target/classes/public-site'`), `frontend/package.json` (script `"build:public": "tsc --noEmit && vite build --mode public"`), `frontend/src/components/NavBar.tsx` (prop `sections` hoặc biến thể public), `frontend/src/styles.css` (chân trang), `pom.xml` (execution `npm-build-public` ở phase `prepare-package`, sau `npm-build`)

**Interfaces:**
- Consumes: `SiteProvider`, `createStaticSource()` (Task 5).
- Produces: `PublicApp` — `SiteProvider value={{ source: createStaticSource(), readOnly: true, homePath: '/vietsub/list' }}`; routes đúng bảng spec mục 5 (`/` → `/vietsub/list`, `/profiles` → `/profiles/emibonnie`, `*` → `NotFoundPage` với link "Back to Vietsub list"); NavBar 2 mục **Vietsub list**, **Profile**, tên app dẫn `/vietsub/list`; `SiteFooter` đọc `data/site.json` → `Vietsub by @byZenQN · All videos are the property of their original creators · Updated 2026`.

- [ ] **Step 1: Test** — `PublicApp.test.tsx` (`MemoryRouter`, `fetch` giả cho `/data/*`): `rootOpensVietsubList`; `navHasOnlyPublicSections` (có "Vietsub list", "Profile"; không có "Get Engsub", "Vietsub", "Publish"); `footerShowsCreditAndYear` (đúng chuỗi trên với năm từ `site.json`); `unknownRouteShowsNotFound`; `profileIsReadOnly` (không có "Edit").
- [ ] **Step 2: Chạy** → FAIL. **Step 3: Implement.** **Step 4: Chạy** `npm test` → PASS; `npm run build:public` → tạo `target/classes/public-site/public.html` + `assets/`; `mvn -q package -DskipTests` → jar chứa `public-site/public.html` (`jar tf target/*.jar | grep public-site/public.html`).
- [ ] **Step 5: Commit** — `git commit -m "Public read-only app build with footer and not-found page"`

### Task 7: Nút Publish trong app quản trị

**Files:**
- Create: `frontend/src/api/publish.ts`, `frontend/src/components/PublishButton.tsx`, `frontend/src/components/PublishButton.test.tsx`
- Modify: `frontend/src/components/NavBar.tsx` (gắn `PublishButton` bên phải, chỉ app quản trị), `frontend/src/lib/errors.ts` (`PUBLISH_IN_PROGRESS` → "A publish is already running.", `PUBLISH_NOT_CONFIGURED` → "Publishing is not set up." + hint "Set CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID and SUBTITLESTUDIO_PUBLISH_PROJECT in .env and restart the app."), `frontend/src/styles.css`

**Interfaces:**
- Consumes: `POST/GET /api/publish` (Task 4), `Tip`, `useConfirmDialog`, `toast` (sonner).
- Produces: `publish.ts`: `interface PublishStatus { status: 'IDLE'|'PUBLISHING'|'DONE'|'FAILED'; configured: boolean; lastPublishedAt: string|null; url: string|null; error: string|null }`, `getPublishStatus()`, `startPublish()`.

- [ ] **Step 1: Test** — `PublishButton.test.tsx` (`fakeFetch`, fake timers cho polling 2 s):
  - `disabledWhenNotConfigured` (tooltip đúng chuỗi spec mục 6);
  - `confirmsThenPublishes` (hộp "Publish the public site now?" → `POST /api/publish` → toast "Publishing…");
  - `spinsAndPollsUntilDone` (nút disabled + có vòng xoay; `GET` lần 2 trả `DONE` → toast "Published" có link **Open site** tới `url`);
  - `showsErrorWhenFailed` (toast hiện `error`);
  - `tooltipShowsLastPublish` ("Last published …" / "Not published yet").
- [ ] **Step 2: Chạy** → FAIL. **Step 3: Implement** (icon `UploadCloud`; dừng polling khi unmount). **Step 4: Chạy** `npm test` → PASS; `npm run build` → OK.
- [ ] **Step 5: Commit** — `git commit -m "Publish button in the admin top bar"`

### Task 8: Docker, cấu hình, tài liệu, publish thật

**Files:**
- Modify: `Dockerfile`, `docker-compose.yml`, `.env.example`, `README.md`, `CLAUDE.md`, `PROGRESS.md`

- [ ] **Step 1: Dockerfile** — stage `wrangler` từ image Node pin version (LTS, tag cụ thể): `npm install --prefix /opt/wrangler wrangler@<version đã ≥ 2 tuần>`; runtime: `COPY --from=wrangler /usr/local/bin/node /usr/local/bin/node`, `COPY --from=wrangler /opt/wrangler /opt/wrangler`, `ENV SUBTITLESTUDIO_PUBLISH_WRANGLER_PATH=/opt/wrangler/node_modules/.bin/wrangler`. Kiểm tra: `docker build -t subtitle-studio:local .` OK; `docker run --rm --entrypoint /opt/wrangler/node_modules/.bin/wrangler subtitle-studio:local --version` in version.
- [ ] **Step 2: Compose + `.env.example`** — 4 biến `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `SUBTITLESTUDIO_PUBLISH_PROJECT` (trống), `SUBTITLESTUDIO_PUBLISH_INDEXABLE=false`; compose truyền `${VAR:-}` (không bắt buộc).
- [ ] **Step 3: Tài liệu** — README mục "Public site (Publish)" (tạo project Pages kiểu Direct Upload, token chỉ quyền **Account → Cloudflare Pages → Edit**, account id, điền `.env`, sao lưu trước lần đầu, `INDEXABLE`, rollback trong dashboard); bảng cấu hình + API `GET/POST /api/publish` + mã lỗi; CLAUDE.md (route bản public; trang public đọc qua `useSite().source` và chỉ dùng trường `PublicVideo`; allowlist; token không vào log/commit); PROGRESS.md (nhật ký, kết quả test).
- [ ] **Step 4: Publish thật (cùng người dùng)** — người dùng tạo project + token, điền `.env`; build image, `docker compose up -d --no-build subtitle-studio`; bấm Publish → toast "Published"; trên điện thoại: Vietsub list, search, playlist + Autoplay, Profile, F5 ở `/vietsub/<id>?playlist=<id>`; `curl -sI https://<project>.pages.dev/ | grep -i x-robots-tag` → `noindex, nofollow`; `curl -s https://<project>.pages.dev/data/videos.json` không chứa `translation` hay `cueCount`.
- [ ] **Step 5: Commit** — `git commit -m "Docker, compose and docs for publishing the public site"`
