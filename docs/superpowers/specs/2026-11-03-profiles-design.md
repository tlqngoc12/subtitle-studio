# Profile Emi, Bonnie, EmiBonnie (design spec)

> Ngày: 2026-11-03. Trạng thái: chờ review.
> Nền tảng: `main` sau Oracle + Flyway (xem [PROGRESS.md](../../../PROGRESS.md), [spec Oracle](2026-11-03-oracle-design.md)).

## 1. Mục tiêu

Thêm menu **Profile**: trang giới thiệu cho fan về **EmiBonnie** (เอมี่-บอนนี่), cặp diễn viên GL của GMMTV và duo nhạc của RISER MUSIC. Có 3 profile: **EmiBonnie** (cặp đôi), **Emi**, **Bonnie**. Nội dung mỗi profile là **danh sách khối tự do**: thêm, sửa, xóa, sắp xếp ngay trên trang.

**Tiêu chí thành công:**
1. Menu "Profile" trên NavBar mở `/profiles` → `/profiles/emibonnie`; thanh tab chuyển giữa EmiBonnie · Emi · Bonnie.
2. Ở chế độ sửa, tạo, sửa, xóa và di chuyển được đủ 6 loại khối: Văn bản, Ảnh, Thư viện ảnh, Nhạc/Video (nhúng), Link, Thông tin nhanh.
3. Ảnh upload lưu ở `./data/media/`, vẫn còn sau khi restart compose. Dữ liệu nằm trong Oracle (`V2__profiles.sql`).
4. `mvn test` (H2) và `mvn verify -Poracle` pass. Frontend `npm test` pass.

**Ngoài phạm vi** (ghi vào Backlog):
- Thêm/xóa profile: phase sau, theo yêu cầu người dùng.
- Đăng nhập, phân quyền sửa: dự án con 2. Phase này ai mở được app cũng sửa được.
- Kéo thả để sắp xếp, ảnh thu nhỏ (thumbnail), upload file nhạc.

## 2. Quyết định đã chốt với người dùng

| # | Quyết định | Lý do |
|---|---|---|
| D1 | Trang giới thiệu cho fan | Mục đích người dùng chọn |
| D2 | **Khối tự do** (thêm/xóa/sắp xếp), không dùng khung cố định | Mỗi profile có thể có bố cục riêng |
| D3 | Nhạc/Video **nhúng YouTube/Spotify**; ảnh **upload** vào `./data/media/` | Nhạc chính thức đã có sẵn trên nền tảng, không lưu mp3 có bản quyền. Link ảnh ngoài dễ chết |
| D4 | **3 profile cố định** (seed trong migration). Thêm/xóa profile để phase sau | Nội dung chung của duo nằm ở EmiBonnie |
| D5 | **Sửa ngay trên trang** (bật/tắt chế độ sửa), sắp xếp bằng nút ⬆️⬇️ | Thấy kết quả tại chỗ, không cần kéo thả |
| D6 | 6 loại khối: TEXT, IMAGE, GALLERY, EMBED, LINKS, FACTS | 5 khối đề xuất + Thông tin nhanh |
| D7 | Mỗi khối là 1 dòng trong `T_PROFILE_BLOCK`, **cột thật theo loại khối**; phần tử của khối nhiều phần tử nằm ở `T_PROFILE_BLOCK_ITEM` | Người dùng chọn. Xem dữ liệu trên DBeaver dễ |
| D8 | Bảng mới có tiền tố **`T_`**; mọi `id` là **sequence tự tăng**; `T_PROFILE` có thêm `slug` để làm URL | Người dùng chọn |
| D9 | Tên menu: **Profile** | Người dùng chọn |

## 3. Database: `src/main/resources/db/migration/V2__profiles.sql`

SQL Oracle, dùng placeholder `${bigint}`/`${int}` như `V1__init.sql`. Sequence `INCREMENT BY 50` khớp `allocationSize = 50` (cùng quy ước với V1).

