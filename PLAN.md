# Subtitle Studio — Plan Phase 1: lấy Engsub và xuất file .srt

## 1. Mục tiêu

Web app chạy local, project riêng (không gộp vào media-downloader).

Phase 1 làm đúng một việc: **dán link YouTube → lấy phụ đề tiếng Anh → làm sạch → xuất file `.srt`** để dịch thủ công.

**Ngoài scope Phase 1** (xem mục 9):
- Upload Vietsub
- Player overlay
- Sửa trực tiếp trên web
- Engine dịch

## 2. Tech stack

| Thành phần | Lựa chọn |
|---|---|
| Ngôn ngữ / framework | Java 21, Spring Boot 3.x, Maven |
| Persistence | Spring Data JPA + H2 (file mode, `./data/subtitle-studio`) |
| Lấy phụ đề | `yt-dlp` gọi qua `ProcessBuilder` |
| Frontend | **React + Vite + TypeScript** (SPA trong thư mục `frontend/`), chỉ gọi REST API `/api/*` |
| Đóng gói | `frontend-maven-plugin` tự cài Node và build React vào `target/classes/static` khi `mvn package` → **1 jar** chứa cả backend và frontend |
| Test | Backend: JUnit 5, AssertJ, Mockito, `@WebMvcTest`, `@DataJpaTest`. Frontend: Vitest + React Testing Library |
| Chạy | Docker (JRE 21 + python3 + yt-dlp), volume `/data`; dev frontend dùng Vite dev server proxy `/api` → `:8080` |

## 3. Luồng xử lý

```
User dán URL
  → POST /api/videos
  → UrlParser: lấy videoId (11 ký tự)
  → Đã có trong DB? → trả về luôn (không gọi yt-dlp lại)
  → YtDlpClient.fetchInfo(videoId)       : yt-dlp -J --skip-download
  → SubtitleTrackSelector                 : chọn track tiếng Anh (manual > auto)
  → YtDlpClient.downloadVtt(videoId, track): ghi data/subs/{id}.en.vtt
  → VttParser          → List<RawCue>
  → CaptionNormalizer  → List<Cue> (khử rolling duplicate, chuẩn hoá thời gian)
  → lưu Video + Cue vào H2
  → frontend preview + nút tải .srt
  → GET /api/videos/{id}/subtitle.srt → SrtWriter
```

## 4. Chi tiết từng thành phần

### 4.1 UrlParser

Các dạng URL cần hỗ trợ:
- `youtube.com/watch?v=ID` (có thể kèm `&t=`, `&list=`)
- `youtu.be/ID`
- `youtube.com/shorts/ID`
- `youtube.com/embed/ID`
- `m.youtube.com/...`
- Chỉ dán `ID` không thôi

Validate ID theo regex `^[A-Za-z0-9_-]{11}$`. Sai thì ném `InvalidUrlException`.

> Vì sao phải validate chặt: ID này được truyền vào yt-dlp, nên chỉ cho phép đúng ký tự hợp lệ.

### 4.2 YtDlpClient (interface + impl)

**Interface** để unit test dùng fake, không gọi mạng:

```java
VideoInfo fetchInfo(String videoId);
Path downloadVtt(String videoId, SubtitleTrack track, Path outDir);
```

**Impl** dùng `ProcessBuilder` với **list argument** (không qua shell). Ví dụ:

- Lấy info:
  ```
  yt-dlp -J --skip-download https://www.youtube.com/watch?v={id}
  ```
  Parse bằng Jackson, lấy các field: `title`, `channel`, `duration`, `subtitles`, `automatic_captions`.

- Tải phụ đề:
  ```
  yt-dlp --skip-download --write-subs|--write-auto-subs --sub-langs {lang} --sub-format vtt -o {outDir}/%(id)s https://www.youtube.com/watch?v={id}
  ```

**Cấu hình** (`application.yml`):

```yaml
subtitle-studio:
  ytdlp:
    path: yt-dlp
    timeout: 60s
  data-dir: ./data
```

**Xử lý process:**
- Đọc stdout và stderr song song để tránh deadlock khi buffer đầy.
- Hết timeout → `destroyForcibly()` → ném `YtDlpTimeoutException`.
- Exit code ≠ 0 → ném `YtDlpFailedException`, kèm 500 ký tự cuối của stderr.

### 4.3 SubtitleTrackSelector

