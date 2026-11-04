# Trang public cho nhóm fan (design spec)

> Ngày: 2026-11-04. Trạng thái: chờ review.
> Nền tảng: `main` sau Playlists (`55c6556`, xem [PROGRESS.md](../../../PROGRESS.md), [spec Playlists](2026-11-04-playlists-design.md)).

## 1. Mục tiêu

Cho **một nhóm fan** xem Vietsub và Profile qua Internet, **miễn phí, 24/24, không cần máy của người dùng bật**. App đầy đủ vẫn chạy ở máy người dùng (`docker compose`); khi muốn cập nhật, người dùng bấm **Publish**: app xuất dữ liệu chỉ đọc thành trang tĩnh và đẩy lên **Cloudflare Pages** (`https://<project>.pages.dev`).

**Tiêu chí thành công:**
1. Bấm Publish một lần → trang public cập nhật, giao diện quản trị báo xong kèm link.
2. Khách (không đăng nhập) mở link trên điện thoại: Vietsub list (tìm kiếm, chip playlist), xem video kèm Vietsub (cả chế độ playlist: Previous/Next/Autoplay), Profile. F5 ở mọi route không 404.
3. Máy người dùng tắt, trang vẫn chạy.
4. Trang public không có chức năng ghi nào và không chứa dữ liệu nội bộ (Engsub, `.srt`, hồ sơ dịch, trạng thái/lỗi dịch).
5. Mặc định không được Google index.

**Ngoài phạm vi:** đăng nhập/tài khoản (không cần vì trang public chỉ đọc), tên miền riêng (gắn sau trong Cloudflare, không đổi code), publish tự động theo lịch, xuất từng phần, lưu nhiều phiên bản (Cloudflare có rollback deployment), sao lưu tự động (chỉ ghi chú: sao lưu theo README trước lần Publish đầu tiên).

## 2. Quyết định đã chốt với người dùng

| # | Quyết định |
|---|---|
| D1 | Hướng **B**: app ở máy người dùng + trang tĩnh; bỏ việc làm đăng nhập. |
| D2 | Làm sau Playlists; trang public có đủ tìm kiếm, chip playlist, chế độ playlist ở trang xem. |
| D3 | Nút **Publish** trong app tự deploy bằng **Cloudflare API token** trong `.env`. |
| D4 | Public: video có Vietsub (tiêu đề, kênh, thời lượng, ảnh YouTube, nhãn **Manual/AI**), Vietsub phát kèm video, playlist, 3 Profile + ảnh. **Không** cho tải `.srt`. **Không** xuất Engsub, hồ sơ dịch, trạng thái/lỗi dịch, log. |
| D5 | Cùng app React, thêm chế độ build `public` + dữ liệu JSON tĩnh (phương án ①). |
| D6 | Deploy bằng CLI **`wrangler`** (pin version) cài trong image, gọi bằng `ProcessBuilder`. |
| D7 | Chân trang: **"Vietsub by @byZenQN · All videos are the property of their original creators · Updated 2026"** (năm = năm lúc Publish). |
| D8 | `SUBTITLESTUDIO_PUBLISH_INDEXABLE` trong `.env`, **mặc định `false`** (noindex). |

## 3. Kiến trúc và luồng dữ liệu

```
Máy người dùng: docker compose (app đầy đủ)
  bấm Publish
    │
    ▼
① SiteExporter → thư mục tạm:
     data/site.json, data/videos.json, data/videos/<id>.json,
     data/playlists.json, data/playlists/<id>.json,
     data/profiles.json, data/profiles/<slug>.json, media/<storage_key>.<ext>
② PublicSiteBundle: chép bản build public trong jar (public-site/**) + _redirects, _headers, robots.txt
③ WranglerClient: wrangler pages deploy <dir> --project-name <project> --branch main
    │
    ▼
Cloudflare Pages (file tĩnh, không có API)
```

