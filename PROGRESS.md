# Subtitle Studio: Tổng quan và tiến độ

> Cập nhật lần cuối: 2026-11-03
> Plan chi tiết: [PLAN.md](PLAN.md)

## 1. Project là gì

Web app chạy local: **dán link YouTube → lấy phụ đề tiếng Anh → làm sạch (khử lặp auto-caption) → xuất file `.srt`** để dịch tay sang tiếng Việt.

Phase 1 chỉ làm phần lấy Engsub và xuất `.srt`. Các phase sau gồm upload Vietsub, player overlay, sửa trên web và engine dịch (xem [PLAN.md](PLAN.md), mục 9).

## 2. Tech stack

| Thành phần | Lựa chọn |
|---|---|
| Ngôn ngữ / framework | Java 21, Spring Boot **3.5.16**, Maven |
| Persistence | Spring Data JPA. **Oracle Database Free 23ai** (profile `oracle`, docker compose) là DB chạy hằng ngày; H2 `MODE=Oracle` cho dev (`./data/dev`) và test. Schema do **Flyway** quản lý (`db/migration`) |
| Lấy phụ đề | `yt-dlp` qua `ProcessBuilder` |
| Frontend | React + Vite + TypeScript (`frontend/`), build vào jar qua `frontend-maven-plugin` (từ T10) |
| Test | JUnit 5, AssertJ, Mockito, `@WebMvcTest`, `@DataJpaTest` |
| Chạy | Docker Compose: Oracle Free (`gvenzl/oracle-free:23.26.3-slim-faststart`, volume `oracle-data`) + app (JRE 21 + python3 + yt-dlp + deno, bind mount `./data` cho `subs/`); mật khẩu trong `.env` |

## 3. Cấu trúc hiện tại

```
subtitle-studio/
├── PLAN.md                  # plan Phase 1
├── PROGRESS.md              # file này
├── pom.xml
└── src/
    ├── main/
    │   ├── java/com/subtitlestudio/
    │   │   ├── SubtitleStudioApplication.java       # entry point, bật @ConfigurationPropertiesScan
    │   │   ├── config/
    │   │   │   ├── ClockConfig.java        # bean Clock (UTC) để test kiểm soát thời gian
    │   │   │   └── SubtitleStudioProperties.java    # bind cấu hình subtitle-studio.* (có validate)
    │   │   ├── subtitle/
    │   │   │   ├── CaptionNormalizer.java  # List<RawCue> → List<Cue> (khử rolling, clamp, gộp câu)
    │   │   │   ├── Cue.java                # record(startMs, endMs, text)
    │   │   │   ├── NoEnglishSubtitleException.java
    │   │   │   ├── SubtitleTrack.java      # record(lang, source)
    │   │   │   ├── SubtitleTrackSelector.java # VideoInfo → SubtitleTrack (manual > auto)
    │   │   │   ├── SourceType.java         # MANUAL | AUTO
    │   │   │   ├── SrtWriter.java          # List<Cue> → .srt (CRLF, UTF-8, BOM tuỳ chọn) + tên file
    │   │   │   ├── VttParser.java          # .vtt → List<RawCue>
    │   │   │   ├── RawCue.java             # record(startMs, endMs, lines)
    │   │   │   └── VttParseException.java
    │   │   ├── url/
    │   │   │   ├── UrlParser.java          # URL/ID → videoId 11 ký tự
    │   │   │   └── InvalidUrlException.java
    │   │   ├── video/
    │   │   │   ├── VideoController.java    # REST /api/videos (PLAN mục 6) + tải .srt
    │   │   │   ├── VideoDto.java / CueDto.java / FetchRequest.java  # DTO JSON
    │   │   │   ├── Video.java              # entity bảng video (PK = videoId)
    │   │   │   ├── CueEntity.java          # entity bảng cue (unique video_id+idx, text_vi để Phase 2)
    │   │   │   ├── VideoRepository.java
    │   │   │   ├── CueRepository.java      # bulk delete theo videoId
    │   │   │   ├── SubtitleService.java    # fetch (cache) / get / list / getCues / refresh / delete
    │   │   │   ├── FetchResult.java        # record(video, created)
    │   │   │   └── VideoNotFoundException.java
    │   │   ├── web/
    │   │   │   └── ApiExceptionHandler.java # exception → ProblemDetail có field code
    │   │   └── ytdlp/
    │   │       ├── VideoInfo.java          # record(id, title, channel, durationSec, subtitleLangs, autoCaptionLangs)
    │   │       ├── VideoInfoParser.java    # JSON yt-dlp -J → VideoInfo
    │   │       ├── YtDlpClient.java        # interface: fetchInfo, downloadVtt
    │   │       ├── YtDlpClientImpl.java    # ProcessBuilder, đọc stream song song, timeout, kill cả process con
    │   │       ├── YtDlpFailedException.java
    │   │       └── YtDlpTimeoutException.java
    │   └── resources/
    │       └── application.yml             # H2 file, ProblemDetail, subtitle-studio.*
    └── test/
        ├── java/com/subtitlestudio/
        │   ├── SubtitleStudioApplicationTests.java  # context load + binding cấu hình
        │   ├── subtitle/CaptionNormalizerTest.java
        │   ├── subtitle/SrtWriterTest.java
        │   ├── subtitle/SubtitleTrackSelectorTest.java
        │   ├── ytdlp/FakeYtDlp.java        # yt-dlp giả (chạy bằng java -cp), chế độ qua -Dfake.mode
        │   ├── ytdlp/VideoInfoParserTest.java
        │   ├── ytdlp/YtDlpClientImplTest.java
        │   ├── subtitle/VttParserTest.java
        │   ├── url/UrlParserTest.java
        │   ├── video/SubtitleServiceTest.java   # @DataJpaTest + pipeline thật, chỉ mock YtDlpClient
        │   ├── video/VideoControllerTest.java   # @WebMvcTest: status, ProblemDetail, header tải .srt
        │   └── video/VideoRepositoryTest.java   # @DataJpaTest: schema, ràng buộc, query
        └── resources/
            ├── application-test.yml        # profile test: H2 in-memory
            ├── vtt/
            │   ├── manual.vtt              # manual sub mẫu
            │   └── auto-rolling.vtt        # auto-caption rolling mẫu (dùng lại cho T04)
            └── ytdlp/                      # JSON yt-dlp -J mẫu
                ├── info-manual-only.json
                ├── info-auto-only.json
                ├── info-both.json
                └── info-no-english.json
```

Frontend:

```
frontend/
├── package.json / package-lock.json   # React 19, Vite 8, TS 7, Vitest 5 (version cố định)
├── vite.config.ts                     # build → ../target/classes/static, proxy /api → :8080, test jsdom
├── index.html
└── src/
    ├── main.tsx                       # font Be Vietnam Pro + styles
    ├── App.tsx                        # state: danh sách, video đang xem, pending, lỗi
    ├── App.test.tsx                   # luồng chính với fetch giả
    ├── styles.css                     # token màu/type, khung video, responsive, dark mode
    ├── api/client.ts                  # client có type + ApiError(status, code, detail)
    ├── lib/format.ts (+test)          # timecode SRT, thời lượng
    ├── lib/errors.ts (+test)          # code → thông báo tiếng Việt
    └── components/                    # UrlForm, ResultPanel, CueTable, VideoList
```

## 4. Cấu hình (`application.yml`)

```yaml
subtitle-studio:
  ytdlp:
    path: yt-dlp     # đường dẫn binary yt-dlp
    timeout: 60s     # quá thời gian thì kill process
  data-dir: ./data   # chứa data/subs/*.vtt (và DB H2 dev ./data/dev)
```

`SubtitleStudioProperties.subsDir()` trả về `{data-dir}/subs`. Profile `oracle` (`application-oracle.yml`): URL `jdbc:oracle:thin:@//${SUBTITLESTUDIO_DB_HOST:localhost}:1521/FREEPDB1`, user/mật khẩu từ `SUBTITLESTUDIO_DB_USER` / `SUBTITLESTUDIO_DB_PASSWORD` (bắt buộc), placeholder Flyway `NUMBER(19)` / `NUMBER(10)`, tắt bảng tạm `HTE_*` của Hibernate.

