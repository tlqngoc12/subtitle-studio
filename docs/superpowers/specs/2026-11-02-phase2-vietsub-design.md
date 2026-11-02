# Phase 2: Xem video với Vietsub (design spec)

> Ngày: 2026-11-02. Trạng thái: chờ review (bản rút gọn, thay bản đầu cùng ngày).
> Nền tảng: Phase 1 (`v0.1.0`), xem [PLAN.md](../../../PLAN.md) và [PROGRESS.md](../../../PROGRESS.md).

## 1. Mục tiêu

Người dùng dán URL YouTube và upload file `.srt` tiếng Việt đã dịch, rồi **xem video đó trên YouTube kèm Vietsub** ngay trong app.

**Luồng:**
1. Màn hình **Vietsub**: nhập URL + chọn file `.srt` → "Thêm Vietsub".
2. Cùng màn hình đó: **danh sách video đã có Vietsub** → bấm "Xem".
3. Màn hình **xem** (màn hình kết quả cuối cùng): phát video YouTube, Vietsub hiện đúng thời điểm, có nút toàn màn hình.

**Tiêu chí thành công:** thêm Vietsub cho một video, mở màn hình xem, Vietsub hiện khớp lời nói, kể cả khi toàn màn hình.

**Ngoài phạm vi** (để Phase 3+): chế độ kiểm tra song ngữ, danh sách câu và tua theo câu, tiến độ dịch, khớp bản dịch với câu tiếng Anh, xuất `.vi.srt`, sửa câu trực tiếp, engine dịch.

## 2. Giả định đã xác nhận

| Điều | Nguồn |
|---|---|
| File `.srt` tiếng Việt do người dùng cung cấp, **dịch từ file Engsub gốc và giữ nguyên timing** | Người dùng xác nhận |
| Màn hình xem chỉ cần **video + Vietsub** (+ toàn màn hình), đây là màn hình kết quả cuối | Người dùng xác nhận |
| Có màn hình riêng liệt kê video có Vietsub; trang Phase 1 giữ nguyên | Người dùng xác nhận |
| App local, một người dùng; backend REST (Spring Boot), frontend React | Phase 1 |

Vì timing đã có sẵn trong file, Vietsub được **lưu và phát theo timing của chính file**, không cần khớp với câu tiếng Anh.

## 3. Dữ liệu

### 3.1 Bảng mới `vi_cue`

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | `BIGINT` identity | PK |
| `video_id` | `VARCHAR(11)` | FK → `video.id`, có index |
| `idx` | `INT` | thứ tự sau khi sắp theo `start_ms`; unique `(video_id, idx)` |
| `start_ms` | `BIGINT` | |
| `end_ms` | `BIGINT` | |
| `text` | `VARCHAR(1000) NOT NULL` | nhiều dòng nối bằng `\n`, dạng Unicode NFC |

### 3.2 Bảng `video` thêm cột

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `vi_cue_count` | `INT NOT NULL DEFAULT 0` | số câu Vietsub; `> 0` nghĩa là video có Vietsub |
| `vi_updated_at` | `TIMESTAMP NULL` | lần thêm/thay Vietsub gần nhất |

**Nâng cấp DB của Phase 1:** schema do Hibernate `ddl-auto: update` quản lý. DB thật của người dùng đã có dữ liệu, nên `vi_cue_count` **bắt buộc có `DEFAULT 0`** (khai báo qua `columnDefinition`); nếu không, H2 từ chối thêm cột `NOT NULL` và app không khởi động được. Phải có test khởi động trên DB tạo theo schema Phase 1.

Cột `cue.text_vi` của Phase 1 **không dùng** ở Phase 2 (để dành cho Phase 3).

### 3.3 Quy tắc

- Thêm Vietsub cho video đã có Vietsub → **thay toàn bộ** Vietsub cũ.
- Xoá video ở trang Phase 1 → xoá luôn Vietsub của nó (trước khi xoá `video`, vì có FK).
- Làm mới Engsub (Phase 1) **không ảnh hưởng** Vietsub, vì hai bộ phụ đề độc lập.

## 4. Đọc file `.srt`: `SrtParser` (package `subtitle`)

