# Đưa trang public lên Google (Đợt 2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task (user rule: Sonnet implements every task, then one Opus review of the whole branch — no per-task review). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lúc Publish, mỗi URL công khai có một file HTML riêng, trong đó có sẵn title, description, canonical và Open Graph; site có thêm `sitemap.xml`, `robots.txt` trỏ tới sitemap, và chỗ chèn mã xác minh Google.

**Architecture:**
- Thêm 2 class ở gói `publish`:
  - `PublicPageRenderer`: đọc lại các file JSON mà `SiteExporter` vừa ghi trong thư mục site (vì vậy chỉ dùng đúng dữ liệu đã nằm trong allowlist), rồi ghi `<route>.html` dựa trên khuôn `index.html`.
  - `SitemapWriter`: ghi sitemap.
- `PublicSiteBundle` nhận thêm `siteUrl`, dùng cho `robots.txt` và `_redirects`.
- Ảnh chương chuyển từ `/novels/<slug>/…` sang `/novel-images/<slug>/…`, để luật cache `immutable` không áp lên file HTML trong `/novels/`.

**Tech Stack:** Spring Boot (Java 21, Jackson, `org.springframework.web.util.HtmlUtils`), JUnit 5, React + Vite (`frontend/public.html`), Vitest.

**Spec:** [docs/superpowers/specs/2026-11-23-public-site-seo-design.md](../specs/2026-11-23-public-site-seo-design.md)

## Global Constraints

- **Tên site:** `byZenQN`. Khai báo một lần trong Java (`PublicPageRenderer.SITE_NAME`) và một lần ở frontend (`SITE_NAME` trong `publicNames.ts`).
- **`SITE_URL`:** mặc định là `settings.url()` (`https://{project}.pages.dev`), không có `/` ở cuối.
- **Cờ `indexable`:** dựng HTML từng trang và sitemap **luôn chạy**; cờ này chỉ quyết định `noindex` và nội dung `robots.txt`.
- **Escape:** mọi giá trị chèn vào HTML phải qua `HtmlUtils.htmlEscape`. Mọi URL trong XML phải escape `&`.
- **Không chữ chương:** không bao giờ có chữ chương trong HTML hay sitemap. Không tạo trang cho `/novels/shelf` và 404.
- **Không lộ bí mật:** không token và không mã xác minh nào xuất hiện trong log hay `toString()`.
- **Commit:**
  - Commit message, tiêu đề và mô tả PR viết bằng tiếng Anh.
  - Làm trên nhánh `feat/public-site-seo`, mở một PR, không merge khi user chưa duyệt.
  - Không stage file `data/`.
  - Chạy vitest từ `frontend/`, không chạy từ `frontend/src`.
- **Trước khi báo xong:** chạy `mvn test -Dskip.npm`, `cd frontend && npm test`, `npx tsc --noEmit`.

## Review Focus

1. **Tên truyện hoặc video có `<`, `"`, `&`, emoji:** HTML vẫn hợp lệ, title hiện đúng chữ. → test ở Task 3.
2. **Mô tả dài, có xuống dòng, hoặc trống:** gộp khoảng trắng, cắt ở 160 ký tự theo code point (không cắt đôi emoji) rồi thêm `…`; trống thì dùng câu mặc định. → test ở Task 3.
3. **Truyện không có ảnh bìa, video không có thumbnail:** `og:image` dùng `{SITE_URL}/logo.webp`. → test ở Task 3.
4. **Mục đã gỡ khỏi public** (chương Unpublish, video không DONE): không có HTML, không có trong sitemap. Có được điều này vì renderer chỉ đọc JSON đã xuất. → test ở Task 3 và Task 4.
5. **Publish lại sau lần đầu:** ảnh chương nằm ở `/novel-images/`; trong JSON và HTML không còn đường dẫn ảnh `/novels/<slug>/*.webp`. → test ở Task 2.

---

### Task 1: Cấu hình `SITE_URL` và mã xác minh Google

**Files:**
- Modify: `src/main/java/com/subtitlestudio/config/SubtitleStudioProperties.java` (record `Publish`)
- Modify: `src/main/resources/application.yml` (khối `publish`), `.env.example`, `docker-compose.yml`
- Test: `src/test/java/com/subtitlestudio/config/` (test properties có sẵn, hoặc tạo `PublishPropertiesTest.java`)

**Interfaces:**
- Produces:
  - `Publish` thêm 2 thành phần cuối: `String siteUrl, String googleVerification`.
  - Hai constructor phụ hiện có truyền `""` cho cả hai.
  - `public String siteUrl()` bị thay bằng `public String publicSiteUrl()`: trả `siteUrl` đã bỏ `/` ở cuối nếu không trống, ngược lại trả `url()`.
  - `public String googleVerification()` là accessor tự sinh.
