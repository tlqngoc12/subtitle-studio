# Phase 2: Vietsub thủ công (design spec)

> Ngày: 2026-11-02. Trạng thái: chờ review.
> Nền tảng: Phase 1 (`v0.1.0`), xem [PLAN.md](../../../PLAN.md) và [PROGRESS.md](../../../PROGRESS.md).

## 1. Mục tiêu

Sau khi tải `.srt` tiếng Anh (Phase 1) và dịch tay, người dùng đưa bản tiếng Việt trở lại app để:

1. **Kiểm tra bản dịch** khi xem video: song ngữ, thấy câu gốc, nhảy tới câu cụ thể.
2. **Xem sạch** video chỉ với Vietsub.
3. **Xuất `.vi.srt`** để dùng ở nơi khác.

**Tiêu chí thành công:** dịch xong (hoặc dịch dở) → upload → xem video thấy Vietsub khớp lời nói, biết rõ đã dịch bao nhiêu câu và dòng nào không khớp.

**Ngoài phạm vi** (Phase 3+): sửa câu trực tiếp trên web, lọc "chỉ câu chưa dịch", nhảy tới câu chưa dịch kế tiếp, engine dịch, lịch sử các bản upload.

## 2. Bối cảnh và giả định đã xác nhận

| Điều | Nguồn |
|---|---|
| Khi dịch, người dùng **giữ nguyên cấu trúc**: không đổi số thứ tự, không đổi timecode, chỉ thay text | Người dùng xác nhận |
| Người dùng **dịch thẳng trên file `.srt` tiếng Anh**, nên file dịch dở vẫn đủ số dòng: phần đã dịch là tiếng Việt, phần còn lại vẫn là tiếng Anh gốc | Suy ra từ cách dịch; đã duyệt trong phần 2 |
| Người dùng **upload dần** (bản dịch dở), rồi upload lại bản đầy đủ hơn | Người dùng xác nhận |
| Cần cả chế độ **Kiểm tra** và chế độ **Xem** | Người dùng xác nhận |
| App local, một người dùng; backend REST (Spring Boot), frontend React; cột `cue.text_vi` đã có từ Phase 1 | Phase 1 |

## 3. Dữ liệu

### 3.1 Schema

- `cue.text_vi VARCHAR(1000) NULL`: đã có. `NULL` nghĩa là câu chưa dịch.
- `video` thêm:

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `translated_count` | `INT NOT NULL DEFAULT 0` | Số câu có `text_vi`. Lưu sẵn để danh sách hiện tiến độ mà không phải đếm |
| `translated_at` | `TIMESTAMP NULL` | Lần upload gần nhất; `NULL` khi chưa có hoặc đã xoá bản dịch |

**Nâng cấp DB của Phase 1:** schema vẫn do Hibernate `ddl-auto: update` quản lý. DB thật của người dùng đã có dữ liệu, nên cột mới **bắt buộc có `DEFAULT 0`** (khai báo qua `columnDefinition`); nếu không, H2 từ chối thêm cột `NOT NULL` vào bảng đã có dòng và app không khởi động được. Phải có test khởi động trên một DB tạo bởi schema Phase 1.

### 3.2 Quy ước upload

Mỗi lần upload là **toàn bộ bản dịch tại thời điểm đó** và **thay thế hoàn toàn** bản trước: mọi `text_vi` của video bị xoá rồi ghi lại theo file mới. Không có chế độ "upload thêm phần mới".

## 4. API

### 4.1 Endpoint mới / thay đổi

| Method | Path | Mô tả |
|---|---|---|
| PUT | `/api/videos/{id}/translation` | Upload `.srt` tiếng Việt, `multipart/form-data`, field `file`. Trả 200 kèm `TranslationReport` |
| DELETE | `/api/videos/{id}/translation` | Xoá toàn bộ bản dịch. Trả 204 |
| GET | `/api/videos/{id}/subtitle.vi.srt` | Tải `.vi.srt` (`?bom=true` như bản tiếng Anh) |
| GET | `/api/videos/{id}/cues` | Mỗi cue thêm `textVi` (`null` nếu chưa dịch) |
| GET | `/api/videos`, `/api/videos/{id}` | `VideoDto` thêm `translatedCount` |
| POST | `/api/videos/{id}/refresh` | Thay đổi: bị chặn khi video đã có bản dịch (xem 4.2) |

