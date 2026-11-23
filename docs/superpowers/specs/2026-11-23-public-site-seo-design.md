# Đưa trang public lên Google (Đợt 2)

Ngày: 2026-11-23 · Trạng thái: chờ duyệt · Làm sau khi Đợt 1 ([2026-11-23-novels-navigation-export-design.md](2026-11-23-novels-navigation-export-design.md)) đã merge

## Mục đích

User muốn người khác tìm thấy trang public (vietsub, truyện dịch, sáng tác, profile) qua Google. Hiện site đang **chặn Google hoàn toàn**:

- `SUBTITLESTUDIO_PUBLISH_INDEXABLE=false`, nên `robots.txt` là `Disallow: /`.
- Trang có thẻ `<meta name="robots" content="noindex, nofollow">` và header `X-Robots-Tag: noindex`.

Chỉ bật cờ thôi thì chưa đủ, vì site là SPA chỉ có một file `index.html`:

- Mọi URL trả về cùng một tiêu đề "Subtitle Studio" và cùng một mô tả chỉ nói về vietsub.
- Không có `sitemap.xml`.
- Link chia sẻ lên mạng xã hội không có ảnh hay tên truyện.

## Hiện trạng (để người làm nắm)

- Lúc Publish: `SiteExporter` ghi JSON vào `data/`; `NovelExporter` ghi chương dưới dạng ảnh vào `novels/`; `PublicSiteBundle` chép bản build public (`public.html` → `index.html`) và ghi `_redirects` (`/* /index.html 200`), `_headers`, `robots.txt`. Sau đó `wrangler` deploy lên Cloudflare Pages.
- Các route public: `/` (chuyển về `/vietsub/list`), `/vietsub/list`, `/vietsub/:id`, `/profiles`, `/photos`, `/works`, `/works/:id`, `/novels` (`?tab=`), `/novels/shelf`, `/novels/:slug`, `/novels/:slug/:chapterNo`.
- Ở phía trình duyệt đã có hàm đặt `document.title` (`publicNames.ts`), nhưng chỉ có tác dụng sau khi JS chạy xong.
- Chữ của chương được vẽ thành ảnh để chống copy, nên Google không đọc được nội dung chương. **Giữ nguyên như vậy.**
- `_headers` đang để `/novels/*` cache `immutable` 1 năm (cho ảnh chương).

## Mục tiêu / Không làm / Không được xảy ra

- **Mục tiêu:**
  - Mỗi URL công khai có tiêu đề, mô tả, canonical và ảnh chia sẻ (Open Graph) riêng, có sẵn ngay trong HTML mà không cần chạy JS.
  - Có `sitemap.xml`; `robots.txt` cho phép crawl và trỏ tới sitemap.
  - Xác minh được site với Google Search Console.
- **Không làm:**
  - SSR hay đổi framework.
  - Đưa chữ chương thành text (vẫn để là ảnh).
  - Dữ liệu cấu trúc phức tạp (schema Book/VideoObject), hreflang, quảng cáo, analytics.
- **Không được xảy ra:**
  - Trang HTML bị cache `immutable` (sửa truyện xong Google và khách vẫn thấy bản cũ).
  - Lộ trang hoặc API admin.
  - Index `/novels/shelf` (tủ sách là dữ liệu riêng trong trình duyệt).
  - Vượt giới hạn 20.000 file của Cloudflare Pages Free.
  - Token Cloudflare lọt vào bất kỳ file nào.

## Các cách đã cân nhắc

1. **Dựng sẵn HTML cho từng URL lúc Publish (đã chọn).** Java viết thêm một file HTML cho mỗi route, chép từ `index.html` rồi thay phần `<head>` (title, description, canonical, OG) và chèn nội dung tĩnh tối thiểu vào `#root`. React mount lên thì thay nội dung đó như bình thường.
   - Ưu: Google và mạng xã hội đọc được ngay, không tốn lượt chạy Functions, hợp với luồng Publish sẵn có.
   - Nhược: thêm khoảng 1 file cho mỗi chương.
2. **Chỉ đặt meta bằng JS.** Google có render JS nhưng chậm hơn và kém ổn định; Facebook/Zalo không chạy JS nên link chia sẻ không có ảnh.
3. **Pages Function + `HTMLRewriter` chèn meta cho từng request.** Không thêm file, nhưng mỗi lượt xem tốn một lượt Function (gói Free có 100k/ngày) và thêm một chỗ có thể hỏng ngay lúc khách đang xem.

## Thiết kế

### Cấu hình

