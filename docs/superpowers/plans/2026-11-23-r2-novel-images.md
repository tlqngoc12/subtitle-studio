# R2 cho ảnh chương truyện – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ảnh chương (`/novel-images/*`) lưu trên Cloudflare R2 và được phục vụ qua một Pages Function, để lần deploy Pages không còn chứa khoảng 12.700 ảnh.

**Architecture:** `NovelExporter` trả về danh sách ảnh (`ChapterImage`). Khi R2 bật, nó không chép ảnh vào site. `R2ImageSync` (dùng `R2ImageStore`, bản thật bằng AWS SDK v2 S3) upload ảnh còn thiếu **trước** `wrangler.deploy`, rồi dọn ảnh thừa **sau** khi deploy thành công. `PagesFunctions` (đổi tên từ `ReadCountsFunctions`) ghi `wrangler.toml` với D1 và/hoặc R2, cùng Function `functions/novel-images/[[path]].js`.

**Tech Stack:** Java 21 / Spring Boot 3.5, AWS SDK for Java v2 (`s3`), Cloudflare Pages Functions (JS), JUnit 5 + AssertJ.

**Spec:** `docs/superpowers/specs/2026-11-23-r2-novel-images-design.md`

## Global Constraints

- Nhánh: `feat/r2-novel-images` tạo từ `main` mới nhất. Commit message, tiêu đề PR và mô tả PR viết bằng tiếng Anh.
- Biến môi trường mới: `SUBTITLESTUDIO_PUBLISH_R2_BUCKET`, `SUBTITLESTUDIO_PUBLISH_R2_ACCESS_KEY_ID`, `SUBTITLESTUDIO_PUBLISH_R2_SECRET_ACCESS_KEY`. Cả 3 mặc định trống.
- Tên bucket phải khớp `[a-z0-9-]+`. Khoá R2 không bao giờ xuất hiện trong `toString()`, log, `wrangler.toml` hay thông báo lỗi.
- Key R2 = `novel-images/<slug>/<file>`, tức URL bỏ dấu `/` đầu. Binding trong Function tên `NOVEL_IMAGES`.
- Header cho ảnh có thật: `Content-Type: image/webp` (hoặc theo metadata), `Cache-Control: public, max-age=31536000, immutable`, `X-Content-Type-Options: nosniff`. Ảnh không có: `404` + `Cache-Control: no-store`.
- Endpoint S3: `https://<accountId>.r2.cloudflarestorage.com`, region `auto`, path-style. Đặt `requestChecksumCalculation(WHEN_REQUIRED)` và `responseChecksumValidation(WHEN_REQUIRED)`, vì SDK ≥ 2.30 mặc định gửi checksum mà R2 chưa hỗ trợ đủ.
- Upload lỗi → Publish `FAILED` với thông báo `Could not upload chapter images to R2.`, **không deploy**. Dọn ảnh lỗi → `log.warn`, Publish vẫn `DONE`.
- R2 tắt → hành vi Publish giống hệt hiện tại, trừ phần sửa `_redirects` ở Task 4.
- Test chạy bằng `mvn test -Dskip.npm` (backend). Không chạy benchmark.

## Review Focus

1. **Thứ tự upload → deploy → dọn:** deploy lỗi thì không xoá gì trên R2; upload lỗi thì wrangler không được gọi. Test nằm ở Task 3 và Task 5.
2. **Upload một phần rồi app restart:** lần sau phải List lại và chỉ up phần còn thiếu. Test "chỉ upload key còn thiếu" ở Task 3 đã phủ trường hợp này.
3. **Path xấu trong Function** (`..`, rỗng, `%2e%2e`): phải trả 404, không đọc key ngoài prefix. Task 2 có kiểm tra bằng tay sau deploy.
4. **Hai chương dùng chung một file ảnh, hoặc cùng key xuất hiện 2 lần:** upload một lần, không xoá nhầm. Test bỏ trùng ở Task 3.
5. **Danh sách trên R2 hơn 1000 key** (phân trang ListObjectsV2) và xoá hơn 1000 key (DeleteObjects chia lô 1000). Test ở Task 3 với store giả trả nhiều trang.
6. **Chặn xoá hàng loạt:** tập giữ lại rỗng, hoặc sắp xoá > 50% số key đang có → không xoá gì. Test ở Task 3.
7. **`_routes.json`** chỉ chứa đường dẫn của Function đang bật, để trang/JS/CSS không ăn quota Functions. Test ở Task 2.