## 5. Cách chạy

```bash
# chạy hằng ngày: Oracle + app (cần .env, xem .env.example)
docker compose up -d --build

# test nhanh (H2 in-memory MODE=Oracle, schema từ Flyway)
mvn test -Dskip.npm

# thêm nhóm test trên Oracle thật (Testcontainers, cần Docker)
mvn verify -Poracle -Dskip.npm

# chạy app dev ngoài Docker (H2 ./data/dev.mv.db)
mvn spring-boot:run
```

Yêu cầu: JDK 21, Maven 3.9+, và `yt-dlp` trong PATH (cần từ T07 trở đi).

## 6. Tiến độ Phase 1

| Task | Nội dung | Trạng thái | Ghi chú |
|---|---|---|---|
| T01 | Scaffold Spring Boot, Maven, H2, `application.yml` | ✅ Xong | 3/3 test pass |
| T02 | `UrlParser` | ✅ Xong | 46 test case |
| T03 | `VttParser` | ✅ Xong | 15 test |
| T04 | `CaptionNormalizer` | ✅ Xong | 26 test; golden file với video thật làm ở T11 |
| T05 | `SrtWriter` | ✅ Xong | 23 test |
| T06 | `SubtitleTrackSelector` + parse JSON `yt-dlp -J` | ✅ Xong | 21 test |
| T07 | `YtDlpClientImpl` | ✅ Xong | 11 test, fake bằng Java thay cho `.sh` |
| T08 | Entity + Repository + `SubtitleService` | ✅ Xong | 21 test; app khởi động thật OK |
| T09 | Controller + `@RestControllerAdvice` | ✅ Xong | 23 test + smoke test curl trên app thật |
| T10 | Frontend React + Vite + TS (gộp vào jar) | ✅ Xong | 32 test Vitest; jar chứa frontend |
| T11 | Dockerfile + docker-compose + README | ✅ Xong | DoD 3 video thật ✅, golden test ✅, người dùng chạy thử `java -jar` OK; Docker image build + chạy thử OK (2026-11-03) |

**Tổng: 11/11 task, Phase 1 hoàn thành (tag `v0.1.0`). Backend `mvn test`: 192/192 pass (3 golden test chỉ chạy khi có golden local). Frontend `npm test`: 32/32 pass.**

**Definition of Done:** dán link 3 video thật (1 có manual sub, 1 chỉ có auto sub, 1 dài trên 1 giờ). File `.srt` phải mở đúng trong VLC, không có dòng lặp, timing khớp với lời nói.

## 6b. Tiến độ Phase 2: Xem video với Vietsub

Spec: [docs/superpowers/specs/2026-11-02-phase2-vietsub-design.md](docs/superpowers/specs/2026-11-02-phase2-vietsub-design.md). Plan: [docs/superpowers/plans/2026-11-02-phase2-vietsub.md](docs/superpowers/plans/2026-11-02-phase2-vietsub.md). Branch `phase2-vietsub` (worktree `../subtitle-studio-phase2`).

| Task | Nội dung | Trạng thái |
|---|---|---|
| P2-T01 | `SrtParser` | ✅ 14 test |
| P2-T02 | Bảng `vi_cue`, `VietsubService`, nâng cấp DB Phase 1, xoá video xoá cả Vietsub | ✅ 15 test |
| P2-T03 | `POST /api/vietsub`, GET/DELETE vietsub, `INVALID_SRT`, `FILE_TOO_LARGE`, forward `/vietsub/**` | ✅ 13 test |
| P2-T04 | Router, thanh điều hướng, trang Vietsub (thêm/thay/xoá), link "Xem Vietsub" ở trang Phase 1 | ✅ 13 test |
| P2-T05 | Màn hình xem: YouTube player, overlay, toàn màn hình | ✅ 17 test |
| P2-T06 | Kiểm chứng app thật + tài liệu | ✅ (trừ bước xem bằng mắt) |

| Sau review | Tắt CC YouTube, cỡ chữ như YouTube, tách menu, nút toàn màn hình kiểu YouTube, Download Vietsub, icon lucide-react | ✅ |

**Backend `mvn test`: 241/241. Frontend: 82/82.** Merge vào `main` 2026-11-02.

## 7. Nhật ký

### 2026-11-02: T01 Scaffold ✅
- Tạo `pom.xml` (Spring Boot 3.5.16, Java 21): web, data-jpa, validation, H2, configuration-processor.
- `application.yml`: H2 file mode `./data/subtitle-studio` (`AUTO_SERVER=TRUE`), `ddl-auto: update`, `open-in-view: false`, bật `spring.mvc.problemdetails`.
- `SubtitleStudioProperties` (record + `@Validated`) bind `subtitle-studio.*`.
- Test viết trước theo TDD: `contextLoads`, binding cấu hình, `subsDir()`.
- `.gitignore` (`target/`, `data/`, IDE) và `git init`. **Chưa commit.**

### 2026-11-02: T02 UrlParser ✅
- `UrlParser` (`@Component`) trả về videoId, sai thì ném `InvalidUrlException` (message có kèm input).
- Hỗ trợ: `watch?v=` (`v` ở vị trí bất kỳ trong query, kèm `t`/`list`/`index`), `youtu.be/ID` (kèm `?si=`), `shorts/ID`, `embed/ID`, `m.`/`www.`/không subdomain, thiếu scheme, host viết hoa, ID trần, khoảng trắng thừa.
- Từ chối: null/blank, ID sai độ dài, ký tự lạ (`;`, `$`, khoảng trắng, `%xx`), host giả (`youtube.com.evil.com`, `notyoutu.be`), scheme khác http/https, URL YouTube không có ID (`/channel/...`, `watch` không có `v`).
- TDD: chạy với stub trước, thấy 46/46 fail ở assertion, rồi mới viết code thật.

### 2026-11-02: T03 VttParser ✅
- `VttParser.parse(String)` (`@Component`) trả về `List<RawCue>`. Thiếu header `WEBVTT` hoặc content rỗng thì ném `VttParseException`.
- Xử lý: header có metadata hoặc title, bỏ block `NOTE`/`STYLE`/`REGION`, cue identifier có hoặc không, timestamp `MM:SS.mmm` và `HH:MM:SS.mmm` (giờ có thể nhiều hơn 2 chữ số), bỏ cue settings, xoá mọi inline tag, decode entity (named + numeric, single pass), CRLF/CR/LF, BOM.
- Bỏ dòng chỉ có khoảng trắng, bỏ cue không còn text, bỏ block không có dòng timing. Giữ nguyên rolling duplicate để T04 xử lý.
- **Bug tìm được nhờ test:** regex tách block ban đầu (`\n\s*\n`) coi dòng `" "` là dòng trống, làm vỡ cue auto-caption. Đã sửa thành chỉ tách theo dòng thật sự rỗng (`\n{2,}`).
- Thêm `.gitattributes` (`*.vtt`, `*.srt` để `-text -whitespace`) vì fixture phụ thuộc vào dòng chỉ có dấu cách.

### 2026-11-02: T04 CaptionNormalizer ✅
- `normalize(raw, type)`: mặc định gộp câu với AUTO, không gộp với MANUAL. Có overload `normalize(raw, type, mergeShortLines)`.
- AUTO: sort → bỏ cue < 50ms → khử rolling → gộp các segment cùng `start` → clamp (min 300ms, không overlap) → gộp câu (≤ 84 ký tự, gap < 1s, tổng ≤ 7s, greedy).
- MANUAL: giữ timing gốc, không khử lặp (giữ "Yeah." lặp có chủ đích), không bỏ cue ngắn, dòng nối bằng `\n`, chỉ clamp và gom khoảng trắng.
- Kết quả với fixture `auto-rolling.vtt`: 5 raw cue thành 3 segment, gộp câu còn 2 cue.
- Hằng số (`MIN_DURATION_MS`, `MAX_MERGED_CHARS`…) là `static final` trong class, chưa đưa ra config.