Thứ tự ưu tiên khi chọn track:

1. Manual: `en`, `en-US`, `en-GB`, rồi bất kỳ key nào bắt đầu bằng `en-`.
2. Auto: `en-orig`, rồi `en`.
3. Không có track nào → ném `NoEnglishSubtitleException`.

Kết quả trả về `SubtitleTrack(lang, SourceType.MANUAL|AUTO)`.

### 4.4 VttParser

Những gì cần xử lý:
- Header `WEBVTT` (có thể kèm metadata `Kind:`, `Language:`).
- Bỏ qua các block `NOTE`, `STYLE`, `REGION`.
- Dòng cue identifier (nếu có).
- Timestamp dạng `HH:MM:SS.mmm` hoặc `MM:SS.mmm`; bỏ phần cue settings phía sau, ví dụ `align:start position:0%`.
- Xoá inline tag như `<00:00:01.234>`, `<c>`, `</c>`, `<i>`.
- Decode entity: `&amp;`, `&lt;`, `&gt;`, `&nbsp;`, `&#39;`.
- Chấp nhận cả line ending CRLF lẫn LF, và có hoặc không có BOM.

Output: `RawCue(startMs, endMs, List<String> lines)`.

### 4.5 CaptionNormalizer (phần quan trọng nhất)

**Vấn đề với auto-caption:** YouTube xuất ở dạng "rolling". Mỗi cue gồm dòng cũ cộng dòng mới, kèm thêm các cue rất ngắn (~10ms) lặp lại y nguyên. Dummy data minh hoạ:

```
00:00:01.000 --> 00:00:03.500
so today we're going to talk

00:00:03.500 --> 00:00:03.510
so today we're going to talk

00:00:03.510 --> 00:00:06.000
so today we're going to talk
about dependency injection in spring
```

Nếu export nguyên như vậy thì mỗi câu xuất hiện 2–3 lần.

**Thuật toán khử lặp** (áp dụng cho `AUTO`; với `MANUAL` chỉ chạy bước 4–5):

1. Bỏ các cue có duration < 50ms.
2. Với mỗi cue, xét từng dòng (sau khi trim). Nếu dòng trùng với dòng vừa emit gần nhất thì bỏ qua, ngược lại emit thành segment mới với `start = cue.start`.
3. `end` của mỗi segment = `start` của segment kế tiếp; riêng segment cuối lấy `cue.end`.
4. Clamp: `end > start`, duration tối thiểu 300ms, không overlap với segment sau.
5. Bỏ các segment rỗng; gộp khoảng trắng thừa.

**Gộp câu** (option `mergeShortLines`, mặc định bật cho `AUTO`): nối các segment liên tiếp khi thoả **tất cả** điều kiện sau:
- Tổng độ dài ≤ 84 ký tự (2 dòng × 42).
- Khoảng hở giữa hai segment < 1.0s.
- Tổng duration ≤ 7s.

Mục đích: mỗi dòng .srt là một ý đủ nghĩa, dịch tay dễ hơn.

> Ghi chú: cần thử với 3–5 video thật (có manual sub, chỉ có auto sub, video dài trên 1 giờ). Lưu kết quả lại làm golden file cho test.

### 4.6 SrtWriter

- Format mỗi cue:
  ```
  {index}
  HH:MM:SS,mmm --> HH:MM:SS,mmm
  {text}
  (dòng trống)
  ```
- Index bắt đầu từ 1.
- Hỗ trợ giờ ≥ 10 (video rất dài).
- Encoding UTF-8, mặc định không BOM; option `bom=true` cho player cũ.
- Tên file: `{title-đã-sanitize}_{videoId}.en.srt`. Sanitize bằng cách bỏ ký tự `\/:*?"<>|` và cắt còn tối đa 80 ký tự. Header `Content-Disposition` dùng `filename*=UTF-8''...` để giữ được tiếng Việt / Unicode.

## 5. Database

**`video`**

| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | VARCHAR(11) PK | videoId |
| title | VARCHAR(500) | |
| channel | VARCHAR(255) | |
| duration_sec | INT | |
| sub_lang | VARCHAR(16) | vd `en`, `en-orig` |
| sub_source | VARCHAR(10) | `MANUAL` / `AUTO` |
| cue_count | INT | |
| fetched_at | TIMESTAMP | |

**`cue`**

| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | BIGINT PK (identity) | |
| video_id | VARCHAR(11) FK | index |
| idx | INT | thứ tự, unique (video_id, idx) |
| start_ms | BIGINT | |
| end_ms | BIGINT | |
| text_en | VARCHAR(1000) | |
| text_vi | VARCHAR(1000) NULL | **để sẵn cho Phase 2**, Phase 1 không dùng |

File `.vtt` gốc được giữ ở `data/subs/` để debug hoặc re-parse khi cải tiến normalizer, không cần gọi lại YouTube.

## 6. REST API

| Method | Path | Mô tả |
|---|---|---|
| POST | `/api/videos` | body `{ "url": "..." }`. Trả 201 nếu mới, 200 nếu đã có |
| GET | `/api/videos` | danh sách video đã lấy, mới nhất trước |
| GET | `/api/videos/{id}` | thông tin video + sub_source |
| GET | `/api/videos/{id}/cues` | danh sách cue (preview) |
| GET | `/api/videos/{id}/subtitle.srt` | tải file .srt (`?bom=true` tuỳ chọn) |
| POST | `/api/videos/{id}/refresh` | xoá cue cũ, tải lại từ YouTube |
| DELETE | `/api/videos/{id}` | xoá video + cue + file vtt |

**Lỗi** trả về qua `@RestControllerAdvice` theo format `ProblemDetail`:

| Exception | HTTP | code |
|---|---|---|
| InvalidUrlException | 400 | `INVALID_URL` |
| NoEnglishSubtitleException | 422 | `NO_ENGLISH_SUBTITLE` |
| YtDlpFailedException | 502 | `YTDLP_FAILED` |
| YtDlpTimeoutException | 504 | `YTDLP_TIMEOUT` |
| VideoNotFoundException | 404 | `VIDEO_NOT_FOUND` |

## 7. Frontend (React SPA, 1 trang ở Phase 1)

> Chọn React + Vite + TS thay cho vanilla JS (quyết định 2026-11-02) vì Phase 2–3 cần player YouTube, overlay Vietsub đồng bộ theo thời gian và sửa câu trực tiếp, tức giao diện có nhiều state. Backend chỉ cung cấp REST API, không render HTML.

**Cấu trúc và tích hợp:**
- `frontend/` ở gốc repo: `package.json`, `vite.config.ts`, `src/` (components, `api/` client có type cho DTO).
- Vite `build.outDir` = `../target/classes/static` để Spring Boot serve trực tiếp; không commit file build.
- `frontend-maven-plugin`: `install-node-and-npm` → `npm ci` → `npm run test` → `npm run build` trong `mvn package`. Có thể bỏ qua bằng `-Dskip.npm` khi chỉ làm backend.
- Dev: `npm run dev` (Vite :5173) proxy `/api` → `http://localhost:8080`; backend chạy `mvn spring-boot:run`.
- Không dùng router ở Phase 1 (1 trang). Gọi API bằng `fetch` qua một module client có type.

**Màn hình:**

- Ô dán URL và nút **Lấy Engsub**. Trong lúc chờ: hiện trạng thái loading và disable nút để tránh bấm 2 lần.
- Card kết quả gồm:
  - Thumbnail (`https://i.ytimg.com/vi/{id}/mqdefault.jpg`), tiêu đề, kênh, thời lượng.
  - Badge **Manual** / **Auto-generated**. Nếu là Auto thì hiện kèm ghi chú: phụ đề tự động, không có dấu câu.
  - Số lượng cue và nút **Tải .srt**.
  - Bảng preview: thời gian + text, cuộn được.
- Danh sách video đã lấy trước đó, có nút tải lại .srt, refresh và xoá.
- Lỗi hiển thị rõ ràng theo `code`. Ví dụ: "Video này không có phụ đề tiếng Anh".

## 8. Task breakdown

Mỗi task đều kèm unit test chạy trên dummy data, không gọi mạng.

