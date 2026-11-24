# Chuyển ảnh chương truyện sang Cloudflare R2

Ngày: 2026-11-23 · Trạng thái: đã duyệt 2026-11-24 (2026-11-24 đã bổ sung sau review: chặn xoá hàng loạt, `_routes.json`, hết quota Functions, checksum SDK, hạn mức R2, `HEAD`, tiến độ upload, rollback)

## Mục đích

Cloudflare Pages (gói Free) cho tối đa **20.000 file mỗi lần deploy** (`PublishService.FILE_LIMIT`). Site đang có khoảng 13.000 file, trong đó khoảng 12.700 là ảnh chữ của 232 chương (`data/novel-render`, 1,6 GB). Trung bình mỗi chương thêm khoảng 55 ảnh, nên còn khoảng 120 chương nữa là Publish sẽ lỗi.

User muốn đưa ảnh chương ra khỏi Pages, cất trong **R2**, để thêm chương không bị giới hạn. Người đọc và Google không được thấy khác biệt gì.

### Hạn mức Free cần nhớ

| Dịch vụ | Hạn mức Free | Hiện tại / ước tính |
|---|---|---|
| R2 lưu trữ | 10 GB | 1,6 GB (còn chỗ cho khoảng 6 lần số chương hiện có) |
| R2 Class A (put, list, delete) | 1 triệu thao tác/tháng | Lần đầu khoảng 12.700, sau đó vài trăm mỗi lần Publish |
| R2 Class B (get, head) | 10 triệu thao tác/tháng | Mỗi lượt xem một ảnh là 1 thao tác |
| Pages Functions | 100.000 request/ngày, tính chung với `/api/reads` | Mỗi ảnh là 1 request; trình duyệt cache 1 năm nên đọc lại không tốn |

**Khi hết 100.000 request Functions trong ngày,** Function trả lỗi nên **ảnh chương không hiện** cho tới khi quota reset. Trang, JSON và ảnh `/media/*` vẫn chạy bình thường. Cách xử lý nếu xảy ra: xem số request trong dashboard (Workers & Pages → project → Metrics). Nếu thường xuyên vượt thì nâng lên Workers Paid (5 USD/tháng) hoặc chuyển sang cách A khi có tên miền riêng. Không làm cảnh báo tự động trong app.

## Hiện trạng (để người làm nắm)

- `NovelExporter.formats()` lấy ảnh của từng chương từ `RenderCache.imagesFor(...)`. Ảnh nằm ở `data/novel-render/<chapterId>/<hash>-<n>.webp`, tên theo hash của nội dung.
- Ảnh được chép sang `<site>/novel-images/<slug>/<file>`, còn URL `/novel-images/<slug>/<file>` được ghi vào JSON của chương. Mỗi lần Publish chép lại toàn bộ 1,6 GB vào `data/publish-tmp`.
- `PublicSiteBundle` ghi `_headers`, trong đó `/novel-images/*` dùng `LONG_CACHE` (immutable). `_redirects` có dòng `/* /index.html 200`. Vì vậy hiện giờ một ảnh không tồn tại vẫn trả **200 kèm HTML, bị cache 1 năm**. Đây là lỗi, cần sửa luôn.
- `ReadCountsFunctions` ghi `functions/` và `wrangler.toml` (gắn D1 `READS`) cạnh thư mục site, **chỉ khi** bật lượt đọc. `wrangler pages deploy` lấy cả hai từ thư mục làm việc.
- Thứ tự hiện tại: export → bundle → pre-render + sitemap → functions → đếm file → `wrangler.deploy` → xoá thư mục tạm.

## Mục tiêu

- Ảnh chương được cất trên R2, không còn nằm trong lần deploy Pages.
- URL ảnh giữ nguyên `/novel-images/<slug>/<file>`. Không phải sửa JSON, frontend, CSP hay trang pre-render.
- Ảnh có thật thì trả `200`, `Content-Type: image/webp`, `Cache-Control: public, max-age=31536000, immutable`. Ảnh không có thì trả **`404`, không cache**.
- Mỗi lần Publish chỉ upload ảnh R2 chưa có. Lần đầu upload hết, những lần sau chỉ up ảnh mới.
- Ảnh trên R2 không còn chương nào dùng thì được xoá sau khi deploy thành công.
- Không chép 1,6 GB ảnh vào `publish-tmp` nữa.

## Không làm

- Không dùng tên miền riêng và không bật địa chỉ công khai `r2.dev`. Ảnh chỉ đi qua Function.
- Không đổi cách render ảnh, số khổ màn hình hay định dạng `webp`.
- Không chuyển ảnh khác (`/media/*`: works, photos, profiles, fanfics) sang R2. Số lượng ảnh này nhỏ.
- Không thêm cache ở edge trong Function (Cache API). Có thể làm sau nếu lượng đọc lớn.
- Không thêm giao diện quản lý R2 trong app.