- Mỗi lần Publish **xuất lại toàn bộ**; `wrangler` tự bỏ qua file không đổi.
- Mỗi lúc chỉ một Publish; chạy nền; trạng thái giữ trong bộ nhớ (restart → `IDLE`).
- Thư mục tạm nằm trong `{data-dir}/publish-tmp/<uuid>/`, xoá sau khi xong (thành công hay lỗi). Lúc khởi động xoá thư mục `publish-tmp` còn sót.

## 4. Dữ liệu xuất (allowlist)

Chỉ các trường dưới đây được ghi; exporter dựng record riêng, **không** serialize thẳng `VideoDto`/entity.

**`PublicVideo`**: `id`, `title`, `channel`, `durationSec`, `thumbnailUrl`, `viCueCount`, `viUpdatedAt`, `viSource` (`MANUAL`/`AUTO`). Chỉ video có `viCueCount > 0`.

| File | Nội dung |
|---|---|
| `data/site.json` | `{publishedAt, year}` |
| `data/videos.json` | `PublicVideo[]`, cùng thứ tự Vietsub list hiện tại (mới cập nhật Vietsub trước) |
| `data/videos/<id>.json` | `{video: PublicVideo, vietsub: [{startMs, endMs, text}]}` |
| `data/playlists.json` | `[{id, name, description, videoCount, thumbnailUrl, updatedAt}]`, cùng thứ tự `GET /api/playlists`; `videoCount` chỉ đếm video có Vietsub |
| `data/playlists/<id>.json` | `{id, name, description, updatedAt, videos: PublicVideo[]}` theo `position` |
| `data/profiles.json` | `[{slug, displayName}]` |
| `data/profiles/<slug>.json` | như `GET /api/profiles/{slug}`; `mediaUrl` đổi `/api/media/<id>` → `/media/<storage_key>.<ext>` |
| `media/<storage_key>.<ext>` | chỉ ảnh được khối/mục Profile tham chiếu |

- JSON UTF-8, không pretty-print. Tên file theo id (video id đã qua `UrlParser`; playlist id số; slug cố định) nên không có ký tự lạ.
- Ảnh thiếu file trên đĩa → bỏ qua ảnh đó và ghi WARN (Publish vẫn tiếp tục).

## 5. Frontend public

**Hai bản build từ một codebase:**
- `npm run build` → app quản trị (như hiện tại).
- `npm run build:public` → entry `main.public.tsx` → `PublicApp`; outDir `../target/classes/public-site/`. Maven chạy cả hai trong `frontend-maven-plugin`.

**Nguồn dữ liệu:**
```ts
interface ReadSource {
  listVideos(): Promise<PublicVideo[]>;
  getVideo(id: string): Promise<PublicVideo>;
  getVietsub(id: string): Promise<ViCue[]>;
  listPlaylists(): Promise<PublicPlaylistSummary[]>;
  getPlaylist(id: number): Promise<PublicPlaylistDetail>;
  listProfiles(): Promise<ProfileSummary[]>;
  getProfile(slug: string): Promise<Profile>;
}
```
- `PublicVideo` = `Pick<VideoDto, …>` đúng các trường mục 4; các trang dùng trong bản public (`VietsubListPage`, `WatchPage`, `ProfilePage` và component con) chỉ đọc các trường này (TypeScript bắt lỗi).
- `apiSource` (gọi API hiện có) và `staticSource` (đọc `data/*.json`; `data/videos/<id>.json` tải một lần cho cả `getVideo` và `getVietsub`; 404 → `ApiError` với code tương ứng `VIDEO_NOT_FOUND` / `PLAYLIST_NOT_FOUND` / `PROFILE_NOT_FOUND` để trang hiện thông báo như cũ).
- `ReadSourceProvider` (React context): `App` dùng `apiSource`, `PublicApp` dùng `staticSource`; test truyền nguồn giả.

**Route bản public:**

| Route | Nội dung |
|---|---|
| `/` | chuyển `/vietsub/list` |
| `/vietsub/list` | Vietsub list (search, chip playlist, khung playlist) |
| `/vietsub/:id` (`?playlist=`) | Trang xem kèm Vietsub, chế độ playlist |
| `/profiles`, `/profiles/:slug` | Profile chỉ xem (`/profiles` → `/profiles/emibonnie`) |
| khác | "Page not found" + link Vietsub list |