---

### Task 1: Cấu hình R2 + thư viện

**Files:**
- Modify: `pom.xml` (thêm `software.amazon.awssdk:bom` vào `dependencyManagement`, bản 2.x mới nhất trên Maven Central; thêm dependency `software.amazon.awssdk:s3`, exclude `netty-nio-client`, thêm `apache-client`)
- Modify: `src/main/java/com/subtitlestudio/config/SubtitleStudioProperties.java` (record `Publish`)
- Modify: `src/main/resources/application.yml` (khối `publish:`)
- Test: `src/test/java/com/subtitlestudio/config/SubtitleStudioPropertiesTest.java` (tạo mới nếu chưa có, hoặc thêm vào test đang có của `Publish`)

**Interfaces:**
- Produces: `Publish` có thêm 3 thành phần cuối `r2Bucket`, `r2AccessKeyId`, `r2SecretAccessKey`; `boolean r2Enabled()`. Các constructor tiện dụng đang có giữ nguyên chữ ký và truyền `""` cho 3 trường mới. Thêm một constructor tiện dụng cho test: `Publish(token, accountId, project, indexable, wranglerPath, timeout, d1Id, r2Bucket, r2AccessKeyId, r2SecretAccessKey)` (siteUrl và googleVerification = `""`).

- [ ] **Step 1: Viết test lỗi**

```java
@Test void r2EnabledNeedsPublishConfiguredAndAllThreeValues() {
    assertThat(publish("tok","acc","proj","b","k","s").r2Enabled()).isTrue();
    assertThat(publish("tok","acc","proj","","k","s").r2Enabled()).isFalse();
    assertThat(publish("tok","acc","proj","b","","s").r2Enabled()).isFalse();
    assertThat(publish("tok","acc","proj","b","k","").r2Enabled()).isFalse();
    assertThat(publish("","acc","proj","b","k","s").r2Enabled()).isFalse();
}
@Test void toStringHidesR2Keys() {
    String s = publish("tok","acc","proj","bucket","AKID123","SECRET456").toString();
    assertThat(s).doesNotContain("AKID123").doesNotContain("SECRET456").doesNotContain("tok").contains("r2=true");
}
```
(`publish(...)` là helper trong test, gọi constructor tiện dụng mới.)

- [ ] **Step 2: Chạy test và xác nhận lỗi biên dịch / FAIL**

Run: `mvn test -Dskip.npm -Dtest=SubtitleStudioPropertiesTest`

- [ ] **Step 3: Cài đặt**
  - Thêm 3 thành phần vào record, thêm `r2Enabled()` = `configured()` và 3 giá trị đều không trống.
  - `toString()` thêm `", r2=" + r2Enabled()`.
  - `application.yml` thêm `r2-bucket: ${SUBTITLESTUDIO_PUBLISH_R2_BUCKET:}`, `r2-access-key-id: ${SUBTITLESTUDIO_PUBLISH_R2_ACCESS_KEY_ID:}` và `r2-secret-access-key: ${SUBTITLESTUDIO_PUBLISH_R2_SECRET_ACCESS_KEY:}`, kèm comment một dòng.
  - Thêm SDK vào `pom.xml`.

- [ ] **Step 4: Chạy toàn bộ test backend, xác nhận PASS** (22 chỗ đang gọi constructor `Publish` vẫn biên dịch được)

Run: `mvn test -Dskip.npm`

- [ ] **Step 5: Commit** — `feat: add R2 settings for chapter images`

---

### Task 2: `PagesFunctions` — wrangler.toml + Function ảnh

**Files:**
- Rename: `src/main/java/com/subtitlestudio/publish/ReadCountsFunctions.java` → `PagesFunctions.java` (cập nhật chỗ inject trong `PublishService` và test)
- Create: `src/main/resources/public-functions/novel-images.js`
- Rename test: `ReadCountsFunctionsTest.java` → `PagesFunctionsTest.java`

**Interfaces:**
- Produces: `PagesFunctions.prepare(Path site)` và `PagesFunctions.clean(Path root)`, chữ ký giữ nguyên.

