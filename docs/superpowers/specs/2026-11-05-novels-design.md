# Menu Novels: đăng tiểu thuyết dịch từ ảnh chụp (design spec)

> Ngày: 2026-11-05. Trạng thái: chờ review.
> Nền tảng: `main` sau trang public (`c3f9e31`, xem [PROGRESS.md](../../../PROGRESS.md), [spec Gemini](2026-11-03-gemini-translate-design.md), [spec trang public](2026-11-04-public-site-design.md)).

## 1. Mục tiêu

Thêm menu **Novels** vào app quản trị. Người dùng tạo bộ truyện (gốc **tiếng Thái**), thêm từng chương bằng **ảnh chụp màn hình** các trang, bấm **Translate** để Gemini đọc ảnh và dịch sang tiếng Việt theo hồ sơ prompt `.md` của bộ, sửa lại bản dịch cạnh ảnh gốc, rồi đánh dấu **Published**. Khi bấm **Publish** (nút sẵn có), các chương Published được **vẽ thành ảnh có watermark** và đẩy lên trang public trên Cloudflare Pages cho khách đọc. Trang public **không chứa text chương**, và có thêm các lớp chặn sao chép.

Để dịch các chương sau liền mạch với các chương trước, mỗi bộ có **sổ tay truyện** (nhân vật, xưng hô, thuật ngữ, tóm tắt) **tự cập nhật** sau mỗi chương Published và được gửi kèm khi dịch chương tiếp theo.

**Tiêu chí thành công:**
1. Một bộ khoảng 311 trang gốc dịch được hết qua nhiều lần (có thể rải nhiều ngày vì giới hạn free tier); mỗi chương bấm Translate một lần dù có nhiều ảnh.
2. Tên riêng, xưng hô giữa các nhân vật và thuật ngữ đã chốt giữ nhất quán từ chương đầu đến chương cuối; sổ tay không phình quá giới hạn.
3. Chương Draft không bao giờ xuất hiện trên trang public.
4. Trang public không có text chương ở HTML/JSON/DOM; ảnh có watermark; chặn bôi đen, chuột phải, giữ để lưu ảnh, phím tắt copy/lưu/in, in trang; làm mờ khi cửa sổ mất focus.
5. Chi phí 0 đồng: vẫn là trang tĩnh trên Cloudflare Pages gói Free (≤ 20.000 file/site).
6. Không có `GEMINI_API_KEY` thì vẫn tạo bộ, thêm chương, upload ảnh, nhập bản dịch tay và Publish được; chỉ tắt nút Translate.

**Ngoài phạm vi:** Bulk import cả thư mục ảnh + Gemini đề xuất chia chương (Backlog); OCR riêng không dịch; sửa sổ tay bằng tay; bình luận, đánh dấu đã đọc, chỉnh cỡ chữ cho khách; đăng nhập; watermark khác nhau theo từng lượt xem (cần server, 5 USD/tháng); phát hiện DevTools.

## 2. Quyết định đã chốt với người dùng

| # | Quyết định |
|---|---|
| D1 | Mức bảo vệ **C2**: vẽ sẵn chương thành ảnh lúc Publish (trên máy người dùng), đẩy ảnh tĩnh lên Pages. Không dùng Worker (C1, 5 USD/tháng). |
| D2 | Sau khi dịch: **sửa tay cạnh ảnh gốc**, chương có trạng thái **Draft / Published**; chỉ Published lên public. |
| D3 | Ảnh chụp: **mỗi ảnh là một trang riêng, không trùng nhau**. Ngôn ngữ gốc tiếng Thái, ghi rõ trong hồ sơ `.md`. |
| D4 | Thông tin bộ (8 mục): tên, ảnh bìa, tác giả gốc, giới thiệu, thể loại/tag, trạng thái bộ (Ongoing/Completed), credit người dịch, link bản gốc. **Nhiều bộ.** Giới thiệu là **text thường**, không vẽ thành ảnh. |
| D5 | Ngữ cảnh giữa các chương: **sổ tay truyện** + **toàn văn chương liền trước**. Sổ tay **tự cập nhật, không cần duyệt**, chỉ giữ thông tin quan trọng. |
| D6 | Sổ tay theo **cách lai**: phần cố định (tên, thuật ngữ, xưng hô) chỉ thêm/sửa theo khoá, app tự gộp và không bao giờ tự xoá; phần thay đổi theo truyện (tính cách, quan hệ, tâm lý, tóm tắt, diễn biến gần đây) Gemini viết lại, có giới hạn độ dài. |
| D7 | Upload **theo từng chương** (1 hay nhiều ảnh mỗi lần); upload và dịch là hai bước tách rời. |
| D8 | Bật **làm mờ khi cửa sổ mất focus** trên trang đọc public. |

