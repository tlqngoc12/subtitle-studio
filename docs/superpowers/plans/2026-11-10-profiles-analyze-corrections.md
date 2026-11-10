# Vietsub › Profiles: Analyze corrections — Plan

Trạng thái: **user đã duyệt 2026-11-10; làm chung nhánh fix/tab-focus-ring-on-click**. PR #8 đã merge. Một PR chung với bản sửa focus ring của tab.
Tiêu đề, mô tả PR và commit message viết bằng tiếng Anh.

Scope UI user đã chốt ngày 2026-11-10: dùng **tab** (không dùng dropdown), có **"Sửa trước khi lưu"**.

## Mục tiêu

Chọn một hồ sơ dịch Vietsub, bấm **Analyze corrections**. Gemini đọc các câu user đã sửa so với bản AI, rồi đề xuất bản `.md` mới. App hiện **diff có highlight**, user sửa tiếp nếu muốn, rồi lưu. Bản cũ được tự động backup.

## Dữ liệu dùng để phân tích

- **Video nguồn:** các video có `translation_profile = <hồ sơ>`, `edit_status = DONE`, `vi_source = MANUAL`, có `vi_auto.srt`. Lấy **mọi video phù hợp**, không giới hạn 3 như phần ví dụ.
- **Bộ ba mỗi câu** (ghép theo `start_ms`): Engsub (`cue`) / bản AI (`vi_auto.srt`) / bản cuối (`vi_cue`). Chỉ lấy câu **đã sửa** (AI khác bản cuối, so sánh sau khi chuẩn hoá khoảng trắng).
- **Giới hạn mỗi request:** tối đa **300 bộ ba** và **30.000 ký tự**, video mới trước. Đây là hằng số trong code.
- **Refactor:** tách phần đọc và ghép từ `ExampleSource` (PR #8) thành `CorrectionReader`, trả về `List<Correction(en, ai, vi)>` cho mỗi video. `ExampleSource` và phần phân tích dùng chung. Hành vi của `ExampleSource` giữ nguyên, test cũ phải xanh.

## Backend

**API mới** (`PromptProfileController`; tên hồ sơ kiểm tra bằng regex sẵn có, không cho `_example`):

| Method | Path | Kết quả |
|---|---|---|
| GET | `/api/prompt-profiles/{name}` | `{name, text, sha, stats: {videos, correctedLines}}` (`sha` = SHA-256 của nội dung file) |
| POST | `/api/prompt-profiles/{name}/analyze` | `{proposed, rules: [{text, count}], basedOn: {videos, lines}, model, sha}` |
| PUT | `/api/prompt-profiles/{name}` body `{text, baseSha}` | `{sha}`. File đã đổi từ lúc mở (sha khác) thì **409 `PROFILE_CHANGED`** |

**Analyze:**
- Gọi `GeminiCaller.generate` **1 lần**: có fallback model, có `onTrying`, response là JSON theo schema `{rules:[{text,count}], proposed:string}`.
- **System rules** (tiếng Việt):
  - Phân tích các chỗ người dịch sửa bản AI.
  - Chỉ thêm hoặc sửa quy tắc khi được ít nhất 2 câu sửa ủng hộ. Ghi số lần vào `count`.
  - Giữ nguyên cấu trúc và các mục của hồ sơ. Không xoá quy tắc cũ, trừ khi các câu sửa mâu thuẫn rõ với nó.
  - Viết tiếng Việt, ngắn gọn, có ví dụ "sai → đúng" khi cần.
  - Kết quả dưới 20 KB.
- Kiểm tra kết quả:
  - `proposed` rỗng hoặc quá 20 KB thì lỗi `ANALYSIS_INVALID`.
  - Không có câu nào đã sửa thì **400 `NO_CORRECTIONS`** và **không gọi Gemini**.
  - Gemini chưa cấu hình thì `GEMINI_NOT_CONFIGURED`.
  - Hết quota hoặc lỗi Gemini dùng lại mã lỗi hiện có.
- Chạy **đồng bộ** trong request (thường 10–60 giây). Frontend hiện trạng thái đang chạy.
- **Không ghi file** ở bước này.
- Log: `analyze <name>: N lines from M videos, model X`. Không log nội dung.

**Save:**
- Kiểm tra: UTF-8 hợp lệ, không rỗng, ≤ 20 KB (`PromptProfileStore.MAX_BYTES`), `baseSha` khớp file hiện tại.
- Trước khi ghi, copy file cũ sang `data/prompts/.history/<name>-<yyyyMMdd-HHmmss>.md` (tạo thư mục nếu chưa có). `list()` hiện chỉ đọc `*.md` ở cấp đầu nên không lẫn file backup.
- **Ghi an toàn:** ghi ra file tạm trong cùng thư mục rồi `Files.move(ATOMIC_MOVE, REPLACE_EXISTING)`.
- Thêm `write(name, text, baseSha)` vào `PromptProfileStore`. Hồ sơ Novels (`NovelProfileStore`) **không** có API này.

**SPA:** thêm `/vietsub/profiles` vào `SpaForwardController`.

**Test (TDD):**
- `CorrectionReader`: ghép theo `start_ms`, chỉ lấy câu đã sửa, thiếu hoặc hỏng `vi_auto` thì trả rỗng, giới hạn 300 bộ ba và 30k ký tự, video mới trước.
- `ExampleSource`: test cũ vẫn xanh sau khi refactor.
- Analyze:
  - Fake Gemini server nhận đúng bộ ba và hồ sơ hiện tại.
  - Response sai schema, rỗng hoặc quá lớn thì báo lỗi.
  - `NO_CORRECTIONS` không gọi Gemini.
- Save:
  - Có backup.
  - Ghi atomic.
  - 409 khi sha lệch.
  - 400 khi quá lớn, rỗng, hoặc tên không hợp lệ (`../x`, `_example`).
- Controller test cho cả 3 endpoint.

## Frontend

**Tab và route:**
- `VietsubTabs` thêm tab **Profiles** → `/vietsub/profiles`.
- Trang mới `pages/ProfilesPage.tsx` (+ `.css`). Hồ sơ đang chọn lưu trên URL `?profile=`.

**Bố cục:**
1. **Hàng trên:**
   - Dropdown hồ sơ (`GET /api/prompt-profiles` có sẵn).
   - Dòng thống kê: "34 videos · 612 corrected lines".
   - Nút chính màu cam **Analyze corrections** (icon lucide `Sparkles`).
   - Nút bị tắt kèm tooltip (`<Tip>`) khi: chưa chọn hồ sơ / 0 câu đã sửa ("No corrected lines yet") / thiếu `GEMINI_API_KEY`.
2. **Đang phân tích:** nút hiện "Analyzing…", spinner, dòng chữ "This can take up to a minute". Khoá dropdown.
3. **Kết quả:**
   - Danh sách **quy tắc rút ra**, mỗi dòng: text + nhãn "×47".
   - Dòng "Based on N lines from M videos · model X".
   - **Khung diff:**
     - Dùng thư viện **`diff` (jsdiff)**, không tự viết thuật toán. `diffLines` cho từng dòng; dòng bị thay thì dùng thêm `diffWordsWithSpace` để tô đúng chữ đổi.
     - Thêm: `<ins>` nền cam nhạt (`color-mix(--brand 22%, --surface)`).
     - Xoá: `<del>` chữ `--danger`, gạch ngang (đỏ được phép vì đây là xoá).
     - Mỗi đoạn có chữ `visually-hidden` "Added:" / "Removed:" cho trình đọc màn hình.
     - Đoạn không đổi dài hơn 6 dòng thì thu gọn thành "… 12 unchanged lines" (bấm để mở).
   - **Nút:** **Edit before saving** (chuyển sang `<textarea>` chứa bản đề xuất, diff bên dưới cập nhật sau mỗi lần gõ, debounce 300 ms) · **Cancel** (hỏi xác nhận nếu đã sửa) · **Save to `<name>.md`** (`useConfirmDialog`: "Overwrite EmiBonnie.md? The current version is backed up.").
4. **Sau khi lưu:** toast "Saved EmiBonnie.md (backup kept)". Bỏ kết quả, tải lại thống kê.
   - 409 thì báo "The file changed on disk since you opened it. Reload and analyze again."
   - Lỗi khác hiện bằng `Alert`.

**Quy ước:**
- Chỉ dùng màu cam và tím; đỏ chỉ cho phần bị xoá và lỗi. Icon lucide.
- Dùng component có sẵn: `PageHeader`, `IconButton`, `<Tip>`, `Alert`, `LoadingText`, `useConfirmDialog`.
- Breakpoint 520/760; vùng chạm 44px trên mobile; `prefers-reduced-motion`.
- Trên mobile, khung diff cuộn dọc và xuống dòng (`white-space: pre-wrap`, `overflow-wrap: anywhere`), không cuộn ngang.

**Test (TDD):**
- Có tab Profiles (`aria-current`).
- Các trạng thái tắt của nút Analyze kèm lý do.
- Analyze thành công thì có quy tắc và diff: có `<ins>`/`<del>` đúng chỗ, phần không đổi thu gọn.
- Edit làm diff cập nhật.
- Save gửi `baseSha`, có toast, xử lý 409.
- Cancel có hỏi xác nhận.
- Lỗi Gemini thì hiện `Alert`.
- Hàm diff tách thành `lib/profileDiff.ts`, test thuần.

## Ngoài phạm vi (Backlog)

- Chạy định kỳ tự động.
- Xem hoặc khôi phục bản backup trên UI (hiện chép tay từ `.history/`).
- Áp dụng cho hồ sơ Novels.
- Thống kê tỉ lệ sửa theo thời gian (#3, user không cần).

## Docs và quy trình

- `CLAUDE.md`: API hồ sơ (GET/analyze/PUT), backup `.history/`, 409 `PROFILE_CHANGED`, quy tắc chọn bộ ba.
- `PROGRESS.md`: mục mới bằng tiếng Việt. Chỉ cần deploy để có tính năng; không có migration.
- Sonnet làm toàn bộ (TDD), chạy `mvn verify -Dskip.npm` (thêm `-Poracle` không bắt buộc vì không có migration) và `cd frontend && npx tsc --noEmit && npm test`. Chụp ảnh trang Profiles (1366 và 390) nếu dev server chạy được.
- Opus review cả nhánh một lần, rồi tạo PR. **Không merge và không deploy khi user chưa đồng ý.**
- Kiểm tra thật sau khi deploy (khi user cho phép): Analyze `EmiBonnie` (34 video), xem diff, thử Edit rồi Cancel. Chỉ Save khi user muốn.
