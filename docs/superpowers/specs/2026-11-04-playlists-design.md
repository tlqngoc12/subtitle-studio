# Playlist cho video Vietsub (design spec)

> Ngày: 2026-11-04. Trạng thái: chờ review.
> Nền tảng: `main` sau Phase 4 và đợt chỉnh giao diện 2026-11-04 (xem [PROGRESS.md](../../../PROGRESS.md)).

## 1. Mục tiêu

Gom các video có Vietsub thành **playlist có thứ tự**, quản lý ở **menu Vietsub**, xem ở **menu Vietsub list** (chỉ xem) với trải nghiệm giống playlist YouTube: khung playlist, Play all, khung danh sách cạnh trang xem, Previous/Next và **tự phát video tiếp theo**. Thêm **ô tìm kiếm** ở đầu Vietsub list.

**Tiêu chí thành công:**
1. Tạo, đổi tên, xoá playlist; thêm/gỡ video bằng "Save to playlist"; kéo thả sắp thứ tự — tất cả ở menu Vietsub.
2. Vietsub list: chọn All hoặc một playlist, tìm kiếm không phân biệt dấu, URL giữ trạng thái.
3. Xem từ playlist: khung danh sách, Previous/Next, Autoplay chuyển video khi hết (kể cả lúc toàn màn hình), dừng ở video cuối.
4. Playlist chỉ chứa video có Vietsub; xoá Vietsub/video tự gỡ khỏi playlist.

**Ngoài phạm vi:** chia sẻ/xuất playlist, ảnh bìa tự chọn, công khai/riêng tư, shuffle, loop, thêm video từ trang sửa playlist.

## 2. Quyết định đã chốt với người dùng

| # | Quyết định |
|---|---|
| D1 | Playlist để gom nhóm **và** xem liên tục như YouTube; làm cả tự phát trong đợt này. |
| D2 | Vietsub list: ô search + thanh chọn playlist (All + từng playlist) phía trên danh sách. |
| D3 | Giống YouTube: khung playlist (ảnh bìa, tên, số video, Play all, danh sách đánh số), kéo thả sắp thứ tự, khung danh sách cạnh trang xem, Autoplay. |
| D4 | Thêm video bằng nút **Save to playlist** ở từng dòng Manage Vietsub (popover, ô tick, "+ New playlist"). |
| D5 | Dữ liệu: bảng `playlist` + `playlist_item` có `position`. |

## 3. Dữ liệu (Flyway `V4__playlists.sql`)

Kiểm tra lại số version trước khi merge (main hiện ở `V3`; phiên khác có thể thêm migration).

```sql
CREATE SEQUENCE playlist_seq START WITH 1 INCREMENT BY 50;
CREATE TABLE playlist (
  id          ${bigint}            NOT NULL,
  name        VARCHAR2(100 CHAR)   NOT NULL,
  description VARCHAR2(1000 CHAR),
  created_at  TIMESTAMP(6) WITH TIME ZONE NOT NULL,
  updated_at  TIMESTAMP(6) WITH TIME ZONE NOT NULL,
  CONSTRAINT pk_playlist PRIMARY KEY (id)
);

CREATE SEQUENCE playlist_item_seq START WITH 1 INCREMENT BY 50;
CREATE TABLE playlist_item (
  id          ${bigint}          NOT NULL,
  playlist_id ${bigint}          NOT NULL,
  video_id    VARCHAR2(11 CHAR)  NOT NULL,
  position    ${int}             NOT NULL,
  CONSTRAINT pk_playlist_item PRIMARY KEY (id),
  CONSTRAINT fk_playlist_item_playlist FOREIGN KEY (playlist_id) REFERENCES playlist (id),
  CONSTRAINT fk_playlist_item_video FOREIGN KEY (video_id) REFERENCES video (id),
  CONSTRAINT uk_playlist_item_video UNIQUE (playlist_id, video_id)
);
CREATE INDEX ix_playlist_item_video ON playlist_item (video_id);
```

- Không đặt unique trên `(playlist_id, position)` để đổi thứ tự không phải né trùng giữa chừng; service luôn ghi `position` liền mạch 1..n trong một transaction.
- `ix_playlist_item_video` phục vụ "video nằm trong playlist nào" và gỡ video khỏi mọi playlist.
- Entity theo quy ước hiện có: `SEQUENCE` với `allocationSize = 50`, Hibernate `validate`.

