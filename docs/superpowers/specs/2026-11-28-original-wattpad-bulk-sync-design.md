# Truyện sáng tác: Sync with Wattpad cho cả truyện

Ngày: 2026-11-28 · Trạng thái: user đã duyệt (2026-11-28)

Tiếp nối [2026-11-28-original-wattpad-sync-design.md](2026-11-28-original-wattpad-sync-design.md) (sync tay từng chương, đã deploy).

## Mục đích

Hiện mỗi chương phải sync tay: mở chương, chọn phần Wattpad, xác nhận. Khi user sửa nhiều chương trên Wattpad thì việc này lặp lại nhiều lần. Tính năng này thêm nút **Sync with Wattpad** ở tab Chapters của trang truyện sáng tác (ví dụ `/novels/7955`). App tự tìm các chương **có bản mới trên Wattpad**, cho user xem danh sách, user xác nhận một lần rồi app sync cả lô.

## Mục tiêu / Không làm

- Mục tiêu:
  - Tab Chapters của truyện ORIGINAL: **Sync with Wattpad**, **Add chapter** và **Export** gom vào một menu **⋯**.
  - App nhớ chương nào ứng với phần Wattpad nào, và biết phần nào trên Wattpad đã sửa sau lần sync gần nhất.
  - **Không bao giờ âm thầm đè** lên chữ user đã sửa trong app.
- Không làm:
  - Không chạy theo lịch, không tự sync khi mở trang.
  - Không đẩy chữ ngược lên Wattpad.
  - Không đổi tiêu đề chương đã có.
  - Không xoá chương khi phần trên Wattpad bị xoá.
  - Truyện dịch, truyện Wattpad và truyện ảnh giữ toolbar như cũ.
- Phản mục tiêu: đè chữ đã sửa trong app mà user không biết trước; ghép nhầm chương với phần.

## Dữ liệu (Flyway V31)

Thêm ba cột vào `t_chapter`, chỉ dùng cho chương ORIGINAL:

- `original_wattpad_part_id VARCHAR2(20 CHAR)`, UNIQUE: phần Wattpad của chương.
  - Không dùng lại `wattpad_part_id`, vì cột đó làm hiện Fetch & translate next và Reload original của truyện dịch.
- `wattpad_synced_hash CHAR(64)`: SHA-256 (hex) của `text_vi` ngay sau lần sync gần nhất. App so mã này với chữ hiện tại để biết user đã sửa trong app chưa.
- `wattpad_modified_at TIMESTAMP`: `modifyDate` của phần trên Wattpad **ở bản vừa sync** (null nếu Wattpad không trả). Danh sách chương dùng cột này để hiện tooltip mà không phải gọi Wattpad.

Ba cột này cùng `source_fetched_at` (đã có, là thời điểm sync gần nhất) được ghi mỗi lần sync, cả sync tay từng chương lẫn sync cả lô. Sync tay ở trang chương (đã có) từ nay cũng ghi `original_wattpad_part_id`. Nếu phần đó đang gắn với chương khác thì gỡ khỏi chương kia; một phần chỉ thuộc một chương.

## Ghép chương ↔ phần và trạng thái

App gọi `storyWithParts` **một lần**, rồi xét từng phần theo thứ tự Wattpad.

**Ghép:**

1. Có chương mang `original_wattpad_part_id` bằng id của phần → ghép với chương đó.
2. Không có thì chọn chương chưa được ghép, có tiêu đề trùng tên phần (chuẩn hoá: trim, gộp khoảng trắng, NFC, không phân biệt hoa thường; cùng luật với nhãn "Same title"). Có nhiều chương trùng thì lấy chương đứng trước theo thứ tự đọc.
3. Vẫn không có → phần mới.

**Trạng thái của mỗi phần** (xét theo thứ tự, gặp dòng nào trước thì lấy dòng đó):