`TranslationReport`:

```json
{
  "totalCues": 1152,
  "translated": 200,
  "untranslated": 951,
  "unmatched": [
    { "index": 57, "startMs": 213400, "text": "…", "reason": "NO_MATCHING_TIME" }
  ],
  "skippedBlocks": 0
}
```

- `translated`: số dòng đã khớp và đã được dịch (được lưu vào `text_vi`). Sau upload, `video.translated_count = translated`.
- `untranslated`: số dòng khớp được nhưng text vẫn giống câu tiếng Anh gốc (xem 5.2).
- `unmatched`: các dòng không ghép được với câu gốc nào, kèm lý do.
- `skippedBlocks`: số block `.srt` không đọc được.

Giới hạn dung lượng upload: **5 MB** (`spring.servlet.multipart.max-file-size`, `max-request-size`). File `.vi.srt` của video 4 giờ chỉ khoảng 0,5 MB.

### 4.2 Lỗi mới

| Code | HTTP | Khi nào | Ghi chú |
|---|---|---|---|
| `INVALID_SRT` | 400 | Không đọc được block `.srt` nào, hoặc file không phải UTF-8 hợp lệ | |
| `TRANSLATION_NOT_MATCHED` | 422 | Không có dòng nào vừa khớp timecode vừa đã được dịch | **Giữ nguyên bản dịch cũ**. Thường do chọn nhầm file của video khác, hoặc upload file tiếng Anh chưa dịch |
| `NO_TRANSLATION` | 404 | Tải `.vi.srt` khi `translated_count = 0` | |
| `TRANSLATION_EXISTS` | 409 | Làm mới video có `translated_count > 0` | Thông báo hướng dẫn: tải `.vi.srt` về hoặc xoá bản dịch trước |
| `FILE_TOO_LARGE` | 413 | Upload vượt 5 MB | Map từ `MaxUploadSizeExceededException` |

Lý do chặn Làm mới thay vì tự khớp lại bản dịch: Làm mới tạo lại toàn bộ cue; nếu YouTube đổi timing, phần dịch sẽ âm thầm mất. Làm mới hiếm khi cần sau khi đã dịch.

## 5. Đọc file và khớp bản dịch (backend)

### 5.1 `SrtParser` (package `subtitle`)

Đọc `.srt` thành `List<SrtEntry(int index, long startMs, long endMs, String text)>`.

- Chấp nhận: BOM UTF-8; CRLF, LF hoặc CR; nhiều dòng trống liên tiếp; thiếu dòng trống cuối file; mili giây phân cách bằng `,` hoặc `.`; giờ nhiều hơn 2 chữ số; dòng số thứ tự không phải số hoặc bị thiếu (khi đó lấy thứ tự xuất hiện).
- Text nhiều dòng được nối bằng `\n`; mỗi dòng được `strip`; dòng rỗng bị bỏ.
- Giữ nguyên tag như `<i>` trong text. Frontend luôn render dạng văn bản thuần (không dùng `dangerouslySetInnerHTML`), nên không có rủi ro chèn HTML.
- Block không có dòng timing hợp lệ bị bỏ qua và được đếm vào `skippedBlocks`.
- Không đọc được block nào thì ném `InvalidSrtException` (→ `INVALID_SRT`).
- Byte không phải UTF-8 hợp lệ thì ném `InvalidSrtException` (đọc bằng decoder ở chế độ `REPORT`, không âm thầm thay bằng `?`).

### 5.2 `TranslationMatcher` (package `subtitle`)

Đầu vào: danh sách cue gốc của video (đã sắp theo `startMs`, kèm `text_en`) và danh sách `SrtEntry`. Đầu ra: `MatchResult` gồm map `cueIdx → textVi`, số `untranslated`, danh sách `unmatched`.

Với mỗi entry, theo thứ tự trong file:

