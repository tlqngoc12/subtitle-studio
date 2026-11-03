# Phase 4: Dịch Vietsub tự động bằng Gemini (design spec)

> Ngày: 2026-11-03. Trạng thái: chờ review.
> Nền tảng: `main` sau Oracle + Flyway (xem [PROGRESS.md](../../../PROGRESS.md), spec [Oracle](2026-11-03-oracle-design.md)).

## 1. Mục tiêu

Ở menu **Lấy Engsub**, người dùng dán link YouTube, chọn một **hồ sơ dịch** (ví dụ `EmiBonnie`) rồi bấm Lấy Engsub. App lấy Engsub như hiện nay, sau đó **tự gọi Gemini API (free tier)** để dịch sang tiếng Việt, giữ nguyên timecode, và lưu kết quả thành Vietsub giống hệt khi upload `.srt` bằng tay (xem được ở màn hình xem, Download/Replace/Delete như cũ).

**Tiêu chí thành công:**
1. Video ≤ 60 phút có Vietsub tự động, timing đúng từng block của Engsub, xưng hô và tên riêng theo hồ sơ.
2. Engsub hiện ngay; dịch chạy nền; trạng thái đúng cả khi đóng tab hoặc quay lại trang.
3. Vietsub tự upload (MANUAL) không bao giờ bị Gemini ghi đè.
4. Mỗi video có file `en.srt`, `vi_auto.srt`, `vi_manual.srt` (khi có) trong `./data/subs/`.
5. Không có `GEMINI_API_KEY` thì app vẫn chạy đầy đủ như hiện tại, chỉ tắt tính năng dịch.

**Ngoài phạm vi:** sửa từng câu trên web (Phase 3); video > 60 phút (chia đợt dịch); chọn model trên giao diện; thống kê quota; hồ sơ lưu trong DB và sửa trên web (Backlog, phase cải tiến).

## 2. Quyết định đã chốt với người dùng

| # | Quyết định |
|---|---|
| D1 | **Hồ sơ dịch theo series**, mỗi hồ sơ là một file Markdown `./data/prompts/<Tên>.md`; chọn bằng dropdown cạnh ô dán link. Lưu trong DB + sửa trên web: Backlog. |
| D2 | **Dịch chạy nền** (virtual thread trong app), trạng thái lưu trong DB, frontend hỏi lại 3 giây/lần. |
| D3 | **Một request** cho cả video: gửi danh sách block có `id`, không gửi timecode; nhận JSON theo schema; app kiểm tra đủ/đúng `id` rồi ghép lại timecode gốc. |
| D4 | **Nguồn Vietsub**: `AUTO` (Gemini) và `MANUAL` (upload tay). AUTO không bao giờ ghi đè MANUAL; MANUAL ghi đè được AUTO. |
| D5 | **Dán trùng link không tốn quota**: chỉ dịch khi video chưa có Vietsub; dịch lại phải bấm nút. |
| D6 | **Lưu file** `<id>.en.srt`, `<id>.vi_auto.srt`, `<id>.vi_manual.srt` bên cạnh `.vtt` hiện có. |
| D7 | Phương án chạy nền: **trong app, không hàng đợi** (hàng đợi DB + worker để dự án con 2 nếu cần). |

## 3. Hồ sơ dịch và nội dung gửi Gemini

**File hồ sơ:** `{data-dir}/prompts/<Tên>.md`.
- Tên hợp lệ: `^[A-Za-z0-9_-]{1,40}$` (lấy từ tên file bỏ `.md`). File khác mẫu này, file bắt đầu bằng `_`, file > 20 KB hoặc không phải UTF-8: không xuất hiện trong danh sách và không đọc được qua API.
- Nội dung tự do; app gửi nguyên văn.
- Repo có `prompts/_example.md` (thư mục `prompts/` ở gốc repo, được copy vào `./data/prompts/` khi thư mục này chưa tồn tại lúc app khởi động) với các mục gợi ý: Bối cảnh, Nhân vật, Xưng hô, Tên riêng và thuật ngữ, Văn phong.