- [ ] **Step 1: Viết test lỗi** (giữ các test đang có, thêm:)

```java
@Test void r2OnlyWritesBucketBindingAndImageFunction() {
    // settings: configured, d1 trống, r2Bucket="novel-imgs", key/secret có giá trị
    functions.prepare(site);
    assertThat(root.resolve("wrangler.toml")).content()
        .contains("[[r2_buckets]]").contains("binding = \"NOVEL_IMAGES\"").contains("bucket_name = \"novel-imgs\"")
        .doesNotContain("d1_databases").doesNotContain("SECRET");
    assertThat(root.resolve("functions/novel-images/[[path]].js")).content().contains("NOVEL_IMAGES").contains("immutable");
    assertThat(root.resolve("functions/api/reads")).doesNotExist();
}
@Test void readCountsAndR2BothWritten() { /* toml có cả d1_databases và r2_buckets; có cả 2 bộ function */ }
@Test void neitherWritesNothing() { /* không có wrangler.toml, không có functions/, không có site/_routes.json */ }
@Test void routesJsonListsOnlyEnabledFunctions() {
    // 3 tổ hợp có Function: chỉ reads → include ["/api/reads/*"]; chỉ R2 → ["/novel-images/*"]; cả hai → cả 2.
    // File nằm ở site/_routes.json, version 1, exclude rỗng, không bao giờ có "/*".
}
@Test void refusesUnsafeBucketName() { /* r2Bucket = "x\"\n[evil]" → IllegalStateException */ }
```

- [ ] **Step 2: Chạy test và xác nhận FAIL** — `mvn test -Dskip.npm -Dtest=PagesFunctionsTest`