### 2026-11-02: T05 SrtWriter ✅
- `formatTimestamp(ms)` → `HH:MM:SS,mmm` (giờ có thể nhiều hơn 2 chữ số, số âm thì ném `IllegalArgumentException`).
- `write(cues)` → chuỗi SRT: index từ 1, CRLF, mỗi block cách nhau 1 dòng trống, text nhiều dòng chuyển sang CRLF.
- `toBytes(cues, bom)`: UTF-8, BOM `EF BB BF` khi `bom=true`.
- `fileName(title, id)` → `{title}_{id}.en.srt`: bỏ `\/:*?"<>|` và ký tự điều khiển, gom khoảng trắng, cắt 80 code point (không làm vỡ emoji), bỏ `.`/dấu cách ở cuối. Title rỗng thì còn `{id}.en.srt`.
- **2 bug tìm được nhờ test:** (1) `@CsvSource` coi dấu `,` trong `00:00:00,000` là phân cách cột (bug của test, đổi sang `delimiter='|'`); (2) `String.format` theo locale mặc định sinh chữ số Ả Rập với `ar-EG-u-nu-arab`, đã sửa bằng `Locale.ROOT`.

### 2026-11-02: T06 SubtitleTrackSelector + VideoInfoParser ✅
- `VideoInfoParser.parse(json)` → `VideoInfo`: thiếu `channel` thì lấy `uploader`; `duration` có thể `null` hoặc float (làm tròn); chỉ giữ ngôn ngữ có track không rỗng; bỏ `live_chat`. JSON hỏng hoặc thiếu `id` thì ném `YtDlpFailedException`.
- `SubtitleTrackSelector.select(info)`: manual `en` → `en-US` → `en-GB` → `en-*` khác (theo alphabet) → auto `en-orig` → `en` → không có thì ném `NoEnglishSubtitleException` (message có videoId). Không nhầm `eng`/`enm`; không lấy auto `en-US`.
- 4 fixture JSON: chỉ manual / chỉ auto / cả hai / không có tiếng Anh.
- Tạo sẵn `YtDlpFailedException` cho T07.

### 2026-11-02: T07 YtDlpClientImpl ✅
- `YtDlpClient` (interface) + `YtDlpClientImpl` (`@Component`, lấy `path`/`timeout` từ `SubtitleStudioProperties`).
- `fetchInfo`: `-J --skip-download {url}` → `VideoInfoParser`.
- `downloadVtt`: `--skip-download --write-subs|--write-auto-subs --sub-langs {lang} --sub-format vtt -o {outDir}/%(id)s {url}`. Tự tạo `outDir`; trả về `{outDir}/{id}.{lang}.vtt`. Exit 0 mà không có file thì ném `YtDlpFailedException`.
- Xử lý process: argument dạng list, không qua shell; đọc stdout/stderr song song bằng virtual thread; hết timeout thì kill cả process con và ném `YtDlpTimeoutException`; exit ≠ 0 thì ném `YtDlpFailedException` kèm 500 ký tự cuối của stderr; không chạy được binary cũng ném `YtDlpFailedException`.
- Env `PYTHONUTF8=1`, `PYTHONIOENCODING=utf-8` để yt-dlp in UTF-8 trên Windows.
- **Thay `fake-yt-dlp.sh` bằng `FakeYtDlp.java`** (chạy được trên Windows); PLAN và CLAUDE.md đã cập nhật theo.
- **Mutation test:** tạm đổi sang đọc stream tuần tự thì test `drainsLargeStdoutAndStderrWithoutDeadlock` fail (treo đến timeout 20s), chứng minh test bắt được deadlock thật. Code đã được khôi phục.

### 2026-11-02: Đổi tên project và tạo repo
- `translate-video` → `subtitle-studio`: package `com.subtitlestudio`, prefix cấu hình `subtitle-studio.*`, DB `./data/subtitle-studio`.
- Repo public: https://github.com/tlqngoc12/subtitle-studio (branch `main`, commit đầu `ce6fbe0` gồm T01–T07).

### 2026-11-02: T08 Entity + Repository + SubtitleService ✅
- `Video` (PK videoId) và `CueEntity` (`unique(video_id, idx)`, index `video_id`, `text_vi` nullable) đúng schema PLAN mục 5.
- `SubtitleService`: `fetch(url)` (đã có trong DB thì trả về luôn, không gọi yt-dlp lại; `FetchResult.created` cho T09 chọn 201/200), `get`, `list` (mới nhất trước), `getCues`, `refresh`, `delete` (xoá cả file `.vtt`). `refresh` khi đổi ngôn ngữ track thì xoá file `.vtt` cũ.
- **yt-dlp chạy ngoài transaction**; chỉ bước ghi DB nằm trong `TransactionTemplate`. yt-dlp lỗi hoặc không có tiếng Anh thì không lưu gì; `refresh` lỗi thì dữ liệu cũ còn nguyên.
- Test: `@DataJpaTest` + parser/normalizer thật, chỉ `@MockitoBean YtDlpClient` (mock copy fixture `.vtt` vào thư mục tạm).
- **Bug tìm được nhờ test:**
  1. `videos.save()` với id gán tay sẽ `merge` và trả về bản sao; cue tham chiếu object gốc (transient) nên flush lỗi `TransientObjectException`. Đã sửa: dùng object do `save()` trả về. **Nếu không có test, lỗi này xảy ra ngay lần lưu video đầu tiên.**
  2. Bulk delete JPQL để lại `CueEntity` cũ trong persistence context. Đã sửa: `@Modifying(flushAutomatically, clearAutomatically)` và load lại entity sau khi xoá.
  3. (Lỗi test) bean `MutableClock` bị dùng chung giữa các test vì Spring cache context; đã reset trong `@BeforeEach`.
- Test `deleteRemovesVideoCuesAndVttFile` ban đầu pass luôn với stub (vì không có gì để xoá); đã thêm kiểm tra điều kiện ban đầu.

### 2026-11-02: Chốt frontend
- Đổi frontend từ vanilla JS sang **React + Vite + TypeScript**, **gộp vào 1 jar** (`frontend-maven-plugin`). PLAN mục 2, 7, 8 (T10, T11) và CLAUDE.md đã cập nhật.

### 2026-11-02: T09 Controller + ApiExceptionHandler ✅
- 7 endpoint đúng PLAN mục 6. `POST /api/videos` trả 201 + `Location` khi mới, 200 khi đã có. `DELETE` trả 204.
- `GET /{id}/subtitle.srt`: `Content-Type: application/x-subrip;charset=UTF-8`, `Content-Disposition: attachment; filename*=UTF-8''...` (giữ tiếng Việt), `?bom=true` thêm BOM.
- DTO riêng (`VideoDto` có thêm `thumbnailUrl`, `CueDto` có `idx` bắt đầu từ 0), không trả entity ra JSON.
- `ApiExceptionHandler` kế thừa `ResponseEntityExceptionHandler`: 5 mã của PLAN, cộng thêm `VttParseException` → 502 `YTDLP_FAILED` và lỗi không lường trước → 500 `INTERNAL_ERROR` (không lộ message nội bộ). JSON hỏng → 400 ProblemDetail (từ class cha).
- **Smoke test bằng curl trên jar thật:** `GET /api/videos` → `[]` 200; URL sai → 400 `INVALID_URL` (`application/problem+json`); id lạ → 404 `VIDEO_NOT_FOUND`; URL hợp lệ khi máy chưa có yt-dlp → 502 `YTDLP_FAILED` với message rõ ràng.