- Biến môi trường:
  - `SUBTITLESTUDIO_PUBLISH_SITE_URL` (mặc định trống);
  - `SUBTITLESTUDIO_PUBLISH_GOOGLE_VERIFICATION` (mặc định trống).

- [ ] **Step 1: Viết test lỗi**
  - `publicSiteUrlDefaultsToPagesDev`: project `abc`, siteUrl trống → `https://abc.pages.dev`.
  - `publicSiteUrlTrimsSlash`: `https://x.dev/` → `https://x.dev`.
  - `toStringHidesVerification`: `googleVerification = "SECRET123"` → `toString()` không chứa `SECRET123`.
- [ ] **Step 2: Chạy và xác nhận fail**

  Run: `mvn test -Dskip.npm -Dtest=PublishPropertiesTest`
- [ ] **Step 3: Viết code**
  - Thêm 2 trường và `publicSiteUrl()`.
  - Map env trong `application.yml`.
  - Thêm 2 dòng có chú thích vào `.env.example` và `docker-compose.yml`.
- [ ] **Step 4: Chạy lại test**

  Run: `mvn test -Dskip.npm`. Expected: PASS toàn bộ (kể cả các chỗ đang gọi constructor của `Publish`).
- [ ] **Step 5: Commit**

  `git commit -m "feat(publish): site URL and Google verification settings"`

### Task 2: Ảnh chương sang `/novel-images/`, sửa `_headers`, `_redirects`, `robots.txt`

**Files:**
- Modify: `src/main/java/com/subtitlestudio/publish/NovelExporter.java:109-117`
- Modify: `src/main/java/com/subtitlestudio/publish/PublicSiteBundle.java`
- Test: `src/test/java/com/subtitlestudio/publish/PublicSiteBundleTest.java`, `SiteExporterTest.java` (hoặc test của `NovelExporter` đang kiểm URL ảnh)

**Interfaces:**
- Produces: `PublicSiteBundle.writeTo(Path dir, boolean indexable, String siteUrl)` thay cho `writeTo(Path, boolean)`.
- Ảnh chương được ghi vào `dir/novel-images/<slug>/<file>`, URL là `/novel-images/<slug>/<file>`.

- [ ] **Step 1: Viết test lỗi**
  - **Ảnh chương** (`SiteExporterTest`): URL trong `data/novels/<slug>/<n>.json` bắt đầu bằng `/novel-images/<slug>/`; file nằm ở `dir/novel-images/<slug>/`; thư mục `dir/novels` không còn file `.webp`.
  - **`_headers`:**
    - có khối `/novel-images/*` với `immutable`;
    - **không còn** khối `/novels/*`;
    - khi `indexable=true` có khối `/novels/shelf` với `X-Robots-Tag: noindex`;
    - khi `indexable=false` vẫn có `X-Robots-Tag: noindex, nofollow` trong `/*`.
  - **`_redirects`:** dòng đầu là `/ /vietsub/list 301`, dòng cuối là `/* /index.html 200`.
  - **`robots.txt`:**
    - `indexable=true` → đúng 4 dòng như spec (không có `Disallow: /data/`, vì Google cần nạp JSON của SPA), gồm `Sitemap: https://abc.pages.dev/sitemap.xml`;
    - `indexable=false` → `User-agent: *\nDisallow: /\n` như cũ.
- [ ] **Step 2: Chạy và xác nhận fail**

  Run: `mvn test -Dskip.npm -Dtest=PublicSiteBundleTest+SiteExporterTest`
- [ ] **Step 3: Viết code**
  - Đổi `dir.resolve("novels")` và tiền tố URL trong `NovelExporter`.
  - Trong `PublicSiteBundle.headers(...)`, đổi `/novels/*` thành `/novel-images/*` và thêm khối shelf.
  - `_redirects` thêm dòng 301.
  - `robots(indexable, siteUrl)` trả nội dung đúng như spec.
  - Cập nhật chỗ gọi trong `PublishService` (`settings.publicSiteUrl()`).
- [ ] **Step 4: Chạy lại test**

  Run: `mvn test -Dskip.npm`. Expected: PASS.
- [ ] **Step 5: Commit**

  `git commit -m "feat(publish): chapter images under /novel-images, robots and redirects for search engines"`

### Task 3: `PublicPageRenderer` — mỗi route một file HTML

**Files:**
- Create: `src/main/java/com/subtitlestudio/publish/PublicPageRenderer.java`
- Create: `src/main/java/com/subtitlestudio/publish/PublicPage.java` (record)
- Test: `src/test/java/com/subtitlestudio/publish/PublicPageRendererTest.java`