```sql
CREATE SEQUENCE t_profile_seq            START WITH 1 INCREMENT BY 50;
CREATE SEQUENCE t_media_seq              START WITH 1 INCREMENT BY 50;
CREATE SEQUENCE t_profile_block_seq      START WITH 1 INCREMENT BY 50;
CREATE SEQUENCE t_profile_block_item_seq START WITH 1 INCREMENT BY 50;

CREATE TABLE t_profile (
  id            ${bigint}                 NOT NULL,
  slug          VARCHAR2(20 CHAR)         NOT NULL,
  display_name  VARCHAR2(100 CHAR)        NOT NULL,
  updated_at    TIMESTAMP WITH TIME ZONE  NOT NULL,
  CONSTRAINT t_profile_pk PRIMARY KEY (id),
  CONSTRAINT t_profile_slug_uk UNIQUE (slug)
);

CREATE TABLE t_media (
  id             ${bigint}                 NOT NULL,
  content_type   VARCHAR2(50 CHAR)         NOT NULL,
  size_bytes     ${bigint}                 NOT NULL,
  original_name  VARCHAR2(255 CHAR),
  created_at     TIMESTAMP WITH TIME ZONE  NOT NULL,
  CONSTRAINT t_media_pk PRIMARY KEY (id)
);

CREATE TABLE t_profile_block (
  id          ${bigint}                 NOT NULL,
  profile_id  ${bigint}                 NOT NULL,
  position    ${int}                    NOT NULL,
  block_type  VARCHAR2(10 CHAR)         NOT NULL,
  title       VARCHAR2(200 CHAR),
  body        CLOB,
  media_id    ${bigint},
  caption     VARCHAR2(500 CHAR),
  embed_url   VARCHAR2(500 CHAR),
  created_at  TIMESTAMP WITH TIME ZONE  NOT NULL,
  updated_at  TIMESTAMP WITH TIME ZONE  NOT NULL,
  CONSTRAINT t_profile_block_pk PRIMARY KEY (id),
  CONSTRAINT t_profile_block_profile_fk FOREIGN KEY (profile_id) REFERENCES t_profile (id),
  CONSTRAINT t_profile_block_media_fk FOREIGN KEY (media_id) REFERENCES t_media (id),
  CONSTRAINT t_profile_block_type_ck CHECK (block_type IN ('TEXT','IMAGE','GALLERY','EMBED','LINKS','FACTS'))
);
CREATE INDEX t_profile_block_profile_ix ON t_profile_block (profile_id, position);

CREATE TABLE t_profile_block_item (
  id        ${bigint}           NOT NULL,
  block_id  ${bigint}           NOT NULL,
  position  ${int}              NOT NULL,
  label     VARCHAR2(200 CHAR),
  value     VARCHAR2(1000 CHAR),
  media_id  ${bigint},
  CONSTRAINT t_profile_block_item_pk PRIMARY KEY (id),
  CONSTRAINT t_profile_block_item_block_fk FOREIGN KEY (block_id) REFERENCES t_profile_block (id) ON DELETE CASCADE,
  CONSTRAINT t_profile_block_item_media_fk FOREIGN KEY (media_id) REFERENCES t_media (id)
);
CREATE INDEX t_profile_block_item_block_ix ON t_profile_block_item (block_id, position);

-- Seed: 3 profile cố định (id lấy từ sequence).
INSERT INTO t_profile (id, slug, display_name, updated_at) VALUES (t_profile_seq.NEXTVAL, 'emibonnie', 'EmiBonnie', CURRENT_TIMESTAMP);
INSERT INTO t_profile (id, slug, display_name, updated_at) VALUES (t_profile_seq.NEXTVAL, 'emi',       'Emi',       CURRENT_TIMESTAMP);
INSERT INTO t_profile (id, slug, display_name, updated_at) VALUES (t_profile_seq.NEXTVAL, 'bonnie',    'Bonnie',    CURRENT_TIMESTAMP);
```

> Sequence `INCREMENT BY 50` nên id seed là 1, 51, 101; Hibernate (pooled optimizer) cấp id tiếp theo không trùng. Thứ tự hiển thị tab theo `id` nên vẫn là EmiBonnie, Emi, Bonnie.
> Nếu `position`/`value` trùng từ khóa trên H2 hoặc Oracle thì đổi tên cột (vd `sort_order`, `item_value`) ở cả migration và entity, rồi ghi lại trong PROGRESS.

**Cột nào dùng cho loại khối nào** (kiểm tra ở Java, DB chỉ CHECK `block_type`):