Đọc `.srt` thành `SrtParseResult(List<SrtEntry(int index, long startMs, long endMs, String text)> entries, int skippedBlocks)`.

- Chấp nhận: BOM UTF-8; CRLF, LF hoặc CR; nhiều dòng trống liên tiếp; thiếu dòng trống cuối file; mili giây phân cách bằng `,` hoặc `.`; giờ nhiều hơn 2 chữ số; thiếu dòng số thứ tự (khi đó lấy thứ tự xuất hiện).
- Text nhiều dòng nối bằng `\n`; mỗi dòng được `strip`; dòng rỗng bị bỏ. Giữ nguyên tag như `<i>`.
- Block không có dòng timing hợp lệ bị bỏ qua và được đếm vào `skippedBlocks`.
- Không đọc được block nào, hoặc file không phải UTF-8 hợp lệ (kể cả UTF-16), thì ném `InvalidSrtException` (→ `INVALID_SRT`).

## 5. Lưu Vietsub: `VietsubService` (package `video`)

`VideoDto add(String url, byte[] srt)`:

1. `UrlParser.parse(url)` → `videoId` (`INVALID_URL` nếu sai).
2. Parse `.srt` **trước** mọi lời gọi mạng, để file hỏng báo lỗi ngay mà không gọi YouTube.
3. Chuẩn hoá từng câu: text sang NFC; bỏ câu có text rỗng; câu dài hơn 1000 ký tự → `InvalidSrtException("Block <index> is longer than 1000 characters")`; sắp theo `startMs` (giữ thứ tự file khi trùng); `endMs <= startMs` → bỏ câu đó.
4. Không còn câu nào → `InvalidSrtException("No subtitle text found")`.
5. Video chưa có trong DB → `SubtitleService.fetch(url)` (pipeline Phase 1, lấy thông tin video và Engsub). Lỗi của bước này (`YTDLP_FAILED`, `NO_ENGLISH_SUBTITLE`…) được trả nguyên.
6. Trong một transaction: xoá `vi_cue` cũ của video, ghi các câu mới (`idx` từ 0), cập nhật `vi_cue_count` và `vi_updated_at` (từ `Clock`).
7. Trả video.

`void clear(String id)`: xoá mọi `vi_cue`, `vi_cue_count = 0`, `vi_updated_at = NULL`. Video không tồn tại → `VideoNotFoundException`.

`List<ViCue> getCues(String id)`: các câu theo `idx`. Video không tồn tại → `VideoNotFoundException`; chưa có Vietsub → danh sách rỗng.

`SubtitleService.delete(id)`: xoá `vi_cue` của video trước khi xoá `cue` và `video`.

## 6. API

| Method | Path | Mô tả |
|---|---|---|
| POST | `/api/vietsub` | `multipart/form-data`: field `url` (text) và `file` (.srt). Trả 200 `VideoDto` |
| GET | `/api/videos/{id}/vietsub` | Danh sách `{ "startMs", "endMs", "text" }` theo thứ tự thời gian |
| DELETE | `/api/videos/{id}/vietsub` | Xoá Vietsub. Trả 204 |
| GET | `/api/videos`, `/api/videos/{id}` | `VideoDto` thêm `viCueCount` (number) và `viUpdatedAt` (ISO string hoặc `null`) |

"Thay Vietsub" từ danh sách dùng lại `POST /api/vietsub` với `url` là videoId (UrlParser chấp nhận ID trần).

Giới hạn upload: **5 MB** (`spring.servlet.multipart.max-file-size`, `max-request-size`).

**Lỗi mới:**

| Code | HTTP | Khi nào |
|---|---|---|
| `INVALID_SRT` | 400 | File không đọc được, không phải UTF-8, không có câu nào, hoặc có câu dài hơn 1000 ký tự |
| `FILE_TOO_LARGE` | 413 | Upload vượt 5 MB (`MaxUploadSizeExceededException`) |

Các lỗi của Phase 1 (`INVALID_URL`, `NO_ENGLISH_SUBTITLE`, `YTDLP_FAILED`, `YTDLP_TIMEOUT`, `VIDEO_NOT_FOUND`) giữ nguyên.