**Một request gồm:**
1. **System instruction cố định** (trong code): dịch sang tiếng Việt tự nhiên, văn phong phụ đề ngắn gọn; mỗi `id` đầu vào trả đúng một phần tử cùng `id`; giữ nguyên `\n` và gạch đầu dòng hội thoại; không thêm, bớt, gộp, tách block; câu bị cắt qua nhiều block thì dịch sao cho mỗi block khớp phần lời của nó; quy định trong hồ sơ được ưu tiên về xưng hô và tên riêng.
2. **Nội dung hồ sơ** (nguyên văn).
3. **Dữ liệu:** tiêu đề, kênh của video và mảng `[{"id": <idx>, "text": <text_en>}]` lấy từ bảng `cue` theo `idx`.

**Đầu ra:** structured output, `responseMimeType = application/json`, schema mảng `{id: integer, text: string}` (bắt buộc cả hai).

**Kiểm tra đầu ra** (sai thì lượt dịch `FAILED`, không lưu gì): tập `id` trả về **bằng đúng** tập `id` gửi đi (không thiếu, không thừa, không trùng); mọi `text` sau `strip()` không rỗng (Oracle lưu `''` thành NULL).

**Kết nối:** SDK chính thức `com.google.genai:google-genai` (version mới nhất ổn định lúc implement, ghi rõ trong `pom.xml`). Cấu hình:

| Thuộc tính | Biến môi trường | Mặc định | Ghi chú |
|---|---|---|---|
| `subtitle-studio.gemini.api-key` | `GEMINI_API_KEY` | rỗng | Rỗng = tắt tính năng dịch. Không bao giờ ghi ra log |
| `subtitle-studio.gemini.model` | `SUBTITLESTUDIO_GEMINI_MODEL` | model **Flash có free tier** | Tên model chốt lúc implement theo danh sách model hiện hành |
| `subtitle-studio.gemini.timeout` | | `3m` | |
| `subtitle-studio.gemini.max-duration` | | `60m` | Video dài hơn không được dịch |
| `subtitle-studio.gemini.temperature` | | `0.3` | |

`docker-compose.yml` truyền `GEMINI_API_KEY` từ `.env` (không bắt buộc); `.env.example` thêm dòng `GEMINI_API_KEY=`.

## 4. Dữ liệu (migration `V2__vietsub_source_and_translation.sql`)

Thêm vào bảng `video`:

| Cột | Kiểu | Ràng buộc |
|---|---|---|
| `vi_source` | `VARCHAR2(10 CHAR)` | NULL được; `CHECK (vi_source IN ('MANUAL','AUTO'))` |
| `translation_status` | `VARCHAR2(12 CHAR)` | NULL được; `CHECK (translation_status IN ('TRANSLATING','FAILED'))` |
| `translation_error` | `VARCHAR2(500 CHAR)` | NULL được |
| `translation_profile` | `VARCHAR2(40 CHAR)` | NULL được |

Cùng migration: `UPDATE video SET vi_source = 'MANUAL' WHERE vi_cue_count > 0`.

**Vòng đời:** `NULL → TRANSLATING → (thành công) NULL + vi_source = AUTO + translation_profile` hoặc `→ (lỗi, restart) FAILED + translation_error`; `FAILED → TRANSLATING` khi dịch lại. `translation_error` được xoá khi bắt đầu lượt mới.

**Thao tác Vietsub hiện có:** upload/Replace tay đặt `vi_source = MANUAL`; Delete Vietsub đặt `vi_source = NULL` (giữ nguyên `translation_*`).

**API** `VideoDto` thêm `viSource`, `translationStatus`, `translationError`, `translationProfile`.

## 5. File `.srt` lưu trữ

| File | Ghi khi | Nội dung |
|---|---|---|
| `<id>.en.srt` | Lấy Engsub thành công, Làm mới | Bằng đúng byte với `GET /api/videos/{id}/subtitle.srt` |
| `<id>.vi_auto.srt` | Lượt dịch được lưu vào DB | Timecode Engsub + bản dịch (`SrtWriter`, cùng định dạng file tải về) |
| `<id>.vi_manual.srt` | Upload/Replace tay thành công | **Nguyên byte** file người dùng upload |