1. Tìm cue gốc có `startMs` **gần nhất** với `entry.startMs` bằng binary search.
2. Nếu `|chênh lệch| > 100 ms` → `unmatched` với lý do `NO_MATCHING_TIME`.
3. Nếu cue đó đã được một entry trước khớp → `unmatched` với lý do `DUPLICATE_TIME` (giữ entry đầu tiên).
4. Nếu text của entry, sau khi chuẩn hoá, **bằng** text tiếng Anh gốc của cue → tính là `untranslated`, không lưu. Chuẩn hoá: gộp mọi khoảng trắng (kể cả `\n`) thành một dấu cách, `strip`, chuyển thường bằng `Locale.ROOT`.
5. Nếu text dài hơn 1000 ký tự → `unmatched` với lý do `TOO_LONG`.
6. Ngược lại → khớp, lưu text (giữ `\n` giữa các dòng).

Ngưỡng ±100 ms: export của Phase 1 có độ chính xác mili giây và các công cụ chỉnh sửa giữ nguyên timecode, nên khớp thường là chênh 0 ms. Chọn cue **gần nhất** giải quyết trường hợp hai cue gốc cách nhau dưới 200 ms.

Vì khớp theo timecode, file thiếu một block ở giữa chỉ làm đúng câu đó thiếu, các câu sau không bị lệch (khác với khớp theo số thứ tự).

### 5.3 `TranslationService` (package `video`)

- `upload(id, bytes)`:
  1. Video không tồn tại → `VideoNotFoundException`.
  2. Parse và khớp, **chưa ghi DB**.
  3. `translated == 0` → `TranslationNotMatchedException`, không thay đổi gì.
  4. Trong một transaction: đặt `text_vi = NULL` cho mọi cue của video, ghi `text_vi` cho các cue đã khớp, cập nhật `translated_count` và `translated_at` (từ `Clock`).
  5. Trả `TranslationReport`.
- `clear(id)`: xoá mọi `text_vi`, `translated_count = 0`, `translated_at = NULL`.
- `exportVi(id, bom)`: `translated_count == 0` → `NoTranslationException`; ngược lại dùng `SrtWriter` ghi các cue có `text_vi` theo thứ tự `idx`, với timing gốc, đánh số lại từ 1. Tên file `{title}_{id}.vi.srt` (thêm tham số ngôn ngữ cho `SrtWriter.fileName`).
- `SubtitleService.refresh(id)`: nếu `translated_count > 0` → `TranslationExistsException`, kiểm tra **trước** khi gọi yt-dlp.

## 6. Frontend

### 6.1 Điều hướng

- Thêm `react-router`. Hai route:
  - `/`: trang chủ (khung dán link + danh sách đã lấy).
  - `/videos/:id`: trang video, thay cho panel kết quả của Phase 1. Lấy phụ đề xong hoặc mở video từ danh sách đều điều hướng tới đây.
- Backend: một controller **chỉ** forward `/videos/{id}` (và `/videos/{id}/`) về `/index.html`. Không bắt mọi đường dẫn, để `/api/...` sai vẫn trả 404 ProblemDetail.

### 6.2 Trang video

```
← Danh sách
<Tiêu đề>                                  [Kiểm tra | Xem]  [Toàn màn hình]
<kênh>, <thời lượng>, <Manual|Auto-generated>, đã dịch 200/1152 câu ▓▓░░░░
┌──────────── player 16:9 + overlay ───┐ ┌ danh sách câu (chỉ ở Kiểm tra) ┐
└──────────────────────────────────────┘ └─────────────────────────────────┘
Phụ đề: [Tải .srt tiếng Anh] [Upload bản dịch…] [Tải .vi.srt] [Xoá bản dịch]
<báo cáo upload, nếu vừa upload>
```

- Màn hình hẹp (< 760 px): danh sách câu nằm dưới player.
- **Upload:** nút chọn file (`accept=".srt"`). Thành công → hiện báo cáo ngay dưới thanh nút: *"Đã nhận X câu đã dịch, Y câu còn tiếng Anh, Z dòng không khớp"*, kèm danh sách có thể mở rộng của các dòng không khớp (số thứ tự, timecode, text, lý do bằng tiếng Việt). Player, danh sách câu và tiến độ cập nhật ngay.
- **Tải `.vi.srt`:** vô hiệu khi `translatedCount == 0`.
- **Xoá bản dịch:** hỏi xác nhận; chỉ hiện khi `translatedCount > 0`.
- Giữ token màu và font của Phase 1 (Be Vietnam Pro); khung video tối của trang chủ trở thành player thật.

### 6.3 Trang chủ