**Interfaces:**
- Consumes:
  - các file trong `dir` do `SiteExporter` ghi: `data/videos.json` (`List<PublicVideo>`), `data/works.json` (`List<WorkSummaryDto>`), `data/works/<id>.json` (`WorkDto`), `data/novels.json` (`List<PublicNovelSummary>`), `data/novels/<slug>.json` (`PublicNovelDetail`);
  - `dir/index.html` do `PublicSiteBundle` ghi.
- Produces:
  - `record PublicPage(String path, String title, String description, String imageUrl, String ogType, Instant lastModified, List<Link> links)` với `record Link(String href, String text)`. `path` bắt đầu bằng `/`, ví dụ `/novels/be-my-sugar/3`.
  - `@Component class PublicPageRenderer` có:
    - `public static final String SITE_NAME = "byZenQN"`;
    - `List<PublicPage> pages(Path dir)`: đọc JSON và trả danh sách trang;
    - `List<PublicPage> writeTo(Path dir, String siteUrl, String googleVerification)`: ghi `dir/<path bỏ "/" đầu>.html` cho mỗi trang, chèn meta xác minh vào `dir/index.html`, rồi trả danh sách trang (Task 4 dùng danh sách này).

**Bảng trang** (title luôn kết thúc bằng ` · byZenQN`; `{n}` là `label` nếu có, không thì `Chương {chapterNo}`):

| path | title | description | image | ogType | links |
|---|---|---|---|---|---|
| `/vietsub/list` | `Vietsub` | `Video thần tượng Thái Lan kèm phụ đề tiếng Việt.` | logo | website | mọi `/vietsub/{id}` |
| `/vietsub/{id}` | `{title} · Vietsub` | `Xem {title} kèm phụ đề tiếng Việt.` | `thumbnailUrl` | video.other | `/vietsub/list` |
| `/profiles` | `Profile` | `Giới thiệu EmiBonnie.` | logo | website | — |
| `/photos` | `Photos` | `Ảnh của EmiBonnie.` | logo | website | — |
| `/works` | `Works` | `Phim, nhạc và chương trình của EmiBonnie.` | logo | website | mọi `/works/{id}` |
| `/works/{id}` | `{title}` | `description` của work, trống thì `{title} — tác phẩm của EmiBonnie.` | `coverUrl` | website | `/works` |
| `/novels` | `Truyện` | `Truyện dịch và sáng tác tiếng Việt.` | logo | website | mọi `/novels/{slug}` |
| `/novels/{slug}` | `{title}` | `description`, trống thì `Đọc {title} bằng tiếng Việt.` | `coverUrl` | book | mọi chương `/novels/{slug}/{chapterNo}` (text là `{n}`) |
| `/novels/{slug}/{chapterNo}` | `{n} · {title}` | `Đọc {n} của {title}.` | `coverUrl` của truyện | book | `/novels/{slug}` + chương trước/sau nếu có |

`lastModified`: video lấy `viUpdatedAt`; truyện lấy `lastPublishedAt` (từ summary); chương lấy `publishedAt`; các trang còn lại là `null`.

**Cách ghi HTML** (khuôn là `dir/index.html`):
- Bỏ `<title>…</title>` và `<meta name="description" …>` trong khuôn.
- Chèn ngay sau `<head>`:
  - `<title>`, `meta description`, `link rel="canonical" href="{siteUrl}{path}"`;
  - `og:title`, `og:description`, `og:url`, `og:image`, `og:type`, `og:site_name` (= `byZenQN`), `twitter:card` (= `summary_large_image`);
  - meta `google-site-verification` nếu có mã.
- `og:image` tương đối thì ghép `siteUrl` vào trước; không có ảnh thì dùng `{siteUrl}/logo.webp`.
- Thay `<div id="root"></div>` bằng `<div id="root"><main><h1>{title không có hậu tố}</h1><p>{description}</p><ul><li><a href="{href}">{text}</a></li>…</ul></main></div>`. Bỏ `<ul>` khi không có link.
- Mô tả: gộp mọi khoảng trắng thành một dấu cách, `trim`, dài hơn 160 code point thì cắt còn 159 rồi thêm `…`.
- Nếu khuôn thiếu `<div id="root"></div>` hoặc thiếu `<head>` thì ném `IllegalStateException`, để lỗi lộ ra ngay thay vì publish trang hỏng.