**Forward route SPA:** một controller **chỉ** forward `/vietsub` và `/vietsub/{id}` (kèm dạng có `/` ở cuối) về `/index.html`; `/api/...` sai vẫn trả 404 ProblemDetail.

## 7. Frontend

### 7.1 Điều hướng

`react-router`, ba route:

| Route | Trang |
|---|---|
| `/` | Trang Phase 1 (giữ nguyên hành vi) |
| `/vietsub` | Trang Vietsub: form thêm + danh sách |
| `/vietsub/:id` | Màn hình xem |

Thanh điều hướng trên cùng có hai mục: **Lấy Engsub** (`/`) và **Vietsub** (`/vietsub`); mục hiện tại có `aria-current="page"`.

Trang Phase 1: video có `viCueCount > 0` hiện thêm link **"Xem Vietsub"** tới `/vietsub/:id`.

### 7.2 Trang Vietsub (`/vietsub`)

- Form: ô **"Link YouTube"**, ô chọn file **"File Vietsub (.srt)"** (`accept=".srt"`), nút **"Thêm Vietsub"**. Thiếu URL hoặc file thì không gửi. Trong lúc gửi: nút đổi thành "Đang thêm…" và bị vô hiệu (video mới cần lấy thông tin từ YouTube, có thể mất 10–20 giây).
- Thành công → chuyển tới `/vietsub/:id`.
- Danh sách: các video có `viCueCount > 0`, mới cập nhật trước (`viUpdatedAt` giảm dần). Mỗi dòng: thumbnail, tiêu đề, "N câu", nút **Xem** (link), **Thay Vietsub** (chọn file → gửi với `url = id`), **Xoá Vietsub** (hỏi xác nhận).
- Chưa có video nào: *"Chưa có video nào có Vietsub. Dán link YouTube và chọn file .srt ở trên để bắt đầu."*
- Lỗi hiển thị theo `code` (mục 7.4).

### 7.3 Màn hình xem (`/vietsub/:id`)

- Link **"← Danh sách Vietsub"**, tiêu đề video, kênh.
- Khung player 16:9 với overlay Vietsub và nút **"Toàn màn hình"**.
- **`useYouTubePlayer(container, videoId)`**: hook bọc YouTube IFrame Player API.
  - Nạp `https://www.youtube.com/iframe_api` một lần; host `https://www.youtube-nocookie.com`.
  - Tham số: `fs: 0` (tắt nút fullscreen của YouTube vì nó che overlay), `playsinline: 1`, `rel: 0`, `iv_load_policy: 3`.
  - Cung cấp `currentMs`, `state`, `error`. Khi đang phát, đọc `getCurrentTime()` theo `requestAnimationFrame`; dừng đọc khi pause/kết thúc; `destroy()` khi unmount.
  - Lỗi 101/150 → `EMBED_BLOCKED`; script không tải được → `LOAD_FAILED`.
- **`findActiveCue(cues, ms)`**: hàm thuần; trả câu có `startMs ≤ ms < endMs`; nếu nhiều câu chồng nhau, trả câu bắt đầu muộn nhất; không có thì `null`.
- **`SubtitleOverlay`**: lớp phủ đáy player (`pointer-events: none`), chữ trắng trên nền tối bán trong suốt, cỡ chữ theo bề rộng player (container query units); render dạng văn bản thuần (không `dangerouslySetInnerHTML`), giữ xuống dòng.
- **Toàn màn hình:** nút của app gọi `requestFullscreen()` trên khung bao player + overlay.
- Video chưa có Vietsub (`viCueCount == 0`): *"Video này chưa có Vietsub."* kèm link về trang Vietsub.

### 7.4 Thông báo lỗi (tiếng Việt)

| Code | Thông báo |
|---|---|
| `INVALID_SRT` | Không đọc được file .srt. Kiểm tra file đúng định dạng SubRip và lưu bằng UTF-8. (kèm chi tiết từ server) |
| `FILE_TOO_LARGE` | File quá lớn (tối đa 5 MB). |
| `EMBED_BLOCKED` (frontend) | Video này không cho phép phát nhúng trong app. |
| `LOAD_FAILED` (frontend) | Không tải được trình phát YouTube. Kiểm tra kết nối mạng. |

Các code của Phase 1 dùng thông báo đã có.

## 8. Test