| Biến môi trường | Mặc định | Ý nghĩa |
|---|---|---|
| `SUBTITLESTUDIO_PUBLISH_INDEXABLE` | `false` | Đã có. User tự bật `true` khi muốn lên Google. Phần dựng HTML cho từng trang và sitemap **luôn chạy**, cờ này chỉ quyết định `noindex` và `robots.txt`. |
| `SUBTITLESTUDIO_PUBLISH_SITE_URL` | `https://{project}.pages.dev` | Mới. Gốc URL dùng cho canonical, `og:url` và sitemap. Dùng tên miền riêng thì điền vào đây. Bỏ dấu `/` ở cuối. |
| `SUBTITLESTUDIO_PUBLISH_GOOGLE_VERIFICATION` | trống | Mới. Mã `google-site-verification`. Có giá trị thì chèn `<meta name="google-site-verification" …>` vào mọi trang. |

Cập nhật `.env.example`, `docker-compose.yml`, `application.yml` và `SubtitleStudioProperties.Publish` (`toString()` không in mã xác minh).

### HTML cho từng trang (`PublicPageRenderer`, gói `publish`)

Mỗi trang có một file `<đường dẫn>.html` trong thư mục site. Ví dụ `novels/be-my-sugar.html` và `novels/be-my-sugar/3.html`. Cloudflare Pages phục vụ `/novels/be-my-sugar` từ `novels/be-my-sugar.html` mà không chuyển hướng. File tĩnh được ưu tiên hơn luật SPA `/* /index.html 200`. **Người làm phải kiểm tra lại cả hai điều này bằng một lần deploy thử** (xem phần Kiểm tra).

| Route | `<title>` | Description | `og:image` |
|---|---|---|---|
| `/vietsub/list` | `Vietsub · {Tên site}` | Mô tả chung phần vietsub | logo |
| `/vietsub/:id` | `{Tên video} · Vietsub · {Tên site}` | Mô tả video (cắt 160 ký tự), nếu không có thì câu mặc định | thumbnail YouTube |
| `/profiles`, `/photos`, `/works` | `{Tên mục} · {Tên site}` | Mô tả mặc định của mục | logo / ảnh banner |
| `/works/:id` | `{Tên work} · {Tên site}` | Mô tả work | ảnh bìa |
| `/novels` | `Truyện · {Tên site}` | "Truyện dịch và sáng tác…" | logo |
| `/novels/:slug` | `{Tên truyện} · {Tên site}` | Tóm tắt truyện (cắt 160 ký tự) | ảnh bìa |
| `/novels/:slug/:chapterNo` | `{Tên chương} · {Tên truyện} · {Tên site}` | "Đọc {Tên chương} của {Tên truyện}…" | ảnh bìa truyện |

- **Thẻ trong `<head>`:**
  - `<title>`, `meta description`, `link rel=canonical` (URL đầy đủ, không có query);
  - `og:title`, `og:description`, `og:url`, `og:image`, `og:type` (`website`; trang truyện dùng `book`; trang video dùng `video.other`), `og:site_name`, `twitter:card=summary_large_image`;
  - meta xác minh Google nếu có cấu hình.
- **Nội dung tĩnh trong `#root`:** chỉ là HTML ngữ nghĩa đơn giản, không cần CSS riêng, React sẽ thay khi mount.
  - Có: `<h1>`, đoạn mô tả, và danh sách link liên quan. Trang truyện liệt kê link các chương đã publish; trang danh sách liệt kê link các mục con.
  - Mục đích là để Google lần theo link được ngay cả khi không chạy JS.
  - Không chèn chữ chương.
- **Escape:** mọi giá trị đưa vào HTML hoặc thuộc tính đều phải escape (tên truyện có thể chứa `<`, `"`, `&`).
- **Nguồn dữ liệu:** dùng đúng dữ liệu mà `SiteExporter`/`NovelExporter` vừa xuất, cùng allowlist. Chỉ có truyện, chương, video, work **đã public** mới có trang.
- **`index.html` gốc:** sửa lại description mặc định trong `public.html` để nói cả vietsub lẫn truyện. Khi chạy client, `publicNames.ts` vẫn đặt `document.title` như cũ.
- **Không tạo trang** cho `/novels/shelf` và 404.

### `_redirects`, `_headers`, `robots.txt`, sitemap