**Khác app quản trị** (prop/flag `readOnly`, không tách component):
- NavBar chỉ **Vietsub list**, **Profile**; tên app dẫn `/vietsub/list`; không có nút Publish.
- Profile không có **Edit**; trang trống không có link **Add Vietsub**; không nút tải `.srt`; không hiện trạng thái/lỗi dịch.
- Nhãn **Manual/AI** giữ nguyên.
- Chân trang D7 (năm lấy từ `data/site.json`).
- `indexable=false`: `<meta name="robots" content="noindex, nofollow">` (chèn khi export), header `X-Robots-Tag: noindex, nofollow`, `robots.txt` `Disallow: /`. `true`: không có ba thứ trên, `robots.txt` cho phép.

**File sinh thêm:**
- `_redirects`: `/* /index.html 200` (SPA; file thật vẫn được phục vụ trước).
- `_headers`: `/assets/*` và `/media/*` cache dài (`immutable`); `/data/*` `no-cache` để khách thấy bản mới ngay sau Publish; `X-Robots-Tag` theo D8.

## 6. Backend Publish (package `com.subtitlestudio.publish`)

| Thành phần | Việc |
|---|---|
| `SiteExporter` | Ghi dữ liệu mục 4 vào thư mục cho trước |
| `PublicSiteBundle` | Chép `classpath:public-site/**`; sinh `_redirects`, `_headers`, `robots.txt`; chèn meta robots vào `index.html` theo `indexable` |
| `WranglerClient` (interface) + `WranglerClientImpl` | `ProcessBuilder` list args `[wranglerPath, "pages", "deploy", dir, "--project-name", project, "--branch", "main"]` (không qua shell); env tiến trình con `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`; đọc stdout/stderr song song; quá `timeout` → `destroyForcibly()`; exit ≠ 0 → lỗi theo nhóm (token sai/hết quyền, project không tồn tại, mạng, khác); **không** ghi output thô vào log hay thông báo |
| `PublishService` | `start()`: chưa cấu hình → `PublishNotConfiguredException`; đang chạy → `PublishInProgressException`; chạy nền (executor riêng): export → bundle → deploy → xoá tạm; trạng thái `IDLE / PUBLISHING / DONE / FAILED`, `lastPublishedAt`, `url` (`https://<project>.pages.dev`), `error` |
| `PublishController` | `POST /api/publish` → 202 + trạng thái; `GET /api/publish` → `{status, configured, lastPublishedAt, url, error}` |

**Mã lỗi:** `PUBLISH_IN_PROGRESS` 409, `PUBLISH_NOT_CONFIGURED` 503. Lỗi lúc chạy nằm ở `error` của trạng thái (tiếng Anh, vd "Cloudflare rejected the API token.", "Cloudflare Pages project \"x\" was not found.", "Publishing timed out.", "Could not start wrangler.").

**Cấu hình** (`subtitle-studio.publish.*`, record trong `SubtitleStudioProperties`; `toString()` che token):

| Thuộc tính | Env | Mặc định |
|---|---|---|
| `cloudflare-api-token` | `CLOUDFLARE_API_TOKEN` | trống |
| `cloudflare-account-id` | `CLOUDFLARE_ACCOUNT_ID` | trống |
| `project` | `SUBTITLESTUDIO_PUBLISH_PROJECT` | trống |
| `indexable` | `SUBTITLESTUDIO_PUBLISH_INDEXABLE` | `false` |
| `wrangler-path` | `SUBTITLESTUDIO_PUBLISH_WRANGLER_PATH` | `wrangler` |
| `timeout` | | `5m` |

`configured` = token, account id và project đều không trống.

**Giao diện quản trị:** nút **Publish** (icon `UploadCloud`, `<Tip>`) bên phải thanh đầu trang, chỉ ở app quản trị.
- Chưa cấu hình → nút disabled, tooltip "Set CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID and SUBTITLESTUDIO_PUBLISH_PROJECT in .env".
- Bấm → hộp xác nhận "Publish the public site now?" → toast "Publishing…"; trong lúc chạy nút quay và bị khoá; frontend hỏi `GET /api/publish` mỗi 2 s tới khi xong.
- Xong → toast "Published" + link **Open site**; lỗi → toast lỗi với `error`.
- Tooltip lúc rảnh: "Last published <giờ> · Open site" hoặc "Not published yet".