Vẫn TDD: viết test trước, chạy thấy fail đúng lý do, rồi mới viết code.

| Phần | Loại | Trường hợp chính |
|---|---|---|
| `SrtParser` | Unit | CRLF/LF/CR, BOM, `,`/`.`, giờ > 99, thiếu dòng số thứ tự, block hỏng, text nhiều dòng, file rỗng, UTF-16, byte không phải UTF-8 |
| `VietsubService` | `@DataJpaTest` | Thêm cho video đã có; video chưa có → gọi `fetch`; thay toàn bộ; file hỏng → không gọi YouTube, không đổi dữ liệu; NFC; câu > 1000 ký tự; sắp theo thời gian; bỏ câu rỗng/timing sai; xoá; `getCues` |
| `SubtitleService.delete` | `@DataJpaTest` | Video có Vietsub → xoá được, không lỗi FK |
| Nâng cấp schema | Test khởi động | DB theo schema Phase 1 (đã có dòng) → app khởi động, `vi_cue_count = 0` |
| Controller | `@WebMvcTest` | Multipart `url` + `file`, `INVALID_SRT`, `FILE_TOO_LARGE`, GET/DELETE vietsub, `viCueCount` trong `VideoDto` |
| SPA forward | `@WebMvcTest` | `/vietsub`, `/vietsub/{id}` → forward `index.html`; `/api/khong-co` vẫn 404 |
| Frontend | Vitest + RTL | Điều hướng; form thêm (gửi đúng, khoá nút khi đang gửi, chuyển trang); danh sách (lọc, sắp xếp, thay, xoá); link "Xem Vietsub" ở trang Phase 1; `findActiveCue`; overlay theo thời gian (player giả); toàn màn hình; lỗi cấm nhúng; markup hiện dạng văn bản |

YouTube IFrame API không unit test được: kiểm tra trong checklist test tay (phát, pause, tua, toàn màn hình, video cấm nhúng).

## 9. Các bước triển khai

| # | Việc |
|---|---|
| P2-T01 | `SrtParser` + `InvalidSrtException` |
| P2-T02 | Schema (`vi_cue`, `vi_cue_count DEFAULT 0`, `vi_updated_at`) + test nâng cấp DB Phase 1; `VietsubService`; `SubtitleService.delete` xoá cả Vietsub |
| P2-T03 | `VietsubController`, `VideoDto` thêm field, lỗi mới, giới hạn upload, forward `/vietsub/**` |
| P2-T04 | Frontend: router, thanh điều hướng, trang Vietsub (form + danh sách), link "Xem Vietsub" ở trang Phase 1 |
| P2-T05 | Frontend: màn hình xem (player, overlay, toàn màn hình, lỗi) |
| P2-T06 | Kiểm chứng với video thật, cập nhật README/PROGRESS/PLAN; tag `v0.2.0` khi người dùng đồng ý |

## 10. Definition of Done

Với một video thật đã có Engsub từ Phase 1:

1. Dịch file `.srt` (giữ timing), vào trang Vietsub, dán URL + chọn file → chuyển sang màn hình xem.
2. Phát video: Vietsub hiện khớp lời nói; pause/tua vẫn đúng.
3. Bấm "Toàn màn hình" của app: Vietsub vẫn hiện.
4. Thêm Vietsub bằng URL của một video **chưa có** trong app → app tự lấy thông tin video rồi lưu Vietsub.
5. "Thay Vietsub" bằng file khác → màn hình xem dùng bản mới.
6. Xoá video ở trang Phase 1 → không lỗi; video biến mất khỏi danh sách Vietsub.
7. App khởi động bình thường trên DB thật đã dùng ở Phase 1.

## 11. Rủi ro

- **YouTube IFrame API thay đổi hoặc video chặn nhúng:** cô lập trong `useYouTubePlayer`; lỗi cấm nhúng có thông báo rõ.
- **Độ chính xác đồng bộ:** `getCurrentTime()` theo `requestAnimationFrame` cho sai lệch vài chục ms, đủ cho phụ đề.
- **File dịch dở còn dòng tiếng Anh:** hiện nguyên văn như trong file; chấp nhận vì Phase 2 phát đúng nội dung người dùng cung cấp.