- Mỗi video trong danh sách hiện thêm *"đã dịch X/Y"* khi `translatedCount > 0`.
- Lỗi `TRANSLATION_EXISTS` khi Làm mới có thông báo tiếng Việt kèm hướng dẫn.

### 6.4 Player và overlay

- **`useYouTubePlayer(videoId)`**: hook bọc YouTube IFrame Player API.
  - Nạp `https://www.youtube.com/iframe_api` một lần; dùng host `https://www.youtube-nocookie.com`.
  - Tham số: `fs: 0` (tắt nút fullscreen của YouTube vì nó che overlay), `playsinline: 1`, `rel: 0`, `iv_load_policy: 3`.
  - Cung cấp: `currentMs`, `seekTo(ms)`, `state`, `error`.
  - Khi đang phát, đọc `getCurrentTime()` theo `requestAnimationFrame`; dừng đọc khi pause hoặc kết thúc.
  - Lỗi 101/150 (video không cho nhúng) → `error = 'EMBED_BLOCKED'`; trang hiện: *"Video này không cho phép phát nhúng. Bạn vẫn tải được .srt và .vi.srt."*
- **`findActiveCue(cues, ms)`**: hàm thuần, binary search, trả cue có `startMs ≤ ms < endMs` hoặc `null`.
- **`SubtitleOverlay`**: lớp phủ trên player (`pointer-events: none`), cỡ chữ theo bề rộng player (container query units).

| | Kiểm tra | Xem |
|---|---|---|
| Câu đã dịch | Dòng tiếng Việt, bên dưới là dòng tiếng Anh nhỏ hơn | Chỉ tiếng Việt |
| Câu chưa dịch | Tiếng Anh mờ, có dấu hiệu "chưa dịch" | Không hiện gì |

- **`CueList`** (chỉ ở chế độ Kiểm tra): mỗi dòng gồm thời gian, EN, VI (hoặc "chưa dịch"); câu đang phát được tô sáng và tự cuộn vào khung nhìn; click một dòng → `seekTo(startMs)`.
- **Toàn màn hình:** nút của app gọi `requestFullscreen()` trên phần tử bao player + overlay, nên overlay vẫn hiện khi fullscreen.
- Chế độ mặc định: **Kiểm tra** khi bản dịch chưa đủ, **Xem** khi `translatedCount == cueCount`. Người dùng chuyển bằng nút gạt.

## 7. Lỗi hiển thị (tiếng Việt)

| Code | Thông báo |
|---|---|
| `INVALID_SRT` | Không đọc được file .srt. Kiểm tra file có đúng định dạng SubRip và lưu bằng UTF-8. |
| `TRANSLATION_NOT_MATCHED` | Không có dòng nào khớp với phụ đề của video này. Bản dịch cũ được giữ nguyên. Có thể bạn chọn nhầm file, hoặc file chưa được dịch. |
| `NO_TRANSLATION` | Video này chưa có câu nào được dịch. |
| `TRANSLATION_EXISTS` | Video đã có bản dịch nên không làm mới được. Tải .vi.srt về hoặc xoá bản dịch trước. |
| `FILE_TOO_LARGE` | File quá lớn (tối đa 5 MB). |

Lý do trong danh sách dòng không khớp: `NO_MATCHING_TIME` → "Không có câu gốc trùng thời điểm", `DUPLICATE_TIME` → "Trùng thời điểm với dòng trước", `TOO_LONG` → "Dài quá 1000 ký tự".

## 8. Test

Vẫn TDD: viết test trước, chạy thấy fail đúng lý do, rồi mới viết code.

