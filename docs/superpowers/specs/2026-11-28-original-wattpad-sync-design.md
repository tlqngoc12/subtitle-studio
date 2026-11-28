# Truyện sáng tác: sync chương từ Wattpad

Ngày: 2026-11-28 · Trạng thái: user đã duyệt (2026-11-28)

## Mục đích

User viết truyện sáng tác (Novels › Originals) và đăng lên Wattpad, nhiều khi sửa trực tiếp trên Wattpad. Hiện muốn đưa chữ từ Wattpad về app thì phải chép tay từng chương. Tính năng này cho truyện sáng tác gắn **một link truyện Wattpad**. Ở mỗi chương có thêm hành động **Sync from Wattpad**: hiện danh sách phần (chương) của truyện trên Wattpad, user chọn một phần, xác nhận, rồi app thay toàn bộ chữ chương bằng chữ của phần đó.

## Mục tiêu / Không làm

- Mục tiêu: nhập/sửa/xoá link Wattpad cho truyện ORIGINAL, ví dụ `https://www.wattpad.com/story/420481110`.
- Mục tiêu: ở trang chương (Draft), chọn một phần Wattpad → hộp xác nhận → chữ chương (`text_vi`) bị thay bằng chữ phần đó.
- Không làm (đã chốt với user):
  - **Tiêu đề chương giữ nguyên**, chỉ thay chữ.
  - **Chỉ chương Draft**: chương Published phải Unpublish trước.
  - **Bỏ ảnh**, chỉ lấy chữ. Truyện sáng tác chưa hỗ trợ ảnh trong chương.
- Không làm: không tạo chương mới từ Wattpad; không sync hàng loạt; không tự sync theo lịch; không dịch; không ghi nhớ chương nào ứng với phần nào; không đẩy chữ ngược lên Wattpad.
- Phản mục tiêu: ghi đè chữ mà user không biết trước; gắn nhầm phần của truyện khác; làm truyện sáng tác bị coi là truyện Wattpad dịch (hiện tab Wattpad, nút Fetch & translate next…).

## Các cách đã cân nhắc

| Chủ đề | Cách | Kết quả |
|---|---|---|
| Lưu link | **A. Dùng lại cột `t_novel.wattpad_story_id`** (đã UNIQUE; mọi chỗ coi truyện là Wattpad đều kiểm tra `source_type = WATTPAD`) | **Chọn**: không cần migration |
| | B. Thêm cột riêng `t_novel.original_wattpad_story_id` | Bỏ: trùng nghĩa, phải thêm cả ràng buộc UNIQUE |
| Ghi chữ | **A. Server lấy chữ và ghi luôn** (`POST`, giống Reload original) | **Chọn**: kiểm tra Draft/bận ở một chỗ, dễ test |
| | B. Server chỉ trả chữ, frontend đổ vào editor rồi Save | Bỏ: luật "chỉ Draft" nằm ở frontend; autosave lưu ngay nên cũng không có lợi gì thêm |
| Nhớ phần ↔ chương | Lưu vào `t_chapter.wattpad_part_id` | Bỏ: cột này đang làm hiện Fetch & translate next / Reload original. Thay vào đó gợi ý bằng tên (xem dưới) |
| Chỗ đặt nút | **Menu ⋯ của trang chương** (cạnh Export chapter) | **Chọn**: đúng chỗ đang sửa chữ, hộp xác nhận nhắc được cả phần chưa lưu |
| | Thêm nút ở từng dòng tab Chapters | Để sau nếu cần: danh sách chương hiện chưa có hành động theo dòng |

## Dữ liệu

- Không có migration. Truyện ORIGINAL được phép có `wattpad_story_id` (trước đây validator luôn đặt null).
- `t_chapter` không đổi: chương sync xong vẫn là chương ORIGINAL bình thường (`source_text` null, `wattpad_part_id` null, chữ ở `text_vi`).

## Backend

### Link truyện (tạo/sửa truyện ORIGINAL)