- [ ] **Step 1: Viết test lỗi** (dựng `dir` tạm có JSON mẫu và `index.html` giống `frontend/public.html`)
  - `writesOneFilePerRoute`: có `vietsub/list.html`, `vietsub/v1.html`, `novels.html`, `novels/sugar.html`, `novels/sugar/3.html`, `works/7.html`, `profiles.html`, `photos.html`, `works.html`.
  - `novelPageHasHeadTags`:
    - `<title>Be My Sugar · byZenQN</title>`;
    - `link rel="canonical" href="https://abc.pages.dev/novels/sugar"`;
    - `og:type` là `book`;
    - `og:image` là `https://abc.pages.dev/media/c.webp`;
    - chỉ có **một** `<title>` và một `meta name="description"`.
  - `novelPageLinksChapters`: `#root` chứa `<a href="/novels/sugar/3">Chương 3</a>` và `<a href="/novels/sugar/4">Ngoại truyện 1</a>` (chương có label).
  - `escapesTitles`: truyện tên `A<b> & "C"` → HTML chứa `A&lt;b&gt; &amp; &quot;C&quot;` và không chứa `<b>`.
  - `truncatesDescription`: mô tả 300 ký tự có `\n` và emoji → description dài 160 code point, kết thúc `…`, không có `\n`.
  - `fallsBackToLogo`: truyện `coverUrl = null` → `og:image` là `https://abc.pages.dev/logo.webp`.
  - `verificationMetaOnlyWhenSet`: có mã → mọi file `.html` và `index.html` có `<meta name="google-site-verification" content="X">`; mã trống → không file nào có.
  - `noChapterTextAnywhere`: JSON chương có `images`; HTML của chương không chứa `.webp` lẫn chữ chương.
  - `onlyExportedItems`: `novels.json` không có slug `hidden` → không có `novels/hidden.html`.
  - `failsOnBrokenTemplate`: khuôn thiếu `#root` → `IllegalStateException`.
- [ ] **Step 2: Chạy và xác nhận fail**

  Run: `mvn test -Dskip.npm -Dtest=PublicPageRendererTest`
- [ ] **Step 3: Viết code**
  - Đọc JSON bằng `ObjectMapper` đã cấu hình sẵn trong app.
  - Escape bằng `HtmlUtils.htmlEscape(value, "UTF-8")`.
  - Ghi file UTF-8, tạo thư mục cha khi cần.
- [ ] **Step 4: Chạy lại test**

  Run: như Step 2. Expected: PASS.
- [ ] **Step 5: Commit**

  `git commit -m "feat(publish): a pre-rendered HTML head for every public page"`

### Task 4: `SitemapWriter` và nối vào `PublishService`

**Files:**
- Create: `src/main/java/com/subtitlestudio/publish/SitemapWriter.java`
- Modify: `src/main/java/com/subtitlestudio/publish/PublishService.java` (`run()`, constructor)
- Test: `src/test/java/com/subtitlestudio/publish/SitemapWriterTest.java`, `PublishServiceTest.java`

**Interfaces:**
- Consumes: `List<PublicPage>` (Task 3).
- Produces:
  - `SitemapWriter(int maxUrlsPerFile)`; bean mặc định dùng `50_000`.
  - `void write(Path dir, String siteUrl, List<PublicPage> pages)`:
    - nếu số trang ≤ max: ghi `dir/sitemap.xml` dạng `<urlset>`;
    - nếu nhiều hơn: ghi `dir/sitemap-1.xml`… và `dir/sitemap.xml` dạng `<sitemapindex>`.
  - `<lastmod>` có khi `lastModified` khác `null`, theo định dạng `yyyy-MM-dd` (UTC).
- Thứ tự trong `run()`: `exporter.export` → `bundle.writeTo(dir, indexable, siteUrl)` → `pageRenderer.writeTo(dir, siteUrl, verification)` → `sitemap.write(...)` → `readCounts.prepare` → đếm file. Phần đếm file và giới hạn 20.000 giữ nguyên, lúc này đã đếm cả file mới.

- [ ] **Step 1: Viết test lỗi**
  - `writesUrlset`: 3 trang → 3 `<loc>` dạng `https://abc.pages.dev/...`, có `<lastmod>2026-11-20</lastmod>` cho trang có ngày, không có `lastmod` cho trang không ngày.
  - `escapesAmpersand`: path `/works/a&b` → `&amp;`.
  - `splitsIntoIndex`: `new SitemapWriter(2)` với 5 trang → có `sitemap-1.xml`, `sitemap-2.xml`, `sitemap-3.xml`, và `sitemap.xml` là `<sitemapindex>` gồm 3 `<loc>`.
  - `PublishServiceTest.publishWritesPagesAndSitemap` (dùng `FakeWrangler` có sẵn): sau khi publish, thư mục gửi deploy có `sitemap.xml` và `novels/<slug>.html`, và `fileCount` đã tính cả các file đó.