- [ ] **Step 3: Cài đặt**
  - Ghi `wrangler.toml` khi `readCountsEnabled() || r2Enabled()`. Phần đầu (`name`, `pages_build_output_dir`, `compatibility_date`) dùng chung. Khối `[[d1_databases]]` và `[[r2_buckets]]` thêm theo từng cờ. Bucket đi qua cùng kiểm tra an toàn, regex `[a-z0-9-]+`.
  - `novel-images.js` export `onRequestGet` và `onRequestHead` (hoặc `onRequest` lọc method, method khác trả 405). Key = `"novel-images/" + params.path.join("/")`. Đoạn nào rỗng, là `.` hoặc `..`, hay chứa `\` thì trả 404.
  - Ghi `site/_routes.json` (`{"version":1,"include":[…],"exclude":[]}`) với `include` chỉ gồm đường dẫn của Function đang bật (`/api/reads/*`, `/novel-images/*`). Không Function nào bật thì không ghi.
  - `GET` dùng `env.NOVEL_IMAGES.get(key)`, `HEAD` dùng `env.NOVEL_IMAGES.head(key)`. Ra null thì trả 404 + `Cache-Control: no-store`. Có thì trả các header như trong Global Constraints, thêm `ETag: object.httpEtag`. `If-None-Match` khớp thì trả 304. `HEAD` thì không có body.

- [ ] **Step 4: Chạy test, xác nhận PASS**

- [ ] **Step 5: Commit** — `feat: generate R2 binding and chapter image function for Pages`

---

### Task 3: `R2ImageStore` + `R2ImageSync`

**Files:**
- Create: `src/main/java/com/subtitlestudio/publish/ChapterImage.java` — `public record ChapterImage(String key, Path file) {}`
- Create: `src/main/java/com/subtitlestudio/publish/R2ImageStore.java` (interface)
- Create: `src/main/java/com/subtitlestudio/publish/S3R2ImageStore.java` (`@Component`, bản thật)
- Create: `src/main/java/com/subtitlestudio/publish/R2ImageSync.java` (`@Component`)
- Test: `src/test/java/com/subtitlestudio/publish/FakeR2Store.java`, `R2ImageSyncTest.java`
- Lưu ý: test gọi `upload(images, (d, t) -> {})` khi không cần kiểm tiến độ.

**Interfaces:**
- Produces:
  - `interface R2ImageStore { Set<String> listKeys(String prefix); void put(String key, Path file, String contentType); void delete(Collection<String> keys); }`. `listKeys` tự lo phân trang, `delete` tự chia lô 1000. Lỗi thì ném `RuntimeException`.
  - `R2ImageSync.upload(List<ChapterImage> images, BiConsumer<Integer,Integer> progress)`: gọi `progress.accept(done, total)` lúc bắt đầu (0/total, total = số ảnh cần upload) và ít nhất mỗi 100 ảnh, cùng lần cuối (total/total). Ném `PublishFailedException("Could not upload chapter images to R2.")` khi List hoặc một lần put bất kỳ bị lỗi. Trả về `int` là số ảnh đã upload.
  - `R2ImageSync.prune(List<ChapterImage> keep)`: không bao giờ ném lỗi. Trả về `int` là số key đã xoá, hoặc 0 khi lỗi hoặc khi bị chặn. **Chặn:** `keep` rỗng, hoặc số key sắp xoá > 50% số key đang có dưới `PREFIX` → không xoá, `log.warn` (chỉ số lượng).
  - `static final String PREFIX = "novel-images/"`.

- [ ] **Step 1: Viết test lỗi** với `FakeR2Store`. Fake ghi lại các lần put/delete, có thể cài để ném lỗi theo key, và trả `listKeys` theo trang giả (đếm số lần gọi).

```java
@Test void uploadsOnlyMissingKeysOnceEach() {
    store.seed("novel-images/a/1.webp");
    int n = sync.upload(List.of(img("novel-images/a/1.webp"), img("novel-images/a/2.webp"), img("novel-images/a/2.webp")), (d, t) -> {});
    assertThat(n).isEqualTo(1);
    assertThat(store.puts()).containsExactly("novel-images/a/2.webp");
    assertThat(store.contentTypeOf("novel-images/a/2.webp")).isEqualTo("image/webp");
}
@Test void uploadFailureThrowsPublishFailed() {
    store.failPut("novel-images/a/2.webp");
    assertThatThrownBy(() -> sync.upload(List.of(img("novel-images/a/2.webp")), (d, t) -> {}))
        .isInstanceOf(PublishFailedException.class).extracting("userMessage")
        .isEqualTo("Could not upload chapter images to R2.");
}
@Test void prunesKeysNotKeptOnlyUnderPrefix() {
    store.seed("novel-images/a/1.webp", "novel-images/old/9.webp", "other/x.txt");
    assertThat(sync.prune(List.of(img("novel-images/a/1.webp")))).isEqualTo(1);
    assertThat(store.deleted()).containsExactly("novel-images/old/9.webp");
}
@Test void pruneFailureIsSwallowed() { /* seed 4 key, keep 3, store.failDelete() → prune trả 0, không ném */ }
@Test void manyKeysAcrossPages() { /* seed 2500 key (nhiều trang list), keep 2000 → prune xoá đúng 500, chia lô ≤ 1000 */ }
@Test void emptyKeepNeverDeletes() { /* seed 10 key, prune(List.of()) → 0, store.deleted() rỗng */ }
@Test void deletingMoreThanHalfIsRefused() { /* seed 10 key, keep 4 (sắp xoá 6 > 50%) → 0, không xoá gì; keep 5 (xoá 5 = 50%) → xoá 5 */ }
@Test void uploadReportsProgress() { /* 250 ảnh thiếu → progress nhận (0,250) … (250,250), có ít nhất 1 mốc ở giữa */ }
```

- [ ] **Step 2: Chạy test và xác nhận FAIL** — `mvn test -Dskip.npm -Dtest=R2ImageSyncTest`

- [ ] **Step 3: Cài đặt `R2ImageSync`**
  - Bỏ key trùng: dùng `LinkedHashMap` key → file.
  - Upload song song tối đa 8 luồng. Dùng virtual-thread executor + `Semaphore(8)`, hoặc executor 8 luồng, tuỳ người làm.
  - Lỗi được log bằng `log.warn` kèm key, không kèm khoá.

- [ ] **Step 4: Cài đặt `S3R2ImageStore`**
  - Dựng `S3Client` lười, lần đầu dùng mới dựng, và chỉ khi `r2Enabled()`. Credentials lấy từ `r2AccessKeyId`/`r2SecretAccessKey`, endpoint và các tuỳ chọn checksum như Global Constraints, `forcePathStyle(true)`.
  - `listKeys` dùng `listObjectsV2Paginator`. `put` dùng `RequestBody.fromFile`. `delete` dùng `deleteObjects` theo lô 1000.
  - Bản thật không có unit test. Kiểm thật ở Task 6.

- [ ] **Step 5: Chạy test, xác nhận PASS**

- [ ] **Step 6: Commit** — `feat: sync chapter images to R2`

---

### Task 4: Exporter và bundle theo chế độ R2

**Files:**
- Modify: `src/main/java/com/subtitlestudio/publish/NovelExporter.java` (`export`, `formats`)
- Modify: `src/main/java/com/subtitlestudio/publish/SiteExporter.java:104` (`export`)
- Modify: `src/main/java/com/subtitlestudio/publish/PublicSiteBundle.java` (`writeTo`, `headers`, `_redirects`)
- Test: `SiteExporterTest.java`, `PublicSiteBundleTest.java`

**Interfaces:**
- Consumes: `ChapterImage` (Task 3), `Publish.r2Enabled()` (Task 1).
- Produces:
  - `List<ChapterImage> NovelExporter.export(Path dir, Function<Long,String> coverUrl, BiConsumer<Path,Object> write)`.
  - `List<ChapterImage> SiteExporter.export(Path dir, Instant publishedAt)`.
  - `PublicSiteBundle.writeTo(Path dir, boolean indexable, String siteUrl, boolean r2Images)`.

- [ ] **Step 1: Viết test lỗi**

```java
// SiteExporterTest
@Test void r2OnDoesNotCopyChapterImagesButReturnsThem() {
    // novel slug "s", 1 chương published, render ra 2 file; properties với r2 bật
    List<ChapterImage> images = exporter.export(dir, now);
    assertThat(dir.resolve("novel-images")).doesNotExist();
    assertThat(images).extracting(ChapterImage::key).allMatch(k -> k.startsWith("novel-images/s/"));
    assertThat(images).allMatch(i -> Files.exists(i.file()));
    // JSON chương vẫn chứa URL "/novel-images/s/<file>" như cũ
}
@Test void r2OffStillCopiesImages() { /* như hành vi cũ + danh sách trả về khớp các file đã chép */ }