| Loại | `title` | `body` | `media_id` | `caption` | `embed_url` | Item |
|---|---|---|---|---|---|---|
| TEXT | tùy chọn | **bắt buộc** (Markdown) | — | — | — | — |
| IMAGE | tùy chọn | — | **bắt buộc** | tùy chọn | — | — |
| GALLERY | tùy chọn | — | — | — | — | ≥1, mỗi item có `media_id`, `label` = chú thích (tùy chọn) |
| EMBED | tùy chọn | — | — | — | **bắt buộc** (URL nhúng đã chuẩn hóa) | — |
| LINKS | tùy chọn | — | — | — | — | ≥1, `label` + `value` (URL http/https) bắt buộc |
| FACTS | tùy chọn | — | — | — | — | ≥1, `label` + `value` bắt buộc |

**Ghi chú:**
- Không đặt UNIQUE `(profile_id, position)`, vì đổi chỗ hai khối sẽ vướng ràng buộc. Hiển thị theo `ORDER BY position, id`.
- Oracle lưu `''` thành NULL: trường tùy chọn rỗng → lưu NULL, trường bắt buộc kiểm tra trống (sau `strip()`) ở Java.
- Cột không dùng cho loại khối đó luôn ghi NULL (vd đổi nội dung khối không để sót `body` cũ).
- Item xóa theo khối (`ON DELETE CASCADE`). Entity map `@OneToMany(cascade = ALL, orphanRemoval = true)` + `@OrderBy("position")`.

## 4. Lưu ảnh

- File thật ở `${subtitle-studio.data-dir}/media/{id}.{ext}`, `ext` lấy theo loại ảnh đã nhận diện (`jpg`, `png`, `webp`, `gif`). Tên file người dùng đặt chỉ lưu vào `original_name`, **không bao giờ dùng làm đường dẫn**.
- **Nhận diện qua magic bytes** (`ImageSniffer`), không tin `Content-Type` hay đuôi file. Không phải 4 loại trên → `INVALID_MEDIA`.
- Giới hạn **10 MB/ảnh**: `spring.servlet.multipart.max-file-size` và `max-request-size` nâng lên `10MB`. `VietsubService` vẫn tự kiểm tra `.srt` ≤ 5 MB như cũ (thêm kiểm tra nếu hiện chỉ dựa vào giới hạn multipart). Vượt giới hạn → `MEDIA_TOO_LARGE` 413.
- Ghi file trước, insert `T_MEDIA` sau. Insert lỗi thì xóa file.
- `GET /api/media/{id}` trả file với `Content-Type` đã lưu, `X-Content-Type-Options: nosniff`, `Cache-Control: public, max-age=31536000, immutable` (ảnh không bao giờ đổi nội dung theo id).
- **Dọn ảnh mồ côi** (`MediaService`):
  - Khi sửa khối (đổi ảnh, bỏ ảnh khỏi gallery) hoặc xóa khối: ảnh không còn khối/item nào tham chiếu thì xóa dòng `T_MEDIA` và file.
  - Ảnh upload nhưng không được lưu vào khối (bấm Hủy, đóng tab): lúc app khởi động, xóa ảnh **không ai tham chiếu và `created_at` cũ hơn 24h**. Dùng `Clock` (bean có sẵn) để test bằng `MutableClock`.
  - File trong `media/` không có dòng `T_MEDIA` thì để nguyên, không tự xóa file mà DB không biết.

## 5. Backend API: package `com.subtitlestudio.profile`

| Method | Đường dẫn | Kết quả |
|---|---|---|
| `GET` | `/api/profiles` | `200` `[{slug, displayName}]` theo thứ tự `id` (EmiBonnie, Emi, Bonnie) |
| `GET` | `/api/profiles/{slug}` | `200` `{slug, displayName, updatedAt, blocks: [Block]}` |
| `POST` | `/api/profiles/{slug}/blocks` | thêm vào cuối (`position = max + 1`) → `201` `Block` |
| `PUT` | `/api/profiles/{slug}/blocks/{id}` | thay toàn bộ nội dung khối (kể cả item), **không đổi `type`** → `200` `Block` |
| `DELETE` | `/api/profiles/{slug}/blocks/{id}` | xóa khối + item + ảnh mồ côi → `204` |
| `POST` | `/api/profiles/{slug}/blocks/{id}/move` | body `{"direction":"UP"\|"DOWN"}`: đổi `position` với khối kề → `200` `[Block]` (danh sách mới). Đã ở đầu/cuối thì không làm gì, vẫn `200` |
| `POST` | `/api/media` | multipart field `file` → `201` `{id, url: "/api/media/{id}"}` |
| `GET` | `/api/media/{id}` | file ảnh |

Mọi thao tác ghi khối cập nhật `T_PROFILE.updated_at`. Khối `{id}` không thuộc profile `{slug}` → `BLOCK_NOT_FOUND`.