- [ ] **Step 2: Chạy và xác nhận fail**

  Run: `mvn test -Dskip.npm -Dtest=SitemapWriterTest+PublishServiceTest`
- [ ] **Step 3: Viết code** theo đúng Interfaces ở trên.
- [ ] **Step 4: Chạy lại test**

  Run: `mvn test -Dskip.npm`. Expected: PASS toàn bộ.
- [ ] **Step 5: Commit**

  `git commit -m "feat(publish): sitemap.xml and wiring the pre-rendered pages into publish"`

### Task 5: Frontend — tiêu đề byZenQN

**Files:**
- Modify: `frontend/public.html` (`<title>byZenQN</title>`, description `Vietsub và truyện dịch tiếng Việt về EmiBonnie.`)
- Modify: `frontend/src/pages/public/publicNames.ts` (`export const SITE_NAME = 'byZenQN'`; `useDocumentTitle` đặt `${title} · ${SITE_NAME}`)
- Modify: các trang public chưa đặt tiêu đề: `VietsubListPage` (`Vietsub`), `WatchPage` (`{title} · Vietsub`), `ProfilePage` (`Profile`), `PhotosPage` (`Photos`), `WorksPage` (`Works`), `WorkDetailPage` (`{title}`). Chỉ đặt trên site public (kiểm tra cách các trang này biết mình đang chạy ở public, ví dụ `useSite()`); admin giữ nguyên.
- Test: `publicNames.test.ts` và test của các trang trên.

Mục đích: tiêu đề do JS đặt khớp với `<title>` đã dựng sẵn, để Google không thấy hai tiêu đề khác nhau.

- [ ] **Step 1: Viết test lỗi**
  - `useDocumentTitle('Truyện')` → `document.title === 'Truyện · byZenQN'`.
  - `WatchPage` public với video `Ep 1` → `Ep 1 · Vietsub · byZenQN`.
  - Trang admin tương ứng không đổi `document.title`.
- [ ] **Step 2: Chạy và xác nhận fail**

  Run: `cd frontend && npx vitest run src/pages`
- [ ] **Step 3: Viết code.**
- [ ] **Step 4: Chạy lại test**

  Run: `cd frontend && npm test` và `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit**

  `git commit -m "feat(public): page titles end with byZenQN"`

### Task 6: Tài liệu, kiểm tra toàn bộ, PR

**Files:**
- Modify: `README.md` (mục Publish: 3 bước lên Google của spec: bật `INDEXABLE`, xác minh Search Console bằng thẻ HTML, gửi `sitemap.xml`)
- Modify: `CLAUDE.md` (gói `publish`: `PublicPageRenderer`, `SitemapWriter`, `/novel-images/`; ước tính file mỗi chương +1)
- Modify: `PROGRESS.md`

- [ ] **Step 1: Cập nhật 3 file tài liệu.**
- [ ] **Step 2: Chạy toàn bộ**
  - `mvn test -Dskip.npm` → BUILD SUCCESS.
  - `cd frontend && npm test` → pass.
  - `npx tsc --noEmit` → sạch.
- [ ] **Step 3: Commit, push, mở PR**
  - `git commit -m "docs: publishing for search engines"`
  - `git push -u origin feat/public-site-seo`
  - `gh pr create --base main` với mô tả tiếng Anh: tóm tắt, lệnh test và kết quả, link spec + plan, và mục **"Post-deploy check"** (bên dưới).
  - **Không merge.**

**Post-deploy check** (làm sau khi user duyệt, deploy, bật `SUBTITLESTUDIO_PUBLISH_INDEXABLE=true` trong `.env` và bấm Publish):

```
curl -sI https://<project>.pages.dev/novels/<slug>        # 200, KHÔNG 308/301
curl -s  https://<project>.pages.dev/novels/<slug> | grep -c 'og:title'   # 1
curl -sI https://<project>.pages.dev/novel-images/<slug>/<file>.webp      # Cache-Control: ...immutable
curl -sI https://<project>.pages.dev/novels/<slug>        # không có immutable
curl -sI https://<project>.pages.dev/khong-co             # 200 (SPA)
curl -s  https://<project>.pages.dev/robots.txt
curl -s  https://<project>.pages.dev/sitemap.xml | head
```

Nếu `/novels/<slug>` bị chuyển hướng (Cloudflare tự xử lý "pretty URL"), báo Opus. Hướng sửa dự phòng là ghi `novels/<slug>/index.html` thay cho `novels/<slug>.html`.
