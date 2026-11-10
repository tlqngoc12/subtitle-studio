# Vietsub edit status + seek-and-play on line focus — Plan

Branch: `feat/vietsub-edit-status` (một PR cho cả hai phần, tiêu đề/mô tả/commit bằng tiếng Anh). Scope UI đã được user duyệt ngày 2026-11-10.

## Part 1 — Edit status

### DB / backend
- Flyway **V11**: thêm cột `edit_status` (VARCHAR, nullable; giá trị `IN_PROGRESS` | `DONE`) vào bảng video. Theo đúng tên bảng/cột và kiểu viết của V1/V3/V9.
- Migration gán sẵn `edit_status = 'DONE'` cho mọi video có `vi_source = 'MANUAL'`, vì user muốn các video Manual đã có coi là Done.
- Thêm enum `EditStatus { IN_PROGRESS, DONE }` vào entity `Video` và `VideoDto` (`editStatus`, nullable).
- Các luật chuyển trạng thái:
  - Lưu text trong editor (`saveVietsubText`):
    - `null` thành `IN_PROGRESS`;
    - `IN_PROGRESS` giữ nguyên;
    - **`DONE` giữ `DONE`**.
  - Upload/Replace một file Vietsub thủ công (`.srt`) thì gán `DONE`.
  - Gemini dịch tự động (AUTO) không đổi `edit_status`. AUTO cũng không bao giờ ghi đè MANUAL.
  - Endpoint mới `PUT /api/videos/{id}/edit-status` với body `{ "status": "DONE" | "IN_PROGRESS" }`, trả `VideoDto`. Có kiểm tra khoá lạc quan (`viUpdatedAt`) giống lúc save nếu hợp lý. Từ chối khi video không có Vietsub hoặc đang TRANSLATING.
  - Video `AUTO` thì không được đánh dấu Done, trả lỗi 409/400 rõ ràng. Thực tế lần save đầu đã biến video thành MANUAL rồi.
- Không đổi timestamp `viUpdatedAt` khi chỉ đổi trạng thái, trừ khi code hiện tại cần. Nếu đổi thì cắt về micro giây (bài học Oracle `TIMESTAMP(6)`).
- **Public export** (`SiteExporter`): chỉ xuất video có `viCueCount > 0 && editStatus == DONE`. Áp dụng cho `videos.json`, `videos/<id>.json` và playlist (tính lại số video/ảnh bìa, playlist rỗng thì không xuất). Cập nhật `SiteExporterTest`.
- `PublicVideo` không thêm field `editStatus`, vì không cần cho khách.
- Test:
  - unit test cho các luật chuyển trạng thái;
  - controller test cho endpoint;
  - test migration qua `PersistenceOracleIT` nếu có kiểm tra cột;
  - chạy `mvn verify -Poracle -Dskip.npm` vì có migration.

### Frontend admin
- `/vietsub/:id/edit` (`VietsubEditPage`), cụm actions ở header gồm:
  - `SourceBadge`;
  - chữ "Unsaved changes";
  - **Save**: `IconButton` icon lucide `Save`, tooltip/label "Save (Ctrl+S)", là nút chính màu cam;
  - **Mark as done**: icon `CircleCheck`, tooltip "Mark as done". Hiện khi `editStatus !== 'DONE'`. Disabled khi còn thay đổi chưa lưu (dirty), đang dịch hoặc đang lưu; tooltip nói rõ lý do "Save your changes first";
  - **Reopen**: icon `RotateCcw`, tooltip "Reopen (back to In progress)". Hiện khi `DONE`.
- Sau khi đổi trạng thái: hiện toast ("Marked as done" / "Reopened") và cập nhật `video` state.
- Dùng `IconButton` + `<Tip>` (Radix tooltip) có sẵn. Không tự vẽ icon.
- `/vietsub` (Manage Vietsub): đặt icon trạng thái ngay cạnh nhãn AI/Manual ở mỗi dòng.
  - `IN_PROGRESS`: `PencilLine`, màu **tím** (`--brand-2-ink`), tooltip "In progress".
  - `DONE`: `CircleCheck`, màu **cam** (`--brand-ink`), tooltip "Done".
  - `null`: không hiện icon.
  - Icon có `aria-label` (hoặc chữ `visually-hidden`) để screen reader đọc được.
- Nếu Manage Vietsub có bộ lọc AI/Manual: chưa thêm lọc theo trạng thái (YAGNI), chỉ ghi vào Backlog.

## Part 2 — Seek + play on line focus (editor)

- `useYouTubePlayer`: thêm `play()` (gọi `playVideo()` khi player sẵn sàng). Trả ra cùng `seekTo`.
- `CueEditorTable`: khi một textarea **nhận focus và dòng đó khác dòng focus trước đó**, gọi `onSeekPlay(startMs)`, tức là `seekTo` rồi `play`.
  - Bấm/di con trỏ trong cùng dòng đang focus thì **không** tua lại.
  - Nhớ dòng focus cuối trong ref. Blur khỏi bảng rồi focus lại đúng dòng đó vẫn không tua. Chỉ tua khi đổi sang dòng khác.
- Không làm hỏng các hành vi đã có:
  - nút `#` vẫn chỉ tua và cuộn;
  - focus không bị dời đi;
  - bảng không tự cuộn khi đang gõ (cơ chế `holding`).
  - Lưu ý: seek do focus sẽ kích hoạt logic "seek thì cuộn tới dòng". Dòng đó vốn đang focus và hiện trên màn hình, nên cuộn kiểu `nearest` không nhảy. Phải kiểm tra lại.
- Readonly (đang dịch) thì không seek/play.
- Test: focus dòng 3 thì gọi seek(start3) + play; focus lại dòng 3 thì không gọi; focus dòng 5 thì gọi lại.

## Docs / wrap-up
- `CLAUDE.md`: thêm luật trạng thái sửa và luật "public chỉ xuất DONE". Thay dòng "public chỉ xuất MANUAL" cũ.
- `PROGRESS.md`: thêm mục mới bằng tiếng Việt. Ghi chú cần deploy (có migration V11) rồi Publish lại.
- Tạo PR theo `~/.claude/CLAUDE.md`. **Không merge, không deploy.**