- Ghi đè file cùng loại khi có bản mới. Bản AUTO bị MANUAL thay vẫn giữ `vi_auto.srt`.
- Delete Vietsub: xoá file của nguồn đang dùng (`vi_auto.srt` hoặc `vi_manual.srt`), giữ file của nguồn kia.
- Xoá video: xoá `.vtt`, `en.srt`, `vi_auto.srt`, `vi_manual.srt` của video.
- Khởi động: video thiếu `en.srt` thì tạo từ DB; video `vi_source = MANUAL` thiếu `vi_manual.srt` thì dựng lại từ `vi_cue` (không còn byte gốc).
- Lỗi ghi file không làm hỏng thao tác chính (DB vẫn lưu); ghi log WARN.

## 6. Backend

Package mới `com.subtitlestudio.translate`:

| Khối | Trách nhiệm |
|---|---|
| `PromptProfileStore` | `List<String> list()`, `String read(String name)` (ném `UnknownProfileException`); quy tắc mục 3 |
| `GeminiTranslator` (interface) | `List<TranslatedLine> translate(VideoContext video, String profile, List<SourceLine> lines)`; ném `TranslationFailedException(String userMessage)` |
| `GeminiTranslatorImpl` | Dựng request (mục 3) bằng SDK, gọi, parse JSON, kiểm tra đầu ra, map lỗi (bảng dưới) |
| `TranslationService` | Điều kiện, đánh dấu `TRANSLATING`, chạy nền, lưu kết quả hoặc `FAILED`, reset khi khởi động |
| `SubtitleFileStore` (package `video`) | Ghi/xoá/tạo bù các file mục 5; dùng bởi `SubtitleService`, `VietsubService`, `TranslationService` |

**Điều kiện dịch** (theo thứ tự; trượt thì không gọi Gemini):

| Điều kiện | Từ Lấy Engsub (`profile` có) | Từ nút Dịch lại |
|---|---|---|
| `GEMINI_API_KEY` rỗng | bỏ qua, `skipReason=GEMINI_NOT_CONFIGURED` | 503 `GEMINI_NOT_CONFIGURED` |
| Hồ sơ không tồn tại | 400 `UNKNOWN_PROFILE` | 400 `UNKNOWN_PROFILE` |
| `duration_sec > max-duration` | bỏ qua, `VIDEO_TOO_LONG` | 422 `VIDEO_TOO_LONG` |
| `vi_source = MANUAL` | bỏ qua, `VIETSUB_MANUAL` | 409 `VIETSUB_MANUAL` |
| Đang `TRANSLATING` | bỏ qua (không tạo lượt mới) | 409 `TRANSLATION_IN_PROGRESS` |
| `vi_source = AUTO` | bỏ qua, `VIETSUB_EXISTS` | được dịch (thay bản AUTO) |

`skipReason` là trường thêm trong phản hồi của `POST /api/videos` (không lưu DB), để frontend hiện lý do.

**Chống trùng lượt:** đặt `TRANSLATING` bằng một `UPDATE video SET translation_status='TRANSLATING', translation_profile=?, translation_error=NULL WHERE id=? AND (translation_status IS NULL OR translation_status='FAILED') AND (vi_source IS NULL OR vi_source='AUTO')` (JPQL `@Modifying`); 0 dòng = bỏ qua theo bảng trên.

**Lượt dịch nền** (executor virtual thread, bean riêng để test thay được):
1. Đọc hồ sơ, đọc `cue` theo `idx`, gọi `GeminiTranslator`.
2. Thành công: trong một transaction, khoá dòng `video` (`PESSIMISTIC_WRITE`), kiểm tra lại: video còn tồn tại và `vi_source` khác `MANUAL`. Đúng thì thay `vi_cue` (theo cách `VietsubService` đang làm), `vi_cue_count`, `vi_updated_at`, `vi_source='AUTO'`, `translation_status=NULL`; ghi `vi_auto.srt` sau khi commit. Sai: video đã xoá thì bỏ qua; đã MANUAL thì đặt `translation_status=NULL`, không lưu bản dịch.
3. Lỗi: `translation_status='FAILED'`, `translation_error` = thông điệp tiếng Việt (≤ 500 ký tự).

