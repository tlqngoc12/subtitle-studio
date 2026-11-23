# Review chương từ file .md (nút Review ở trang chương)

Ngày: 2026-11-23 · Trạng thái: chờ user duyệt

## Mục đích

Agent `story-reviewer` (Claude Code) review chương truyện sáng tác và xuất bảng **Đoạn cũ → Đoạn mới**. Hiện user phải tự tìm từng đoạn trong trang chương rồi dán tay. Tính năng này cho app tự nạp file review của chương đang mở, gạch chân từng "Đoạn cũ" và thay bằng "Đoạn mới" chỉ với một thao tác, giống cách nút Check đang làm.

## Mục tiêu / Không làm

- Mục tiêu: bấm **Review** ở trang chương → app tự lấy file review mới nhất của đúng chương → gạch chân, thay nhanh.
- Mục tiêu: tên file luôn khớp truyện và chương, kể cả khi đổi thứ tự chương hoặc đổi tên hồ sơ truyện.
- Không làm: không sửa nội dung file review; không lưu trạng thái "đã sửa"; không gọi AI; không upload file qua giao diện.
- Phản mục tiêu: thay nhầm đoạn (đoạn cũ khớp sai chỗ) hoặc nạp nhầm review của chương khác.

## Các cách đã cân nhắc

| Cách | Đánh đổi | Kết quả |
|---|---|---|
| **A. Agent ghi review vào `data/reviews/` của repo** | Không đổi Docker, được sao lưu cùng `./data`, tên dùng thẳng tên hồ sơ truyện; file không nằm cạnh chương nữa | **User chọn** |
| B. Gắn `D:\working\fanfic` vào Docker, app quét thư mục | Review nằm cạnh truyện; app phụ thuộc đường dẫn máy, tên thư mục truyện không khớp tên hồ sơ | Bỏ |
| Upload/dán file mỗi lần ở trang chương | Không cần quy ước tên; thêm thao tác mỗi lần | Bỏ: user muốn app tự nạp |

## Quy ước file

- Thư mục: `./data/reviews/` (trong container `/data/reviews/`). Không commit git (đã nằm trong `/data/*` bị bỏ qua).
- Tên: `review-<Hồ sơ>-ch-<x>-<YYYY-MM-DD>.md`, trùng thì `-v2`, `-v3`… trước `.md`.
  - `<Hồ sơ>`: tên hồ sơ truyện trong app (tên file `data/prompts/novels/<Hồ sơ>.md`, ví dụ `TheDebtCalledYou`).
  - `<x>`: số thứ tự đọc của chương, 1-based, không đệm số 0 — cùng số với tiền tố file export (`005 - …` → `ch-5`).
- **Mới nhất**: ngày lớn nhất; cùng ngày thì `-vN` lớn nhất (không hậu tố = v1).
- Mỗi file chỉ review **một chương**.
- Nội dung app đọc: mọi bảng markdown có hàng tiêu đề chứa đúng các cột `Mục`, `Đoạn cũ`, `Đoạn mới` (cột `Dòng` có thể có, app bỏ qua). Phần còn lại của file (✅/🔴/🟡, tin nhắn cho AI) app không đọc.
- Ô bảng: `\|` là dấu `|` trong chữ; `<br>` là xuống dòng. "Đoạn mới" trống hoặc đúng `(xoá)` = xoá đoạn cũ.

## Agent story-reviewer (`~/.claude/agents/story-reviewer.md`)

