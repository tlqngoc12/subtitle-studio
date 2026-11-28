# Vietsub: Reload from file

Ngày: 2026-11-28 · Trạng thái: user đã duyệt (2026-11-28, "Thêm nút Reload from file")

## Mục đích

Trang `/vietsub/{id}/edit` đọc phụ đề từ database. File `data/subs/{id}.vi_manual.srt` chỉ là bản sao app ghi ra, nên user sửa file trên đĩa thì app không thấy. Nút **Reload from file** nạp lại file đó vào database.

## Backend

- `POST /api/videos/{id}/vietsub/reload-file` → 200 `VideoDto`.
  - Đọc `SubtitleFileStore.path(id, "vi_manual")`. Không có file thì 404, code `VI_MANUAL_FILE_MISSING`.
  - Dùng chung đường nhập với upload (`VietsubService.add`: giới hạn cỡ, parse SRT, thay toàn bộ cue trong một transaction, nguồn `MANUAL`). Tách phần dùng chung ra hàm riêng, không gọi lại `subtitleService.fetch` (video phải có sẵn, không có thì 404 như hiện nay).
  - Khác upload: **giữ nguyên trạng thái edit** (không tự đặt DONE) và **không ghi lại file** (file chính là nguồn).
  - SRT lỗi → lỗi parse như upload.
- `VideoDto` thêm `viManualFile: boolean` (`SubtitleFileStore.hasViManual`).
- Test: nạp đúng cue từ file, giữ edit status, không ghi đè file, thiếu file 404, file lỗi.

## Frontend (`VietsubEditPage`)

- Nút **Reload from file** (icon lucide `FileUp` hoặc `RotateCcw`) cạnh các nút hành động của trang, theo `docs/ui/screen-layout.md`.
  - Mờ khi `viManualFile` false, tooltip "No vi_manual.srt file for this video."
- Bấm → dialog xác nhận:
  > **Reload subtitles from {id}.vi_manual.srt?**
  > Every line will be replaced by the file's content. Edits in the app that are not in the file will be lost.

  Nếu editor đang có thay đổi chưa lưu, thêm câu "You have unsaved changes." Nút **Reload** kiểu nguy hiểm (`button--danger-solid`) và **Cancel**.
- Xong: nạp lại cue vào editor (bỏ trạng thái dirty), toast "Reloaded from file". Lỗi → toast lỗi theo `code` (thêm `VI_MANUAL_FILE_MISSING` vào `lib/errors.ts`).
- Test: nút mờ/hiện, Cancel không gọi API, Reload gọi API và cập nhật editor, câu unsaved changes, lỗi.

## Tài liệu

`CLAUDE.md` mục Vietsub: endpoint mới, file vi_manual là bản sao nhưng có thể nạp lại bằng nút này.