## Phải tránh (dù chạy được vẫn tính là hỏng)

- Có lúc trang đã deploy trỏ vào ảnh chưa lên R2. **Upload phải xong trước khi deploy Pages.**
- Upload lỗi mà vẫn deploy, hoặc vẫn báo `DONE`.
- Xoá ảnh mà bản đang chạy trên site còn dùng. Chỉ xoá **sau khi** deploy thành công, và chỉ xoá ảnh không thuộc tập vừa publish.
- Lộ khoá R2: không được có trong `toString()`, log, `wrangler.toml` hay thông báo lỗi.
- Ảnh không tồn tại lại trả HTML với `200`, hoặc 404 bị cache `immutable`.
- **Xoá hàng loạt vì lỗi:** tập ảnh vừa publish rỗng hoặc thiếu bất thường (lỗi export, đọc nhầm cache) mà bước dọn vẫn xoá sạch bucket.
- Functions chạy cho mọi request (`_routes.json` bao `/*`), làm trang, JS, CSS cũng ăn quota 100.000/ngày.

## Cách đã cân nhắc

| Cách | Mô tả | Được / mất |
|------|-------|-----------|
| A. Bucket công khai | Bật `r2.dev` hoặc tên miền riêng. URL ảnh đổi sang host khác. | Không tốn request Functions. Nhưng `r2.dev` bị giới hạn tốc độ và Cloudflare không khuyên dùng cho production. Tên miền riêng thì user chưa có. Phải sửa URL trong JSON và CSP `img-src`. |
| **B. Pages Function đọc R2 (đã chọn)** | `functions/novel-images/[[path]].js` gắn binding R2. | URL giữ nguyên, chung host, không sửa CSP. Khớp với hạ tầng Functions + `wrangler.toml` đang có. Mất: mỗi lần tải ảnh tính 1 request Functions (Free: 100k/ngày, đủ cho khoảng 3–10 nghìn lượt đọc chương/ngày). |
| C. Giữ trên Pages, giảm số file | Gộp trang thành ảnh dài hơn, bớt khổ màn hình. | Chỉ lùi giới hạn chứ không bỏ được, và đổi trải nghiệm đọc. |

User chọn **B**.

Về cách upload, đã chọn **API tương thích S3 qua AWS SDK for Java v2 (`software.amazon.awssdk:s3`)**. Lý do: có tài liệu đầy đủ và là thư viện chuẩn. Phương án `wrangler r2 object put` thì upload từng file một và mỗi file một tiến trình, quá chậm với 12.700 file.

## Thiết kế

### Cấu hình mới (`.env`, `.env.example`, `docker-compose.yml`, `SubtitleStudioProperties.Publish`)

| Biến | Mặc định | Ý nghĩa |
|------|----------|---------|
| `SUBTITLESTUDIO_PUBLISH_R2_BUCKET` | trống | Tên bucket. Chỉ nhận `[a-z0-9-]+`. |
| `SUBTITLESTUDIO_PUBLISH_R2_ACCESS_KEY_ID` | trống | Khoá R2 (API token R2, quyền Object Read & Write cho bucket này). |
| `SUBTITLESTUDIO_PUBLISH_R2_SECRET_ACCESS_KEY` | trống | Bí mật đi kèm. **Không bao giờ in ra.** |

- `r2Enabled()` = `configured()` và cả 3 biến R2 đều có giá trị.
- Endpoint là `https://<CLOUDFLARE_ACCOUNT_ID>.r2.cloudflarestorage.com`, region `auto`, dùng path-style.
- AWS SDK v2 từ bản 2.30 mặc định tự gửi checksum (CRC32), R2 từng lỗi với chuyện này. Đặt `requestChecksumCalculation(WHEN_REQUIRED)` và `responseChecksumValidation(WHEN_REQUIRED)` khi dựng `S3Client`.
- `toString()` của `Publish` không được in secret. Access key ID cũng nên ẩn.

### Hai chế độ

- **R2 bật:** chạy theo luồng mới bên dưới.
- **R2 tắt** (chưa cấu hình, hoặc chạy test/dev): **giữ nguyên hành vi cũ**, tức chép ảnh vào Pages. Riêng lỗi "ảnh không tồn tại trả HTML 200" vẫn phải được sửa ở cả chế độ này, xem mục _headers và _redirects.

### Luồng Publish khi R2 bật