**Thông điệp lỗi:**

| Nguyên nhân | `translation_error` |
|---|---|
| HTTP 429 / hết quota | Hết lượt miễn phí của Gemini, thử lại sau. |
| HTTP 401/403 | GEMINI_API_KEY không hợp lệ. |
| Quá `timeout` | Gemini không phản hồi kịp. |
| Bị chặn (safety / finish reason khác STOP) | Gemini từ chối dịch nội dung này. |
| JSON hỏng / thiếu, thừa, trùng `id` / text rỗng | Gemini trả về thiếu/lệch câu (x/y câu hợp lệ), thử dịch lại. |
| Lỗi khác | Không dịch được: <tóm tắt ngắn, không chứa API key>. |
| App khởi động lại giữa chừng | Bị gián đoạn do app khởi động lại, hãy dịch lại. |

**API:**

| Endpoint | Mô tả |
|---|---|
| `GET /api/prompt-profiles` | `{"configured": boolean, "profiles": ["EmiBonnie", ...]}` (sắp theo tên, không phân biệt hoa thường) |
| `POST /api/videos` | Body thêm `profile` (tuỳ chọn). Hồ sơ được kiểm tra **trước** khi lấy Engsub (sai thì 400 `UNKNOWN_PROFILE`, không gọi yt-dlp). Lấy Engsub như cũ, rồi áp các điều kiện còn lại; phản hồi `VideoDto` + `skipReason` (có thể null) |
| `POST /api/videos/{id}/translate` | Body `{"profile": "EmiBonnie"}`; 202 + `VideoDto` khi bắt đầu; lỗi theo bảng điều kiện; 404 `VIDEO_NOT_FOUND` |
| `GET /api/videos/{id}` | Có sẵn; dùng để hỏi lại trạng thái |

**Khởi động** (`ApplicationReadyEvent`): `UPDATE ... SET translation_status='FAILED', translation_error='Bị gián đoạn...' WHERE translation_status='TRANSLATING'`; tạo bù file mục 5; copy `_example.md` nếu thư mục `prompts` chưa có.

## 7. Giao diện

| Menu | Route | Thay đổi |
|---|---|---|
| Lấy Engsub | `/` | Khung dán link: `[link] [Hồ sơ dịch ▾] [Lấy Engsub]`; dropdown có "— Không dịch —" (mặc định) + hồ sơ từ `GET /api/prompt-profiles`; nhớ lựa chọn trong `localStorage` (bọc try/catch); `configured=false` thì khoá dropdown, `title` "Chưa cấu hình GEMINI_API_KEY". |
| | | Panel kết quả: dòng **Vietsub** (bảng dưới). |
| | | Danh sách "Đã lấy trước đó": dòng phụ thêm "· Đang dịch…" / "· Lỗi dịch". |
| Vietsub | `/vietsub` | Quản lý Vietsub: dòng phụ `N câu · Gemini (EmiBonnie)` hoặc `N câu · Tự upload`. |
| Danh sách Vietsub, màn hình xem | `/vietsub/list`, `/vietsub/:id` | Không đổi. |

**Dòng Vietsub trong panel kết quả:**

| Trạng thái | Hiển thị |
|---|---|
| `TRANSLATING` | Icon `Loader2` xoay + "Đang dịch bằng Gemini (EmiBonnie)…" |
| `vi_source = AUTO` | "Vietsub: Gemini · EmiBonnie" · Xem Vietsub · Tải .vi.srt · Dịch lại (`confirm("Thay Vietsub Gemini hiện có?")`, dùng hồ sơ đang chọn; nút khoá khi dropdown là "Không dịch") |
| `vi_source = MANUAL` | "Vietsub: tự upload" · Xem Vietsub; không có Dịch lại, kèm chú thích "Xoá Vietsub tự upload ở trang Vietsub nếu muốn dịch bằng Gemini" |
| `FAILED` | `translation_error` (`role="alert"`) + Dịch lại |
| Chưa có Vietsub | Nút "Dịch bằng Gemini" (hồ sơ đang chọn); nếu `skipReason` là `VIDEO_TOO_LONG` / `GEMINI_NOT_CONFIGURED` thì hiện lý do thay cho nút |

