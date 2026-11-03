# CLAUDE.md

Hướng dẫn khi làm việc trong repo này.

## Project

**Subtitle Studio:** web app chạy local. Người dùng dán link YouTube, app lấy phụ đề tiếng Anh bằng `yt-dlp`, làm sạch (khử lặp auto-caption) rồi xuất file `.srt` để dịch tay sang tiếng Việt.

- **Spec:** [PLAN.md](PLAN.md). Đây là nguồn sự thật cho thuật toán, API, DB schema và task breakdown T01–T11.
- **Tiến độ:** [PROGRESS.md](PROGRESS.md). Đọc file này trước để biết task nào xong và task nào tiếp theo.
- **Đã xong:** Phase 1 (lấy Engsub, xuất `.srt`) và Phase 2 (thêm Vietsub bằng URL + `.srt` đã dịch, xem video kèm Vietsub; spec [docs/superpowers/specs/2026-11-02-phase2-vietsub-design.md](docs/superpowers/specs/2026-11-02-phase2-vietsub-design.md), plan [docs/superpowers/plans/2026-11-02-phase2-vietsub.md](docs/superpowers/plans/2026-11-02-phase2-vietsub.md)).
- **Menu Profile** (EmiBonnie, Emi, Bonnie; khối tự do, ảnh ở `./data/media/`): spec [docs/superpowers/specs/2026-11-03-profiles-design.md](docs/superpowers/specs/2026-11-03-profiles-design.md), plan [docs/superpowers/plans/2026-11-03-profiles.md](docs/superpowers/plans/2026-11-03-profiles.md).
- **Chưa làm** (chỉ làm khi được yêu cầu): Phase 3 (sửa trực tiếp, chế độ kiểm tra song ngữ), Phase 4 (engine dịch). Vietsub lưu ở bảng `vi_cue` với timing riêng; cột `cue.text_vi` vẫn để dành cho Phase 3.

## Lệnh

```bash
mvn test                                   # toàn bộ test (H2 in-memory, profile "test")
mvn test -Dtest=UrlParserTest              # một class
mvn test -Dtest=UrlParserTest#parsesShorts # một method
mvn spring-boot:run                        # chạy app, DB dev H2 ở ./data/dev (MODE=Oracle)
mvn verify -Poracle -Dskip.npm             # thêm nhóm *OracleIT trên Oracle thật (Testcontainers, cần Docker)

# frontend (từ T10)
cd frontend && npm run dev                 # Vite :5173, proxy /api → :8080
cd frontend && npm test                    # Vitest
mvn package                                # build cả frontend (Node tự cài qua frontend-maven-plugin) + jar
mvn test -Dskip.npm                        # chỉ test backend, bỏ qua frontend
```

Môi trường dev: Windows, JDK 21, Maven 3.9. Có cả Git Bash lẫn PowerShell.

## Stack và cấu trúc

- Backend: Java 21, Spring Boot 3.5.x, Maven, Spring Data JPA. Database chạy hằng ngày là **Oracle Free** (profile `oracle`, `docker compose`); H2 `MODE=Oracle` cho dev và test. Schema do **Flyway** quản lý (`src/main/resources/db/migration`). Chỉ cung cấp REST API `/api/*`, không render HTML.
- Frontend: **React + Vite + TypeScript** trong `frontend/` (từ T10). `frontend-maven-plugin` build vào `target/classes/static` khi `mvn package`, nên ra 1 jar duy nhất. Không commit file build.
- Base package: `com.subtitlestudio`. Tổ chức package theo chức năng, chỉ tạo khi task cần:
  - `config`: `SubtitleStudioProperties` (bind `subtitle-studio.*`)
  - `url`: `UrlParser` (T02)
  - `subtitle`: `VttParser`, `CaptionNormalizer`, `SrtWriter`, `SubtitleTrackSelector` (T03–T06)
  - `ytdlp`: `YtDlpClient` interface + impl (T06–T07)
  - `video`: entity, repository, `SubtitleService`, controller (T08–T09)
  - `web`: `@RestControllerAdvice` (T09)
  - `profile`: trang Profile: entity `T_*`, `ProfileBlockValidator`, `EmbedUrlResolver`, `MediaService` (ảnh), `ProfileService`, 2 controller
- Bảng mới đặt tiền tố `T_` (bảng cũ `video`, `cue`, `vi_cue` giữ nguyên tên). Không đặt tên cột trùng từ khoá H2 (vd `value` → `item_value`).
- Cấu hình đọc qua `SubtitleStudioProperties` (record, `@Validated`). Không dùng `@Value` rải rác.

## Quy ước bắt buộc