| Phần | Loại | Trường hợp chính |
|---|---|---|
| `SrtParser` | Unit | CRLF/LF/CR, BOM, `,` và `.`, giờ > 99, thiếu dòng số thứ tự, block hỏng (`skippedBlocks`), text nhiều dòng, file rỗng, byte không phải UTF-8 |
| `TranslationMatcher` | Unit | Chênh 0/100/101 ms; chọn cue gần nhất khi hai cue gần nhau; text giống tiếng Anh (khác hoa/thường, khoảng trắng) → `untranslated`; thiếu block ở giữa không làm lệch câu sau; trùng timecode; dài > 1000 |
| `TranslationService` | `@DataJpaTest` | Upload thay thế toàn bộ; 0 câu dịch → giữ bản cũ; `translated_count`, `translated_at`; xoá; xuất `.vi.srt` đánh số lại; chưa dịch → `NoTranslation` |
| `SubtitleService.refresh` | `@DataJpaTest` | Có bản dịch → `TranslationExists` và **không gọi yt-dlp** |
| Nâng cấp schema | Test khởi động | DB tạo theo schema Phase 1 (không có cột mới, đã có dòng) → app khởi động, `translated_count = 0` |
| Controller | `@WebMvcTest` | Multipart upload, các code lỗi mới (kể cả 413), header `.vi.srt`, `textVi` trong cues, `translatedCount` |
| SPA forward | `@WebMvcTest` | `/videos/{id}` → forward `index.html`; `/api/khong-co` vẫn 404 |
| Frontend | Vitest + RTL | Router; trang video; upload + báo cáo; tiến độ; vô hiệu/ẩn nút theo `translatedCount`; `findActiveCue` (biên đầu/cuối, khoảng trống, rỗng); overlay theo chế độ với player giả; click câu → `seekTo` |
| Golden (local) | Unit | Thêm cặp `.srt` gốc + `.srt` dịch dở của video thật vào `golden/` (gitignore) để kiểm tra báo cáo khớp |

YouTube IFrame API không unit test được: kiểm tra trong checklist test tay (phát, pause, tua, fullscreen, video cấm nhúng).

## 9. Các bước triển khai

| # | Việc |
|---|---|
| P2-T01 | `SrtParser` + `InvalidSrtException` |
| P2-T02 | `TranslationMatcher` |
| P2-T03 | Schema (`translated_count DEFAULT 0`, `translated_at`) + test nâng cấp từ DB Phase 1; `TranslationService` (upload, clear, exportVi); chặn refresh |
| P2-T04 | Endpoint + DTO + lỗi mới + giới hạn upload 5 MB + forward `/videos/{id}` |
| P2-T05 | Frontend: router, trang video (thông tin, tải file, upload + báo cáo, xoá bản dịch), tiến độ ở trang chủ, thông báo lỗi mới |
| P2-T06 | Player: `useYouTubePlayer`, `findActiveCue`, `SubtitleOverlay`, `CueList`, hai chế độ, fullscreen, lỗi cấm nhúng |
| P2-T07 | Kiểm chứng với video thật (Definition of Done), cập nhật README, PROGRESS, PLAN; tag `v0.2.0` |

Mỗi bước có test riêng và commit riêng.

## 10. Definition of Done

Với một video thật (ví dụ `9SGDpanrc8U`, 1152 câu):

1. Dịch 20 dòng đầu ngay trong file `.srt` đã tải, upload → báo cáo "20 đã dịch, 1132 còn tiếng Anh, 0 không khớp".
2. Chế độ Kiểm tra: song ngữ đồng bộ với lời nói; câu đang phát được tô sáng; click một câu → tua đúng chỗ.
3. Chế độ Xem: chỉ có Vietsub; bật fullscreen bằng nút của app vẫn thấy overlay.
4. Tải `.vi.srt` → đúng 20 câu, timing gốc, đánh số 1–20.
5. Upload file đã xoá 1 block ở giữa phần đã dịch → chỉ đúng câu đó thiếu, các câu khác giữ nguyên.
6. Làm mới video đã có bản dịch → bị chặn với thông báo hướng dẫn.
7. App khởi động bình thường trên DB thật đã dùng ở Phase 1.

## 11. Rủi ro

- **YouTube IFrame API thay đổi hoặc chặn nhúng:** cô lập trong `useYouTubePlayer`; lỗi cấm nhúng được xử lý rõ ràng.
- **Độ chính xác đồng bộ:** `getCurrentTime()` theo `requestAnimationFrame` cho sai lệch vài chục ms, đủ cho phụ đề.
- **Người dùng lỡ chỉnh timecode khi dịch:** những dòng đó hiện trong `unmatched` với lý do rõ ràng, không bị lưu sai chỗ.
- **Bản dịch trùng nguyên văn tiếng Anh** (tên riêng, câu như "OK"): bị tính là chưa dịch. Chấp nhận ở Phase 2; Phase 3 (sửa trực tiếp) có thể cho đánh dấu thủ công.