| Task | Nội dung | Test chính |
|---|---|---|
| T01 | Scaffold Spring Boot 3, Maven, H2 file mode, `application.yml`, cấu trúc package | context load |
| T02 | `UrlParser` | ~12 case: các dạng URL, kèm query, ID sai độ dài hoặc sai ký tự, null/blank |
| T03 | `VttParser` | file manual mẫu; file có NOTE/STYLE; inline tag; entity; CRLF + BOM; timestamp `MM:SS.mmm` |
| T04 | `CaptionNormalizer` | file auto rolling mẫu (như mục 4.5) → không còn dòng lặp; cue 10ms bị bỏ; không overlap; rule gộp câu; manual không bị gộp sai |
| T05 | `SrtWriter` | format timestamp (0ms, 59:59.999, > 10h); index; dòng trống; BOM on/off; sanitize filename |
| T06 | `SubtitleTrackSelector` + parse JSON `yt-dlp -J` | JSON mẫu: chỉ manual / chỉ auto / cả hai / không có en |
| T07 | `YtDlpClientImpl` (ProcessBuilder, timeout, stderr) | test với chương trình Java giả `FakeYtDlp` (in ra JSON / exit 1 / sleep vượt timeout); thay cho `fake-yt-dlp.sh` vì dev trên Windows |
| T08 | Entity + Repository + `SubtitleService` (orchestrate, cache theo videoId, refresh, delete) | Mockito fake `YtDlpClient`; `@DataJpaTest` cho repository |
| T09 | Controller + `@RestControllerAdvice` + endpoint tải .srt | `@WebMvcTest`: status code, ProblemDetail, header Content-Disposition |
| T10 | Frontend React + Vite + TS trong `frontend/`, tích hợp `frontend-maven-plugin` (gộp vào jar) | Vitest + React Testing Library (fetch giả): loading/disable nút, render card + badge, lỗi theo `code`, danh sách video; cộng thêm test tay theo checklist |
| T11 | Dockerfile (multi-stage: Maven build cả frontend → JRE 21 + python3 + yt-dlp) + `docker-compose.yml`, volume `/data`, README | build và chạy thử 3 video thật |

**Definition of Done Phase 1:** dán link 3 video thật (1 có manual sub, 1 chỉ có auto sub, 1 dài trên 1 giờ) → file .srt tải về mở đúng trong VLC, không có dòng lặp, timing khớp với tiếng nói.

## 9. Các phase sau (chỉ ghi lại hướng, chưa làm)

- **Phase 2 — Xem video với Vietsub: ✅ xong** (bản rút gọn sau khi người dùng làm rõ yêu cầu).
  - Màn hình Vietsub: dán URL + upload `.srt` tiếng Việt (giữ timing gốc) → lưu thành bộ phụ đề riêng (bảng `vi_cue`).
  - Danh sách video có Vietsub → màn hình xem: YouTube IFrame player + overlay Vietsub + toàn màn hình của app.
  - Spec: [docs/superpowers/specs/2026-11-02-phase2-vietsub-design.md](docs/superpowers/specs/2026-11-02-phase2-vietsub-design.md); plan: [docs/superpowers/plans/2026-11-02-phase2-vietsub.md](docs/superpowers/plans/2026-11-02-phase2-vietsub.md).
  - Chuyển sang Phase 3: chế độ kiểm tra song ngữ, khớp bản dịch với câu tiếng Anh, xuất `.vi.srt`.
- **Phase 3 — Sửa trực tiếp:** sửa từng câu ngay trên web khi đang xem, lưu vào DB, đánh dấu `edited`.
- **Phase 4 — Engine dịch:** dịch nháp theo batch có ngữ cảnh và glossary; không ghi đè câu đã `edited`.
- **Phase sau (chưa xếp phase):** `UrlParser` hỗ trợ thêm `music.youtube.com/watch?v=ID` và `youtube.com/live/ID`.

## 10. Rủi ro và lưu ý

- **yt-dlp thay đổi theo YouTube:** YouTube đổi cơ chế thường xuyên, yt-dlp phải update theo.
  - Pin version trong Dockerfile để build ổn định.
  - Khi lỗi `YTDLP_FAILED` thì việc đầu tiên là rebuild với bản mới.
  - Bản yt-dlp gần đây có thể cần thêm JS runtime (vd deno) để xử lý YouTube đầy đủ. Kiểm tra release notes lúc làm T11.
- **Video giới hạn tuổi / private / members-only:** yt-dlp sẽ lỗi nếu không có cookies. Phase 1 chỉ báo lỗi rõ ràng, không xử lý cookies.
- **Auto-caption không có dấu câu:** normalizer chỉ gộp theo độ dài và khoảng nghỉ, không thể thêm dấu câu. Khi dịch tay sẽ phải tự ngắt ý.
- **Bản quyền:** chỉ dùng cá nhân, không public file phụ đề của video người khác.