- `NovelRequest` thêm `wattpadUrl` (String, chỉ dùng cho ORIGINAL; các loại khác bỏ qua).
- `NovelValidator`, với ORIGINAL:
  - Trống → `wattpadStoryId = null` (xoá link).
  - Có giá trị → `WattpadLink.storyId(url)` (vẫn là chỗ duy nhất tách id). Link chương (`WattpadLink.isChapterLink`) → lỗi field `wattpadUrl`: "Paste the story link (wattpad.com/story/…), not a chapter link." Link khác → "Use a Wattpad story link (wattpad.com/story/…)."
  - `wattpadStoryId` gửi thẳng từ client bị bỏ qua đối với ORIGINAL.
- `NovelService.create` và `update`: story id đã gắn với truyện khác → `DuplicateWattpadNovelException` (409 `DUPLICATE_WATTPAD_NOVEL`, như hiện nay). `update` hiện chưa kiểm tra, cần thêm (bỏ qua chính truyện đó).
- `NovelDetail` / `NovelSummary` đã có `wattpadStoryId`, không đổi.

### Danh sách phần

- `GET /api/novels/{id}/wattpad/parts` cho phép thêm truyện ORIGINAL có link. Hiện `WattpadNovelService.wattpadNovel` chỉ nhận WATTPAD; tách thành `linkedStory(novelId)` nhận WATTPAD **hoặc** ORIGINAL có `wattpadStoryId`. Các endpoint khác (import, fetch-translate, next) **vẫn** chỉ nhận WATTPAD.
- Truyện không có link → 409 `NOVEL_NOT_WATTPAD` (như hiện nay).
- Trả `WattpadPartRow` như cũ. Với ORIGINAL, `importedChapterId` luôn null.

### Sync một chương

- `POST /api/chapters/{id}/wattpad-sync` body `{partId}` → 200 `ChapterDetail`.
- `WattpadNovelService.syncOriginal(chapterId, partId)`, theo thứ tự:
  1. `ChapterService.syncablePart(chapterId)` (transaction chỉ đọc): chương phải thuộc truyện ORIGINAL có link (không thì 409 `NOVEL_NOT_WATTPAD`), phải là Draft (không thì `ChapterPublishedException`, 409 như hiện nay); trả `storyId`.
  2. Ngoài transaction: `wattpad.storyWithParts(storyId)`. `partId` không có trong danh sách → 404 `WATTPAD_PART_NOT_FOUND`; phần `deleted` → 409 `WATTPAD_PART_DELETED`.
  3. `wattpad.partText(partId)` → `WattpadText.parse(html)`, **bỏ** mọi chỗ ảnh (không tải ảnh), giữ đoạn và dòng ngắt cảnh `***` như truyện Wattpad. Chữ rỗng → 409 `WATTPAD_PART_EMPTY`.
  4. `ChapterService.replaceOriginalText(chapterId, text)` (transaction): kiểm tra lại Draft, đặt `text_vi`, `touch`. Tiêu đề, trạng thái, `ai_text`, check/review không đổi. Áp dụng cùng giới hạn độ dài với `PUT /api/chapters/{id}` (`text`); quá dài thì lỗi như khi lưu tay.
- Wattpad lỗi/không trả lời → `WattpadUnavailableException` (502, như hiện nay). Không bao giờ gọi Wattpad trong transaction. Log chỉ ghi id và số ký tự, không ghi chữ chương.
- Test dùng stub `WattpadClient`, không gọi Wattpad thật.

## Frontend

### Form truyện (tab Details và New story, chỉ khi `original`)

- Thêm field **Wattpad link (optional)** dưới Author. Hint: "Paste the story link to sync chapters from Wattpad." Sửa truyện có `wattpadStoryId` thì điền sẵn `https://www.wattpad.com/story/<id>`. Lỗi field `wattpadUrl` hiện ngay dưới ô như các field khác.
- `NovelInput` thêm `wattpadUrl`; chỉ gửi khi `original`.
- Trang truyện ORIGINAL **vẫn không có** tab Wattpad.
- `FanficsTab` chỉ ghép `wattpadStoryId` → novel với truyện không phải ORIGINAL, để thẻ fanfic không trỏ nhầm sang truyện sáng tác.