## 3. Dữ liệu (migration `V5__novels.sql`)

Kiểm tra lại số migration trước khi merge (người dùng hay chạy nhiều phiên song song). Không đặt tên cột trùng từ khoá H2.

**`t_novel`**

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | `${bigint}` PK | sequence |
| `slug` | varchar(60) unique not null | `^[a-z0-9]+(-[a-z0-9]+)*$`, dùng cho URL public |
| `title` | varchar(200) not null | |
| `cover_media_id` | `${bigint}` null | FK `t_media` (dùng lại `MediaService`) |
| `original_author` | varchar(200) null | |
| `description` | clob null | ≤ 5.000 ký tự |
| `tags` | varchar(500) null | danh sách ngăn bằng `,`, mỗi tag ≤ 40 ký tự, tối đa 10 |
| `novel_status` | varchar(20) not null | `ONGOING` / `COMPLETED` |
| `translator_credit` | varchar(200) null | vd "Dịch: @byZenQN" |
| `source_url` | varchar(1000) null | chỉ `http(s)://` |
| `prompt_profile` | varchar(40) null | tên hồ sơ `./data/prompts/<Tên>.md` (theo `PromptProfileStore`); null = không cho Translate |
| `created_at`, `updated_at` | timestamp not null | |

**`t_chapter`**

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | `${bigint}` PK | |
| `novel_id` | FK not null, on delete cascade | |
| `chapter_no` | `${int}` not null | ≥ 1; unique (`novel_id`, `chapter_no`) |
| `title` | varchar(200) null | |
| `translation_status` | varchar(20) not null | `NONE` / `TRANSLATING` / `TRANSLATED` / `FAILED` |
| `translation_error` | varchar(500) null | thông báo ngắn tiếng Anh |
| `translated_at` | timestamp null | |
| `edited_after_translation` | char(1) not null default 'N' | `Y` khi người dùng đã sửa text sau lần dịch gần nhất (để hỏi xác nhận trước khi dịch lại) |
| `publish_status` | varchar(20) not null | `DRAFT` / `PUBLISHED` |
| `published_at` | timestamp null | |
| `created_at`, `updated_at` | timestamp not null | |

**`t_chapter_page`**

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | `${bigint}` PK | |
| `chapter_id` | FK not null, on delete cascade | |
| `position` | `${int}` not null | 1…n, liên tục |
| `media_id` | `${bigint}` not null | FK `t_media`, ảnh chụp gốc |
| `text_vi` | clob null | bản dịch của trang này |

**`t_novel_notebook`**

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | `${bigint}` PK | |
| `novel_id` | FK not null, on delete cascade | |
| `after_chapter_no` | `${int}` not null | sổ tay sau khi chốt chương N; unique (`novel_id`, `after_chapter_no`) |
| `content_json` | clob not null | xem mục 5 |
| `created_at` | timestamp not null | |

Trạng thái cập nhật sổ tay (cột trên `t_novel`): `notebook_status` (`IDLE` / `UPDATING` / `FAILED`), `notebook_error` varchar(500) null, `notebook_pending_chapter_no` `${int}` null.

**Xoá:** xoá bộ thì xoá chương, trang, sổ tay và các ảnh (bìa + ảnh chụp) qua `MediaService`; xoá trang thì xoá ảnh và đánh số lại `position`. Ảnh vẽ cho public (mục 7) là cache, dọn theo mục 7.

## 4. Luồng dịch một chương

**Điều kiện:** bộ có `prompt_profile` hợp lệ (không có → `UNKNOWN_PROFILE`), có `GEMINI_API_KEY` (không có → `GEMINI_NOT_CONFIGURED`), chương có ≥ 1 trang (`CHAPTER_HAS_NO_PAGES`), chương không đang `TRANSLATING` (`TRANSLATION_IN_PROGRESS`). Nếu `edited_after_translation = 'Y'` thì frontend hỏi xác nhận trước khi gọi API.