- Ghi **mỗi chương một file** vào `D:\working\repositories\subtitle-studio\data\reviews\` theo quy ước trên. Cần biết `<Hồ sơ>`: đọc từ người dùng / tên profile app; không chắc thì hỏi.
- Số `<x>` lấy theo số thứ tự file export (`005 - …` → 5).
- "Đoạn cũ" phải là chuỗi **chép y nguyên, liền mạch** từ chương (không "…", không gộp hai chỗ xa nhau); đủ dài để chỉ khớp một chỗ trong chương. Nếu một lỗi xuất hiện nhiều nơi thì mỗi nơi một hàng.
- Phần tổng hợp nhiều chương (bảng tổng, lỗi lặp, hồ sơ cần sửa) chỉ báo trong chat; tin nhắn cho AI viết thuộc chương nào thì nằm trong file chương đó.

## Backend

- `GET /api/novels/{id}/chapters/{chapterId}/review` → `200 {fileName, markdown}` của file mới nhất; không có → `404` mã `REVIEW_NOT_FOUND` kèm mẫu tên đang tìm (`review-TheDebtCalledYou-ch-5-*.md`). Truyện không có hồ sơ → `404` cùng mã.
- Một lớp `ChapterReviewFiles` (package `novel`) lo: tìm file mới nhất; đổi tên khi đổi thứ tự; chuyển vào `_archive/`; đổi tên khi đổi hồ sơ. Chỉ chạm file khớp đúng mẫu tên của hồ sơ đó.
- **Đổi thứ tự chương** (kéo thả, thêm chương chen giữa, xoá chương, mọi chỗ đổi thứ tự đọc): sau khi thứ tự mới được lưu, so vị trí cũ/mới theo `chapterId` và đổi tên **mọi** bản review (mọi ngày, mọi `-vN`) của chương bị đổi số. Đổi qua tên tạm trước để hoán đổi không đè nhau.
- **Xoá chương**: file review của chương đó chuyển vào `data/reviews/_archive/` (giữ tên, trùng thì thêm hậu tố), không xoá.
- **Đổi tên hồ sơ** (`NovelService` đoạn `profiles.rename(oldProfile, newName, …)`): đổi `review-<cũ>-ch-…` thành `review-<mới>-ch-…`.
- Lỗi đổi tên file: ghi log `warn`, **không** làm hỏng thao tác chính (sắp xếp, xoá, đổi tên truyện). Không log nội dung review.

## Frontend (trang chương, `ChapterPage`)

| Menu | Route | Nội dung |
|---|---|---|
| Novels › Originals | `/novels/:id/chapters/:chapterId` | Nút **Review** cạnh nút Check, chỉ với truyện sáng tác (ORIGINAL) |

- Bấm **Review** → gọi API. Lỗi 404 → `Alert`: *"No review file found (review-TheDebtCalledYou-ch-5-\*.md)"* (chuỗi admin tiếng Anh theo quy tắc app).
- Thành công: tên file hiện nhỏ cạnh nút; mỗi "Đoạn cũ" tìm thấy được gạch chân trong ô sửa; popover (dùng lại `CheckPopover`) hiện mục (`🔴1`, `🟡3`…) và chip "Đoạn mới": nháy đúp / Enter để thay, Ctrl+Z hoàn tác (cùng cơ chế `insertText` của Check).
- Khớp: sau khi chuẩn hoá NFC, gộp khoảng trắng, coi ngoặc kép thẳng/cong như nhau; không phân biệt hoa thường **không** áp dụng (khớp đúng chữ). Một "Đoạn cũ" khớp nhiều chỗ → gạch chân tất cả, popover ghi "n matches".
- Dòng tóm tắt: *"12 to fix · 3 done · 2 not found"*. **Done** = không còn Đoạn cũ nhưng có Đoạn mới trong chương. **Not found** = không thấy cả hai; bấm để xem danh sách (mục + đầu đoạn cũ).
- Review và Check loại trừ nhau: bật cái này thì tắt cái kia.
- Gõ sửa chương thì gạch chân tính lại (debounce như Check); không tải lại file.
- Màu theo quy tắc app: nút Review kiểu nút phụ như Check; trạng thái bật = kiểu "đang chọn" tím.

## Kiểm thử

- Backend: chọn file mới nhất (ngày, `-vN`); 404; đổi tên khi hoán đổi 3↔5, chen chương, xoá (archive); đổi tên hồ sơ; file không khớp mẫu không bị đụng. Dùng thư mục tạm.
- Frontend: đọc bảng (nhiều bảng, `\|`, `<br>`, `(xoá)`, thiếu cột); khớp (ngoặc kép, khoảng trắng); đếm to fix/done/not found; áp dụng chip; Review/Check loại trừ; Alert khi 404.

## Để builder quyết

Vị trí cụ thể của hook đổi thứ tự trong `ChapterService`; tên lớp/hàm; bố cục chi tiết dòng tóm tắt (theo `docs/ui/screen-layout.md`).

## Cập nhật tài liệu

CLAUDE.md (mục Novels), PROGRESS.md; memory agent story-reviewer.