**Quy tắc:**
1. Chỉ video có Vietsub (`vi_cue_count > 0`) được thêm.
2. Một video có thể ở nhiều playlist; trong một playlist chỉ một lần.
3. Thêm → cuối (`max(position) + 1`); gỡ → các item sau dồn lên; đổi thứ tự → nhận toàn bộ danh sách `videoIds`, phải bằng đúng tập hiện có, ghi lại `position` 1..n.
4. Delete Vietsub (`VietsubService.clear`) và Delete video (`SubtitleService.delete`) gỡ video khỏi mọi playlist (xoá `playlist_item` trước, theo khoá ngoại) và cập nhật `updated_at` của các playlist bị ảnh hưởng.
5. Xoá playlist: xoá item rồi playlist; video/Vietsub giữ nguyên.
6. Tên được trùng; tên `strip()` không rỗng, ≤ 100 ký tự; mô tả `strip()` ≤ 1000 ký tự, rỗng → NULL (Oracle).
7. `updated_at` cập nhật khi đổi tên/mô tả, thêm, gỡ, đổi thứ tự. Danh sách playlist sắp `updated_at` giảm dần.

## 4. API (package `com.subtitlestudio.playlist`)

| Endpoint | Phản hồi |
|---|---|
| `GET /api/playlists[?videoId=X]` | `[{id, name, description, videoCount, thumbnailUrl, updatedAt, containsVideo?}]`; `thumbnailUrl` = ảnh video ở `position` 1 (null nếu trống); `containsVideo` chỉ có khi truyền `videoId` |
| `POST /api/playlists` `{name, description?}` | 201 + `PlaylistDetailDto` |
| `GET /api/playlists/{id}` | `PlaylistDetailDto {id, name, description, updatedAt, videos: VideoDto[]}` theo `position` |
| `PATCH /api/playlists/{id}` `{name?, description?}` | 200 + `PlaylistDetailDto` |
| `DELETE /api/playlists/{id}` | 204 |
| `POST /api/playlists/{id}/videos` `{videoId}` | 200 + `PlaylistDetailDto`; đã có thì giữ nguyên vị trí |
| `DELETE /api/playlists/{id}/videos/{videoId}` | 204; không có thì vẫn 204 |
| `PUT /api/playlists/{id}/order` `{videoIds}` | 200 + `PlaylistDetailDto` |

**Lỗi** (`ProblemDetail` + `code`): `PLAYLIST_NOT_FOUND` 404; `INVALID_PLAYLIST` 400 kèm `fieldErrors` (`name`, `description`) như `INVALID_BLOCK` của Profile; `VIDEO_NOT_FOUND` 404; `VIDEO_HAS_NO_VIETSUB` 409; `INVALID_PLAYLIST_ORDER` 400. Thông điệp tiếng Anh (quy ước giao diện).

## 5. Menu Vietsub (quản lý)

| Route | Nội dung |
|---|---|
| `/vietsub` | Như hiện tại + tab **Videos \| Playlists** dưới tiêu đề; mỗi dòng Manage Vietsub thêm nút icon **Save to playlist** (`<Tip>`) |
| `/vietsub/playlists` (mới) | **+ New playlist** (form tên + mô tả); danh sách playlist: ảnh bìa, tên, số video, ngày sửa, **Edit**, **Delete** (hộp xác nhận `useConfirmDialog`) |
| `/vietsub/playlists/:id` (mới) | Sửa tên/mô tả tại chỗ, số video, **▶ Play all**, **Delete playlist**; danh sách đánh số với tay nắm kéo thả, nút ↑ ↓, nút ✕ gỡ; trống → `EmptyState` "Use Save to playlist in the Videos tab to add videos." |

- **Popover Save to playlist** (`@radix-ui/react-popover`): `GET /api/playlists?videoId=…`; ô tick lưu ngay (thêm/gỡ) + toast "Saved to …" / "Removed from …"; "+ New playlist" (Enter) tạo rồi thêm video; Esc / bấm ngoài để đóng.
- **Kéo thả** (`@dnd-kit/core` + `@dnd-kit/sortable`, có keyboard sensor): thả là `PUT …/order`; lỗi → trả thứ tự cũ + báo lỗi. Nút ↑ ↓ dùng cùng lời gọi.
- Route mới thêm vào `SpaForwardController` (+ test).
- Version thư viện cố định, đã phát hành ≥ 2 tuần lúc cài.