**Chạy nền** (cùng kiểu với dịch Vietsub: virtual thread trong app, trạng thái trong DB, frontend hỏi lại 3 giây/lần). Đặt `TRANSLATING`, xoá `translation_error`.

**Một lượt gửi Gemini gồm:**
1. **System instruction cố định** (trong code): đọc chữ tiếng Thái trong từng ảnh theo đúng thứ tự trang, dịch sang tiếng Việt văn xuôi tự nhiên; mỗi ảnh đầu vào trả đúng một phần tử `page` tương ứng; giữ ngắt đoạn; không thêm lời bình, không tóm tắt, không bỏ đoạn; bỏ qua chữ giao diện app (thanh trạng thái, nút, số trang) nếu có; quy định trong hồ sơ và sổ tay được ưu tiên về tên riêng và xưng hô.
2. **Hồ sơ `.md`** của bộ (nguyên văn).
3. **Sổ tay** mới nhất có `after_chapter_no < N` (dạng văn bản dựng từ JSON), nếu có.
4. **Toàn văn tiếng Việt chương liền trước** (chương có `chapter_no` lớn nhất < N mà có bản dịch, dù Draft hay Published), nếu có, giới hạn ~20.000 ký tự cuối.
5. **Ảnh các trang** theo `position`, mỗi ảnh kèm nhãn `Page k`. Ảnh được thu nhỏ/nén lại (cạnh dài ≤ 2.000px, JPEG chất lượng ~85) trước khi gửi; `media_resolution` = high.

**Chia lượt:** chương có > `pages-per-request` trang (mặc định **20**) được chia thành nhiều lượt liên tiếp. Lượt sau nhận thêm ~2.000 ký tự cuối bản dịch của lượt trước để nối câu. Tổng request inline > 20 MB thì gửi ảnh qua File API.

**Đầu ra:** structured output, schema `{"pages": [{"page": integer, "text": string}]}`. **Kiểm tra** (sai → `FAILED`, không lưu gì): tập `page` bằng đúng tập trang đã gửi trong lượt; mọi `text` sau `strip()` không rỗng.

**Thử lại:** 503 → chuyển lần lượt sang `fallback-models` (như dịch Vietsub); 429 → không thử lại, `FAILED` với "Gemini quota exceeded. Try again later.". Timeout mỗi lượt theo `subtitle-studio.gemini.timeout`.

**Thành công:** ghi `text_vi` cho mọi trang trong một transaction, `TRANSLATED`, `translated_at`, `edited_after_translation = 'N'`. `publish_status` giữ nguyên (chương Published dịch lại vẫn Published, và sổ tay "sau chương N" được tạo lại như mục 5).

**Thất bại:** `FAILED` + `translation_error`; text cũ (nếu có) giữ nguyên.

**Khởi động lại app:** chương còn `TRANSLATING` → `FAILED` ("Translation was interrupted."); bộ còn `notebook_status = UPDATING` → `FAILED` tương tự.

**Dịch chương N khi N-1 chưa Published:** được phép; sổ tay chỉ lấy từ các chương đã Published (mục 5), text chương trước lấy cả bản Draft.

## 5. Sổ tay truyện

**Nội dung** (`content_json`):

```json
{
  "glossary":   [{"source": "พี่ชาย", "target": "anh trai", "note": "…"}],
  "addressing": [{"from": "Tên A", "to": "Tên B", "rule": "A gọi B là 'anh', xưng 'em'"}],
  "characters": [{"name": "Tên A", "sourceName": "ชื่อ", "profile": "tính cách, quan hệ", "currentState": "trạng thái tâm lý hiện tại"}],
  "storySoFar": "tóm tắt toàn truyện",
  "recentChapters": [{"chapterNo": 9, "summary": "…"}]
}
```

**Khi nào cập nhật:** sau khi chương N chuyển sang Published, hoặc chương đã Published được sửa text/dịch lại rồi lưu. Chạy nền, `notebook_status = UPDATING`. Mỗi bộ chỉ cập nhật tuần tự: nếu đang chạy thì ghi `notebook_pending_chapter_no` và chạy tiếp sau.