| Trạng thái | Khi nào | Mặc định trong danh sách |
|---|---|---|
| `DELETED` | Phần bị xoá trên Wattpad | Chỉ hiện, không chọn được |
| `PUBLISHED` | Chương ghép được đang Published | Chỉ hiện, không chọn được: "Unpublish to sync" |
| `UP_TO_DATE` | Đã từng sync, chữ trong app chưa sửa, và `modifyDate` trên Wattpad không sau `source_fetched_at` | Ẩn, chỉ đếm "N up to date" |
| `UPDATED` | Đã từng sync, chữ chưa sửa, và Wattpad sửa sau lần sync | **Chọn sẵn** |
| `LOCAL_EDITS` | Đã từng sync nhưng chữ trong app đã khác lần sync (hash lệch) | Không chọn sẵn, cảnh báo "Edited in the app since the last sync" |
| `NOT_SYNCED` | Ghép theo tên nhưng chưa sync lần nào | Không chọn sẵn, cảnh báo "Never synced: the app's text will be replaced" |
| `NEW_PART` | Không có chương nào ghép được | **Chọn sẵn**, sẽ tạo chương Draft mới ở cuối truyện, tiêu đề là tên phần |

Nếu Wattpad không trả `modifyDate` thì phần đã sync tính là `UPDATED`.

Chương trong app không ghép được với phần nào thì không đụng tới.

## Backend

- `GET /api/novels/{id}/wattpad/sync-plan` → `{parts: [{partId, title, modifiedAt, wordCount, status, chapterId, chapterTitle, lastSyncedAt}], upToDate: n}`. `lastSyncedAt` là `source_fetched_at` của chương đã ghép (null nếu chưa sync). Dialog không hiện trường này.
  - Chỉ đọc, gọi Wattpad một lần.
  - Chỉ cho truyện ORIGINAL có link. Không có link thì 409 `NOVEL_NOT_WATTPAD`.
- `POST /api/novels/{id}/wattpad/sync` body `{items: [{partId, chapterId}]}` (`chapterId` null nghĩa là tạo chương mới) → 200 `{synced, created, failed: [{partId, title, code, message}]}`.
  - Server **tính lại** kế hoạch trước khi làm. Mục nào không còn hợp lệ (chương giờ đã Published, đã ghép phần khác, đã bị xoá) thì đưa vào `failed`, không làm.
  - **Không** từ chối `LOCAL_EDITS` hay `NOT_SYNCED`, vì user đã tự chọn và đã xác nhận.
  - Làm lần lượt theo thứ tự Wattpad, nghỉ 500 ms giữa hai phần (như import cũ). Phần lỗi được ghi vào `failed` và không dừng cả lô.
  - Mỗi phần: lấy chữ như sync tay (bỏ ảnh, rỗng thì lỗi `WATTPAD_PART_EMPTY`), rồi ghi `text_vi`, `source_fetched_at`, `original_wattpad_part_id`, `wattpad_synced_hash`, `wattpad_modified_at` trong transaction riêng của phần đó.
  - Chương mới tạo bằng đường tạo chương sẵn có (Draft, cuối truyện, tiêu đề là tên phần). Tên trùng mã với chương khác thì dùng `ChapterTitles.defaultTitle` + `: <tên phần>`.
  - Không gọi Wattpad trong transaction. Log chỉ ghi id và số đếm.
- Mỗi truyện chỉ chạy một lô một lúc. Đang chạy mà bấm nữa thì 409 `WATTPAD_SYNC_RUNNING`.
- Test dùng stub `WattpadClient`: đủ 7 trạng thái, ghép theo id trước tên, hash, tính lại kế hoạch khi POST, lỗi từng phần, tạo chương mới, sync tay cũng ghi id phần và hash.

## Frontend

### Toolbar tab Chapters (chỉ truyện ORIGINAL)

