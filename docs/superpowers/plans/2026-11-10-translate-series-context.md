# Dịch phim bộ chính xác hơn: ví dụ từ tập đã Done (#1) + mô tả YouTube (#2) — Plan

Trạng thái: **user đã duyệt 2026-11-10, chọn (a): không chuyển hồ sơ của video cũ**. Nhánh: `feat/translate-series-context`, tạo từ `main` mới nhất (sau deploy `5dce8eb`).
Một PR cho cả hai phần. Tiêu đề, mô tả PR và commit message viết bằng tiếng Anh.

## Hiện trạng (đã đọc code)

- Mỗi video được dịch bằng **1 request** (`GeminiTranslatorImpl.userContent`). Request gồm:
  - hồ sơ `.md`;
  - JSON `{title, channel, lines:[{id,text}]}`;
  - `SYSTEM_RULES` (cố định).
- `VideoContext` hiện chỉ có `title` và `channel`.
- `video.translation_profile` lưu hồ sơ đã dùng. Lưu tay thành MANUAL (`saveText`) vẫn giữ giá trị này.
- `./data/subs/<id>.vi_auto.srt` giữ **bản AI gốc**, kể cả sau khi user sửa tay. Bản sửa nằm ở `vi_manual.srt` và bảng `vi_cue`.
- `yt-dlp -J` đã trả về `description`, nhưng `VideoInfoParser` bỏ qua trường này và DB không lưu.
- Một video **chưa thể nằm trong playlist** lúc dịch lần đầu, vì thêm vào playlist cần có Vietsub (`VideoHasNoVietsubException`). Do đó **không chọn ví dụ theo playlist**, mà chọn theo **hồ sơ dịch**: mỗi bộ phim có một hồ sơ, ví dụ `Moonshadow.md`.
- Quota free: khoảng 20 request/ngày cho mỗi model. **Cả hai phần đều không tăng số request**, chỉ thêm khoảng 2–4k token cho mỗi request.

## Phần #1 — Ví dụ Engsub → Vietsub từ các tập đã Done cùng hồ sơ

**Chọn nguồn:**
- Lấy các video có `translation_profile = <hồ sơ đang dùng>`, `edit_status = 'DONE'`, `vi_source = 'MANUAL'`.
- Bỏ chính video đang dịch.
- Sắp xếp `vi_updated_at` giảm dần, tối đa **3 video**.

**Ghép cặp:** câu Engsub (`cue`) với câu Vietsub cuối cùng (`vi_cue`) theo `start_ms` bằng nhau. User đã xác nhận timeline Engsub và Vietsub luôn trùng.

**Chọn câu (ưu tiên theo thứ tự):**
1. **Câu đã sửa tay:** text trong `vi_cue` khác dòng cùng `start_ms` trong `vi_auto.srt`. Đây là chỗ AI từng sai về tên, xưng hô, giọng văn nên giá trị nhất.
   - Đọc `vi_auto.srt` qua `SubtitleFileStore` và parser `.srt` có sẵn.
   - Không có file thì bỏ qua bước này.
2. **Câu có tên riêng hoặc đại từ xưng hô:** chứa chữ hoa giữa câu trong Engsub, hoặc từ như chị/em/anh/tôi/cậu/P' trong Vietsub. Heuristic đơn giản, viết test.
3. Còn chỗ thì lấy các câu dài nhất (nhiều ngữ cảnh), rải đều trong video.

**Giới hạn:**
- Tối đa **60 cặp** và **6.000 ký tự** cho mỗi request.
- Bỏ câu rỗng, câu chỉ có ♪ hoặc ký hiệu, và câu trùng nhau.
- Các giới hạn này là hằng số trong code (YAGNI, không thêm cấu hình).

**Gửi đi:** trong `userContent`, đặt giữa hồ sơ và phụ đề:
```
# Ví dụ đã được người dịch duyệt (cùng bộ phim; bắt chước tên riêng, xưng hô và giọng văn)
[{"en": "...", "vi": "..."}, ...]
```
Thêm một dòng vào `SYSTEM_RULES`: "Phần ví dụ đã duyệt (nếu có) là chuẩn về tên riêng, xưng hô và giọng văn; chỉ tham khảo, không dịch lại phần ví dụ."