### 2026-11-02: T10 Frontend React ✅
- App React 1 trang: khung video tối với ô nhập như dòng phụ đề vàng (điểm nhấn duy nhất), thanh scrubber chạy khi đang lấy; panel kết quả (thumbnail, tiêu đề, kênh, thời lượng, badge Manual/Auto-generated, ghi chú cho Auto, số câu, nút Tải .srt, bảng preview cuộn được); danh sách "Đã lấy trước đó" (mở, Tải .srt, Làm mới, Xoá có hỏi xác nhận); lỗi hiển thị theo `code` (`role="alert"`).
- Chất lượng: focus hiển thị rõ khi dùng bàn phím, `prefers-reduced-motion`, dark mode (khung video luôn tối), responsive (một cột dưới 760px).
- `frontend-maven-plugin` 2.0.2: Node v26.13.0 cài vào `frontend/node`; `npm ci` (generate-resources), `npm test` (test), `npm run build` (prepare-package). `-Dskip.npm` bỏ qua toàn bộ. `mvn package` → jar có `BOOT-INF/classes/static/index.html`.
- **Bug tìm được khi kiểm tra:** font ban đầu (Atkinson Hyperlegible Next) **không có subset tiếng Việt** (thiếu U+1EA0–1EF1, vd "ọ", "ầ"), nên chữ có dấu sẽ bị lấy font khác thay vào giữa từ. Đã đổi sang **Be Vietnam Pro** (có subset `vietnamese`).
- TS 7 kiểm tra import side-effect: cần `vite/client` trong `types` để import `.css`.
- **Kiểm tra trực quan:** chụp màn hình (Edge headless) bản desktop 1280px và bản hẹp 560px với dữ liệu mẫu: đúng thiết kế. Ảnh 390px bị cắt do giới hạn độ rộng tối thiểu của Edge headless, không phải lỗi layout. **Chưa xem bằng mắt panel kết quả** (cần click) và chưa thử trên điện thoại thật; panel kết quả đã có test Vitest.

**Checklist test tay (khi đã có yt-dlp):**
- [ ] Dán link video có manual sub → badge Manual, không có ghi chú auto, tải .srt mở được trong VLC
- [ ] Dán link video chỉ có auto sub → badge Auto-generated + ghi chú, không có dòng lặp
- [ ] Dán lại cùng video bằng link dạng khác → trả về ngay, không gọi yt-dlp lại
- [ ] Link sai / video không có tiếng Anh → thông báo lỗi tiếng Việt rõ ràng
- [ ] Làm mới, Xoá (hỏi xác nhận) trong danh sách
- [ ] Dùng hoàn toàn bằng bàn phím (Tab qua ô nhập, nút, danh sách)
- [ ] Dark mode, màn hình hẹp

### 2026-11-02: T11 Docker + README ✅
- `Dockerfile` multi-stage: `maven:3.9-eclipse-temurin-21` build cả backend lẫn frontend (chạy luôn JUnit + Vitest) → `eclipse-temurin:21-jre-noble` + python3 venv + **yt-dlp `2026.10.26`** (`[default]`, có `yt-dlp-ejs`) + **deno `2.9.8`**; chạy bằng user không phải root (uid 10001); `VOLUME /data`; healthcheck `GET /api/videos`.
- `docker-compose.yml`: cổng 8080, named volume `subtitle-studio-data` (tránh lỗi quyền của bind mount trên Linux).
- `.dockerignore`; `.gitattributes` thêm `* text=auto eol=lf` để file không bị CRLF khi build trên Linux.
- `application.yml`: URL datasource suy ra từ `subtitle-studio.data-dir`. Đã kiểm tra trên jar thật: `SUBTITLESTUDIO_DATADIR=<dir>` tạo DB trong `<dir>`, không tạo `./data`.
- `README.md` (tiếng Việt): chạy bằng Docker, chạy trực tiếp, cấu hình, phát triển, API, xử lý lỗi, lưu ý bản quyền.
- **Chưa kiểm chứng:** build/run Docker image (máy chưa có Docker).

#### Definition of Done: 3 video thật (yt-dlp 2026.10.26 + deno 2.9.8, chạy `java -jar`)

| Video | Loại | Kết quả API | Câu | Dòng lặp | Chồng giờ | Số từ so với VTT |
|---|---|---|---|---|---|---|
| `iG9CE55wbtY` Ken Robinson, TED (20 phút) | manual `en` | 201 trong 13,4s | 427 | 0 | 0 | 1,004 |
| `9SGDpanrc8U` Spring Boot full course (1 giờ 37 phút) | chỉ auto `en-orig` | 201 trong 19,2s | 1152 | 0 | 0 | 1,000 |
| `5Gk9gIpGvSE` Climate debate (4 giờ 11 phút) | chỉ auto `en-orig` | 201 trong 13,2s | 3238 | 0 | 0 | 1,000 |

- Dán lại cùng video bằng link `youtu.be` → 200 trong 0,009s (cache, không gọi yt-dlp).
- File `.srt`: index liên tục, CRLF, UTF-8 không BOM, AUTO không câu nào > 84 ký tự; `Content-Disposition` có `filename*=UTF-8''…`.
- **Xác nhận giả định từ T07:** yt-dlp ghi đúng `{id}.{lang}.vtt`; `--sub-langs en-orig` hoạt động.
- 13 câu AUTO dài hơn 7s (dài nhất 43s) là các đoạn ngắn như tiêu đề mục, hiện lâu khi người nói dừng, giống YouTube. Rule 7s chỉ áp dụng khi gộp, nên đây là hành vi đúng.
- 2 trường hợp "câu sau lặp đuôi câu trước" đều là lời nói lặp thật (diễn giả nhắc lại câu trích; người nói ngập ngừng), không phải lỗi khử lặp.
- **Người dùng chạy thử** bằng `java -jar` (cổng 8080): lấy video `Vk_DcKbZ0KA` (manual, 171 câu), tải `.srt` thành công, log không có ERROR/WARN; đồng ý chốt Phase 1.

#### Golden test (PLAN 4.5), chỉ lưu local
- `GoldenSubtitleTest`: với mỗi `golden/<id>.<MANUAL|AUTO>.vtt`, chạy parser + normalizer + writer và so **từng byte** với `golden/<id>.srt` (đã kiểm chứng ở trên).
- **Không commit** vì đó là phụ đề của người khác (repo public, PLAN mục 10): `src/test/resources/golden/` nằm trong `.gitignore`; thiếu thư mục thì test tự bỏ qua (CI, Docker, máy khác).
- Đã kiểm tra: thiếu golden → skip; có golden → 3/3 pass; sửa đúng 1 byte trong `.srt` → fail.
- Tạo lại: chạy app, `POST /api/videos` cho video cần dùng, copy `data/subs/<id>.<lang>.vtt` thành `golden/<id>.<MANUAL|AUTO>.vtt` và file tải từ `/subtitle.srt` thành `golden/<id>.srt` (sau khi đã kiểm tra bằng mắt).

### 2026-11-02: Chốt Phase 1 🏁
- Gắn tag `v0.1.0`. Việc còn treo: build và chạy Docker image (cần Docker Desktop).
- Bước tiếp theo: brainstorm và viết plan Phase 2 (Vietsub thủ công).

### 2026-11-02: Phase 2 (Vietsub) ✅
- Spec ban đầu (khớp bản dịch vào câu tiếng Anh theo timecode, chế độ kiểm tra song ngữ, tiến độ, xuất `.vi.srt`) được **rút gọn** sau khi người dùng làm rõ: chỉ cần URL + `.srt` (giữ timing) → danh sách → màn hình xem. Phần bỏ chuyển sang Phase 3.
- Vietsub lưu ở bảng `vi_cue` theo timing của file; `video` thêm `vi_cue_count` (`INT DEFAULT 0 NOT NULL`) và `vi_updated_at`. Test khởi động trên schema thật của Phase 1.
- File `.srt` được parse **trước** khi gọi YouTube; video chưa có thì app tự lấy bằng pipeline Phase 1.
- Player: YouTube IFrame API trên `youtube-nocookie.com`, `fs: 0` (nút toàn màn hình của YouTube che overlay) và nút toàn màn hình riêng; thời gian đọc theo `requestAnimationFrame` khi đang phát.
- **Bug tìm được nhờ test:** xoá video có Vietsub ở trang Phase 1 gây lỗi khoá ngoại (`vi_cue` → `video`); đã sửa trong `SubtitleService.delete`.
- **Kiểm chứng trên bản sao DB thật** (H2 Script/RunScript): khởi động OK; thêm Vietsub cho video có sẵn (171 câu, 0,19s) và video chưa có (tự lấy, 13s); thay Vietsub; file hỏng/UTF-16 → 400 `INVALID_SRT`; file 6 MB → 413 `FILE_TOO_LARGE` (giới hạn thật của Tomcat); xoá video có Vietsub → 204; route `/vietsub/**` trả HTML, `/api/khong-co` vẫn 404.
- **Chưa kiểm chứng bằng mắt:** phát video có Vietsub đồng bộ, pause/tua, toàn màn hình (Edge headless không phát được video YouTube).