- **`_redirects`:** thêm `/ /vietsub/list 301` lên trước luật SPA, để Google không thấy `/` là một trang trùng.
- **`_headers`:**
  - Long cache của `/novels/*` hiện đang áp lên cả file HTML. Phải đổi để **chỉ ảnh chương** được `immutable`. Ví dụ: chuyển ảnh chương sang thư mục con có tiền tố riêng (`/novels/<slug>/img/…`), hoặc dùng luật theo đuôi file nếu Cloudflare hỗ trợ. Người làm chọn cách nào cũng được, miễn kiểm chứng được.
  - Các file `.html` dùng `Cache-Control: no-cache`.
  - Khi `indexable=true`, đường dẫn `/novels/shelf` vẫn có `X-Robots-Tag: noindex`.
- **`robots.txt` khi `indexable=true`:**
  ```
  User-agent: *
  Allow: /
  Disallow: /novels/shelf
  Disallow: /data/
  Sitemap: {SITE_URL}/sitemap.xml
  ```
  Khi `false` thì giữ nguyên như hiện tại.
- **`sitemap.xml`:**
  - Liệt kê mọi URL có trang HTML riêng (gồm cả chương). Có `<lastmod>` nếu biết ngày cập nhật.
  - Nếu quá 50.000 URL thì tách thành sitemap index. Thực tế còn xa con số này, nhưng hàm ghi phải xử lý được.
  - Sitemap luôn được ghi; nó vô hại khi `robots.txt` đang chặn.

### Đếm file

`PublishStatus.fileCount` phải đếm cả file HTML mới và `sitemap.xml`. Cảnh báo ở 16.000 và chặn ở trên 20.000 như cũ. Ước tính: hiện khoảng 62 file mỗi chương, thêm 1 file HTML mỗi chương, gần như không đổi giới hạn thực tế. Cập nhật ước tính trong `CLAUDE.md`.

### Việc user tự làm (ghi vào README, mục Publish)

1. Đặt `SUBTITLESTUDIO_PUBLISH_INDEXABLE=true` (và `SITE_URL` nếu dùng tên miền riêng), rồi Publish.
2. Vào Google Search Console → Add property → URL prefix → chọn cách xác minh bằng thẻ HTML. Chép mã vào `SUBTITLESTUDIO_PUBLISH_GOOGLE_VERIFICATION`, Publish lại, rồi bấm Verify.
3. Gửi `sitemap.xml` trong Search Console.

## Rủi ro bản quyền (user đã được báo và vẫn muốn làm)

Lên Google thì tác giả và nhà xuất bản dễ tìm thấy hơn. Họ có thể gửi DMCA cho Google (gỡ khỏi kết quả tìm kiếm) hoặc cho Cloudflare (có thể bị gỡ cả site). Đợt này không xử lý pháp lý, chỉ:

- giữ câu ghi nhận quyền sở hữu ở footer (đã sửa ở Đợt 1);
- giữ việc vẽ chương thành ảnh;
- không thêm dòng liên hệ gỡ bài (user đã quyết định).

## Quyết định của user (2026-11-23)

1. **Tên site** trong `<title>` và `og:site_name`: **byZenQN**. Đặt `{Tên site}` = `byZenQN` bằng một hằng số trong code, không cần biến môi trường. Thẻ `<title>` mặc định trong `public.html` cũng đổi thành `byZenQN`.
2. **Tên miền:** giữ `*.pages.dev`, tức là dùng giá trị mặc định của `SITE_URL`.
3. **Chương có vào sitemap:** **có**.
4. **Dòng "Liên hệ gỡ bài" ở footer:** **không** thêm.

## Để người làm tự quyết

- Cách tách ảnh chương khỏi luật cache HTML (xem `_headers` ở trên).
- Template nội dung tĩnh, độ dài mô tả mặc định từng mục, cấu trúc class Java.

## Kiểm tra

- **JUnit:**
  - `PublicPageRenderer`: đủ thẻ, escape đúng, chỉ có mục đã public, không có chữ chương;
  - sitemap (gồm cả trường hợp tách index);
  - `robots.txt` và `_headers` theo từng giá trị của `indexable`;
  - `_redirects` có `/` 301;
  - `fileCount` đếm thêm file mới;
  - `toString()` không lộ mã xác minh.
- **Deploy thử** (user chạy Publish một lần, Sonnet kiểm bằng `curl -I`/`curl`):
  - `/novels/<slug>` trả 200 với HTML riêng, không chuyển hướng;
  - một route lạ vẫn rơi về SPA;
  - ảnh chương vẫn `immutable`, HTML là `no-cache`;
  - `/robots.txt` và `/sitemap.xml` đúng.
- Kiểm thêm bằng công cụ "URL Inspection" trong Search Console sau khi bật.