1. Export như cũ, nhưng `NovelExporter` **không chép** ảnh vào site. Nó chỉ ghi URL vào JSON như trước, và gom danh sách `(key, đường dẫn file local)` cho mọi ảnh của các chương được publish. Key là `novel-images/<slug>/<file>`, đúng với đường dẫn URL bỏ dấu `/` đầu.
2. Bundle, pre-render, sitemap như cũ.
3. **Đồng bộ lên R2 (trước khi deploy):**
   - List mọi key dưới prefix `novel-images/` (ListObjectsV2, có phân trang).
   - Upload các key chưa có, kèm `Content-Type: image/webp`. Upload song song có giới hạn (gợi ý 8 luồng). Vì tên file là hash nên key đã có thì coi như đúng nội dung, không so sánh lại.
   - Có file upload lỗi thì Publish `FAILED` với thông báo dễ hiểu (ví dụ "Could not upload chapter images to R2."), và **không deploy**.
4. Ghi Functions + `wrangler.toml` (xem dưới), đếm file, kiểm `FILE_LIMIT`, rồi `wrangler.deploy` như cũ.
5. **Sau khi deploy thành công:** xoá các key dưới `novel-images/` mà không có trong tập vừa publish (DeleteObjects, tối đa 1000 key mỗi lần). Xoá lỗi thì chỉ `log.warn`, Publish vẫn `DONE`, lần Publish sau sẽ dọn tiếp.
   - **Chặn xoá hàng loạt:** không xoá gì và `log.warn` (ghi số key, không cần chi tiết) khi tập vừa publish **rỗng**, hoặc khi số key sắp xoá **lớn hơn 50%** số key đang có dưới `novel-images/`. Lần Publish sau, nếu tập ảnh bình thường trở lại, sẽ dọn như thường. Nếu user thật sự gỡ nhiều truyện cùng lúc thì ảnh thừa chỉ nằm lại trên R2, không hại gì.
6. Trạng thái Publish hiển thị số file deploy lên Pages như cũ.
7. **Tiến độ:** lần đầu phải upload khoảng 12.700 ảnh (1,6 GB), có thể mất vài chục phút. Trong lúc `PUBLISHING`, trạng thái có thêm dòng tiến độ: `Uploading chapter images x/y` khi đang upload lên R2 (cập nhật ít nhất mỗi 100 ảnh). Các bước khác có thể để trống. Nút Publish hiện dòng này dưới chữ "Publishing…". Xong thì dòng tiến độ về `null`.

### Pages Function cho ảnh

- File tài nguyên mới: `src/main/resources/public-functions/novel-images.js`, được chép thành `functions/novel-images/[[path]].js`.
- Xử lý `GET` và `HEAD`:
  - Ghép key `novel-images/` + `params.path.join("/")`. Từ chối path có `..` hoặc rỗng bằng 404.
  - `GET` dùng `env.NOVEL_IMAGES.get(key)`, `HEAD` dùng `env.NOVEL_IMAGES.head(key)` (không tải nội dung ảnh). Không có thì trả `404`, `Cache-Control: no-store`.
  - Có thì trả body kèm `Content-Type` (lấy từ `httpMetadata`, mặc định `image/webp`), `ETag`, `Cache-Control: public, max-age=31536000, immutable` và `X-Content-Type-Options: nosniff`.
  - Nên hỗ trợ `If-None-Match` để trả `304`, không bắt buộc.
  - Lưu ý: `_headers` không áp dụng cho response của Function, nên Function tự đặt header.

### `wrangler.toml` và Functions dùng chung

Hiện `ReadCountsFunctions` chỉ ghi khi bật lượt đọc. Cần gộp lại để một lần ghi gồm:

- `[[d1_databases]]` + `functions/api/reads/*` khi lượt đọc bật.
- `[[r2_buckets]]` với `binding = "NOVEL_IMAGES"`, `bucket_name = "<bucket>"` + `functions/novel-images/[[path]].js` khi R2 bật.
- Không bật cái nào thì không ghi gì, như hiện tại.

Tên bucket phải qua cùng kiểu kiểm tra an toàn như các giá trị khác trong TOML. Có thể đổi tên class (ví dụ `PagesFunctions`), người làm tự quyết.

**`_routes.json`:** để Functions chỉ chạy cho đúng hai đường dẫn, app tự ghi `<site>/_routes.json` mỗi khi có ghi Functions, thay vì phụ thuộc vào file wrangler tự sinh:

```json
{ "version": 1, "include": ["/novel-images/*", "/api/reads/*"], "exclude": [] }
```

`include` chỉ chứa đường dẫn của những Function đang bật. Không có Function nào thì không ghi file này.

### `_headers` và `_redirects`