## 6. Vietsub list (chỉ xem)

- Ô **search** (nút ✕ xoá) lọc client-side theo tên video và tên kênh, không phân biệt hoa thường và dấu (chuẩn hoá NFD, bỏ dấu, `đ`→`d`); không kết quả → `EmptyState` "No videos match "…"".
- **Chips**: `All (n)` + mỗi playlist `Tên (n)`; cuộn ngang trên màn hẹp.
- **All**: như hiện tại (video có Vietsub, mới cập nhật trước); bấm → `/vietsub/:id`.
- **Playlist**: khung đầu (ảnh bìa, tên, mô tả, "N videos", **▶ Play all**) + danh sách đánh số theo `position` (lọc vẫn giữ số gốc); bấm → `/vietsub/:id?playlist=<id>`.
- URL: `?playlist=<id>&q=<text>&page=<n>`; đổi playlist hoặc từ khoá → về trang 1. Playlist không tồn tại → coi như All.

## 7. Trang xem ở chế độ playlist (`/vietsub/:id?playlist=<id>`)

- Khung playlist bên phải (desktop) / dưới player (≤ 760px): tên playlist, "i / n", **Previous** / **Next**, công tắc **Autoplay** (`localStorage`, mặc định bật, bọc try/catch), danh sách đánh số có ảnh nhỏ; video đang xem tô sáng + dấu ▶ và được cuộn vào tầm nhìn; bấm → chuyển video (giữ `?playlist`).
- Hết video (`ended`) + Autoplay bật + còn video sau → chuyển ngay sang video kế tiếp; video cuối → dừng, hiện "End of playlist".
- Chuyển video giữ nguyên khung player (fullscreen giữ nguyên); player mới được tạo với `autoplay: 1` khi chuyển từ Autoplay/Previous/Next/bấm trong danh sách.
- `Shift+N` / `Shift+P`: kế tiếp / trước (bỏ qua khi focus trong ô nhập).
- Playlist không tồn tại hoặc video không có trong playlist → trang xem thường, không báo lỗi.
- Danh sách playlist tải một lần khi mở trang (không theo dõi thay đổi ở tab khác).

## 8. Kiểm thử

| Nhóm | Nội dung |
|---|---|
| Migration `V4` | H2 + Oracle thật (`mvn verify -Poracle`): bảng, sequence, unique `(playlist_id, video_id)` |
| `PlaylistService` | mọi quy tắc mục 3; `containsVideo`; `thumbnailUrl`; sắp `updatedAt` |
| `VietsubService.clear`, `SubtitleService.delete` | gỡ video khỏi mọi playlist |
| Controller | mọi endpoint + mã lỗi + `fieldErrors` |
| Frontend menu Vietsub | tab; popover (tick/bỏ tick/tạo mới/toast); trang sửa (đổi tên, ↑ ↓, gỡ, xoá có xác nhận, kéo thả bằng bàn phím, lỗi lưu thứ tự → trả lại) |
| Frontend Vietsub list | chips; khung playlist; đánh số; search không dấu (cả trong playlist); URL; Back |
| Frontend trang xem | khung; tô sáng; Previous/Next; Autoplay bật/tắt; video cuối dừng; `?playlist` sai bỏ qua; Shift+N/P |
| `SpaForwardController` | `/vietsub/playlists`, `/vietsub/playlists/{id}` trả HTML |
| Kiểm tra tay | deploy; 2 playlist từ video thật; kéo thả bằng chuột; Play all; tự phát qua 2 video, cả khi toàn màn hình |

## 9. Tài liệu

README (mục Playlist, API mới); CLAUDE.md (quy tắc `position` liền mạch, route mới vào `SpaForwardController`); PROGRESS.md (nhật ký).

## 10. Rủi ro

| Rủi ro | Giảm thiểu |
|---|---|
| Trình duyệt chặn tự phát có tiếng | Người dùng đã tương tác với trang; nếu bị chặn, player ở trạng thái sẵn sàng để bấm ▶ |
| Trùng số migration với phiên khác | Kiểm tra trước khi merge |
| Kéo thả khó test trong jsdom | Test bằng keyboard sensor + nút ↑ ↓; kéo chuột kiểm tra tay |