### TDD
- Mỗi task: **viết test trước → chạy thấy fail đúng lý do → viết code tối thiểu cho pass → refactor**.
- Unit test chạy trên **dummy data, không gọi mạng, không gọi yt-dlp thật**. Dùng fake `YtDlpClient` (Mockito hoặc class giả). `YtDlpClientImpl` test bằng chương trình Java giả `FakeYtDlp` (trong `src/test`, chạy qua `java -cp`; chế độ chọn bằng `-Dfake.mode=...`). Không dùng shell script vì `ProcessBuilder` trên Windows không chạy được `.sh`.
- Fixture đặt trong `src/test/resources/` (vd `vtt/auto-rolling.vtt`, `ytdlp/info-manual-only.json`).
- Fixture `.vtt`/`.srt` phải giữ đúng byte: dòng chỉ có dấu cách là có chủ đích (YouTube auto-caption có loại dòng này). Tạo bằng `printf` và kiểm tra bằng `cat -A`; `.gitattributes` đặt `-text -whitespace` cho 2 loại file này.
- Trước khi báo xong task: chạy **toàn bộ** `mvn test`, không chỉ class vừa viết.
- **Golden test** (`GoldenSubtitleTest`) dùng phụ đề YouTube thật trong `src/test/resources/golden/`. Thư mục này **gitignore, không bao giờ commit** (bản quyền, repo public). Thay đổi `VttParser`/`CaptionNormalizer`/`SrtWriter` làm golden fail thì phải xem diff bằng mắt rồi mới cập nhật golden, không cập nhật mù.

### Bảo mật khi gọi yt-dlp
- `videoId` phải qua `UrlParser`, khớp regex `^[A-Za-z0-9_-]{11}$`, rồi mới được truyền vào process.
- `ProcessBuilder` dùng **list argument**, tuyệt đối không qua shell (`sh -c`, `cmd /c`).
- Đọc stdout và stderr song song. Hết timeout thì `destroyForcibly()`.

### Lỗi
- Mỗi lỗi nghiệp vụ là một exception riêng, được map sang `ProblemDetail` có field `code` (bảng ở PLAN.md, mục 6): `INVALID_URL` 400, `NO_ENGLISH_SUBTITLE` 422, `YTDLP_FAILED` 502, `YTDLP_TIMEOUT` 504, `VIDEO_NOT_FOUND` 404.

### Frontend
- TDD giống backend: viết test Vitest + React Testing Library trước. Giả lập `fetch` bằng `vi.stubGlobal`, không gọi backend thật.
- Truy vấn theo role/label (`getByRole`, `getByLabelText`), không dùng class CSS hay test id. Nút chỉ có icon/text ngắn phải có `aria-label` đủ nghĩa.
- Màu: dùng token trong `styles.css`: `--brand` (cam #F39A42, hành động chính), `--brand-2` (tím #D9A1D9, "đang ở đây": menu, trang hiện tại). Chữ trên hai màu này dùng `--on-brand` (chữ đậm), không dùng chữ trắng. Focus ring giữ `--focus` (xanh).
- Thêm route phía client (React Router) thì phải thêm đường dẫn đó vào `SpaForwardController` (+ test), nếu không F5 sẽ 404.
- Chuỗi hiển thị bằng tiếng Việt; thông báo lỗi lấy theo `code` của ProblemDetail (`src/lib/errors.ts`), luôn có fallback khi thiếu `code`.
- Font phải có subset `vietnamese` (hiện dùng Be Vietnam Pro).
- Icon dùng `lucide-react` (không tự vẽ SVG). Nút chỉ có icon phải có `aria-label` và `title` (tooltip).
- Màn hình xem: không phụ thuộc `:hover` của khung player (khi chuột ở trên iframe YouTube, trang không nhận hover); phụ đề YouTube phải tắt (`cc_load_policy: 0` + `unloadModule('captions')`).
- Version package cố định (không dùng `^`); `package-lock.json` được commit; `frontend/node`, `node_modules` không commit.

### Database (Oracle + Flyway)
- Không sửa migration đã push hoặc đã chạy trên DB thật; thay đổi schema = file mới `V{n}__mo_ta.sql` viết bằng SQL Oracle.
- Cột chuỗi luôn `VARCHAR2(n CHAR)` (Oracle mặc định đếm byte; chữ Thái/Việt 2–3 byte/ký tự). Cột số nguyên dùng placeholder `${bigint}` / `${int}` (H2 báo `NUMBER` là `NUMERIC`, Hibernate validate không nhận).
- Oracle lưu chuỗi rỗng `''` thành `NULL`: giá trị cho cột `NOT NULL` không bao giờ được rỗng (lọc hoặc thay trước khi lưu).
- Hibernate chỉ `validate`; không bật `ddl-auto` khác. Id dùng `SEQUENCE` với `allocationSize` khớp `INCREMENT BY` của sequence.
- Thay đổi liên quan DB: chạy cả `mvn test` và `mvn verify -Poracle -Dskip.npm` trước khi commit.
- Nhiều nhánh có thể cùng thêm migration: trước khi merge, kiểm tra số version không trùng (đã từng trùng `V2`), đổi số trên nhánh chưa merge.

### Gemini (dịch Vietsub, package `translate`)
- Test **không bao giờ gọi Gemini thật**: dùng `GeminiTranslator` giả, hoặc `FakeGeminiServer` (HTTP server trong test) cho `GeminiTranslatorImpl`.
- `GEMINI_API_KEY` không bao giờ xuất hiện trong log, message exception hay commit. `SubtitleStudioProperties.Gemini.toString()` đã che key.
- Vietsub `AUTO` (Gemini) không bao giờ ghi đè `MANUAL` (tự upload): kiểm tra lại dưới khoá dòng khi lưu (`VietsubService.saveAuto`).
- Hồ sơ dịch trong `./data/prompts/*.md` là dữ liệu của người dùng: không commit (chỉ có mẫu `src/main/resources/prompts/_example.md`).

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