- Toolbar chỉ còn một nút `⋯` (`IconButton`, "Chapter actions"). Menu gồm, theo thứ tự:
  1. **Sync with Wattpad** (icon `RefreshCw`). Truyện chưa có link: mục mờ, tooltip "Add a Wattpad link in Details to sync."
  2. **Add chapter** (icon `Plus`).
  3. **Export** (icon `Download`). Mờ khi chưa có chương, như hiện nay; hiện "Exporting…" khi đang chạy.
- Dùng cùng kiểu menu với `NovelMenu` hoặc `ChapterBar` (mục mờ có tooltip lý do).
- Các loại truyện khác: toolbar giữ nguyên.

### Dialog Sync with Wattpad

1. Mở dialog → gọi `sync-plan` (`LoadingText` "Checking Wattpad…"). Lỗi → `Alert` + Retry.
2. Không có gì để làm (mọi phần đều `UP_TO_DATE`, `DELETED` hoặc `PUBLISHED`): hiện "Everything is up to date with Wattpad." + nút Close.
3. Có việc: hiện danh sách checkbox theo thứ tự Wattpad.
   - Mỗi dòng có tên phần, ngày sửa trên Wattpad (`formatInstantWithTime`), chương sẽ bị thay ("→ Chương 3: …" hoặc "New chapter"), huy hiệu trạng thái và cảnh báo nếu có.
   - Mặc định chọn theo bảng trên. Dưới danh sách có dòng "N chapters up to date".
4. Nút **Sync N** (mờ khi chưa chọn gì) mở bước xác nhận trong dialog:
   > **Sync N chapters from Wattpad?**
   > The text of X chapters will be replaced by their Wattpad version and Y new chapters will be added. Replaced text cannot be restored. Chapter titles stay the same.

   Nút **Sync** và **Cancel**. Nếu có mục `LOCAL_EDITS` hoặc `NOT_SYNCED` được chọn: nút Sync đổi thành kiểu nguy hiểm (đỏ), và câu xác nhận nêu thêm "Z of them were edited in the app or never synced."
5. Đang chạy: "Syncing… (k/N)" khi có được tiến độ, không thì "Syncing…". Dialog bị khoá trong lúc này.
6. Xong: đóng dialog, nạp lại truyện, toast "Synced X, added Y". Có mục lỗi thì toast lỗi nêu số mục lỗi, và dialog giữ danh sách lỗi (tên phần + lý do theo `code`) để user xem.

### Danh sách chương (tab Chapters, chỉ truyện ORIGINAL)

- Chương đã từng sync (`source_fetched_at` khác null) có thêm **icon đã sync** (`CloudCheck`, hoặc `RefreshCw` nếu bản lucide đang dùng không có `CloudCheck`). Icon màu tím `--brand-2-ink` (nghĩa: thông tin), đặt cạnh các huy hiệu trạng thái của dòng.
- Rê chuột hoặc focus vào icon thì hiện tooltip (`Tip`): `Wattpad: 28/11/2026 14:30 · Last synced: 25/11/2026 09:10`.
  - "Wattpad" là `wattpad_modified_at`, tức lúc phần được sửa trên Wattpad **ở bản đã sync**. Muốn biết Wattpad có bản mới hơn chưa thì mở Sync with Wattpad (danh sách chương không gọi Wattpad).
  - Không có `wattpad_modified_at` thì chỉ hiện `Last synced: …`.
  - Ngày giờ qua `formatInstantWithTime`.
  - `aria-label` của icon dùng đúng chữ của tooltip.
- Chương chưa sync: không có icon.
- `ChapterSummary` (trong `NovelDetail.chapters`) thêm `lastSyncedAt` và `wattpadModifiedAt`.

### Trang chương

Dialog sync tay giữ nguyên. Phần chương đang ghép (`original_wattpad_part_id`) được chọn sẵn và có nhãn "Linked", ưu tiên hơn nhãn "Same title".

## Tài liệu

Cập nhật `CLAUDE.md` (mục Truyện sáng tác): V31, ba cột mới, hai endpoint, bảng trạng thái, toolbar mới.