**Một lượt cập nhật:** gửi Gemini sổ tay có `after_chapter_no < N` (mới nhất) + toàn văn chương N (bản đã sửa) + hồ sơ `.md`. Gemini trả JSON:
- `glossaryUpserts`, `addressingUpserts`: chỉ mục **mới hoặc cần sửa**, khoá lần lượt là `source` và cặp (`from`, `to`).
- `characters`: danh sách nhân vật **viết lại** (tối đa 30; mỗi `profile` / `currentState` ≤ 300 ký tự). Nhân vật cũ không có trong danh sách mới vẫn được app giữ lại với dữ liệu cũ (không mất nhân vật).
- `storySoFar`: **viết lại**, ≤ 2.500 ký tự (~400 chữ), nén dần các chương cũ.
- `chapterSummary`: tóm tắt chương N, ≤ 800 ký tự.

**`NotebookMerger` (app gộp, không gọi mạng):**
- `glossary` / `addressing`: upsert theo khoá; **không bao giờ xoá** mục cũ.
- `characters`: thay theo `name`; giữ nhân vật cũ không được nhắc lại; quá 30 nhân vật thì giữ 30 nhân vật được cập nhật gần nhất (nhân vật bị bỏ khỏi danh sách nhưng vẫn còn trong `glossary` nên tên dịch không mất).
- `recentChapters`: thêm `chapterSummary` của N, giữ **3 chương gần nhất** theo `chapterNo`.
- Kiểm tra giới hạn từng trường; vượt giới hạn hoặc JSON sai schema → **không lưu**, `notebook_status = FAILED` + `notebook_error`. Chương vẫn Published.
- Lưu thành dòng mới `after_chapter_no = N` (đã có thì ghi đè). Các dòng có `after_chapter_no > N` **không** được tạo lại tự động; tab Notebook cảnh báo "Notebook versions after chapter N were built from an older text." khi có dòng như vậy.

**Unpublish** chương N: không xoá sổ tay "sau chương N" (lần Publish sau sẽ ghi đè).

**Tổng kích thước** sổ tay dựng thành văn bản để gửi Gemini: giới hạn cứng 12.000 ký tự; quá thì cắt bớt `characters` có `currentState` cũ nhất khỏi phần gửi đi (dữ liệu trong DB không đổi).

**Xem trên web:** tab Notebook, chỉ đọc, chọn phiên bản theo `after_chapter_no`. Có nút **Retry notebook update** khi `FAILED`.

## 5b. Cấu hình

Thêm vào `subtitle-studio.novel.*` (record trong `SubtitleStudioProperties`):

| Thuộc tính | Mặc định | Ghi chú |
|---|---|---|
| `pages-per-request` | `20` | số ảnh tối đa mỗi lượt gửi Gemini |
| `max-page-image-size` | `10MB` | mỗi ảnh chụp upload |
| `render.width` | `1080` | px |
| `render.height` | `1600` | px |
| `render.font-size` | `44` | px |
| `watermark-text` | `${SUBTITLESTUDIO_NOVEL_WATERMARK:}` | rỗng = dùng host của trang public (`<project>.pages.dev`) |

Model, fallback, timeout, temperature dùng chung `subtitle-studio.gemini.*`.

## 6. API (package `com.subtitlestudio.novel`)

| Method | Đường dẫn | Việc |
|---|---|---|
| GET | `/api/novels` | Danh sách bộ: id, slug, title, coverUrl, novelStatus, chapterCount, publishedCount |
| POST | `/api/novels` | Tạo bộ (8 mục + `slug` + `promptProfile`) |
| GET | `/api/novels/{id}` | Chi tiết bộ + danh sách chương (không có text) + trạng thái sổ tay |
| PUT | `/api/novels/{id}` | Sửa bộ |
| DELETE | `/api/novels/{id}` | Xoá bộ (mục 3) |
| POST | `/api/novels/{id}/chapters` | Thêm chương: `chapterNo` (mặc định = lớn nhất + 1), `title` |
| GET | `/api/chapters/{id}` | Chi tiết chương + các trang (`mediaUrl`, `textVi`) + id chương trước/sau |
| PUT | `/api/chapters/{id}` | Sửa `chapterNo`, `title`, `pages: [{id, textVi}]`; sửa text → `edited_after_translation = 'Y'`; chương Published sửa text → cập nhật sổ tay |
| DELETE | `/api/chapters/{id}` | Xoá chương |
| POST | `/api/chapters/{id}/pages` | Multipart nhiều file; thêm vào cuối theo thứ tự tên file (so sánh tự nhiên); trả danh sách trang |
| PUT | `/api/chapters/{id}/pages/order` | `{pageIds: [...]}` đúng đủ tập trang |
| DELETE | `/api/chapters/{id}/pages/{pageId}` | Xoá trang, đánh số lại |
| POST | `/api/chapters/{id}/translate` | 202; chạy nền |
| POST | `/api/chapters/{id}/publish` | Kiểm tra mọi trang có `textVi` không rỗng; → `PUBLISHED`; kích hoạt cập nhật sổ tay |
| POST | `/api/chapters/{id}/unpublish` | → `DRAFT` |
| GET | `/api/novels/{id}/notebook` | `?after=N` tuỳ chọn; trả nội dung + danh sách phiên bản + trạng thái/lỗi |
| POST | `/api/novels/{id}/notebook/retry` | Chạy lại lượt cập nhật lỗi gần nhất |

