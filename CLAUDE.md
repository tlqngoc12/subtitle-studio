# CLAUDE.md

Hướng dẫn khi làm việc trong repo này.

## Project

**Subtitle Studio:** web app chạy local. Người dùng dán link YouTube, app lấy phụ đề tiếng Anh bằng `yt-dlp`, làm sạch (khử lặp auto-caption) rồi xuất file `.srt` để dịch tay sang tiếng Việt.

- **Spec:** [PLAN.md](PLAN.md). Đây là nguồn sự thật cho thuật toán, API, DB schema và task breakdown T01–T11.
- **Tiến độ:** [PROGRESS.md](PROGRESS.md). Đọc file này trước để biết task nào xong và task nào tiếp theo.
- **Phase hiện tại:** Phase 1 (lấy Engsub và xuất `.srt`). **Không** làm các phần thuộc Phase 2+ (upload Vietsub, player overlay, sửa trên web, engine dịch), trừ khi được yêu cầu. Cột `cue.text_vi` để sẵn nhưng Phase 1 không dùng.

## Lệnh

```bash
mvn test                                   # toàn bộ test (H2 in-memory, profile "test")
mvn test -Dtest=UrlParserTest              # một class
mvn test -Dtest=UrlParserTest#parsesShorts # một method
mvn spring-boot:run                        # chạy app, DB ở ./data/subtitle-studio
```

Môi trường dev: Windows, JDK 21, Maven 3.9. Có cả Git Bash lẫn PowerShell.

## Stack và cấu trúc

- Java 21, Spring Boot 3.5.x, Maven, Spring Data JPA + H2 (file mode), vanilla JS frontend trong `src/main/resources/static`.
- Base package: `com.subtitlestudio`. Tổ chức package theo chức năng, chỉ tạo khi task cần:
  - `config`: `SubtitleStudioProperties` (bind `subtitle-studio.*`)
  - `url`: `UrlParser` (T02)
  - `subtitle`: `VttParser`, `CaptionNormalizer`, `SrtWriter`, `SubtitleTrackSelector` (T03–T06)
  - `ytdlp`: `YtDlpClient` interface + impl (T06–T07)
  - `video`: entity, repository, `SubtitleService`, controller (T08–T09)
  - `web`: `@RestControllerAdvice` (T09)
- Cấu hình đọc qua `SubtitleStudioProperties` (record, `@Validated`). Không dùng `@Value` rải rác.

## Quy ước bắt buộc

### TDD
- Mỗi task: **viết test trước → chạy thấy fail đúng lý do → viết code tối thiểu cho pass → refactor**.
- Unit test chạy trên **dummy data, không gọi mạng, không gọi yt-dlp thật**. Dùng fake `YtDlpClient` (Mockito hoặc class giả). `YtDlpClientImpl` test bằng chương trình Java giả `FakeYtDlp` (trong `src/test`, chạy qua `java -cp`; chế độ chọn bằng `-Dfake.mode=...`). Không dùng shell script vì `ProcessBuilder` trên Windows không chạy được `.sh`.
- Fixture đặt trong `src/test/resources/` (vd `vtt/auto-rolling.vtt`, `ytdlp/info-manual-only.json`).
- Fixture `.vtt`/`.srt` phải giữ đúng byte: dòng chỉ có dấu cách là có chủ đích (YouTube auto-caption có loại dòng này). Tạo bằng `printf` và kiểm tra bằng `cat -A`; `.gitattributes` đặt `-text -whitespace` cho 2 loại file này.
- Trước khi báo xong task: chạy **toàn bộ** `mvn test`, không chỉ class vừa viết.

### Bảo mật khi gọi yt-dlp
- `videoId` phải qua `UrlParser`, khớp regex `^[A-Za-z0-9_-]{11}$`, rồi mới được truyền vào process.
- `ProcessBuilder` dùng **list argument**, tuyệt đối không qua shell (`sh -c`, `cmd /c`).
- Đọc stdout và stderr song song. Hết timeout thì `destroyForcibly()`.

### Lỗi
- Mỗi lỗi nghiệp vụ là một exception riêng, được map sang `ProblemDetail` có field `code` (bảng ở PLAN.md, mục 6): `INVALID_URL` 400, `NO_ENGLISH_SUBTITLE` 422, `YTDLP_FAILED` 502, `YTDLP_TIMEOUT` 504, `VIDEO_NOT_FOUND` 404.

### Locale
- `String.format`, `toLowerCase`/`toUpperCase` và các hàm format khác phải truyền `Locale.ROOT`. Locale mặc định có thể sinh chữ số không phải ASCII và làm hỏng file `.srt`.

### Test và Spring
- `@SpringBootTest` phải kèm `@ActiveProfiles("test")` để dùng H2 in-memory. Test không được tạo file trong `./data`.
- `@CsvSource` có giá trị chứa dấu phẩy (vd timestamp SRT `00:00:01,000`) thì dùng `delimiter = '|'`.
- Ưu tiên test slice (`@WebMvcTest`, `@DataJpaTest`) hoặc unit test thuần, thay vì `@SpringBootTest`.
- Spring chuẩn hoá `Path` khi bind (`./data` thành `data`). Khi assert path thì so theo `toAbsolutePath().normalize()`.

## Sau mỗi task

1. Cập nhật [PROGRESS.md](PROGRESS.md): bảng tiến độ, nhật ký, quyết định và lưu ý mới.
2. Báo kết quả `mvn test` thật (số test, pass/fail).
3. **Chỉ commit khi được yêu cầu.** Commit message ngắn gọn, ví dụ `T02: UrlParser`.

## Giao tiếp

- Trả lời bằng tiếng Việt có dấu đầy đủ. Tên kỹ thuật và identifier giữ nguyên.
- Mọi thứ trong code đều viết **tiếng Anh**: comment, Javadoc, tên class/method/biến, comment trong file config, message trong exception và log. Chuỗi hiển thị cho người dùng trên frontend vẫn dùng tiếng Việt.