**Block (request và response dùng chung dạng):**
```json
{
  "id": 12, "type": "LINKS", "title": "Mạng xã hội",
  "body": null, "mediaId": null, "mediaUrl": null, "caption": null, "embedUrl": null,
  "items": [ { "label": "Instagram", "value": "https://instagram.com/...", "mediaId": null, "mediaUrl": null } ]
}
```
Request bỏ qua `id`, `mediaUrl` và các trường không thuộc loại khối. Response luôn có `mediaUrl` cho trường có `mediaId`.

**`ProfileBlockValidator`** (unit test thuần) chuẩn hóa và kiểm tra theo bảng ở mục 3, thêm:
- Độ dài theo cột (`title` ≤ 200, `caption` ≤ 500, `label` ≤ 200, `value` ≤ 1000). `body` ≤ 100.000 ký tự. Tối đa 50 item/khối.
- `mediaId` phải tồn tại trong `T_MEDIA`.
- **EMBED**: chỉ nhận
  - YouTube: URL hợp lệ với `UrlParser` → `https://www.youtube-nocookie.com/embed/{videoId}`;
  - Spotify: `https://open.spotify.com/{track|album|playlist|artist}/{id}` (id khớp `^[A-Za-z0-9]{22}$`, bỏ query, chấp nhận tiền tố `intl-xx/`) → `https://open.spotify.com/embed/{kind}/{id}`.
  - Lưu **URL nhúng đã chuẩn hóa**. Frontend chỉ nhúng URL do backend trả về.
- **LINKS**: `value` phải parse được bằng `java.net.URI`, scheme `http`/`https`, có host. Chặn `javascript:`, `data:`, v.v.
- Lỗi → `InvalidBlockException` mang danh sách `{field, message}` (vd `items[2].value`).

**Mã lỗi mới** (`ApiExceptionHandler`, ProblemDetail có `code`):

| Code | HTTP | Khi nào |
|---|---|---|
| `PROFILE_NOT_FOUND` | 404 | slug không tồn tại |
| `BLOCK_NOT_FOUND` | 404 | id khối không có hoặc không thuộc profile |
| `INVALID_BLOCK` | 400 | validator từ chối; ProblemDetail có thêm property `errors: [{field, message}]` |
| `INVALID_MEDIA` | 400 | không phải ảnh jpeg/png/webp/gif, file rỗng, thiếu field `file` |
| `MEDIA_TOO_LARGE` | 413 | vượt 10 MB (`MaxUploadSizeExceededException`) |
| `MEDIA_NOT_FOUND` | 404 | `GET /api/media/{id}` không có |

## 6. Frontend

**Phạm vi giao diện:**

| Menu | Route | Nội dung |
|---|---|---|
| **Profile** (mục thứ 4 trên NavBar) | `/profiles` | chuyển sang `/profiles/emibonnie` |
| ↳ thanh tab **EmiBonnie · Emi · Bonnie** | `/profiles/:slug` | tên profile + danh sách khối theo thứ tự |
| nút ✏️ "Chỉnh sửa" / ✔️ "Xong" | cùng route, state `editing` | mỗi khối có Sửa · Lên · Xuống · Xóa; cuối trang có "+ Thêm khối" (chọn 1 trong 6 loại) |
| sửa / thêm khối | form mở ngay tại vị trí khối | form theo loại khối, Lưu / Hủy |

- NavBar: "Profile" là `aria-current="page"` cho mọi đường dẫn bắt đầu bằng `/profiles`.
- Slug không tồn tại (`PROFILE_NOT_FOUND`) → hiện "Không tìm thấy profile" + link về EmiBonnie.
- Thêm dependency, **pin version cố định** (bản mới nhất lúc implement): `react-markdown`, `yet-another-react-lightbox`, `@fontsource/noto-sans-thai` (font dự phòng sau Be Vietnam Pro để chữ Thái hiển thị đúng).

**Hiển thị khối** (`src/components/profile/`):

| Khối | Hiển thị |
|---|---|
| TEXT | `react-markdown`, **không bật HTML thô** (không `rehype-raw`). Link trong Markdown mở tab mới |
| IMAGE | ảnh + chú thích, `loading="lazy"`, `alt` = chú thích hoặc tiêu đề; bấm → lightbox |
| GALLERY | lưới ảnh; bấm → lightbox lướt qua lại |
| EMBED | `<iframe src={embedUrl}>`: YouTube tỉ lệ 16:9; Spotify cao 152px (track) / 352px (album, playlist, artist); `title` có nghĩa, `allow` tối thiểu, `loading="lazy"` |
| LINKS | danh sách link, icon `lucide-react`, `target="_blank" rel="noopener noreferrer"` |
| FACTS | bảng 2 cột Nhãn: Giá trị (`<table>` có `<th scope="row">`) |