Upload, sửa thứ tự, xoá trang, sửa text và publish đều bị chặn khi chương đang `TRANSLATING`.

**Mã lỗi** (thêm vào `ApiExceptionHandler`):

| Code | HTTP | Khi nào |
|---|---|---|
| `NOVEL_NOT_FOUND` / `CHAPTER_NOT_FOUND` / `PAGE_NOT_FOUND` | 404 | |
| `INVALID_NOVEL` / `INVALID_CHAPTER` | 400 | kèm `FieldError[]` (tiếng Anh) |
| `DUPLICATE_NOVEL_SLUG` | 409 | |
| `DUPLICATE_CHAPTER_NUMBER` | 409 | |
| `INVALID_PAGE_ORDER` | 400 | danh sách id không đúng đủ tập trang |
| `INVALID_MEDIA` / `MEDIA_TOO_LARGE` | 400 / 413 | dùng lại `ImageSniffer`; PNG / JPEG / WebP |
| `CHAPTER_HAS_NO_PAGES` | 422 | |
| `TRANSLATION_IN_PROGRESS` | 409 | dùng lại mã sẵn có |
| `CHAPTER_NOT_TRANSLATED` | 409 | publish khi còn trang chưa có text |
| `UNKNOWN_PROFILE` | 400 | dùng lại; bộ chưa chọn hồ sơ hoặc hồ sơ không còn |
| `GEMINI_NOT_CONFIGURED` | 503 | dùng lại |
| `NOTEBOOK_UPDATE_IN_PROGRESS` | 409 | retry khi đang cập nhật |

## 7. Vẽ chương thành ảnh và xuất bản

**`NovelRenderer`** (Java2D, không gọi mạng):
- Font đọc truyện có đủ dấu tiếng Việt, giấy phép OFL, đóng gói trong `src/main/resources/fonts/` (chốt *Literata* hoặc *Noto Serif* lúc implement). Text chuẩn hoá **NFC**.
- Ghép text các trang của chương (ngăn bằng một dòng trống), dàn trang lại từ đầu: khổ `render.width × render.height`, lề 64px, giãn dòng 1.7, ngắt dòng bằng `LineBreakMeasurer`; chỉ sang trang mới ở ranh giới dòng. Trang đầu có tiêu đề chương.
- Watermark vẽ vào ảnh: chữ chéo lặp lại, độ mờ ~6%, `<watermark-text> · <tên truyện>`; chân ảnh `Ch. N · k/n`.
- Mã hoá **WebP** bằng một thư viện Java có sẵn (chốt lúc implement, chạy được trên Windows và trong image Docker Linux); không dùng được thì **PNG**.
- Kết quả ổn định: cùng input + cùng cài đặt → cùng byte (để hash không đổi).

**Cache** `{data-dir}/novel-render/<chapterId>/<hash>-<k>.webp`, `hash` = SHA-256 (rút gọn) của text đã ghép + tiêu đề + tên truyện + watermark + cài đặt vẽ + phiên bản renderer. Có sẵn thì dùng lại; khác hash thì vẽ mới và xoá các ảnh cũ của chương. Xoá chương/bộ thì xoá thư mục cache tương ứng.

**`SiteExporter` mở rộng** (allowlist, record riêng, không serialize entity):