### 2026-11-02: Phase 2, chỉnh sửa sau review và theo phản hồi của người dùng
- Review độc lập (0 Critical): sửa "tua khi pause thì Vietsub đứng yên" (poll 250 ms khi không phát) và "`.srt` thiếu dòng trống giữa block" (tách theo từng dòng timing). 11 Minor còn lại ghi trong Backlog.
- **CC của YouTube tự bật** cho video tiếng nước ngoài, đè vị trí Vietsub: tắt bằng `cc_load_policy: 0` + `unloadModule('captions')` khi ready và khi bắt đầu phát.
- **Cỡ chữ Vietsub** như phụ đề YouTube: 1,9cqw (≈20px ở khung 1040px), chữ thường, nền đen 75%; overlay đặt ở 14% từ đáy để không đè thanh tua.
- **Menu tách 3 mục:** Lấy Engsub (`/`), Vietsub (`/vietsub`: form + quản lý Download/Replace/Delete), Danh sách Vietsub (`/vietsub/list`: chỉ để xem; màn xem tô sáng mục này).
- **Toàn màn hình kiểu YouTube:** nút icon ở góc dưới phải trong khung, bật/tắt, phím `F`. Nút luôn hiện mờ vì khung không nhận `:hover` khi chuột ở trên iframe (đã kiểm chứng bằng CDP).
- **Download Vietsub:** `GET /api/videos/{id}/subtitle.vi.srt` → `{title}_{id}.vi.srt`; 404 `NO_VIETSUB` khi chưa có.
- **Icon:** chuyển từ SVG tự vẽ sang `lucide-react` 1.66.0 (bundle +≈4 KB nhờ tree-shaking).

### 2026-11-03: Kiểm chứng Docker image ✅
- Docker Desktop 29.9.2. Lần build đầu **lỗi**: Node do `frontend-maven-plugin` tải về cần `libatomic.so.1`, image `maven:3.9-eclipse-temurin-21` không có (exit 127 ở `npm ci`). Đã sửa: cài `libatomic1` ở build stage.
- Build lại OK trong khoảng 2,5 phút: JUnit 244/244, Vitest 82/82; image `subtitle-studio:local` nặng 787 MB.
- Chạy thử ở cổng 18080 với volume riêng: container healthy, chạy bằng uid 10001, yt-dlp 2026.10.26, deno 2.9.8, Java 21.0.13; `/` và `/vietsub/list` trả 200, URL sai → 400 `INVALID_URL`.
- Video thật `iG9CE55wbtY`: 201 trong 7,6s (manual, 427 câu), tải `.srt` OK, upload Vietsub OK, tải `.vi.srt` OK; restart container xong dữ liệu vẫn còn trong volume; log không có ERROR/WARN.
- `docker compose up -d`: container healthy ở cổng 8080.
- **Compose đổi từ named volume sang bind mount `./data:/data`**: bản Docker và bản `java -jar` dùng chung một DB (trước đó bản Docker mở với DB rỗng, không thấy dữ liệu Phase 2 đã chép sang `main`). Không chạy hai bản cùng lúc.
- Dữ liệu Docker Desktop (image, volume, cache) chuyển sang `D:\docker\DockerDesktopWSL`.