// PublicSiteBundleTest
@Test void r2HeadersLeaveNovelImagesToTheFunction() { /* writeTo(..., true): _headers không chứa "/novel-images/*" */ }
@Test void r2OffMissingImageIs404NotSpa() {
    // writeTo(..., false): trong _redirects, dòng "/novel-images/*" có mã 404 và đứng trước dòng "/* /index.html 200"
}
```

- [ ] **Step 2: Chạy test và xác nhận FAIL** — `mvn test -Dskip.npm -Dtest='SiteExporterTest,PublicSiteBundleTest'`

- [ ] **Step 3: Cài đặt**
  - `formats()` luôn trả URL như cũ và gom `ChapterImage(key, file gốc trong render cache)`. Nó chỉ `Files.copy` khi `!r2Enabled()`.
  - **Trước khi làm luật 404 trong `_redirects` (R2 tắt):** đọc tài liệu Cloudflare Pages về thứ tự áp dụng `_redirects` so với file tĩnh. Nếu luật đó làm ảnh **có thật** cũng trả 404, thì bỏ test `r2OffMissingImageIs404NotSpa`, không thêm luật, và ghi lý do vào mô tả PR, đúng như spec cho phép.

- [ ] **Step 4: Chạy test, xác nhận PASS**

- [ ] **Step 5: Commit** — `feat: keep chapter images out of the Pages bundle when R2 is on`

---

### Task 5: Nối vào `PublishService` + tiến độ

**Files:**
- Modify: `src/main/java/com/subtitlestudio/publish/PublishService.java` (constructor, `run()`, `status()`)
- Modify: `src/main/java/com/subtitlestudio/publish/PublishStatus.java` (thêm thành phần cuối `String progress`, null khi không có)
- Modify: `frontend/src/api/publish.ts` (kiểu `progress?: string | null`), `frontend/src/components/PublishButton.tsx` (hiện `progress` dưới chữ "Publishing…" khi đang publish, chữ nhỏ màu phụ)
- Test: `PublishServiceTest.java` (dùng `FakeWrangler` + `FakeR2Store`), test của `PublishButton` (tạo mới nếu chưa có)

**Interfaces:**
- Consumes: `SiteExporter.export` → `List<ChapterImage>`, `R2ImageSync.upload/prune`, `PublicSiteBundle.writeTo(..., settings.r2Enabled())`, `PagesFunctions`.

- [ ] **Step 1: Viết test lỗi**

```java
@Test void r2UploadsBeforeDeployAndPrunesAfter() { /* thứ tự ghi nhận: put… → deploy → delete; status DONE */ }
@Test void r2UploadFailureSkipsDeploy() { /* status FAILED, error "Could not upload chapter images to R2.", wrangler không được gọi */ }
@Test void deployFailureDoesNotPrune() { /* FakeWrangler ném lỗi → store.deleted() rỗng */ }
@Test void pruneFailureStillDone() { /* store.failDelete() → status DONE */ }
@Test void r2OffNeverTouchesStore() { /* không có list/put/delete nào */ }
@Test void progressShowsWhileUploadingAndClearsAfter() {
    /* FakeR2Store chặn put (latch) → status().progress() = "Uploading chapter images 0/N" hoặc x/N;
       thả latch, chờ DONE → progress() == null */
}
```
```tsx
// PublishButton test: status PUBLISHING + progress "Uploading chapter images 3/10" → thấy chữ đó; DONE → không thấy.
```

- [ ] **Step 2: Chạy test và xác nhận FAIL** — `mvn test -Dskip.npm -Dtest=PublishServiceTest`

- [ ] **Step 3: Cài đặt** thứ tự trong `run()`: export → bundle → pre-render + sitemap → **`if r2: sync.upload(images, progress)`** → `functions.prepare` → đếm file / `FILE_LIMIT` → `wrangler.deploy` → **`if r2: sync.prune(images)`** → `finish("DONE")`. Bước prune nằm trong nhánh thành công, trước `finish`.
  - Tiến độ giữ trong một trường `volatile String progress`: upload đặt `"Uploading chapter images " + done + "/" + total`; sau upload và khi kết thúc (DONE hoặc FAILED) đặt về `null`. `status()` trả kèm trường này.
  - Frontend: nút Publish đang poll status, chỉ cần hiện `progress` khi có.

- [ ] **Step 4: Chạy toàn bộ test backend, xác nhận PASS** — `mvn test -Dskip.npm`. Kết quả phải là `Failures: 0, Errors: 0`.

- [ ] **Step 5: Commit** — `feat: upload chapter images to R2 before deploying and prune after`

---

### Task 6: Cấu hình triển khai, tài liệu, PR

**Files:**
- Modify: `.env.example`, `docker-compose.yml` (thêm 3 biến, mỗi biến một dòng comment giống các biến `PUBLISH_` khác)
- Modify: `README.md` (mục Publish: các bước user tự làm trên Cloudflare, chép từ mục "Việc user tự làm" trong spec, **gồm cả cảnh báo rollback và bảng hạn mức Free / chuyện gì xảy ra khi hết 100.000 request Functions**)
- Modify: `PROGRESS.md` (mục 2026-11-23 mới), đổi trạng thái spec thành "đã duyệt"

- [ ] **Step 1: Thêm biến vào `.env.example` và `docker-compose.yml`**, rồi kiểm cú pháp compose. Run: `docker compose config -q`. Expected: không in ra gì.
- [ ] **Step 2: Cập nhật README, PROGRESS và spec.**
- [ ] **Step 3: Chạy lại toàn bộ test.** Run: `mvn test -Dskip.npm` → `BUILD SUCCESS`. Run: `cd frontend && npm test` → toàn bộ pass (frontend có đổi `PublishButton` ở Task 5).
- [ ] **Step 4: Commit** — `docs: R2 setup for chapter images`
- [ ] **Step 5: Push và tạo PR** `gh pr create --base main`. Mô tả gồm: tóm tắt, test đã chạy và kết quả, link spec và plan, mục "Post-deploy check" chép từ phần Kiểm thử của spec, cùng các bước user phải làm trên Cloudflare trước khi Publish. Gửi link PR cho Opus review, **chưa merge**.