| File | Nội dung |
|---|---|
| `data/novels.json` | `[{slug, title, coverUrl, originalAuthor, tags, novelStatus, publishedCount, updatedAt}]`; chỉ bộ có ≥ 1 chương Published |
| `data/novels/<slug>.json` | thông tin 8 mục (giới thiệu là text) + `chapters: [{chapterNo, title}]` chỉ chương Published, theo `chapter_no` |
| `data/novels/<slug>/<chapterNo>.json` | `{chapterNo, title, prev, next, images: ["/novels/<slug>/<hash>-<k>.webp", …]}` |
| `novels/<slug>/<hash>-<k>.webp` | ảnh đã vẽ |
| `media/<storage_key>.<ext>` | ảnh bìa (như Profile) |

**Không xuất:** `text_vi`, ảnh chụp gốc, sổ tay, hồ sơ dịch, trạng thái/lỗi dịch, chương Draft. Test exporter phải khẳng định điều này.

`_headers`: `/novels/*` cache dài (`immutable`, tên file theo hash). `_redirects` giữ `/* /index.html 200`.

## 8. Frontend

Chuỗi giao diện tiếng Anh; cam `--brand` cho hành động chính, tím `--brand-2` cho mục đang chọn / thông tin, `--danger` chỉ cho lỗi/xoá; tab gạch chân `tabs__list` / `tabs__tab`; icon `lucide-react`; nút chỉ có icon có `aria-label` + `<Tip>`; `EmptyState` cho trang trống; route mới thêm vào `SpaForwardController` (+ test).

### App quản trị

| Menu | Route | Nội dung | Màu |
|---|---|---|---|
| **Novels** (thanh đầu trang, sau Profile) | `/novels` | Lưới thẻ bộ: bìa, tên, Ongoing/Completed, "12 chapters · 8 published". Nút **New novel**. Trống → `EmptyState`. | New novel cam; menu đang chọn tím |
| | `/novels/new` | Form 8 mục + slug + dropdown **Translation profile** (dùng lại API hồ sơ dịch); bìa dùng `ImagePicker` | Create cam |
| | `/novels/:id` | Đầu trang: bìa + tên. Radix Tabs gạch chân: **Chapters** \| **Details** \| **Notebook**; dữ liệu bộ tải ở cấp trang | Tab đang chọn tím |
| | ↳ Chapters | Danh sách chương: số, tên, badge dịch (Not translated / Translating… / Translated / Failed), badge đăng (Draft / Published), số trang. Nút **Add chapter**. | Add chapter cam; Translating tím; Published cam; Draft viền tím; Failed đỏ |
| | ↳ Details | Sửa 8 mục + hồ sơ; **Delete novel** cuối trang (`useConfirmDialog`) | Save cam; Delete đỏ |
| | ↳ Notebook | Sổ tay chỉ đọc: Characters, Glossary & addressing, Story so far, Recent chapters; dropdown phiên bản "After chapter N"; trạng thái/lỗi + **Retry notebook update** | Phiên bản đang xem tím |
| | `/novels/:id/chapters/:chapterId` | **Thanh trên:** Back, số + tên chương (sửa được), badge, **Translate** / **Translate again** (xác nhận nếu đã sửa tay), **Publish** / **Unpublish**, chương trước/sau.<br>**Pages:** vùng kéo thả 1 hay nhiều ảnh, ảnh thu nhỏ, kéo đổi thứ tự (dnd-kit), xoá trang (xác nhận).<br>**Bản dịch:** mỗi trang một hàng, ảnh gốc trái (bấm phóng to) + ô text phải; **Save**; rời trang khi chưa lưu thì hỏi. Điện thoại: ảnh trên, text dưới. Đang dịch: hỏi lại trạng thái 3 giây/lần, khoá sửa. | Translate / Publish / Save cam; trang đang sửa viền tím; xoá đỏ |

### Trang public

`ReadSource` thêm `listNovels()`, `getNovel(slug)`, `getChapter(slug, chapterNo)`; `staticSource` đọc JSON mục 7, 404 → `NOVEL_NOT_FOUND` / `CHAPTER_NOT_FOUND`. App quản trị không cần đọc qua `ReadSource` cho Novels (trang public có component riêng).

| Menu | Route | Nội dung | Màu |
|---|---|---|---|
| **Novels** (thanh đầu trang public) | `/novels` | Lưới thẻ bộ | Menu đang chọn tím |
| | `/novels/:slug` | Bìa, tên, tác giả gốc, tag, trạng thái, credit, link bản gốc (`rel="noopener noreferrer"`), giới thiệu (text), danh sách chương Published | **Read chapter 1** cam; tag viền tím |
| | `/novels/:slug/:chapterNo` | Cột ảnh dọc ở giữa (tối đa ~600px trên máy tính, vừa màn hình điện thoại), `loading="lazy"`; Previous / Next ở đầu và cuối; dropdown chọn chương | Previous/Next cam; chương hiện tại tím |