**Chế độ sửa:**
- Nút chỉ có icon có `aria-label` + `title` (vd "Di chuyển khối lên"). Nút Lên của khối đầu và Xuống của khối cuối bị disable.
- Chỉ mở một form sửa mỗi lúc. Thêm khối mới cũng mở form ở cuối danh sách, chưa gọi API cho tới khi bấm Lưu.
- Item (GALLERY/LINKS/FACTS) thêm, xóa, Lên/Xuống ngay trong form.
- Chọn ảnh → upload ngay (`POST /api/media`), hiện ảnh xem trước. Đang upload thì nút Lưu bị disable.
- Xóa khối → `window.confirm("Xóa khối này?")`.
- Lỗi: thông báo theo `code` trong `errors.ts` (thêm các code mới, có fallback). `INVALID_BLOCK` thì hiện từng lỗi dưới đúng ô theo `field`.

**API client:** thêm hàm vào `src/api/client.ts` (hoặc `src/api/profiles.ts` nếu file quá dài), cùng kiểu xử lý lỗi hiện có.

## 7. Kiểm thử

**Backend** (TDD, `mvn test` toàn bộ trước khi báo xong mỗi task):
- Unit thuần: `ProfileBlockValidator` (mỗi loại khối hợp lệ/thiếu trường; link `javascript:` bị chặn; YouTube `watch`/`youtu.be`/`shorts` → URL nhúng; Spotify `intl-vi/track/...?si=...` → URL nhúng; host lạ bị chặn; vượt độ dài), `ImageSniffer` (jpeg/png/webp/gif; HTML đổi đuôi `.jpg` bị chặn; file rỗng).
- `@DataJpaTest` (H2, đi qua V1 + V2): seed 3 profile; thêm/sửa/xóa/di chuyển; xóa khối → item bị xóa; cột không thuộc loại khối là NULL.
- `MediaService` với `@TempDir`: lưu file, xóa file khi insert lỗi, dọn ảnh mồ côi > 24h (`MutableClock`), ảnh đang được dùng không bị xóa. **Không tạo file trong `./data`.**
- `@WebMvcTest`: từng endpoint và từng mã lỗi ở mục 5; header của `GET /api/media/{id}`.
- `PersistenceOracleIT` (`mvn verify -Poracle`): V2 chạy trên Oracle + `validate`; seed 3 profile; CLOB Markdown tiếng Việt + Thái + emoji dài 50.000 ký tự; `ON DELETE CASCADE` khối → item; `onlyFlywayCreatesTables` cập nhật danh sách bảng.

**Frontend** (Vitest + RTL, giả lập `fetch` bằng `vi.stubGlobal`, truy vấn theo role/label):
- `/profiles` chuyển sang `/profiles/emibonnie`; tab chuyển profile; NavBar "Profile" là trang hiện tại.
- Hiển thị đủ 6 loại khối; Markdown có `<script>`/`<img onerror>` không thành phần tử thật.
- Bật/tắt chế độ sửa; thêm, sửa, xóa (có confirm), Lên/Xuống; lỗi `INVALID_BLOCK` hiện đúng ô.
- Upload ảnh: xem trước, nút Lưu bị disable khi đang upload, lỗi `MEDIA_TOO_LARGE`.

**Kiểm tay trên compose Oracle:** tạo đủ 6 loại khối ở cả 3 profile; restart compose → dữ liệu và ảnh còn; YouTube/Spotify nhúng phát được; xem trên điện thoại (khung hẹp).

## 8. Triển khai

- `./data/media/` nằm trong bind mount `./data` sẵn có, compose không đổi. Thư mục tự tạo lúc cần.
- `./data/` đã gitignore, ảnh không bao giờ vào repo.
- Cập nhật `PROGRESS.md` (nhật ký, Backlog: thêm/xóa profile; kéo thả; thumbnail; upload nhạc; phân quyền sửa), `README.md` (menu Profile, nơi lưu ảnh), `CLAUDE.md` (package `profile`, quy ước tiền tố `T_` cho bảng mới).