## 7. Docker, cấu hình, tài liệu

- `pom.xml`: thêm execution `npm run build:public`.
- `Dockerfile`: stage cài `wrangler` (pin version, đã phát hành ≥ 2 tuần) bằng Node pin version vào `/opt/wrangler`; image runtime chép `node` + `/opt/wrangler`, `SUBTITLESTUDIO_PUBLISH_WRANGLER_PATH=/opt/wrangler/node_modules/.bin/wrangler`. Image tăng ~100 MB.
- `docker-compose.yml` + `.env.example`: 4 biến `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `SUBTITLESTUDIO_PUBLISH_PROJECT`, `SUBTITLESTUDIO_PUBLISH_INDEXABLE=false`.
- README: mục "Trang public (Publish)": tạo project Pages (Direct Upload), tạo API token chỉ quyền **Account → Cloudflare Pages → Edit**, lấy account id, điền `.env`, sao lưu trước lần đầu, ý nghĩa `INDEXABLE`, rollback trong dashboard Cloudflare.
- CLAUDE.md: route mới của bản public; trang dùng trong bản public đọc dữ liệu qua `ReadSource` và chỉ dùng trường `PublicVideo`; dữ liệu public theo allowlist; token Cloudflare không vào log/commit.
- PROGRESS.md: nhật ký.

## 8. Kiểm thử

| Nhóm | Nội dung |
|---|---|
| `SiteExporter` | đúng bộ file/trường; **không lọt** `cueCount`, `subSource`, `translation*`, Engsub, đường dẫn `.srt`; video không Vietsub bị loại (cả trong playlist, `videoCount` khớp); `mediaUrl` đổi đường dẫn; chỉ chép ảnh đang dùng; ảnh thiếu file → bỏ qua + WARN; tiếng Việt/Thái/emoji giữ nguyên |
| `PublicSiteBundle` | `_redirects`; `_headers`; `indexable` false/true (meta, header, robots.txt) |
| `WranglerClientImpl` | chương trình giả `FakeWrangler` (Java, chạy `java -cp`, chế độ `-Dfake.mode=`): tham số đúng thứ tự, env có token/account id, timeout → huỷ tiến trình, exit lỗi → đúng nhóm thông báo; token không có trong log/thông báo |
| `PublishService` | một Publish mỗi lúc; chưa cấu hình; trạng thái; thư mục tạm luôn bị xoá; dọn `publish-tmp` lúc khởi động |
| `PublishController` | 202 / 409 / 503; `GET` |
| Frontend | `staticSource` (fetch giả, 404 → code đúng); `PublicApp`: không menu/nút quản trị, chân trang, route not found; các trang chạy với cả hai nguồn; nút Publish (disabled khi chưa cấu hình, xác nhận, quay, toast xong/lỗi, tooltip) |
| Kiểm tay | Publish thật lên `*.pages.dev`; điện thoại: Vietsub list, search, playlist, Autoplay, Profile; F5 ở `/vietsub/:id`; header `X-Robots-Tag`; dữ liệu `data/videos.json` không có trường nội bộ |

## 9. Rủi ro

| Rủi ro | Giảm thiểu |
|---|---|
| Lộ dữ liệu nội bộ ra public | Allowlist record riêng + test chặn từng trường |
| Lộ Cloudflare token | Chỉ qua env tiến trình con; `toString()` che; không log output wrangler; token quyền tối thiểu |
| Cloudflare/wrangler thay đổi | Pin version; lỗi deploy báo rõ trên UI |
| Giới hạn Cloudflare Pages (~20.000 file, 25 MiB/file) | Dữ liệu hiện tại rất xa giới hạn |
| Bản quyền | noindex mặc định; chân trang ghi công; không cho tải `.srt` |