### Trang chương (chỉ truyện ORIGINAL có link)

- Menu ⋯ thêm mục **Sync from Wattpad** (icon `RefreshCw` hoặc `Download`):
  - Mờ khi chương Published, tooltip "Unpublish to sync from Wattpad."; mờ khi `locked`, như các mục khác.
  - Truyện không có link thì không hiện mục này.
- Bấm vào → dialog **Sync from Wattpad**:
  1. Đang tải: `LoadingText` "Loading Wattpad chapters…" (gọi `GET /api/novels/{id}/wattpad/parts` **một lần** mỗi lần mở dialog, không poll).
  2. Danh sách phần theo thứ tự Wattpad (radio): tên phần, số từ, ngày sửa (`formatInstant`). Phần `deleted` mờ, không chọn được. Phần có tên trùng tiêu đề chương (so sánh sau khi bỏ khoảng trắng thừa, không phân biệt hoa thường, NFC) được **chọn sẵn** và có nhãn "Same title". Lỗi tải → `Alert` + nút Retry.
  3. Nút chính **Sync** (mờ khi chưa chọn) → bước xác nhận ngay trong dialog:
     > **Replace this chapter's text?**
     > Are you sure you want to replace the text of "‹tiêu đề chương›" with "‹tên phần Wattpad›" from Wattpad? Your current text will be lost, including any unsaved changes. The chapter title stays the same.
     Nút: **Replace text** (kiểu nguy hiểm, đỏ, vì làm mất dữ liệu) · **Cancel**.
  4. Đang sync: nút hiện "Syncing…", khoá dialog. Xong: đóng dialog, nạp lại chương từ response (bỏ phần chưa lưu), toast "Synced from Wattpad". Lỗi: hiện trong dialog theo `code` (`lib/errors.ts`), giữ nguyên chữ chương.
- Chuỗi giao diện bằng tiếng Anh (admin). Màu theo token sẵn có: nút chính cam `--brand`, mục đang chọn tím `--brand-2`, chỉ nút Replace text màu đỏ.
- API client: `listWattpadParts(novelId)` (có thể đã có trong `api/novels.ts`), thêm `syncChapterFromWattpad(chapterId, partId)`.

### Mã lỗi mới trong `lib/errors.ts` (nếu chưa có)

`NOVEL_NOT_WATTPAD` ("This story has no Wattpad link."), `WATTPAD_PART_NOT_FOUND`, `WATTPAD_PART_DELETED`, `WATTPAD_PART_EMPTY`, `DUPLICATE_WATTPAD_NOVEL`: kiểm tra mã nào đã có thì dùng lại.

## Test

- Backend:
  - Validator: link truyện hợp lệ, link chương, link lạ, trống xoá link; loại khác bỏ qua `wattpadUrl`.
  - `update`/`create` báo trùng story id.
  - `parts` nhận ORIGINAL có link, từ chối ORIGINAL không link; import, fetch-translate vẫn từ chối ORIGINAL.
  - `syncOriginal`: thay `text_vi`, giữ tiêu đề; Published → 409; phần không thuộc truyện → 404; phần deleted/rỗng → 409; HTML có ảnh → chữ không có marker và không tải ảnh; không ghi gì khi Wattpad lỗi.
- Frontend:
  - Form: field chỉ hiện cho original, điền sẵn link, gửi `wattpadUrl`.
  - Menu: ẩn khi không link, mờ khi Published.
  - Dialog: chọn sẵn phần cùng tên, phần deleted không chọn được, hộp xác nhận đúng nội dung, Cancel không gọi API, Replace gọi API rồi cập nhật editor, hiện lỗi.
  - `FanficsTab` bỏ qua ORIGINAL.

## Tài liệu

Cập nhật `CLAUDE.md` (mục Truyện sáng tác: ORIGINAL được có `wattpad_story_id`; endpoint mới; luật chỉ Draft và bỏ ảnh).