- **R2 bật:** bỏ khối `/novel-images/*` khỏi `_headers`, vì Function tự đặt header.
- **R2 tắt:** ảnh không tồn tại dưới `/novel-images/*` không được rơi vào SPA. Thêm vào `_redirects`, trước dòng `/* /index.html 200`, một luật trả 404 cho `/novel-images/*`, để file có thật vẫn được phục vụ còn file không có thì 404. Chưa chắc Pages áp `_redirects` trước hay sau file tĩnh có thật: nếu áp trước thì luật này chặn cả ảnh thật. Người làm đọc tài liệu Cloudflare Pages; nếu tài liệu không nói rõ thì **không thêm luật**, ghi lý do trong PR, và chỉ sửa ở chế độ R2. Nếu thêm thì sau deploy phải `curl` một ảnh có thật (200) và một ảnh không có (404).

### Xử lý lỗi và thời gian

- Lần đầu phải upload khoảng 1,6 GB. Upload không được tính vào `timeout` của wrangler. Nếu cần giới hạn thì dùng timeout riêng cho bước R2, ví dụ mỗi request vài phút.
- Tiến trình bị tắt giữa chừng (app restart) thì lần sau List lại rồi upload phần còn thiếu, không cần ghi trạng thái gì thêm.

## Kiểm thử

- **Unit:** cấu hình (`r2Enabled`, `toString` không lộ secret), nội dung `wrangler.toml` theo 4 tổ hợp lượt đọc và R2, kiểm tra tên bucket không hợp lệ, `_headers` và `_redirects` theo từng chế độ.
- **`NovelExporter`:** khi R2 bật thì không có file nào dưới `<site>/novel-images/` và trả đúng danh sách key. Khi R2 tắt thì hành vi như cũ.
- **Đồng bộ R2:** test với client S3 giả hoặc mock:
  - chỉ upload key còn thiếu;
  - upload lỗi thì không deploy và báo `FAILED`;
  - chỉ xoá sau khi deploy thành công;
  - deploy lỗi thì không xoá gì;
  - xoá lỗi thì vẫn `DONE`;
  - tập publish rỗng, hoặc sắp xoá hơn 50% số key, thì không xoá gì;
  - tiến độ `Uploading chapter images x/y` có trong trạng thái khi đang upload và về `null` khi xong.
- **`_routes.json`:** chỉ chứa đường dẫn của Function đang bật (4 tổ hợp lượt đọc × R2).
- **Function:** test JS nhỏ nếu repo có sẵn cách chạy, còn không thì kiểm thủ công sau deploy.
- **Sau deploy, user hoặc Sonnet kiểm tra:**
  ```
  curl -sI https://<project>.pages.dev/novel-images/<slug>/<file>.webp   # 200, image/webp, immutable
  curl -sI https://<project>.pages.dev/novel-images/<slug>/khong-co.webp # 404, không immutable
  curl -sI https://<project>.pages.dev/novels/<slug>/1                   # 200 như cũ
  curl -sI https://<project>.pages.dev/sitemap.xml                       # 200, application/xml (không đi qua Function)
  ```
  Dashboard → Workers & Pages → project → Functions: sau khi mở vài trang không phải chương truyện, số request Functions không tăng.
  Mở thử một chương trên điện thoại và máy tính: ảnh hiện đủ. Trạng thái Publish báo số file Pages còn vài trăm.

## Việc user tự làm trên Cloudflare (ghi vào README/PROGRESS)

1. Dashboard → R2 → bật R2 (khai báo thẻ; trong hạn mức free thì không mất phí).
2. Tạo bucket, ví dụ `subtitle-studio-novel-images`, location tự động.
3. R2 → Manage API tokens → tạo token **Object Read & Write**, chỉ cho bucket này. Chép Access Key ID và Secret vào `.env`.
4. API token dùng cho wrangler (`CLOUDFLARE_API_TOKEN`) có thể cần thêm quyền đọc R2 để `wrangler pages deploy` gắn binding. Nếu deploy báo thiếu quyền thì thêm quyền R2 cho token đó.
5. Restart app và bấm Publish. Lần đầu sẽ lâu do phải upload khoảng 12.700 ảnh.
6. **Lưu ý rollback:** nếu quay về một bản deploy cũ trong dashboard Pages, ảnh mà chỉ bản cũ dùng có thể đã bị xoá khỏi R2. Muốn quay lại an toàn thì sửa trong app rồi Publish lại.
7. Theo dõi số request Functions/ngày ở dashboard (mục Hạn mức Free ở đầu spec).

## Để người làm tự quyết

- Tên class, cách chia giữa `NovelExporter` và lớp đồng bộ R2 mới.
- Số luồng upload, kích thước trang khi List.
- Cách test Function.