Khi video đang hiển thị (panel kết quả) hoặc bất kỳ video nào trong danh sách có `TRANSLATING`: gọi `GET /api/videos/{id}` mỗi 3 giây cho các video đó, dừng khi hết `TRANSLATING`, cập nhật cả panel và danh sách. Icon dùng `lucide-react` (`Languages`, `Loader2`); nút chỉ có icon có `aria-label` và `title`.

## 8. Kiểm thử

Test tự động **không gọi Gemini thật**.

| Nhóm | Nội dung |
|---|---|
| `PromptProfileStore` | tên hợp lệ / `../x` / ký tự lạ / > 40 ký tự; file > 20 KB; không UTF-8; bỏ qua `_…`; thư mục chưa có → rỗng; sắp xếp |
| Kiểm tra đầu ra | thiếu, thừa, trùng `id`; text rỗng/blank; giữ `\n` và `- ` |
| `GeminiTranslatorImpl` | SDK trỏ tới HTTP server giả trong test (base URL qua `HttpOptions`): request có system instruction, hồ sơ, schema, model, temperature; map 429, 401, timeout, safety block, JSON hỏng; không log key |
| `TranslationService` (H2 + translator giả, executor đồng bộ trong test) | mọi dòng bảng điều kiện; bấm hai lần → một lượt; MANUAL xuất hiện giữa chừng → giữ MANUAL; video xoá giữa chừng; lỗi → FAILED + thông điệp; khởi động → TRANSLATING thành FAILED |
| `SubtitleFileStore` | ghi/ghi đè/xoá theo mục 5; `vi_manual.srt` đúng byte upload; tạo bù khi khởi động |
| Controller | `GET /api/prompt-profiles`, `profile` trong `POST /api/videos` + `skipReason`, `POST /translate` và mã lỗi |
| Migration `V2` | `mvn test` (H2) + `mvn verify -Poracle` (Oracle thật): cột, CHECK, video có Vietsub được gán `MANUAL` |
| Frontend (Vitest) | dropdown (khoá, nhớ lựa chọn, "Không dịch"); 5 trạng thái dòng Vietsub; polling 3 giây bằng fake timer, dừng khi xong; confirm Dịch lại; nhãn nguồn ở Quản lý Vietsub |
| Kiểm tra tay | key thật, hồ sơ `EmiBonnie`, một video thật < 1 giờ; xem trên màn hình xem; xưng hô; file trong `./data/subs/` |

## 9. Tài liệu

- README: lấy key ở Google AI Studio, đặt `GEMINI_API_KEY` trong `.env`; lưu ý free tier (dữ liệu có thể được Google dùng để cải thiện sản phẩm; giới hạn request xem trong AI Studio); cách viết hồ sơ.
- CLAUDE.md: test không gọi Gemini thật; API key không ghi log, không commit; hồ sơ là dữ liệu người dùng (không commit file trong `./data/prompts/`).
- PROGRESS.md: nhật ký Phase 4; Backlog thêm "hồ sơ dịch lưu trong Oracle + sửa trên web (phase cải tiến)" và "video > 60 phút: chia đợt dịch".

## 10. Rủi ro

| Rủi ro | Giảm thiểu |
|---|---|
| Google đổi giới hạn/chính sách free tier | Model cấu hình được; lỗi quota có thông điệp rõ và Dịch lại |
| Gemini trả thiếu/lệch câu với video dài | Kiểm tra đầu ra chặt; không lưu bản hỏng; Dịch lại |
| Chất lượng xưng hô | Phụ thuộc hồ sơ; file mẫu hướng dẫn viết; sửa hồ sơ rồi Dịch lại |
| SDK không cho đổi base URL để test | Bọc lời gọi SDK sau một interface hẹp và test phần dựng request/xử lý phản hồi qua interface đó |
| App restart giữa lượt dịch | Reset sang FAILED khi khởi động; Dịch lại |