### 2026-11-03: Chỉnh giao diện, phân trang ✅
- **Lấy Engsub:** bỏ badge Manual/Auto-generated (panel kết quả và danh sách); vẫn giữ ghi chú "không có dấu câu" cho phụ đề tự động. Khung dán link ôm sát nội dung (bỏ chiều cao 300px, rộng tối đa 760px).
- **Phân trang 10 video/trang** cho Đã lấy trước đó, Quản lý Vietsub, Danh sách Vietsub: phía frontend (API không đổi), `react-paginate` 8.3.0 + style riêng, số trang trên URL `?page=` (Back từ màn xem về đúng trang), ẩn khi ≤ 10 video, xoá hết trang cuối thì lùi trang, Lấy Engsub/Replace về trang 1.
- **Bug tìm được khi chụp màn hình bản build:** `react-paginate` là UMD (component ở `module.exports.default`); Vitest tự gỡ, bản build Vite thì không → trang trắng (React #130), test vẫn pass. Đã xử lý interop trong `Pagination.tsx`. Khi nâng version thư viện này phải kiểm tra bản build.
- Frontend `npm test`: 110/110. Backend: 244/244.

### 2026-11-03: Oracle + Flyway (dự án con 1/2 của hướng nhiều người dùng) ✅
Spec: [docs/superpowers/specs/2026-11-03-oracle-design.md](docs/superpowers/specs/2026-11-03-oracle-design.md). Plan: [docs/superpowers/plans/2026-11-03-oracle.md](docs/superpowers/plans/2026-11-03-oracle.md). Làm trên worktree `../subtitle-studio-oracle` (nhánh `oracle`), merge fast-forward vào `main`.
- **Flyway** `V1__init.sql` (SQL Oracle) tạo `video`, `cue`, `vi_cue`, sequence `cue_seq`/`vi_cue_seq` (`INCREMENT BY 50`, khớp `allocationSize = 50`, batch insert 100). Hibernate chỉ `validate`. `SchemaUpgradeTest` bỏ (không còn đường nâng cấp schema bằng Hibernate).
- **Điều chỉnh so với spec:** H2 báo `NUMBER(19)`/`NUMBER(10)` là `NUMERIC`, Hibernate validate (H2Dialect) đòi `BIGINT`/`INTEGER` → cột số nguyên dùng placeholder Flyway `${bigint}`/`${int}` (H2: `BIGINT`/`INTEGER`; Oracle: `NUMBER(19)`/`NUMBER(10)`). Vẫn một file migration.
- **Tiêu đề rỗng → videoId** trong `VideoInfoParser` (Oracle lưu `''` thành NULL, `title` NOT NULL).
- **Profile `oracle` + `PersistenceOracleIT`** (Testcontainers, cùng image với compose): Flyway + validate, tiêu đề Thái 480 ký tự + emoji, câu tiếng Việt 1000 ký tự, 3.200 câu batch, xoá theo khoá ngoại, `Instant` micro giây, `''` → ORA-01400. 7/7 pass. **Bug tìm được:** `hikari.connection-timeout: 30s` không bind được (Hikari nhận số ms) → app Oracle sẽ không khởi động; sửa thành `30000`.
- **Hibernate tự tạo bảng tạm `HTE_CUE`/`HTE_VI_CUE`** trên Oracle lúc khởi động (kể cả khi `validate`) → tắt bằng `hibernate.query.mutation_strategy.global_temporary.create_tables: false`. Test `onlyFlywayCreatesTables` đã thêm nhưng **chưa chạy** (container test Oracle khởi động quá chậm lúc đó; người dùng chọn bỏ qua phần test). Đã kiểm tay trên Oracle thật: chỉ còn `CUE`, `VIDEO`, `VI_CUE`, `flyway_schema_history`; xoá Vietsub và xoá video chạy được.
- **Test frontend flaky** (từ commit phân trang): truy vấn item ngay khi khung danh sách vừa hiện, trước khi fetch xong → fail trong Docker build. Thêm `loadedRegion()`; chứng minh bằng độ trễ fetch 50 ms tạm thời: 25 fail trước, 0 sau.
- **Smoke test compose** (project tạm, cổng 18080): fetch video thật 201 (427 câu), Vietsub 427, restart toàn bộ (Flyway "up to date", dữ liệu còn), restart riêng Oracle (API 200 ngay), sqlplus bằng `subtitle_studio`, charset AL32UTF8, cổng chỉ `127.0.0.1:1521`.
- **Chuyển dữ liệu thật:** tải 4 file `.vi.srt` (backup ở `../subtitle-studio-vietsub-backup-20261103`), `docker compose up` bản Oracle, thêm lại 4 video: số câu Engsub/Vietsub khớp 100% (WI5Mcuvwf34 310/306, iuZ8Ebi9Plg 403/398, UFWHj80bFDs 239/236, Vk_DcKbZ0KA 171/171). `fetched_at`/`vi_updated_at` là thời điểm thêm lại. File H2 cũ `./data/subtitle-studio.mv.db` vẫn giữ nguyên.
- Backend `mvn test`: 247/247 (golden test chỉ chạy khi có dữ liệu golden local). Frontend: 110/110.

### 2026-11-03: Menu Profile (EmiBonnie, Emi, Bonnie) ✅
Spec: [docs/superpowers/specs/2026-11-03-profiles-design.md](docs/superpowers/specs/2026-11-03-profiles-design.md). Plan: [docs/superpowers/plans/2026-11-03-profiles.md](docs/superpowers/plans/2026-11-03-profiles.md). Làm trên worktree `../subtitle-studio-profiles` (nhánh `profiles`).
- **Flyway `V2__profiles.sql`**: `t_profile` (seed 3 profile, `id` từ sequence, `slug` làm URL), `t_profile_block` (mỗi khối 1 dòng, cột theo loại khối, CHECK `block_type`), `t_profile_block_item` (`ON DELETE CASCADE`), `t_media`. **Điều chỉnh so với spec:** cột `value` → `item_value` (`VALUE` là từ khoá H2); timestamp `TIMESTAMP(6) WITH TIME ZONE` như V1.
- **Ảnh**: nhận diện bằng magic bytes (không tin `Content-Type`), tối đa 10 MB, file `./data/media/{storage_key}.{ext}` (UUID, ghi bằng `CREATE_NEW`: H2 dev và Oracle dùng chung `./data` và sequence đều bắt đầu từ 1, nên tên theo id sẽ ghi đè ảnh của nhau, lỗi do final review tìm ra). Lưu dòng `t_media` rồi ghi file trong cùng transaction. Ảnh không còn khối nào dùng bị xoá **sau khi commit** (sửa lỗi/rollback thì ảnh cũ còn); ảnh upload bỏ ngang > 24h dọn lúc khởi động.
- **Giới hạn upload**: multipart nâng lên 10 MB cho ảnh; `VietsubService` tự chặn `.srt` > 5 MB (`FILE_TOO_LARGE`). 413 trên `/api/media` trả `MEDIA_TOO_LARGE`.
- **Link nhúng**: chỉ YouTube (qua `UrlParser`, nhúng `youtube-nocookie.com`) và Spotify `track/album/playlist/artist`; backend lưu URL nhúng đã chuẩn hoá. Link khối LINKS chỉ `http/https`. Markdown không render HTML thô.
- **Frontend**: menu Profile, tab EmiBonnie · Emi · Bonnie, chế độ sửa tại chỗ (Lên/Xuống thay kéo thả), `react-markdown`, `yet-another-react-lightbox`, font dự phòng `Noto Sans Thai`.
- Backend `mvn test`: 347/347. `mvn verify -Poracle`: 11/11 (gồm `onlyFlywayCreatesTables` lần đầu được chạy, và CLOB 50.000 ký tự Thái + emoji + tiếng Việt). Frontend: 151/151.
- **Sau review, trên compose thật** (build image từ nhánh, `docker compose up -d --no-build subtitle-studio`; image cũ tag `subtitle-studio:pre-profiles`): Flyway chạy V2 trên Oracle, upload, đổi ảnh (ảnh cũ bị xoá), restart (khối và ảnh còn), chữ Việt/Thái/emoji OK. **Bug tìm được:** F5 ở `/profiles/emi` → 404 vì `SpaForwardController` chưa có route `/profiles` → đã thêm.
- **Docker build nhanh hơn:** `mvn -B package -DskipTests` (bỏ cả JUnit lẫn Vitest) + BuildKit cache mount `/root/.m2`, `/root/.npm`. Lần build đầu với Dockerfile mới: 49 giây. Test phải chạy bằng `mvn test` / `npm test` trước khi commit.
- **Màu chủ đạo:** cam `--brand` #F39A42 (nút chính, khung link, tab profile, viền form sửa), tím `--brand-2` #D9A1D9 (menu/trang hiện tại, hover). Chữ trên hai màu này luôn là `--on-brand` #1B2430; focus ring vẫn xanh.
- Merge `--no-ff` vào `main` (`3a2f3c6`, `main` đã có spec/plan Phase 4 Gemini), push. Sau merge: backend 269/269, frontend 151/151.

### 2026-11-03: UI polish, giao diện tiếng Anh ✅
Nhánh `ui-polish` (commit `80e20de`), merge vào `main`. Quy trình: review giao diện bằng ảnh chụp (Edge headless + CDP, khối mẫu tạm rồi xoá) → chốt bảng phạm vi với người dùng → code (người dùng yêu cầu chưa build/test trong lúc làm) → chạy test → commit → merge → push.
- **Đầu trang:** thanh dính khi cuộn, có tên app; NavBar 1 hàng, cuộn ngang trên điện thoại. **Form Vietsub:** nút "Choose .srt file" hiện tên file. **Danh sách:** hover dòng; cả dòng là link ở Vietsub list.
- **Tiếng Anh** cho toàn bộ chuỗi giao diện (giữ Engsub/Vietsub), cả lỗi `errors.ts` và `FieldError.message` của backend; `<html lang="en">`. Bộ lọc theo dấu bỏ sót chuỗi không dấu ("Link YouTube", "Xong", "Trang sau") → phải rà thêm bằng tay.
- **Chuyển động** (`motion`), **tooltip** (`@radix-ui/react-tooltip`), **logo mạng xã hội** (`simple-icons`), icon thông tin video và loại khối, trang trống có icon. Test: jsdom cần stub `ResizeObserver` cho Radix; tooltip trong test đóng bằng Esc (jsdom không ra khỏi "grace area" của Radix).
- Test: frontend 166/166, backend 269/269.

### 2026-11-03: Phase 4, dịch Vietsub tự động bằng Gemini
Spec: [docs/superpowers/specs/2026-11-03-gemini-translate-design.md](docs/superpowers/specs/2026-11-03-gemini-translate-design.md). Plan: [docs/superpowers/plans/2026-11-03-gemini-translate.md](docs/superpowers/plans/2026-11-03-gemini-translate.md). Worktree `../subtitle-studio-gemini` (nhánh `gemini`).
- **Hồ sơ dịch** = file Markdown `./data/prompts/<Tên>.md` (mẫu `_example.md` tự tạo lần đầu); `GET /api/prompt-profiles`; dropdown "Hồ sơ dịch" cạnh ô dán link, nhớ lựa chọn.
- **Gemini** qua SDK `com.google.genai:google-genai` 1.78.0: một request mỗi video, structured output `[{id, text}]`, gửi block theo `id` (không gửi timecode), kiểm tra đủ/không thừa/không trùng `id` và text không rỗng; tắt retry của SDK (429 không đốt thêm quota). Test bằng HTTP server giả, không gọi Gemini thật.
- **Nguồn Vietsub** `MANUAL`/`AUTO` (Flyway **V3**, vì nhánh Profile đã dùng V2): AUTO không ghi đè MANUAL (kiểm tra dưới khoá dòng khi lưu); dán trùng link không dịch lại; `POST /api/videos/{id}/translate` để dịch lại. Trạng thái `TRANSLATING`/`FAILED` + thông điệp lỗi tiếng Việt lưu trong `video`; app khởi động lại thì `TRANSLATING` → `FAILED`.
- **File** `./data/subs/<id>.en.srt`, `vi_auto.srt`, `vi_manual.srt` (bản upload giữ nguyên byte); tạo bù cho video cũ lúc khởi động.
- **Giao diện:** dòng Vietsub trong panel kết quả (đang dịch / Gemini · hồ sơ / tự upload / lỗi + Dịch lại / Dịch bằng Gemini), polling 3 giây, "· Đang dịch…/· Lỗi dịch" trong danh sách, nguồn ở Quản lý Vietsub.
- **Bug tìm được nhờ test:** SDK ném exception khi gọi `text()` trên phản hồi bị chặn (SAFETY) → xử lý theo `finishReason`.
- Merge `main` (Profile menu) vào nhánh giữa chừng: 5 xung đột kiểu cùng thêm, giữ cả hai.
- Merge `main` lần hai (UI polish, giao diện tiếng Anh): toàn bộ chuỗi giao diện và thông báo lỗi của tính năng dịch chuyển sang tiếng Anh; tooltip dùng `<Tip>`.
- Test cuối: backend `mvn test` 427/427, frontend 187/187, `tsc` sạch; `mvn verify -Poracle` 12/12 (trước lần merge thứ hai, lần đó không đổi DB).
- **Deploy** (`docker compose up -d --build`): Flyway V3 chạy trên Oracle thật, 4 video cũ có Vietsub được gán `MANUAL`; `GET /api/prompt-profiles` → `configured: true`, hồ sơ `EmiBonnie` (file người dùng, không commit).
- **Thử Gemini thật** (video TED 427 câu, model `gemini-3.8-flash`): lần 1 HTTP 503 (quá tải) sau ~10 s, lần 2 HTTP 504 sau ~175 s; video thử đã xoá. Người dùng chọn thử lại sau. Nếu còn lặp lại: tắt thinking của model (thinking budget 0) hoặc đổi sang Flash-Lite.
- Chưa làm: review độc lập toàn nhánh (final review của quy trình).

### 2026-11-03: Sửa lỗi video không có Engsub báo "Could not get subtitles from YouTube"
- **Nguyên nhân:** video gốc tiếng Thái (`I-yJxYCP8B0`) chỉ có phụ đề tay `zh-Hant`; YouTube vẫn liệt kê auto `en` nhưng đó là bản **dịch máy** từ `th-orig` (URL có `tlang=en`). `SubtitleTrackSelector` lấy auto `en` làm phương án cuối, tải thì YouTube trả HTTP 429 → lỗi `YTDLP_FAILED` khó hiểu thay vì `NO_ENGLISH_SUBTITLE`.
- **Sửa:** khi có track gốc của ngôn ngữ khác (`xx-orig` ≠ `en-orig`), bỏ auto `en` → `NO_ENGLISH_SUBTITLE`, không gọi tải phụ đề. Không có `-orig` nào thì giữ cách chọn cũ. Fixture `ytdlp/info-machine-translated-en.json` theo video thật; backend 432/432.
- Ý tưởng để sau: video tiếng Thái lấy `th-orig` rồi Gemini dịch Thái → Việt.

### 2026-11-04: Sửa lỗi "Could not translate: Gemini returned error 503"
- **Nguyên nhân (đo trực tiếp bằng request nhỏ "Say OK"):** `gemini-3.8-flash` (và `gemini-flash-latest`) trả 503 "This model is currently experiencing high demand" liên tục ở free tier; `gemini-3.6-flash`, `gemini-3.5-flash-lite`, `gemini-3.1-flash-lite` trả 200. Không phải lỗi code hay độ dài video.
- **Sửa:** model mặc định `gemini-3.6-flash`; thêm `fallback-models` (mặc định `gemini-3.5-flash-lite`) được thử lần lượt khi gặp 503 (429 hết quota thì không thử để khỏi tốn lượt). Hết model mà vẫn 503: "Gemini is busy right now (high demand), try again in a few minutes."
- **Kiểm chứng thật** (jar ngoài Docker, H2 tạm, video TED 427 câu, hồ sơ EmiBonnie): 3.6-flash lúc đó cũng 503 → tự chuyển 3.5-flash-lite → dịch xong 427/427 câu trong ~33 s, timecode khớp 100%. Ghi chú: câu Engsub 2 dòng có thể thành 1 dòng tiếng Việt (chấp nhận được cho phụ đề).
- Backend 435/435.
- Log ra file `{data-dir}/logs/app.log` (xoay vòng ngày/10 MB, giữ 14 ngày/200 MB); test chỉ log ra console (`logback-test.xml`). Manage Vietsub: ảnh/tiêu đề mở trang xem.

### 2026-11-04: Chỉnh giao diện theo phản hồi (toast, hộp thoại xác nhận, nhãn)
- **Nhãn:** Manage Vietsub hiện nguồn `Manual` / `AI`; panel kết quả "Vietsub: AI" / "Vietsub: Manual"; tooltip "Watch Video", "Download Engsub"; link "Download Vietsub"; nút cam "Download Engsub".
- **Manage Vietsub:** thêm nút Watch Video; cả dòng (tới các nút) là link tới trang xem → con trỏ bàn tay.
- **Get Engsub:** bấm tên video ở Fetched earlier thì cuộn lên panel kết quả (timeline) và chuyển focus tới tiêu đề; Get Engsub thành công thì xoá ô link (lỗi thì giữ); dán link đã có → toast cảnh báo "Already fetched: …".
- **Toast** (`sonner` 2.0.8, `components/AppToaster.tsx`): "Vietsub replaced: … (N lines)" sau Replace.
- **Hộp thoại xác nhận** (`@radix-ui/react-alert-dialog` 1.2.1, hook `useConfirmDialog`) thay `window.confirm` ở Delete video, Delete Vietsub, Delete block (Profile) và "Replace the Gemini Vietsub?"; focus mặc định ở Cancel.
- Test frontend: jsdom thiếu `matchMedia`/`scrollIntoView` → giả lập trong `test/setup.ts`; sonner giữ toast giữa các test → `toast.dismiss()` sau mỗi test; test nhãn nguồn bị mất ở lần merge giao diện tiếng Anh đã được viết lại. Frontend 197/197.

### 2026-11-04: Bỏ chức năng Refresh (lấy lại Engsub từ YouTube)
- Người dùng thấy không cần: bỏ nút ↻ ở Fetched earlier, `handleRefresh`/`refreshVideo` (frontend), `POST /api/videos/{id}/refresh` và `SubtitleService.refresh` (backend), CSS `button--spinning`, dòng API trong README.
- Test mới: `/refresh` trả 404, dòng Fetched earlier không còn nút Refresh; bỏ 7 test của chức năng cũ. Backend 429/429, frontend 196/196.
- "Translate again" hiện chỉ có ở dòng Vietsub của panel kết quả (Get Engsub); Manage Vietsub chưa có (có thể thêm sau).

## 8. Quyết định và lưu ý kỹ thuật

- **Font Be Vietnam Pro** (thay Atkinson Hyperlegible Next): giao diện tiếng Việt cần font có đủ glyph dấu tiếng Việt. Khi đổi font phải kiểm tra `subsets` có `vietnamese`.
- **Shell của Claude Code chưa nhận PATH của Node vừa cài**: dùng `export PATH="/c/Program Files/nodejs:$PATH"` trong Git Bash (mở terminal mới thì tự có).

- **yt-dlp + deno đã cài** trên máy dev (winget). Trong shell của Claude Code cần thêm PATH bằng `cygpath -u "$LOCALAPPDATA"/…/WinGet/Packages/...`; ghép đường dẫn Windows `C:\…` thẳng vào PATH của Git Bash sẽ làm hỏng PATH truyền sang Java (dấu `:`).
- **Lỗi của Spring MVC (JSON hỏng, 405…)** dùng ProblemDetail mặc định, không có field `code`. Frontend cần fallback khi thiếu `code`.

- **Frontend React thay vì vanilla/Thymeleaf:** Phase 2–3 (player YouTube, overlay Vietsub, sửa câu trực tiếp) có nhiều state, nên React hợp hơn. Backend giữ thuần REST API, nên **T09 không đổi**.
- **Máy dev chưa cài Node:** `frontend-maven-plugin` tự tải Node khi `mvn package`, nên build jar và Docker không cần Node sẵn. Để dev frontend có hot reload (`npm run dev`) thì nên cài Node LTS.

- **Hai request `fetch` cùng videoId chạy đồng thời** có thể cùng import, request thứ hai lỗi PK khi lưu. Phase 1 chạy local một người dùng nên chấp nhận; ghi vào Backlog.
- **Sau `cues.deleteByVideoId()` persistence context bị clear**: mọi entity load trước đó thành detached, phải load lại.

- **Chưa chạy với yt-dlp thật.** Định dạng tên file output (`{id}.{lang}.vtt`) và việc `--sub-langs` hiểu lang là regex là theo hiểu biết về yt-dlp; cần xác nhận ở T11.
- **Constructor package-private `YtDlpClientImpl(List<String> baseCommand, …)`** chỉ dùng cho test. Spring dùng constructor `@Autowired` nhận `SubtitleStudioProperties`.

- **Auto `en` khi không có `en-orig`** có thể là bản YouTube dịch máy từ ngôn ngữ khác (video gốc không phải tiếng Anh). PLAN vẫn chấp nhận làm fallback; khi test video thật ở T11 cần để ý chất lượng của trường hợp này.
- **Parse JSON yt-dlp bằng `JsonNode`** (không map vào POJO), vì JSON của yt-dlp rất lớn và thay đổi theo version; chỉ đọc những field cần dùng.

- **SRT dùng CRLF** (chuẩn thực tế của SubRip, tương thích player cũ tốt nhất).
- **Header `Content-Disposition` (`filename*=UTF-8''...`)** làm ở T09 bằng `ContentDisposition` của Spring. `SrtWriter` chỉ tạo tên file.
- **Format số và text dùng `Locale.ROOT`** (`String.format`, `toLowerCase`…) để kết quả không phụ thuộc locale của máy.

- **T04 khác PLAN ở 3 điểm** (đều có test riêng):
  1. **Rule khử lặp:** bỏ dòng *đã có trong cue liền trước* (dòng đang hiển thị trên màn hình), thay vì chỉ so với "dòng vừa emit gần nhất". Rule của PLAN sẽ emit lại A khi gặp `[A,B]` rồi `[A,B]`.
  2. **`end` của segment AUTO** = `min(start kế tiếp, lần cuối dòng đó còn xuất hiện)`, thay vì luôn bằng `start kế tiếp`. Nhờ vậy đoạn im lặng hoặc nhạc vẫn có gap thật, câu trước không hiện mãi, và rule gộp "gap < 1s" mới có tác dụng.
  3. **Nhiều dòng mới trong cùng một cue / cùng `start`** gộp thành một segment (AUTO nối bằng dấu cách, MANUAL nối bằng `\n`) để không sinh segment 0ms.
- **Khi gộp câu**, `\n` trong text MANUAL được đổi thành dấu cách. Độ dài 84 tính trên chuỗi sau khi nối.
- **Chưa kiểm chứng với video thật:** ghi chú ở PLAN 4.5 về golden file từ 3–5 video thật sẽ làm ở T11, khi đã có yt-dlp chạy được.

- **Fixture `.vtt` phải giữ đúng byte.** Dòng chỉ có dấu cách (`" "`) rất dễ bị editor hoặc công cụ ghi file cắt mất. Khi tạo fixture có loại dòng này thì dùng `printf` và kiểm tra lại bằng `cat -A`.
- **VttParser bỏ qua timestamp sai định dạng** (bỏ cả cue đó) thay vì ném lỗi, để một cue hỏng không làm hỏng cả file.

- **UrlParser dùng whitelist host** (`youtube.com`, `www.`, `m.`, `youtu.be`) và không decode `%xx` trong ID. ID chứa ký tự encode sẽ bị từ chối. `music.youtube.com` và `/live/ID` để **phase sau** (xem mục 10, Backlog).

- **Test dùng profile `test` với H2 in-memory** để `mvn test` không tạo file DB trong `./data`.
- **Spring chuẩn hoá `Path`** khi bind: `./data` thành `data`. Khi test cần so sánh path thì so theo `toAbsolutePath().normalize()`.
- **Làm theo TDD:** mỗi task viết test trước, chạy cho fail rồi mới viết code. Test chạy trên dummy data, không gọi mạng.
- **Đã kiểm tra (T08):** app khởi động thật (`java -jar`) với H2 file mode, tạo được `subtitle-studio.mv.db`, wiring bean OK.

## 9. Rủi ro đang theo dõi

- yt-dlp thay đổi theo YouTube: pin version trong Dockerfile, và bản mới có thể cần JS runtime (deno). Kiểm tra lúc làm T11.
- Video giới hạn tuổi / private / members-only: Phase 1 chỉ báo lỗi, không xử lý cookies.
- Auto-caption không có dấu câu: normalizer chỉ gộp theo độ dài và khoảng nghỉ.

## 10. Backlog (để phase sau)

| Mục | Nguồn | Ghi chú |
|---|---|---|
| **Thêm / xoá profile** (hiện cố định 3 profile seed trong V2) | Profile | người dùng yêu cầu để phase sau; cần trang quản lý danh sách profile |
| Phân quyền sửa profile (hiện ai mở được app cũng sửa được) | Profile | đi cùng dự án con 2 (tài khoản) |
| Kéo thả sắp xếp khối, ảnh thumbnail, upload file nhạc | Profile | ngoài phạm vi spec Profile |
| `UrlParser` hỗ trợ `music.youtube.com/watch?v=ID` | T02 | thêm host vào whitelist + test |
| `UrlParser` hỗ trợ `youtube.com/live/ID` (livestream) | T02 | thêm nhánh path `live` giống `shorts`/`embed` + test |
| Chặn import trùng khi 2 request `fetch` cùng videoId chạy đồng thời | T08 | lock theo videoId hoặc bắt lỗi PK rồi trả về bản đã lưu |
| Review Profile (Minor): kết quả thêm/di chuyển/xoá về muộn sau khi đổi tab bị áp vào profile mới; toolbar không khoá khi đang di chuyển (bấm nhanh 2 lần có thể hiện sai thứ tự); dọn ảnh lúc khởi động nằm trong `@Transactional` nên lỗi DB có thể chặn khởi động; `BlockView` tin mọi `embedUrl` không phải Spotify; YouTube `?t=` bị bỏ, chưa nhận `live`/`music.youtube`/Spotify episode/`spotify:`; cắt `original_name` có thể tách đôi emoji; `max-request-size` = `max-file-size` nên file sát 10 MB bị 413; nút "Xong" đóng form đang sửa mà không hỏi | Profile | final review nhánh `profiles` |
| Review Phase 2 (Minor): số quá lớn trong `.srt` → 500; block bị bỏ qua không báo; file ≫5 MB có thể thành "lỗi mạng" (kiểm tra kích thước ở form); UTF-16 không BOM; player không hồi phục sau lỗi khi đổi video; lỗi YouTube 100 + timeout tải API; thêm Vietsub đồng thời → 500; sắp xếp danh sách dưới 1 giây | P2 | xem nhật ký Phase 2 |
| Hồ sơ dịch lưu trong Oracle + sửa trên web | P4 | phase cải tiến (hiện là file `./data/prompts/*.md`) |
| Video > 60 phút: chia đợt dịch Gemini | P4 | hiện bỏ qua với `VIDEO_TOO_LONG` |