**Chặn sao chép trên trang đọc** (`useCopyGuard` + CSS):
- `user-select: none`, `-webkit-touch-callout: none`, `draggable={false}` cho ảnh; lớp phủ trong suốt trên cột ảnh; chặn `contextmenu`, `dragstart`, `copy`, `cut`.
- Chặn phím Ctrl/⌘ + C, S, P, U, A khi đang ở trang đọc.
- `@media print`: ẩn nội dung, hiện dòng "Printing is not available."
- **Làm mờ** cột ảnh (`filter: blur`) khi `window` `blur` hoặc `document.visibilityState === 'hidden'`; bỏ mờ khi `focus` / `visible`. Có `aria-live` thông báo ngắn "Content hidden while the window is inactive."
- Không phát hiện DevTools.

## 9. Kiểm thử

TDD theo CLAUDE.md; không gọi Gemini thật (dùng client giả như dịch Vietsub).

**Backend:**
- `NotebookMerger`: upsert theo khoá, không bao giờ xoá glossary/addressing, giữ nhân vật cũ, giới hạn 30 nhân vật, giữ 3 `recentChapters`, từ chối khi vượt giới hạn hoặc sai schema.
- Dựng prompt dịch: có hồ sơ, sổ tay đúng phiên bản (`< N`, chỉ từ chương Published), text chương trước (cả Draft), nhãn `Page k` đúng thứ tự.
- Chia lượt: 45 trang với `pages-per-request = 20` → 3 lượt 20/20/5, lượt sau có đoạn cuối lượt trước; ghép lại đúng trang.
- Kiểm tra đầu ra: thiếu/thừa/trùng trang, text rỗng → `FAILED`, không ghi gì; 503 → fallback; 429 → `FAILED` không thử lại.
- Trạng thái: khởi động lại → `TRANSLATING`/`UPDATING` thành `FAILED`; các thao tác bị chặn khi đang dịch.
- `NovelRenderer`: kích thước ảnh, số trang ổn định, cùng input → cùng byte, tiếng Việt có dấu sau NFC vẽ được (glyph tồn tại trong font), hash cache dùng lại / xoá ảnh cũ.
- `SiteExporter`: chỉ bộ có chương Published; **JSON public không chứa `text_vi`**, không có chương Draft, không có ảnh chụp gốc, không có sổ tay.
- Controller + mã lỗi; upload nhiều file sắp theo tên tự nhiên; đổi thứ tự sai tập → `INVALID_PAGE_ORDER`; `V5` chạy trên H2 (và `*OracleIT`).

**Frontend (Vitest + RTL, `fetch` giả):** danh sách + form bộ, tab Chapters/Details/Notebook, trang chương (upload, đổi thứ tự, badge, Translate với xác nhận ghi đè, Publish, polling, khoá khi đang dịch, cảnh báo chưa lưu), trang public (danh sách, chi tiết, trình đọc Previous/Next, chặn phím tắt và `contextmenu`, làm mờ khi `blur` / `visibilitychange`), `SpaForwardController`.

## 10. Rủi ro và ghi chú

- **Quota free tier:** dịch cả bộ có thể mất nhiều ngày; mỗi chương tốn 1 + (số lượt) request dịch và 1 request sổ tay. Lỗi 429 hiện rõ để người dùng thử lại hôm sau.
- **Chất lượng OCR tiếng Thái** phụ thuộc độ nét ảnh chụp; ảnh mờ → bản dịch sai, người dùng sửa ở màn hình chương.
- **Giới hạn Pages Free 20.000 file/site:** bộ ~311 trang gốc ước tính ~550 ảnh đã vẽ; tổng số file vẫn cần cộng với Vietsub/Profile hiện có. Exporter ghi WARN khi tổng file > 18.000.
- **Bảo vệ không tuyệt đối:** chụp bằng thiết bị khác / quay màn hình không chặn được; watermark để truy nguồn.
- **Bản quyền:** repo public; không commit ảnh chụp hay text truyện vào repo (dữ liệu nằm trong `./data/`, đã gitignore). Fixture test dùng ảnh/text tự tạo.