**Kiến trúc:**
- Thêm `ExampleSource` (service mới trong `translate/`), có hàm `List<ExamplePair> examplesFor(String profile, String excludeVideoId)`.
- Mở rộng `VideoContext` thành `VideoContext(title, channel, description, examples)`.
- `TranslationService.begin` tạo context trong transaction đọc. Lỗi khi đọc ví dụ (ví dụ file `.srt` hỏng) thì **log rồi dịch tiếp không có ví dụ**, không làm hỏng lượt dịch.
- Log 1 dòng: `examples: N pairs from M videos (K corrected)`. Không log nội dung phụ đề.

**Test (TDD):**
- Chọn đúng video: cùng hồ sơ, DONE, MANUAL, không lấy chính nó, tối đa 3, mới nhất trước.
- Ghép theo `start_ms`; ưu tiên câu đã sửa; giới hạn 60 cặp và 6.000 ký tự; thiếu `vi_auto.srt` vẫn chạy.
- `userContent` có phần ví dụ khi có, không có phần này khi danh sách rỗng.
- Lỗi khi đọc ví dụ thì vẫn dịch.
- Fake Gemini server (test có sẵn) nhận được ví dụ trong request.

## Phần #2 — Mô tả YouTube

**DB:** Flyway **V12** `ALTER TABLE video ADD (description CLOB);` (theo kiểu V6), nullable.
- Kiểm tra `PersistenceOracleIT`: nếu test có liệt kê cột hoặc schema thì cập nhật.
- Chạy `mvn verify -Poracle -Dskip.npm`.

**Lấy dữ liệu:**
- `VideoInfoParser` đọc `description` (rỗng thì null). `VideoInfo` thêm field này.
- Get Engsub lưu vào `Video.description`.
- **Không đưa vào `VideoDto` và `PublicVideo`**, vì frontend không cần.

**Video cũ (description null):**
- Khi bấm Translate again, nếu null thì gọi `yt-dlp -J` một lần để bổ sung.
- Lỗi hoặc timeout thì **bỏ qua**, dịch không có mô tả và không báo lỗi cho user.
- Lấy được thì lưu lại, để lần sau không phải gọi nữa.

**Làm sạch trước khi gửi** (hàm thuần, có test):
- Bỏ các dòng chỉ có URL, các dòng chỉ có hashtag hoặc mention, và các dòng như "Subscribe", "Follow", "Official", "©".
- Gộp các dòng trống liên tiếp. Cắt còn **1.500 ký tự**.
- Không còn gì thì không gửi.

**Gửi đi:** thêm khoá `"description"` vào JSON bên cạnh `title` và `channel`. Thêm một dòng vào `SYSTEM_RULES`: "Mô tả video chỉ để hiểu bối cảnh và tên nhân vật; không dịch mô tả."

**Test (TDD):**
- Parser đọc `description`.
- Get Engsub lưu `description`.
- Translate again bổ sung `description` khi null, và vẫn dịch nếu `yt-dlp` lỗi.
- Có test cho hàm làm sạch.
- Request gửi Gemini có hoặc không có `description` tuỳ trường hợp.
- Oracle IT cho V12.

## Ngoài phạm vi (Backlog)

- Sổ tay phim tự cập nhật sau mỗi tập (tốn thêm 1 request mỗi tập).
- Chọn ví dụ theo playlist.
- Màn hình xem hoặc sửa các ví dụ.
- Gemini xem video qua link YouTube.

## Docs và quy trình

- `CLAUDE.md`: cách chọn ví dụ (hồ sơ + DONE + MANUAL, ưu tiên câu đã sửa, giới hạn); cột `description`; quy ước "lỗi ngữ cảnh không làm hỏng lượt dịch".
- `PROGRESS.md`: mục mới bằng tiếng Việt. Ghi chú: cần deploy vì có V12. Gợi ý user tạo một hồ sơ cho mỗi bộ phim (ví dụ `data/prompts/Moonshadow.md`) và dùng nhất quán.
- Sonnet làm toàn bộ (TDD), sau đó Opus review cả nhánh một lần, rồi tạo PR. **Không merge và không deploy khi user chưa đồng ý.**
- Kiểm tra thật sau khi deploy (khi user cho phép): dịch 1 tập Moonshadow có ít nhất 1 tập Done trước đó, xem log `examples: …`.
