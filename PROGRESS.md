# Subtitle Studio: Tổng quan và tiến độ

> Cập nhật lần cuối: 2026-11-12 (lô phản hồi UI; trước đó 2026-11-11: Fanfics; trước đó: UI polish; trước đó 2026-11-10: lô cải tiến 2; trước đó: data/prompts và data/subs được theo dõi trong git, repo public, theo lựa chọn của người dùng; phần còn lại của data/ vẫn bị bỏ qua)
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
    ├── styles/                        # tokens.css (màu, khoảng cách, bóng, breakpoint), base.css (reset, button, field, badge, alert, tabs), vietsub-lists.css (hàng/danh sách dùng chung), index.css
    │                                  #   CSS riêng của từng component/trang nằm cạnh file .tsx (vd. components/NavBar.css)
    ├── api/client.ts                  # client có type + ApiError(status, code, detail)
    ├── lib/format.ts (+test)          # timecode SRT, thời lượng
    ├── lib/errors.ts (+test)          # code → thông báo tiếng Việt
    └── components/                    # UrlForm, ResultPanel, CueTable, VideoList; ui/ = Alert, LoadingText, IconButton(+IconLink), PageHeader, Cover, SearchBar, PopoverPanel
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
# trước khi deploy: powershell -ExecutionPolicy Bypass -File scripts\backup-db.ps1 (lỗi thì dừng)
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

### 2026-11-04: Chẩn đoán lỗi "Gemini returned missing or mismatched lines"
- **Báo lỗi:** video `ogF17eFThI0` (Behind The Scenes "Us" EP.5, 104 câu Engsub MANUAL, hồ sơ EmiBonnie) dịch FAILED: "Gemini returned missing or mismatched lines (17/104 valid), try again." Nghĩa là câu trả lời là JSON hợp lệ nhưng chỉ 17 id khớp đúng một lần và có chữ (`TranslationOutput.validate`).
- **Điều tra:** phát lại đúng request của app (rules, schema, hồ sơ, `temperature: 0.3`) bằng script ngoài app: `gemini-3.6-flash` 1/1 lần và `gemini-3.5-flash-lite` 4/4 lần đều trả đủ **104/104** → **không tái hiện**, lỗi là câu trả lời hỏng ngẫu nhiên của model (lúc đó log cho thấy 3.6-flash đang 503 nên app chạy bản lite). Phụ đề có nhiều chú thích `[IN HOA]` lặp lại và câu bị cắt qua 2–3 block, dễ bị model gộp/bỏ. App từ chối đúng (không lưu Vietsub sai); bấm Translate again là đủ.
- **Không đủ dữ liệu để biết kiểu hỏng** (log không ghi gì) → thêm **log chẩn đoán**, không bao giờ chứa nội dung phụ đề hay API key:
  - `Gemini <model> translated <n> lines` khi thành công (biết model nào trả lời, kể cả khi đã chuyển sang model dự phòng);
  - `Gemini <model> returned an invalid answer: items=… valid=…/… missing=… extra=… duplicated=… blank=… missingIds=[…]` (tối đa 10 id, `TranslationOutput.describe`);
  - `Gemini <model> answer for <n> lines is not the expected JSON (<k> chars)`;
  - `Translation of <videoId> failed: <thông báo>` (`TranslationService`).
- **Chưa làm (Backlog):** tự khắc phục khi câu trả lời hỏng (hỏi lại chỉ các block thiếu/sai, hoặc gửi lại cả request).
- Nhánh `translate-diagnostics`, merge fast-forward vào `main`. Backend 439/439.

### 2026-11-04: Playlist cho video Vietsub
- Spec [docs/superpowers/specs/2026-11-04-playlists-design.md](docs/superpowers/specs/2026-11-04-playlists-design.md), plan [docs/superpowers/plans/2026-11-04-playlists.md](docs/superpowers/plans/2026-11-04-playlists.md).
- **Backend:** Flyway `V4__playlists.sql` (`t_playlist`, `t_playlist_item`, theo quy ước tiền tố `T_`), package `playlist` (`PlaylistService`, `PlaylistController`, `/api/playlists…`), mã lỗi `PLAYLIST_NOT_FOUND`, `INVALID_PLAYLIST`, `VIDEO_HAS_NO_VIETSUB`, `INVALID_PLAYLIST_ORDER`. Gỡ Vietsub / xoá video thì tự gỡ khỏi mọi playlist qua `VideoRemovalEvent`.
- **Menu Vietsub:** tab Videos | Playlists; nút Save to playlist (`@radix-ui/react-popover` 1.3.1) ở Manage Vietsub; trang `/vietsub/playlists` (tạo, xoá) và `/vietsub/playlists/:id` (kéo thả bằng `@dnd-kit/core` 6.3.1 + `@dnd-kit/sortable` 10.0.0 + `@dnd-kit/utilities` 3.2.2, có bàn phím; ↑ ↓; gỡ; sửa tên/mô tả; Play all; xoá).
- **Vietsub list:** ô search không phân biệt dấu (`lib/search.ts`), chip All/playlist, khung playlist kiểu YouTube; URL `?playlist&q&page`.
- **Trang xem:** `?playlist=` → khung playlist, Previous/Next, Shift+N/P, Autoplay (`localStorage` `subtitle-studio.autoplay`, mặc định bật); player được tạo lại trong cùng khung nên toàn màn hình giữ nguyên khi chuyển video.
- Test jsdom: kéo thả bằng bàn phím của dnd-kit cần giả lập `getBoundingClientRect` và chờ một `setTimeout` sau khi bắt đầu kéo (dnd-kit gắn listener phím trễ một nhịp).
- **Review độc lập cả nhánh** tìm ra và đã sửa (mỗi lỗi có test RED→GREEN): Autoplay nhảy cóc video (player còn báo `ended` của video cũ một nhịp sau khi đổi `videoId` → `useYouTubePlayer` trả `loading` tới khi state thuộc video mới); lưu thứ tự lỗi có thể làm hiện lại video vừa gỡ (khoá nút gỡ khi đang lưu); Play all chưa tự phát. Lỗi nhỏ để sau: xem Backlog.
- Merge fast-forward vào `main`, push, deploy 2026-11-04: Flyway lên `v4` trên Oracle. Frontend 271/271, backend `mvn clean test` + `verify -Poracle` (12/12) xanh. Chưa kiểm tra tay: kéo thả bằng chuột, tự phát tiếp có tiếng trên trình duyệt thật.

### 2026-11-04: Trang public cho nhóm fan (Publish lên Cloudflare Pages)
Spec: [docs/superpowers/specs/2026-11-04-public-site-design.md](docs/superpowers/specs/2026-11-04-public-site-design.md). Plan: [docs/superpowers/plans/2026-11-04-public-site.md](docs/superpowers/plans/2026-11-04-public-site.md). Worktree `../subtitle-studio-public-site` (nhánh `public-site`).
- **Hướng đã chọn:** app đầy đủ chạy ở máy người dùng; nút **Publish** xuất bản chỉ đọc thành trang tĩnh và `wrangler pages deploy` lên Cloudflare Pages (miễn phí, 24/24). Không cần đăng nhập vì trang public không có chức năng ghi.
- **Backend `publish`:** `SiteExporter` (allowlist `PublicVideo`, Vietsub, playlist chỉ gồm video có Vietsub, Profile với ảnh đổi sang `/media/<storage_key>.<ext>`; ảnh mất file → bỏ + WARN), `PublicSiteBundle` (`public.html` → `index.html`, `_redirects` SPA, `_headers`: `/data/*` no-cache, `/assets/*` `/media/*` immutable; noindex mặc định), `WranglerClientImpl` (token/account chỉ qua env; output không log; lỗi phân loại token/project/mạng/timeout), `PublishService` (một lần mỗi lúc, chạy nền, trạng thái trong bộ nhớ, dọn `publish-tmp`).
- **Frontend:** `ReadSource` (`apiSource` / `createStaticSource`) qua `SiteContext` (`useSite()`; mặc định là app quản trị nên test cũ không đổi); `PublicApp` + `main.public.tsx` + `public.html`, `npm run build:public` → `classpath:public-site/`; NavBar bản public 2 mục; chân trang; nút **Publish** (xác nhận, hỏi trạng thái mỗi 2 s, toast Published + Open site).
- **Docker:** stage `node:22.23.4-bookworm-slim` cài `wrangler@4.151.3` vào `/opt/wrangler`; image chạy chép `node` + `/opt/wrangler`. 4 biến mới trong `.env.example`/compose.
- Nhãn Manual/AI giữ nguyên như app (chỉ ở Manage Vietsub); dữ liệu public có `viSource` để thêm nhãn sau nếu muốn.
- **Final review** (subagent): 1 Critical + 2 Important + 1 Minor nâng lên Important, đã sửa theo TDD: (1) Cloudflare Pages trả `index.html` **200 text/html** cho file JSON không tồn tại → `staticSource` coi là not found; (2) wrangler chạy trong thư mục cha của site (ghi được) với đường dẫn tuyệt đối; (3) hết timeout thì giết cả tiến trình con của wrangler; (4) khách không thấy câu dành cho quản trị ("Choose Edit…", "Check that Subtitle Studio is running"). Minor còn lại ở Backlog.
- **Publish thật (2026-11-04):** project Pages `subtitle-studio-vn` → **https://subtitle-studio-vn.pages.dev** (tên `subtitle-studio` đã có người dùng, Cloudflare tự gán `subtitle-studio-bkx.pages.dev` → tạo project mới và xoá project đó). Token loại **User API Token**, quyền Account → Cloudflare Pages → Edit; project tạo bằng `wrangler pages project create` trong container. Kiểm tra: status DONE, `X-Robots-Tag: noindex, nofollow`, `robots.txt` Disallow, `data/videos.json` 23 video chỉ 8 trường allowlist, F5 deep link 200; file JSON thiếu → 200 text/html (xác nhận lỗi (1)).
- Backend 420/420, frontend 297/297 (một test VietsubPage có sẵn thỉnh thoảng fail do thời gian, chạy lại pass).

### 2026-11-04: Khôi phục file bị .gitignore chặn; fullscreen iPhone; Vietsub list 2 tab; màu toast
- **Sự cố:** quy tắc `data/` trong `.gitignore` chặn **mọi** thư mục tên `data`, nên `frontend/src/data/` (5 file `ReadSource` của trang public) chưa từng được commit; khi xoá worktree `public-site`, git xoá luôn file bị ignore → `main` đã push thiếu file (clone về không build được; bản đang chạy và trang public không ảnh hưởng vì build từ trước). Đã tạo lại đúng nội dung (gồm bản sửa SPA fallback) và đổi quy tắc thành `/data/`. **Bài học:** thư mục mới → `git check-ignore -v <file>`; trước khi xoá worktree xem `git status --ignored`.
- **Fullscreen trên iPhone:** Safari iPhone chỉ cho `<video>` fullscreen → nút ⛶ không có tác dụng. Không có Fullscreen API thì khung player phủ kín viewport (`.player--filled`, fixed, `100dvh`, khoá cuộn trang), Vietsub vẫn hiện; nút hoặc Esc để thoát; dùng `webkitRequestFullscreen` khi chỉ có bản prefix. Nút Copy link, âm lượng/CC/settings ở góc trên là giao diện của YouTube (iframe khác tên miền), app không đổi được.
- **Vietsub list:** 2 tab **Playlists** (mặc định) và **All videos** (Radix Tabs 1.2.1), mỗi tab có tìm kiếm + phân trang 10/trang. Tab Playlists: thẻ xếp dọc dùng chung `PlaylistHeader` (ảnh bìa, tên, số video, Play all); tìm kiếm khớp tên playlist hoặc video bên trong, "N videos" = số video khớp. Mở playlist có link "← Playlists" (giữ `q`). Bỏ chip ngang (`PlaylistChips`). URL: `?tab=all`, `?playlist=`, `?q=`, `?page=`.
- `/vietsub`: mô tả còn một câu. Toast `sonner`: thành công cam, thông tin tím, lỗi đỏ. Quy tắc 2 màu chủ đạo ghi vào CLAUDE.md và README.
- Frontend 305/305 (chỉ chạy test theo yêu cầu, rồi merge → build → restart).

### 2026-11-04: Chuyển tab không giật; review giao diện (agent) và sửa
- **Giật khi chuyển tab Vietsub list:** Radix Tabs gỡ tab ẩn khỏi trang, mỗi tab tự gọi API khi hiện → mỗi lần chuyển tải lại (Playlists N+1 request) và danh sách co về "Loading…". Sửa: tải video + playlist **một lần ở cấp trang** rồi truyền xuống 2 tab (test: chuyển tab không có request mới).
- **Tab gạch chân dùng chung** (`tabs__list` / `tabs__tab`, tab đang mở gạch **tím**): Vietsub list (Radix Tabs, `data-state`), menu Vietsub Videos | Playlists và tab Profile (link, `aria-current`). Bỏ kiểu pill `ptabs`.
- **Theo review giao diện:** menu tự cuộn tới mục đang mở + mép phải mờ trên điện thoại, viền focus không bị cắt, Publish chỉ còn icon ở ≤520px; tiêu đề video 2 dòng trên điện thoại (thấy số tập); trang xem trên iPhone tiêu đề nhỏ để video lên cao; video đang phát trong khung playlist màu **tím**; thẻ playlist gọn, bấm cả thẻ (stretched link), không có mô tả thì hiện 3 tập đầu; link quay lại một kiểu "← Back to …"; Delete playlist xuống cuối trang sửa; ô dán link: gợi ý nhạt, focus xanh; profile trống trên trang public: "Nothing here yet — check back soon."; vùng chạm ≥44px trên điện thoại. Chưa làm (để sau): gom hàng trang sửa playlist trên điện thoại, gợi ý video khác dưới trang xem.
- Frontend 309/309.

### 2026-11-09: Thanh đọc truyện, trang chủ Novels, nút Filter Vietsub ✅ (chưa deploy)

Plan: [docs/superpowers/plans/2026-11-09-reader-and-novels-home.md](docs/superpowers/plans/2026-11-09-reader-and-novels-home.md). Nhánh `feature/novel-page-checks`, chưa merge, chưa push, chưa deploy.

- **Ảnh chương ít khoảng trắng hơn:** `NovelRenderer` lề trên các trang 2+ còn 56 (trang 1 giữ 110 cho tiêu đề), vùng chân trang 120 xuống 64, chữ `Ch. N · k/n` căn giữa theo chiều dọc. `VERSION` lên 3. **Ảnh đã đăng cần Publish again** mới vẽ lại.
- **Tiêu đề video dài trong playlist** (panel, thẻ playlist, danh sách Vietsub list) xuống dòng và cắt ở 2 dòng bằng class `title-clamp`, không tràn viền thẻ.
- **Manage Vietsub:** một nút `Filter` (lucide `ListFilter`, popover Radix với All / AI / Manual, hiện `Filter: AI`/`Filter: Manual` khi đang lọc) thay cho 3 nút tab; `?source=ai|manual` giữ nguyên. **Bỏ Add Vietsub:** xoá `VietsubForm` và CSS `filepick`, các link `Add Vietsub` ở trạng thái rỗng của Vietsub list và trang xem, câu mô tả đầu trang. Hàm `addVietsub` đổi tên `replaceVietsub(id, file)` vì Replace vẫn dùng `POST /api/vietsub`; endpoint, service và test phía backend giữ nguyên (Replace, Get Engsub/dịch vẫn gọi).
- **Trang đọc:** bỏ nút cam, ô chọn chương và hàng chế độ đêm/cỡ chữ. Thay bằng thanh icon dính dưới thanh trên của site: `Chương trước`, `Chương sau` (tắt chứ không ẩn ở đầu/cuối), `Mục lục` (popover danh sách chương, `Đang đọc`, dấu đã đọc, tự cuộn tới chương hiện tại) và `Cài đặt` (`Chế độ đêm`, `A−`/`A+`). Thanh trượt đi khi cuộn xuống quá 80px, hiện lại khi cuộn lên, gần đầu trang, đang mở popover hoặc focus bàn phím nằm trong thanh; `prefers-reduced-motion` thì không trượt. Phím ←/→ vẫn chuyển chương, trừ khi focus ở trong popover. Cuối chương: hai nút `Chương trước` / `Chương sau` cùng kiểu, bỏ thẻ chương sau; chương cuối vẫn có hộp `Bạn đã đọc hết...`.
- **Breadcrumb** `Novels › tên truyện › tên chương` ở trang đọc, `Novels › tên truyện` ở trang truyện, `Novels › Tất cả truyện` ở `/novels/all`.
- **Trang chủ Novels:** banner nổi bật (tối đa 5 truyện, mới cập nhật nhất trước): trái là trạng thái, tên, `Chương x/y`, `Tác giả`, `Cập nhật dd-MM-yyyy` (giờ Việt Nam), `Đọc từ đầu`/`Đọc tiếp: Chương N`, nút ⓘ; phải là các bìa xếp quạt (bấm bìa bên cạnh để chọn), `01 / 05`, nút `Tạm dừng`/`Tiếp tục`, tự chuyển mỗi 6 giây, dừng khi rê chuột/focus, không tự chuyển khi `prefers-reduced-motion`; điện thoại chỉ hiện bìa hiện tại. Dưới banner là `Mới cập nhật` (6 thẻ nhỏ `x/y chương`, link `Xem tất cả` tới `/novels/all`). Banner đọc `data/novels/<slug>.json` của các truyện nổi bật để biết chương đầu tiên.
- **Dữ liệu public:** `PublicNovelSummary` có thêm `totalChapters` (mọi chương, kể cả nháp) và `lastPublishedAt` (ngày đăng mới nhất trong các chương đã đăng, null nếu không có). File cũ chưa có hai trường này vẫn chạy: `y` = số chương đã đăng, ngày = `updatedAt`. **Cần Publish again** để có dữ liệu mới.
- Backend 733/733, frontend 500/500 (vài test phân trang có sẵn của VietsubPage/HomePage thỉnh thoảng fail do thời gian khi chạy cả bộ, chạy lại pass).

### 2026-11-09: Banner ảnh trên trang Profile và tab Trailer của truyện ✅ (chưa deploy)

Spec: [docs/superpowers/specs/2026-11-09-profile-banner-design.md](docs/superpowers/specs/2026-11-09-profile-banner-design.md), plan: [docs/superpowers/plans/2026-11-09-profile-banner-and-trailer.md](docs/superpowers/plans/2026-11-09-profile-banner-and-trailer.md). Nhánh `feature/novel-page-checks`, **chưa merge, chưa push, chưa deploy**. **Migration `V10__profile_banner_and_novel_trailer.sql`** (bảng `t_profile_banner_image` + cột `t_novel.trailer_video_id`) chưa chạy trên DB thật nào; tự chạy khi app khởi động. **Public site cần Publish again** mới có banner và trailer (file cũ không có `banner` / `trailerVideoId` vẫn chạy: không có banner, không có tab Trailer).

- **Banner Profile:** tối đa 8 ảnh mỗi profile, ảnh upload riêng cho banner, xếp quạt giữa khung dưới tên profile (admin và public), không có chú thích hiện. Mỗi ảnh có mô tả tuỳ chọn (tối đa 200 ký tự, cắt khoảng trắng, rỗng = NULL) chỉ dùng làm `alt`; không có mô tả thì `alt=""` và tên của mục bấm là `Ảnh k/n`. Bấm ảnh mở lightbox (`‹ ›`, ←/→, Esc, ✕, bấm nền; focus về ảnh đã mở). Không có ảnh thì không có phần tử banner. API: `POST /api/profiles/{slug}/banner`, `PUT .../banner/{imageId}` (mô tả), `DELETE .../banner/{imageId}`, `PUT .../banner/order`; mỗi lệnh trả cả danh sách. Giới hạn 8, độ dài mô tả và vị trí liền mạch 1..n do **service** bảo đảm (`ProfileBannerService`); sắp xếp thiếu/trùng/lạ id → 400 `imageIds` và không đổi gì; ảnh của profile khác → 404 `BANNER_IMAGE_NOT_FOUND`. `ProfileDto` có thêm `banner: [{id, mediaUrl, altText}]` (`mediaId` không được serialize); bản export public chép ảnh như ảnh profile khác (file mất thì `mediaUrl` null và hiện khung trống).
- **Dọn ảnh:** xoá ảnh banner thì xoá dòng, đánh lại vị trí, rồi `MediaService.deleteIfUnreferenced` (cùng quy tắc với khối ảnh); `MediaRepository.isReferenced` và việc dọn ảnh mồ côi lúc khởi động đều tính ảnh banner.
- **Edit mode:** mục `Banner` phía trên các khối: lưới ảnh nhỏ kéo thả (dnd-kit) hoặc `Move left/right`, ô mô tả dưới mỗi ảnh (lưu khi blur hoặc Enter), `Delete` có hỏi lại, form `Add image` (chọn file + `Image description (optional)`), tắt hẳn kèm `Up to 8 images` khi đủ 8. Đổi thứ tự cập nhật ngay, hoàn lại và báo `Alert` nếu lỗi.
- **Component dùng chung mới:** `components/ui/FanCarousel` (tách từ banner Novels: xếp quạt, tự chuyển 6 giây, tạm dừng, `‹ ›`, bộ đếm, chỉ ảnh hiện tại trên điện thoại; mục là `Link` khi có `href`, là nút khi có `onOpen`) và `components/ui/ImageLightbox` (Radix Dialog). `FeaturedNovels` dùng `FanCarousel`; một truyện duy nhất thì không còn bộ đếm `01 / 01` (quy tắc "một ảnh" của FanCarousel). Lightbox của trang chương và khối Profile vẫn dùng `yet-another-react-lightbox`, chưa đổi.
- **Trailer truyện:** Novels › Details có ô `Trailer (YouTube link)`; server lấy id 11 ký tự bằng `UrlParser` (nhận `watch?v=`, `youtu.be/`, `/shorts/`, `/embed/`, có/không `www`/`m`, và cả id trần), link sai/không phải YouTube → 400 trường `trailerUrl`, rỗng = xoá; form hiện `https://youtu.be/<id>`. Trang truyện public: tab `Giới thiệu` · `Danh sách chương` · `Trailer`, tab chỉ có khi có nội dung, mặc định `Danh sách chương`, URL chỉ ghi tab khác (`?tab=intro|trailer`), tab không có thì về danh sách chương. `<iframe>` `youtube-nocookie.com/embed/<id>` chỉ được tạo khi tab Trailer đang mở.
- Kiểm thử: `mvn test -Dskip.npm` 789/789, vitest 686/686, `tsc -b --noEmit`, `npm run build`, `npm run build:public` đều qua. `mvn verify -Poracle` chưa chạy (cần Docker).

### 2026-11-09: Trình sửa Vietsub trực tiếp (Vietsub live editor) ✅ (chưa deploy, chưa merge)

Spec: [docs/superpowers/specs/2026-11-09-vietsub-live-editor-design.md](docs/superpowers/specs/2026-11-09-vietsub-live-editor-design.md), plan: [docs/superpowers/plans/2026-11-09-vietsub-live-editor.md](docs/superpowers/plans/2026-11-09-vietsub-live-editor.md). Nhánh `feature/novel-page-checks`, **chưa merge, chưa push, chưa deploy**. Không đổi schema, không có migration.

- **Thay đổi hành vi:** bấm một hàng ở **Manage Vietsub** (`/vietsub`) nay mở trình sửa `/vietsub/:id/edit` (admin, không có trên public site); Vietsub list và trang xem vẫn mở trang xem. Nút Download/Replace/Delete giữ nguyên.
- **Trang sửa:** video YouTube bên trái (sticky dưới top bar, phụ đề đè lên là **chữ đang sửa, chưa lưu**), bảng bên phải (`#` bấm để tua tới dòng, Start/End chỉ đọc, ô text tự giãn). Dòng đang chiếu được tô tím + `aria-current`, bảng tự cuộn theo nhưng **dừng khi đang gõ** và tiếp tục 3 giây sau khi rời ô. Dòng đã sửa có chấm cam `Edited`. Từ 1024px hai cột, nhỏ hơn thì xếp chồng; ≤520px ẩn cột End. Hàng được `memo`, gõ một dòng chỉ render lại dòng đó.
- **Lưu:** `PUT /api/videos/{id}/vietsub/text` (`{ baseUpdatedAt, lines: [{ idx, text }] }`, gửi đủ mọi dòng). Server khoá dòng video, trả **409 `VIETSUB_CHANGED`** nếu `viUpdatedAt` khác `baseUpdatedAt`, **409 `TRANSLATION_IN_PROGRESS`** khi Gemini đang dịch, **400 `INVALID_VIETSUB_TEXT`** (kèm `errors[].field = lines[i].text`) khi sai số dòng/thứ tự hoặc text rỗng/quá 1000 ký tự, 404 nếu không có video/Vietsub. Thành công: chỉ đổi text (timing giữ nguyên), `viSource = MANUAL`, `viUpdatedAt = now`, ghi lại `vi_manual.srt` bằng `SrtWriter` (file `vi_auto.srt` giữ làm lịch sử). Vietsub AI sau khi sửa thành Manual nên lần dịch Gemini sau không ghi đè.
- **Giao diện lưu:** nút Save (bật khi có thay đổi và hợp lệ), Ctrl+S / ⌘S, toast `Vietsub saved`; 409 hiện Alert có nút Reload (giữ nguyên phần đã gõ cho tới khi Reload), 400 hiện lỗi dưới từng dòng và cuộn tới dòng đầu, lỗi mạng hiện Alert. Có thay đổi chưa lưu thì `beforeunload` hỏi khi đóng tab, và bấm link nội bộ (menu, breadcrumb) hiện hộp xác nhận `Discard unsaved changes?`.
- **Lưu ý:** app dùng `BrowserRouter` (không có `useBlocker`) nên hộp xác nhận chỉ bắt **click vào link**; nút Back của trình duyệt không bị chặn. Trang tải video trước rồi mới tải các dòng, nên nếu Vietsub đổi giữa hai lần tải thì lần lưu bị từ chối (409) thay vì ghi đè bản mới.
- Kiểm thử: `mvn test -Dskip.npm`, `vitest`, `tsc -b --noEmit`, `npm run build`, `npm run build:public` đều qua.
- **Cập nhật: tua hoặc bấm `#` không còn đặt con trỏ vào text:** chỉ cuộn tới và tô dòng đó (huỷ chờ 3 giây), focus giữ nguyên chỗ người dùng đang đứng.
- **Trang Profile:** tên profile không còn hiện thành tiêu đề lớn (tab đã có tên); vẫn giữ `<h1>` ẩn (`visually-hidden`) cho trình đọc màn hình, nút Edit/Done căn phải, bản public không còn khoảng trống ở đầu trang.
- **Lỗi lưu Vietsub lần thứ hai bị 409 (đã sửa):** trên Oracle (`TIMESTAMP(6)` làm tròn chữ số thứ 7) giá trị `viUpdatedAt` trả về cho client giữ nguyên nano của đồng hồ Windows (vd `.1234567`) nên lần lưu sau gửi lại giá trị lệch với giá trị đã lưu (`.123457`). Sửa: `Video.updateVietsub` cắt về micro giây trước khi gán (mọi đường: upload, AUTO, sửa text). Có test hai lần lưu liên tiếp ở `VietsubTextSaveTest` và `PersistenceOracleIT` (đồng hồ `.1234567Z`). Token khoá lạc quan duy nhất trong app là `viUpdatedAt`.
- **Nút Save chỉ có chữ:** bỏ icon `Save` ở trình sửa Vietsub và trang Chương.
- **Deploy:** đã merge `feature/novel-page-checks` vào `main` (merge `860a6cc`) và chạy local; tag rollback `subtitle-studio:pre-second-save-fix`.

### 2026-11-09: Banner Profile dạng FilmStrip một ảnh, trình sửa Vietsub bám theo dòng đang chiếu ✅ (đã merge vào main, deploy local)

Thay thế phần mô tả banner Profile và bảng dòng của hai mục ngay trên. Không đổi API hay schema.

- **Banner Profile = `FilmStrip`:** mỗi lần hiện **một ảnh rộng hết khung**; vuốt hoặc `‹ ›` chuyển đúng một slide; dấu chấm bên dưới (chấm hiện tại màu tím orchid, có vòng `--brand-2-ink` để đạt 3:1); mô tả hiện khi hover/focus; lightbox cũng hiện mô tả. Không tự chuyển. Banner Novels vẫn dùng `FanCarousel`. Đã bỏ prop `fit="natural"`.
- **Trình sửa Vietsub** (`/vietsub/:id/edit`): bảng chỉ còn hai cột `#` + Text. Dòng được tô là dòng đang chiếu tại thời điểm hiện tại, hoặc dòng gần nhất ngay trước đó (kể cả khi đang ở khoảng trống giữa hai dòng). Khi **tua** (lùi, hoặc nhảy hơn 1,5 giây) hoặc bấm nút `#`, bảng cuộn tới dòng đó và đặt con trỏ ở cuối text; phát bình thường chỉ tô dòng. Giới hạn đã biết: nút Back của trình duyệt không bị chặn khi còn sửa chưa lưu (`BrowserRouter`).
- **Trạng thái deploy:** nhánh `feature/novel-page-checks` đã merge vào `main` và deploy local (migration V10 chạy khi app khởi động). Image cũ để quay lại: `subtitle-studio:pre-filmstrip-slides`. **Public site cần Publish again** mới có banner, trailer và các thay đổi giao diện công khai.

### 2026-11-10: Trình sửa Vietsub hiện dòng Engsub phía trên mỗi dòng ✅ (chưa merge, chưa deploy)

Nhánh `feat/editor-engsub-line`. Chỉ đổi frontend, không đổi API hay schema.

- `/vietsub/:id/edit` tải thêm Engsub bằng `getCues(id)` song song với Vietsub; mỗi hàng ghép với dòng Engsub **cùng `startMs`** (hai timeline luôn giống nhau, dựng `Map` một lần bằng `useMemo`). Không khớp thì hàng đó không hiện gì.
- Dòng Engsub là `<p class="cue-row__en" lang="en">` chỉ đọc (bôi đen copy được, giữ xuống dòng, luôn hiện, không có nút bật/tắt), nằm ngay trên textarea và nối qua `aria-describedby` (gộp với id lỗi nếu có). Chữ nhỏ (`--step--1`), màu `--muted`.
- `getCues` lỗi thì editor vẫn chạy bình thường, chỉ không có dòng Engsub (không báo lỗi). Lưu vẫn chỉ gửi Vietsub; `CueRow` vẫn memo, nhận Engsub dạng string nên gõ chỉ render lại đúng hàng đó.


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

### 2026-11-05: Menu Novels (đăng tiểu thuyết) ✅

- Spec [2026-11-05-novels-design.md](docs/superpowers/specs/2026-11-05-novels-design.md), plan [2026-11-05-novels.md](docs/superpowers/plans/2026-11-05-novels.md); nhánh `feature/novels`, 15 task TDD.
- Migration **V5** (`t_novel`, `t_chapter`, `t_chapter_page`, `t_novel_notebook`). Job dọn ảnh bỏ rơi giờ tính cả bìa và ảnh chụp chương là "đang dùng" (trước đó sẽ xoá chúng sau 24 giờ).
- Gemini: tách `GeminiCaller` dùng chung (Vietsub, dịch chương, sổ tay). Dịch chương gửi ảnh JPEG đã thu nhỏ (cạnh dài ≤ 2.000px), `media_resolution` HIGH, 20 ảnh hoặc ~15 MB mỗi lượt, lượt sau nhận 2.000 ký tự cuối lượt trước.
- Sổ tay: glossary/xưng hô chỉ thêm/sửa theo khoá (app gộp), nhân vật ≤ 30, tóm tắt ≤ 2.500 ký tự, 3 chương gần nhất; mỗi lần cập nhật là một phiên bản "after chapter N"; hàng đợi tuần tự mỗi bộ, chạy sau khi transaction commit.
- Review cuối (Opus): 0 Critical, 3 Important đã sửa (sổ tay kẹt UPDATING khi lỗi lạ; không gọi Gemini khi thiếu key; Unpublish không làm mất chỉnh sửa chưa lưu), 5 Minor vào Backlog.
- Gemini fallback (503) giờ là `gemini-3.6-flash` → `gemini-3.5-flash-lite` → `gemini-3.5-flash`.
- Publish: `NovelExporter` vẽ chương bằng font Literata (OFL, file variable `fonts/Literata.ttf`), WebP lossless (~54 KB/trang mẫu), cache theo hash nội dung.

### 2026-11-06: Bớt tốn quota Gemini free ✅

- **Nguyên nhân hết quota:** free tier giới hạn **20 request/ngày cho mỗi model** (`GenerateRequestsPerDayPerProjectPerModel-FreeTier`), đếm request chứ không đếm token. Log ngày 05/11: 7 request dịch nhưng **9 request sổ tay** (chương 2 bốn lần, chương 3 ba lần, do mỗi lần lưu chữ chương đã đăng là chạy lại sổ tay); chương 6 dịch xong 7–8/9 trang rồi lượt hỏi lại gặp 429 thì bỏ cả chương.
- Sửa chữ chương đã Published **không cập nhật sổ tay nữa**; sổ tay chỉ chạy 1 lần lúc Publish.
- Trang đã dịch được **lưu ngay cả khi lượt sau lỗi** (`ChapterPartlyTranslatedException`); chương FAILED bấm Translate again **chỉ gửi trang còn thiếu chữ** (giữ số trang, carry-over lấy từ các trang trước). Chương FAILED mà mọi trang đã có chữ thì dịch lại cả chương.
- Chương trước gửi kèm giảm từ 20.000 xuống **4.000 ký tự** cuối.
- `GeminiCaller`: **429 cũng chuyển sang model dự phòng** (quota tính riêng từng model; lúc `gemini-3.6-flash` hết quota thì `gemini-3.5-flash-lite` vẫn trả lời). Log `out of quota (HTTP 429): <metric, limit, model>, retry in …`. Mọi model đều 429 mà đều bảo chờ < 60 giây → "Gemini's per-minute limit was reached, try again in a minute."
- Thử `media_resolution` trên 1 trang thật (flash-lite, chép nguyên văn chữ Thái): HIGH 1064 token ảnh, chuẩn nhất; MEDIUM 540, trả lời sai hẳn ("không có chữ Thái"); LOW 266, giống HIGH ~97% nhưng đọc sai tên nhân vật (พีรญา → พิรญา). **Giữ HIGH** vì giới hạn đang chạm là số request, không phải token.

### 2026-11-06: Chặn bản dịch còn nguyên chữ Thái + nhãn chương ✅

- **Sự cố:** khi `gemini-3.6-flash` hết quota, `gemini-3.5-flash-lite` dịch chương 7–16; chương 16 (14 trang) bị trả về nguyên chữ Thái và app lưu như bản dịch, chương 12/14/15 lọt vài chữ kiểu `ค่ะ (Dạ)`. Thứ tự fallback là 3.6-flash → 3.5-flash-lite → 3.5-flash; 429 của `gemini-3.5-flash` lại báo quota của `gemini-3.6-flash` (nghi dùng chung), nên khi 3.6 hết thì thực tế chỉ còn flash-lite. Quota ngày reset lúc 0h giờ Pacific (15h giờ VN mùa đông).
- `PageTextOutput`: trang có **> 30% chữ cái là chữ Thái** bị coi là thiếu (log `untranslated [n]`, hỏi lại đúng trang đó); prompt thêm quy tắc "text là bản dịch tiếng Việt, không để sót chữ Thái kể cả thán từ/cách gọi".
- **Nhãn chương** (Oracle **V7** `t_chapter.label`, ≤ 100 ký tự, sửa được cả khi Published): hiện thay "Chapter N" ở danh sách chương, trang chương, Notebook › Recent chapters, trang public (danh sách, nút Read, trang đọc), tiêu đề/chân ảnh vẽ và prompt Gemini. Số chương (ô **Order**) vẫn là thứ tự, số trong link public và khoá phiên bản sổ tay. Chương không nhãn giữ nguyên ảnh đã cache.

### 2026-11-09: Kiểm tra trang ảnh trước/sau khi dịch (xoay, ảnh ngang, chữ Thái gốc) ✅ (chưa deploy)

- **Nguyên nhân tìm được:** chương 17 (trang 14–22), 18 và 19 được upload từ ảnh chụp điện thoại xoay 90° (3264×2448, không có EXIF); Gemini (`gemini-3.5-flash-lite` sau các lỗi 503) đọc chữ Thái nằm ngang rất tệ và bịa nội dung, mà vẫn qua mọi kiểm tra cũ (đủ trang, là tiếng Việt, không trống).
- **Xoay ảnh** (chỉ chương Draft, không đang dịch): `POST /api/chapters/{id}/pages/{pageId}/rotate` và `.../pages/rotate` (cả chương), body `{direction: LEFT|RIGHT}`. Mỗi lần xoay tạo file media mới (PNG giữ PNG, JPEG/WebP ra JPEG 0.92), file cũ xoá nếu không trang nào dùng. Bản dịch và chữ gốc của trang giữ nguyên. Nút Rotate trên từng thẻ và Rotate all left/right ở mục Pages.
- **Cảnh báo ảnh ngang:** `PageDto.landscape` đọc từ header ảnh; badge Landscape (cam) và hộp xác nhận trước khi Translate.
- **Gemini trả thêm chữ Thái đã đọc** (`source`, cùng request, vẫn 1 request/lượt) lưu ở `t_chapter_page.source_th` (Oracle **V8**). `SuspectPages`: trang có chữ gốc ≥ 100 ký tự mà bản dịch/chữ gốc < 0,6 × trung vị của cả truyện (cần ≥ 5 trang để lấy trung vị, ít hơn thì dùng ngưỡng cố định 0,5) bị đánh dấu "May be incomplete"; dòng cảnh báo trên ô Chapter text, badge `⚠ N` ở danh sách chương, chữ gốc hiện trong lightbox kèm nút Copy source. Chương dịch trước đây không có chữ gốc nên không bao giờ bị đánh dấu.
- **Việc cần làm sau khi deploy (sau 15:00 giờ VN, khi quota reset):** chương 17–19: Unpublish → xoay ảnh bị ngang → Translate again → Publish.

### 2026-11-09: Lô cải tiến (tìm Vietsub, autoplay, Novels: lưu/thứ tự/model) ✅ (chưa deploy)

Plan: [docs/superpowers/plans/2026-11-09-enhancements-batch.md](docs/superpowers/plans/2026-11-09-enhancements-batch.md). Nhánh `feature/novel-page-checks`, chưa merge, chưa push, chưa deploy.

- **Vietsub › Videos:** ô tìm kiếm (không phân biệt dấu), chip All/AI/Manual, sắp xếp AI trước rồi Manual (mới cập nhật trước), phân trang sau khi lọc, `q` và `source` giữ trên URL; bỏ nút Watch Video ở danh sách (bấm cả hàng vẫn mở trang xem).
- **Autoplay trong playlist:** giữ một `YT.Player` cho mỗi container, đổi video bằng `loadVideoById` (tự phát) hoặc `cueVideoById` (không tự phát) thay vì huỷ/tạo iframe mới. **Cần kiểm tra tay trên Edge và Safari sau khi deploy** (test tự động không có trình duyệt thật).
- **Novels, trang chương:** toast `Chapter saved` / `Novel saved` / `Auto-saved`; Ctrl+S / ⌘S lưu; tự lưu mỗi 3 phút khi có thay đổi chưa lưu (bỏ qua khi đang dịch, đang khoá hoặc Number rỗng); nhãn "Order" đổi thành "Number", câu gợi ý của Number và Chapter label thành tooltip trên icon `Info`; Number + Label cùng một hàng, Title một hàng đầy chiều rộng.
- **Thứ tự đọc chương:** cột `t_chapter.sort_order` tách khỏi `chapter_no` (số chương, link public và phiên bản sổ tay không đổi khi sắp xếp lại). `PUT /api/novels/{id}/chapters/order` (thiếu/trùng/id của truyện khác → 400, không đổi gì); chương mới luôn nằm cuối; danh sách, Previous/Next và site public theo `sort_order`. UI: kéo thả (dnd-kit) và nút Move up/down.
- **Model Gemini:** `GeminiCaller` báo từng model trước khi gọi; chương và Vietsub hiện `Translating with <model>…` (cập nhật khi chuyển sang model dự phòng) và `Translated by <model>` (nhiều model: nối bằng `, `); lưu ở `t_chapter.translation_model` và `video.translation_model`. Lỗi → giữ giá trị đã lưu trước đó. Dữ liệu cũ: không hiện gì.
- **Flyway V9** (`V9__chapter_order_and_translation_model.sql`, một file cho cả lô): `t_chapter.sort_order` (backfill = `chapter_no`, rồi NOT NULL), `t_chapter.translation_model`, `video.translation_model` (VARCHAR2(200 CHAR)). Chạy được trên H2 MODE=Oracle (test); **chưa chạy trên Oracle thật**, sẽ chạy khi deploy.

### 2026-11-09: Trang đọc truyện public dễ đọc hơn (tiếng Việt, tiến độ đọc, chế độ đêm) ✅ (chưa deploy)

Plan: [docs/superpowers/plans/2026-11-09-novel-reader-polish.md](docs/superpowers/plans/2026-11-09-novel-reader-polish.md). Nhánh `feature/novel-page-checks`, chưa merge, chưa push, chưa deploy.

- **Toast:** hiện giữa màn hình (sonner `top-center` + `offset`/`mobileOffset` top `calc(50vh - 40px)`), cả trang admin lẫn public.
- **Ảnh chương giữ dòng trống:** `NovelRenderer` vẽ đúng như người dịch gõ: mỗi dòng trống thêm một dòng cao `lineHeight`, các dòng liền nhau vẫn là đoạn (khoảng cách 0,35); dòng trống đầu và cuối bị bỏ. `VERSION` lên 2. **Ảnh đã đăng cần Publish again** mới vẽ lại theo cách mới.
- **Trang public Novels (Truyện) bằng tiếng Việt:** `publicNames.ts` (`Chương N`, `Ngoại truyện 1: ...`, trạng thái `Đang ra`/`Hoàn thành`, `N chương`, lỗi `Không tải được. Vui lòng thử lại sau.`). Admin vẫn tiếng Anh. Tiêu đề tab: `Chương 5: Mưa · <truyện>`, `<truyện>`, `Truyện` (khôi phục khi rời trang).
- **Trang đọc:** một thanh công cụ (`Chương trước` · danh sách chương · `Chương sau`), `h1` ẩn (ảnh đã có tên chương), `Đang tải chương…`, ảnh có `aspect-ratio` (không giật), ảnh đầu `eager`, ghép liền nhau chỉ bo góc ngoài. Cuối chương: thẻ `Chương sau` kèm tên chương, hoặc hộp `Bạn đã đọc hết các chương đã đăng.`. Phím `←`/`→` đổi chương (bỏ qua khi đang ở select/input hoặc có phím bổ trợ).
- **Lưu trong trình duyệt (`localStorage`, luôn try/catch):** vị trí đọc `novel-progress:<slug>` và danh sách đã đọc `novel-read:<slug>` (trang truyện có `Đọc tiếp: ...`, `Đọc từ đầu`, dấu Check và badge `Đang đọc`; chương đã gỡ thì về `Bắt đầu đọc`); chế độ đêm `reader-night` (mặc định theo theme tối, nút `Chế độ đêm` ghi đè); cỡ chữ `reader-width` (600/760/900 px, nút `A−`/`A+`).
- Kiểm thử: `mvn test -Dskip.npm`, `vitest`, `tsc -b --noEmit` đều qua.

### 2026-11-09: Thanh đọc rộng, ảnh chương liền mạch và chỉnh nhỏ (10 mục) ✅ (đã merge vào main, deploy local)

Plan: [docs/superpowers/plans/2026-11-09-reader-bar-wide-and-polish.md](docs/superpowers/plans/2026-11-09-reader-bar-wide-and-polish.md). Không đổi API hay schema.

- **Thanh đọc (public):** rộng bằng cột ảnh (`var(--reader-width)` nay đặt ở `<main>` để thanh và ảnh cùng theo A−/A+); bên trái nút `←` (`Về trang truyện`) cùng tên truyện (đậm, một dòng) và tên chương (`Chương N` hoặc nhãn, không kèm tiêu đề); bên phải `‹ › Mục lục Cài đặt`.
- **`NovelRenderer` `VERSION` 4 → cần Publish lại các chương đã đăng:** bỏ chữ chân trang `Ch. N · k/n`; trang 2+ chỉ chừa lề mỏng (`TOP` -6, `BOTTOM` 0; chữ cách mép khoảng 12 px) nên các ảnh nối liền thành một dải; dòng chữ không bao giờ bị cắt ở mép ảnh. Trang 1 giữ tiêu đề.
- **Banner nổi bật:** ngày `Cập nhật` dạng `dd/MM/yyyy`; mỗi bìa là link tới trang truyện (tên truy cập là tên truyện); hai nút `‹` / `›` (`Truyện trước` / `Truyện sau`) cạnh bộ đếm, đổi truyện và khởi động lại bộ hẹn 6 giây.
- **Breadcrumbs** đẹp hơn (chữ nhỏ, phân cách `ChevronRight` mảnh, mục hiện tại đậm, link chuyển cam khi hover/focus, mục khác co lại trước).
- **Toast:** nút đóng ở góc trên phải (sonner 2.0.8 không có tuỳ chọn vị trí nên dùng CSS).
- **Trang truyện (public):** danh sách chương là một hộp viền liền, hàng gọn (40 px), từ 760 px và hơn 12 chương thì chia hai cột (CSS columns: đọc xuống hết cột trái rồi sang cột phải). Có mô tả thì hiện hai tab `Giới thiệu` | `Danh sách chương`, mặc định mở `Danh sách chương`; URL chỉ ghi tab còn lại (`?tab=intro`). Không có mô tả thì không có tab.
- **Admin:** Number, Chapter label, Chapter title trên một hàng (tự xuống dòng khi hẹp); khoảng cách giữa thanh Search/Filter và đường kẻ trên của danh sách Manage Vietsub.

### 2026-11-09: Rà soát UI vòng 1 (token, độ tương phản) và điều khiển đọc truyện trên thanh trên cùng ✅ (chưa merge, chưa deploy)

Plan: [docs/superpowers/plans/2026-11-09-ui-tokens-and-reader-topbar.md](docs/superpowers/plans/2026-11-09-ui-tokens-and-reader-topbar.md). Nhánh `feature/novel-page-checks`. Chỉ đổi frontend.

- **Token khoảng cách** 4 px (`--space-0-5` … `--space-16`) dùng cho mọi `margin`/`padding`/`gap` trong `styles.css` (giá trị lệch làm tròn: 6→8, 10→12, 14→16, 18→20, 22→24, 28→32); ngoại lệ giữ px: 0, 1px, `-1px`, `clamp()`/`calc()`.
- **Token đổ bóng:** chỉ `--shadow-overlay` (tooltip, hộp thoại, menu, popover) và `--shadow-drag` (3 trạng thái kéo). Thẻ và bìa không đổ bóng; bỏ gradient trang trí của `.plcard`; nền mờ banner opacity 0.12.
- **Token tương phản:** `--brand-ink`, `--brand-2-ink` (chữ/icon cam, tím trên nền sáng), `--field-border` (viền input, select, ô tìm, nút Filter ≥ 3:1), `--hover`. `contrast.test.ts` kiểm tra WCAG cho cả hai theme.
- **Thanh đọc** nằm trong thanh trên cùng (thay logo và menu) chỉ ở trang đọc chương; cả thanh trên cùng ẩn khi cuộn xuống, hiện lại khi cuộn lên. Cơ chế: `TopbarSlotProvider` (context) + portal; `ReaderPage` vẫn giữ state.
- **Vòng sau:** xem mục ngay dưới (vòng 2–3, đã làm).

### 2026-11-09: Rà soát UI vòng 2–3 (component dùng chung, breakpoint, tách CSS) ✅ (chưa merge, chưa deploy)

Plan: [docs/superpowers/plans/2026-11-09-ui-components-and-css-split.md](docs/superpowers/plans/2026-11-09-ui-components-and-css-split.md). Refactor thuần: không đổi giao diện.

- **Component dùng chung** trong `frontend/src/components/ui/` (mỗi cái có test): `Alert` (`div.alert[role=alert]`, title + hint + children), `LoadingText` (`p.muted[role=status]`), `IconButton` / `IconLink` (bọc `Tip`; `label` dùng cho cả tooltip và `aria-label`), `PageHeader` (`header.masthead`; có `actions` thì xếp hàng `masthead--row`), `Cover` (ảnh bìa hoặc ô trống có icon `BookOpen`), `SearchBar`, `PopoverPanel` (Radix Popover + Portal, class `.popover` chứa phần giao diện chung; `.saveto`, `.filter-menu`, `.reader-pop` chỉ giữ phần riêng). Chỗ tooltip khác `aria-label` có chủ ý (vd. `Move up` / `Move up: <tên>`) vẫn dùng `Tip` + nút thường.
- `NovelCard`: tên truyện là `h3`. Cuối chương: bỏ `<span aria-hidden>` giữ chỗ, dùng lưới 2 cột (Previous cột 1, Next cột 2).
- **Breakpoint** 520 / 760 / 1024 px: bảng ở đầu `styles/tokens.css`. Mọi `@media` hiện có đã đúng 520/760; chưa có layout nào ở 1024.
- **Tách `styles.css`:** `styles/tokens.css` + `styles/base.css` + `styles/vietsub-lists.css` (nhập qua `styles/index.css`, nhập một lần trong `main.tsx` và `main.public.tsx`); phần còn lại nằm cạnh component sở hữu và được component đó `import`. Bundle admin và public giờ chỉ chứa CSS của các component mà mỗi bên dùng (nhỏ hơn trước).
- **Kiểm tra:** `node frontend/scripts/check-css-split.mjs <commit-trước-khi-tách>` so từng luật (selector, khai báo, @media) của `styles.css` cũ với mọi file `.css` hiện tại: báo thiếu, trùng, luật mới ngoài danh sách chủ ý (`INTENDED` trong script) và breakpoint lạ; thoát mã 1 nếu có vấn đề. Commit trước khi tách: `a171382`.
- Test đọc CSS dùng `src/test/css.ts` (gộp mọi `src/**/*.css`, tokens trước). `vite.config.ts` chỉ xử lý các import `?raw` của CSS, nên `import './X.css'` trong component vẫn rỗng khi chạy test jsdom.

### 2026-11-09: Vai trò màu cam/tím, mục lục dạng ngăn kéo, nút cuối chương ở hai góc ✅ (chưa merge, chưa deploy)

Plan: [docs/superpowers/plans/2026-11-09-brand-colours-and-reader-drawer.md](docs/superpowers/plans/2026-11-09-brand-colours-and-reader-drawer.md). Nhánh `feature/novel-page-checks`. Chỉ đổi frontend; thêm `@radix-ui/react-dialog@1.3.1`.

- **Vai trò màu:** cam = hành động/nhấn (nút chính, viền nút phụ, link); tím = trạng thái/đang chọn/hover. Nút phụ (`.button--small`, `.button--icon`, `.filter-button`, `.pager__link`, nút trang trong cảnh báo chương) viền cam, hover viền tím; nút disabled giữ viền `--rule`. Link thường (`a:not([class])`) màu `--brand-ink`, gạch chân, hover `--brand-2-ink`.
- **Focus ring:** `--focus` = `--brand-2-ink` (sáng) / `--brand-2` (tối), bỏ màu xanh; khung video tối dùng `--brand-2` (7.5:1). `--brand-2-ink` sáng đổi `#9b569b` → `#965296` để chữ hover đạt 4.5:1. `contrast.test.ts` kiểm `--focus` ≥ 3:1 và cấm màu focus hard-code; `brandRoles.test.ts` kiểm viền nút phụ, link, khoảng cách tab.
- **Tab:** khoảng cách thanh tab → nội dung còn 12px (`.tabs` gap `--space-3`, bỏ padding-top của `.tabs__panel`; tab dạng link trong `.page` kéo lên bằng margin âm).
- **Mục lục** (`ReaderBar`): Radix Dialog dạng ngăn kéo bên phải (`min(360px, 85vw)`, cao `100dvh`, overlay mờ, thân cuộn riêng có thanh cuộn mảnh), trượt vào/ra (tắt khi `prefers-reduced-motion`). Esc, ✕, bấm overlay đều đóng; focus trả về nút `Mục lục`. Khi mở, focus rơi vào ngăn kéo (không vào nút ✕, vì tooltip của ✕ sẽ nuốt lần Esc đầu).
- **Cuối chương:** `Chương trước` góc trái, `Chương sau` góc phải của cột đọc (`--reader-width`), cả hai là nút cam `button--primary`.

### 2026-11-09: Bảng màu ấm (sáng A, tối C) ✅ (chưa merge, chưa deploy)

Plan: [docs/superpowers/plans/2026-11-09-warm-palette.md](docs/superpowers/plans/2026-11-09-warm-palette.md). Nhánh `feature/novel-page-checks`. Chỉ đổi frontend, không thêm package.

- **Token:** nền ấm `#F7F3EE` + mực tím sẫm `#221C26` (sáng); nền tím tối `#16121B`/`#211B28` (tối); thêm `--brand-hover`, `--frame`, `--on-frame`. Nút chính hover đổi nền sang `--brand-hover`.
- **Khung video:** `UrlForm.css` và `VideoPlayer.css` dùng `--frame`/`--on-frame` thay hex.
- **Test:** `contrast.test.ts` kiểm `--ink` ≥ 7:1 (AAA), chữ phụ/brand-ink/danger ≥ 4.5:1, viền ô nhập/focus ≥ 3:1, `--on-brand` trên `--brand-hover`, `--on-frame` 7:1. `--danger` và `--hover` giữ nguyên (đạt).

### 2026-11-10: Dịch phim bộ chính xác hơn: ví dụ từ tập đã Done + mô tả YouTube ✅ (đã merge PR #8, chưa deploy; cần deploy vì có V12)

Nhánh `feat/translate-series-context`. Plan: [docs/superpowers/plans/2026-11-10-translate-series-context.md](docs/superpowers/plans/2026-11-10-translate-series-context.md). User đã duyệt, chọn (a): không chuyển hồ sơ của video cũ.

- **Ví dụ Engsub/Vietsub (#1):** mỗi lần dịch, `ExampleSource` lấy tối đa 3 video Done (Manual) đã dịch bằng **cùng hồ sơ**, ghép câu theo `start_ms`, chọn tối đa 60 cặp / 6.000 ký tự (ưu tiên câu người dịch đã sửa so với `vi_auto.srt`, rồi câu có tên riêng/xưng hô, rồi câu dài). Gửi giữa hồ sơ và phụ đề, kèm một dòng trong `SYSTEM_RULES`. Không thêm request Gemini.
- **Mô tả YouTube (#2):** Flyway **V12** `video.description CLOB`; `VideoInfoParser` đọc `description`, Get Engsub lưu lại; Translate again bổ sung một lần bằng `yt-dlp -J` nếu còn null (lỗi hoặc timeout thì bỏ qua). Làm sạch (bỏ URL/hashtag/Subscribe…, cắt 1.500 ký tự) rồi thêm khoá `description` vào JSON gửi Gemini. Không có trong `VideoDto`/`PublicVideo`.
- **Lỗi ngữ cảnh không làm hỏng lượt dịch:** chỉ log rồi dịch tiếp; log không chứa nội dung phụ đề hay mô tả.
- **Cách dùng:** nên tạo **một hồ sơ cho mỗi bộ phim** (vd `data/prompts/Moonshadow.md`) và dùng nhất quán cho mọi tập. Theo lựa chọn (a), video cũ không được chuyển hồ sơ nên ví dụ chỉ xuất hiện khi đã có tập dịch bằng hồ sơ đó và được đánh dấu Done; tập đầu của bộ phim chưa có ví dụ.
- **Cần deploy** (V12 chạy khi app khởi động). Chưa kiểm tra bằng Gemini thật: sau deploy, dịch một tập có ít nhất một tập Done cùng hồ sơ và xem log `examples: ...`.

### 2026-11-10: Vietsub › Profiles (phân tích câu đã sửa) + sửa viền focus của tab ✅ (chưa merge, chưa deploy)

Nhánh `fix/tab-focus-ring-on-click`, một PR cho cả hai phần. Plan: [docs/superpowers/plans/2026-11-10-profiles-analyze-corrections.md](docs/superpowers/plans/2026-11-10-profiles-analyze-corrections.md) (user đã duyệt). **PR #8 (V12) đã merge nhưng chưa deploy, nên lần deploy tới gồm V12 + nhánh này.** Nhánh này không có migration.

- **Viền focus khi click tab:** nguyên nhân là Radix Tabs 1.2.1 gọi `event.currentTarget.focus()` bằng script trong `onMouseDown`, Chromium coi focus do script là `:focus-visible` nên viền xuất hiện khi click chuột (dựng lại bằng Edge headless + CDP: sau click `matches(':focus-visible')` = true, outline 3px). `components/ui/TabTrigger` đánh dấu `data-pointer` lúc `pointerdown`, CSS `.tabs__tab[data-pointer]:focus-visible { outline: none }`; phím hoặc blur xoá dấu nên Tab/mũi tên vẫn hiện viền. Dùng ở trang truyện public, Vietsub list và trang Novel (admin).
- **Backend:** `CorrectionReader` tách khỏi `ExampleSource` (hành vi `ExampleSource` giữ nguyên, test cũ xanh); `PromptProfileStore` thêm `sha`/`write` (backup `.history/`, ghi atomic, 20 KB, 409 `PROFILE_CHANGED`); `ProfileAnalyzer` + 3 endpoint (GET, POST analyze, PUT) trong `PromptProfileController`; `/vietsub/profiles` thêm vào `SpaForwardController`. Chi tiết trong CLAUDE.md.
- **Frontend:** tab **Profiles** ở `VietsubTabs`, trang `ProfilesPage` (chọn hồ sơ lưu ở `?profile=`, nút Analyze corrections có lý do khi tắt, danh sách quy tắc ×N, diff highlight bằng thư viện `diff` qua `lib/profileDiff.ts`, Edit before saving với diff debounce 300 ms, xác nhận khi Save/Cancel đã sửa, toast, 409 → Alert).
- **Khác plan:** lỗi Gemini lúc phân tích dùng mã mới `GEMINI_FAILED` (502) vì trước đây `TranslationFailedException` chưa có handler đồng bộ; nút Analyze dùng `aria-disabled` thay `disabled` để tooltip lý do vẫn hiện; dropdown hồ sơ bị khoá khi đang phân tích hoặc đang có kết quả (phải Cancel hoặc Save trước khi đổi hồ sơ).
- **Sửa giao diện thêm trong PR này:** (1) nút ✕ của toast về lại bên phải: sonner 2.0.8 đặt nút bằng biến `--toast-close-button-*` qua luật cùng độ ưu tiên với luật của app nên thắng thua theo thứ tự nạp CSS; giờ ghi đè các biến trên chính toast (thắng theo độ gần) và thêm `[data-styled='true']`; (2) nhóm nút trên đầu trình sửa Vietsub căn phải (kể cả khi xuống dòng trên màn nhỏ) và tiêu đề dài không còn làm trang rộng hơn màn hình 390px; (3) bỏ mũi tên `>` cuối mỗi hàng Manage Vietsub; (4) nút Back và các nút icon trên thanh đọc truyện public hết bo tròn (bỏ `border-radius: 999px` riêng), dùng `--radius-control` như mọi nút icon; (5) NavBar tô đúng "Vietsub" ở `/vietsub/profiles`; nút "Edit before saving"/"Cancel" dùng kiểu nút phụ.
- **Chưa kiểm tra với Gemini thật.** Sau deploy (khi user cho phép): Analyze `EmiBonnie` (34 video), xem diff, thử Edit rồi Cancel; chỉ Save khi muốn.

### 2026-11-10: Banner Profile tự chạy và lượt đọc truyện ✅ (chưa deploy)

Plan: [docs/superpowers/plans/2026-11-10-banner-autoplay-novel-reads.md](docs/superpowers/plans/2026-11-10-banner-autoplay-novel-reads.md). Nhánh `feature/banner-autoplay-novel-reads`.

- **Banner Profile (`FilmStrip`):** prop `autoplayMs` (Profile truyền 5000) và `paused`. Chuyển ảnh sau mỗi 5 giây, hết ảnh thì quay về ảnh đầu; tạm dừng khi hover, focus trong dải ảnh, mở lightbox, tab bị ẩn; tắt khi reduced motion hoặc chỉ có 1 ảnh; vuốt/bấm tay thì đếm lại từ đầu (`setTimeout` theo slide hiện tại).
- **Lượt đọc truyện:** Pages Function + D1, sinh lúc Publish (xem CLAUDE.md, mục Trang public). Đếm khi mở một chương; hiện tổng theo truyện ở thẻ truyện và trang truyện public ("1,2 N lượt đọc", icon mắt, chữ xám, ẩn nếu chưa có số) và ở trang Novels của admin ("{n} reads", "–" nếu không có).
- **Chưa kiểm chứng với Cloudflare thật:** wrangler không có trong máy dev nên chưa chạy `wrangler pages deploy` thật; giả định wrangler lấy `functions/` + `wrangler.toml` từ thư mục làm việc (cha của thư mục site) và route Function được ưu tiên hơn `_redirects` (`/* /index.html 200`). Kiểm tra bằng `curl https://<project>.pages.dev/api/reads` sau lần Publish đầu.
- **Việc làm tay một lần:** (1) Cloudflare dashboard, Storage & Databases, D1, tạo database tên `novel-reads`; (2) copy Database ID vào `.env` (`CLOUDFLARE_D1_DATABASE_ID=...`) rồi chạy lại app; (3) bấm Publish; nếu deploy báo lỗi binding thì cấp cho API token thêm quyền Account, D1, Edit.
- **Test:** `FilmStrip`/`ProfileBanner` (fake timers), `publicFunctions.test.ts` (function với D1 giả), `novelReads.test.ts`, `NovelReads.test.tsx`, `NovelsPage`; Java: `ReadCountsFunctionsTest`, `PublishServiceTest`, `NovelReadsServiceTest`, `NovelReadsControllerTest`.

### 2026-11-10: Trang public chỉ hiện Vietsub Manual ✅ (chưa deploy)

Nhánh `feature/public-manual-vietsub-only`. Chỉ đổi backend (`SiteExporter`), admin không đổi.

- **Lọc:** chỉ video `viSource == MANUAL` (và có cue) vào `data/videos.json` và `data/videos/<id>.json`; video Vietsub AI không xuất nên mở thẳng `/vietsub/:id` ra "Not found".
- **Playlist:** danh sách video, số lượng và ảnh bìa chỉ tính video Manual; playlist không còn video Manual nào thì không xuất (không có `data/playlists/<id>.json`, không có trong `playlists.json`).
- **Test:** `SiteExporterTest` thêm 3 ca (video AI bị loại, playlist chỉ có AI bị bỏ, playlist hỗn hợp tính lại số lượng + bìa); các ca cũ dùng Vietsub Manual.
- **Cần làm:** bấm **Publish lại** để bản public bỏ các video AI đã đăng trước đó.

### 2026-11-10: Trạng thái sửa Vietsub (In progress / Done), public chỉ xuất Done, tua và phát khi focus dòng ✅ (chưa merge, chưa deploy)

Nhánh `feat/vietsub-edit-status`. Plan: [docs/superpowers/plans/2026-11-10-vietsub-edit-status-and-seek-on-focus.md](docs/superpowers/plans/2026-11-10-vietsub-edit-status-and-seek-on-focus.md).

- **DB/backend:** Flyway **V11** thêm `video.edit_status` (`IN_PROGRESS` | `DONE`, nullable), video MANUAL có sẵn được gán `DONE`. Lưu text: `null` thành `IN_PROGRESS`, `DONE` giữ `DONE`; upload/Replace `.srt` gán `DONE`; Gemini không đổi. `PUT /api/videos/{id}/edit-status` (Mark as done / Reopen) chỉ cho Vietsub MANUAL, từ chối khi đang dịch.
- **Public:** `SiteExporter` chỉ xuất video `DONE` (thay luật "chỉ MANUAL" cũ), playlist tính lại số lượng và ảnh bìa.
- **Admin:** editor có nút Save (icon, cam), Mark as done (khoá khi còn thay đổi chưa lưu hoặc đang dịch) và Reopen, kèm toast; Manage Vietsub hiện icon trạng thái cạnh nhãn Manual (tím = In progress, cam = Done).
- **Editor:** focus textarea của dòng khác dòng focus trước thì tua video tới dòng đó và phát (nhớ dòng trong ref); cùng dòng, readonly (đang dịch) thì không; nút `#` chỉ tua và cuộn.
- **Cần làm:** deploy (có migration V11), rồi bấm **Publish lại**; chỉ các video đã Done mới lên bản public. Backlog: lọc Manage Vietsub theo trạng thái.

### 2026-11-10: UI review Get Engsub, Vietsub, Vietsub list và trang xem ✅ (chưa merge, chưa deploy)

Nhánh `feat/ui-review-watch-lists` (tạo từ `feat/vietsub-edit-status`, rebase lên `main` sau khi PR #4 merge). Plan: [docs/superpowers/plans/2026-11-10-ui-review-engsub-vietsub-lists.md](docs/superpowers/plans/2026-11-10-ui-review-engsub-vietsub-lists.md). Phạm vi: W1–W8, P1–P4, E1–E5, V1–V3, L1 (W9 Theater mode và cỡ chữ S/M/L để Backlog).

- **Trang xem (admin + public):** tiêu đề/kênh nằm dưới video (W2); player không cao hơn màn hình (W1, `max-width` theo `100dvh`); phím tắt cấp trang K/Space, J/L, ←/→, M, C, `?` (hook `usePlayerShortcuts`, bỏ qua khi đang gõ, khi có Ctrl/Meta/Alt, trong dialog/popover; Space không bắt khi focus ở nút/link); popover liệt kê phím (nút `Keyboard`); nút Show/Hide Vietsub trong khung player, nhớ trong localStorage (W5); phụ đề tối thiểu 14px; nút trong khung 44px ở ≤760px. Tooltip của nút trong khung player vẫn dùng `title` (W7: `<Tip>` render portal ra ngoài khung fullscreen nên không hiện).
- **`useYouTubePlayer`:** thêm `togglePlay`, `seekBy`, `toggleMute` (IFrame API: `getPlayerState`, `pauseVideo`, `getDuration`, `mute/unMute/isMuted`).
- **Đã xem (P1):** `data/watched.ts` (localStorage `subtitle-studio.watched`, lỗi storage chỉ giữ trong bộ nhớ). Video tính là đã xem khi `ended` hoặc qua 90% thời lượng. Hiện dấu tick trong panel playlist (kèm "Watched" ẩn, ảnh mờ 75%) và dòng "Watched" trong danh sách video. **Up next** (P2) ở đầu panel và nhãn `Next`. **Continue: EP N** (P4) ở header/thẻ playlist: video chưa xem đầu tiên, chỉ hiện khi đã xem ít nhất một video và còn video chưa xem.
- **Danh sách:** thẻ playlist gọn trên mobile (ảnh bìa rộng hết thẻ, ẩn preview, số video và Play all cùng hàng, preview thẳng hàng) (P3); ô tìm kiếm tối đa 560px (L1); Get Engsub/Manage Vietsub: nút nằm dưới tiêu đề trên mobile (E1), Delete tách ra (E2), tiêu đề 2 dòng (E3), bảng câu 60dvh (E4), placeholder rõ hơn (E5); Manage Vietsub bỏ h2 hiển thị (V2) và có chevron ở cuối dòng (V3); focus ring cho `label.button` bọc input file ẩn (V1, `:has(input:focus-visible)`).
- **W8:** không còn thấy tràn ngang ở 390px khi đo lại sau khi đổi layout (không tìm ra nguyên nhân riêng).
- **Test:** `cd frontend && npx tsc --noEmit && npm test`: 65 file, 862 test pass (trước nhánh này 849 chưa tính test mới của PR #4); thêm test cho hook phím tắt, `watched`, `useYouTubePlayer`, `WatchPage`, `VietsubListPage`, test CSS (`listsLayout.test.ts`, `WatchPage.css.test.ts`). `test/css.ts` chuẩn hoá CRLF (checkout Windows làm 2 test `brandRoles` fail).
- **Chưa deploy; public cần Publish lại** (dữ liệu "đã xem" chỉ nằm ở trình duyệt từng người xem, không gửi đi đâu).

### 2026-11-10: Novel reader UX (trang đọc truyện public) ✅ (chưa merge, chưa deploy)

Nhánh `feat/novel-reader-ux`. Plan: [docs/superpowers/plans/2026-11-10-novel-reader-ux.md](docs/superpowers/plans/2026-11-10-novel-reader-ux.md).

- **Ảnh chương 3 khổ:** `NovelRenderer` (VERSION 5) vẽ mực đen trên giấy trong suốt, ba khổ s/m/l = 1080×4800, 820×3645, 700×3111; `RenderCache` băm riêng từng khổ; JSON chương có `formats`. Màu nền do CSS quyết định.
- **Giao diện đọc:** 4 theme (Sáng/Giấy/Tối/Đen OLED) bằng CSS, cỡ chữ chọn được; trên mobile có thanh dưới, vùng chạm trên mobile (một phần tư trên: cuộn lên, một phần tư dưới: cuộn xuống, giữa: ẩn/hiện thanh), thanh tiến độ, bảng cài đặt dạng bottom sheet. Skeleton + fade khi tải chương, prefetch chương kế.
- **Trang truyện:** trang chủ có hàng "Tủ sách" và "Mới cập nhật" (thời gian tương đối); trang "Tất cả truyện" dạng lưới bìa; trang chi tiết có nút thêm vào tủ và CTA đọc dính đáy trên mobile.
- **Publish đếm file:** `PublishStatus.fileCount`; cảnh báo từ 16.000 file, chặn khi > 20.000 (giới hạn Cloudflare Pages Free). Một chương trung bình ~62 file, tức ~300 chương là chạm ngưỡng.
- **Sửa theo review cuối nhánh:** trang cuối mỗi chương được cắt theo dòng chữ cuối + lề (`NovelRenderer.VERSION` 6, ảnh đã đăng cần Publish again); chữ trên giấy (breadcrumb, skeleton, footer) theo màu theme đọc; thanh CTA trang truyện cố định đáy trên mobile, nằm trong hero trên desktop; tiến độ cuộn gắn với số chương nên không prefetch nhầm; ngưỡng file Pages chỉ còn ở `PublishService`.
- **Hướng sau:** chuyển ảnh chương sang R2 để hết giới hạn số file.
- **Kiểm tra:** `mvn test`, `npm run build`, `npm run build:public`. Chưa kiểm tra bằng trình duyệt trên site thật (chưa publish).

### 2026-11-10: Sửa Analyze ở Vietsub › Profiles báo 0 video / 0 câu ✅ (chưa merge, chưa deploy)
- Nguyên nhân: `ProfileAnalyzer` gọi `findExampleVideos(name, "", ...)`; Oracle coi `''` là NULL nên `v.id <> NULL` không bao giờ đúng, ra 0 dòng (H2 và test mock không bắt được). `ExampleSource` luôn truyền id video thật nên không bị.
- Sửa: thêm `VideoRepository.findCorrectionVideos(profile)` (cùng bộ lọc và thứ tự, không có `excludeId`); `ProfileAnalyzer` dùng nó. Test mới `PersistenceOracleIT.findsEveryFinishedHandMadeVideoOfAProfileWithoutAnExcludedId` trên Oracle thật.

### 2026-11-10: Profile thành một trang (Flyway V13) ✅ (chưa merge, chưa deploy)
Spec: [docs/superpowers/specs/2026-11-10-profile-single-page-design.md](docs/superpowers/specs/2026-11-10-profile-single-page-design.md), plan: [docs/superpowers/plans/2026-11-10-profile-single-page.md](docs/superpowers/plans/2026-11-10-profile-single-page.md). Nhánh `feat/profile-single-page` (một PR chung với Photos và Works). **Migration `V13__profile_single_page.sql` chưa chạy trên DB thật nào.** Sau khi deploy: tải ảnh chân dung cho Emi, Bonnie (và avatar EmiBonnie) rồi Publish again.
- **Trang `/profiles` duy nhất** thay ba tab: tiêu đề `Profile`, banner EmiBonnie (`FilmStrip`), rồi mỗi thành viên một `MemberSection` (chân dung 3:4 bên trái/phải xen kẽ, tên, tagline, icon mạng xã hội lấy từ các khối LINKS; bên kia là họ tên đầy đủ và các khối). FACTS thành lưới 2 cột (1 cột dưới 520px, khối FACTS đầu tiên ẩn tiêu đề), khối mới **CHIPS** (nhãn dạng viên thuốc, tối đa 50, nhãn 1-100 ký tự). `/profiles/:slug` chuyển sang `/profiles#slug`, cuộn tới mục sau khi tải; hash lạ bị bỏ qua. `ProfileTabs` đã xoá.
- **Schema V13:** `t_profile` thêm `kind` (GROUP/MEMBER, check), `sort_order`, `tagline`, `full_name`, `portrait_media_id` (FK `t_media`); `t_media` thêm `width`/`height` (chỉ ảnh upload có `maxSide` mới có); check `block_type` thêm `CHIPS`. Đúng một dòng GROUP (`emibonnie`), API không tạo/xoá được.
- **API:** `GET /api/profiles` trả `{group, members}`; `PUT /api/profiles/{slug}/header`; `POST /api/profiles` (slug sinh từ tên bởi `SlugGenerator`: bỏ dấu, `-`, tối đa 20, trùng thì `-2`, không có chữ Latin hoặc là `order` thì `member-N`); `DELETE /api/profiles/{slug}` (409 `GROUP_PROFILE` với GROUP); `PUT /api/profiles/order`. `POST /api/media?maxSide=400|1600` thu nhỏ bằng `ImageResizer` rồi mã hoá WebP lossy 0.82 (JPEG 0.85 nếu máy không có writer WebP), không phóng to, GIF bị từ chối, kiểm tra 10 MB trước khi giải mã; trả thêm `width`/`height`.
- **Bản public:** `data/profiles.json` = `{group, members}` với mọi URL ảnh đổi sang `/media/...` và id bị bỏ; không còn `data/profiles/*.json`.
- **Admin:** nút `Add member`, menu từng thành viên (Edit header, Move up/down, Delete member có xác nhận), form header (tên, tagline, họ tên, chân dung upload `maxSide=1600`), banner gắn vào dòng GROUP, nút "Edit EmiBonnie avatar" (avatar dùng ở bộ lọc Photos/Works).
- **Quy tắc ảnh:** mọi bảng trỏ tới `t_media` phải được thêm vào `MediaRepository.isReferenced` và `findUnreferencedCreatedBefore`, nếu không ảnh bị dọn sau 24 giờ (chân dung là bảng mới nhất).
- **Test:** `mvn test -Dskip.npm` 960 pass; `npm test` 85 file / 1002 test; `PersistenceOracleIT` (xem mục Oracle trong PR). Ảnh chụp màn hình chụp một lần ở cuối nhánh cho cả ba phần.

### 2026-11-10: Menu Photos (Flyway V14) ✅ (chưa merge, chưa deploy)
Spec: [docs/superpowers/specs/2026-11-10-photos-design.md](docs/superpowers/specs/2026-11-10-photos-design.md), plan: [docs/superpowers/plans/2026-11-10-photos.md](docs/superpowers/plans/2026-11-10-photos.md). Cùng nhánh `feat/profile-single-page` (một PR chung với Profile và Works). **Migration `V14__photos.sql` chưa chạy trên DB thật nào.** Cần Publish again để bản public có `photos.json`.
- **Schema V14:** `t_photo_post` (link Instagram đã chuẩn hoá, unique; `media_id` FK; `taken_on`/`taken_until` kiểu `DATE`; `source` OFFICIAL/MEDIA/FAN; `photo_count` 1-99 hoặc NULL) và `t_photo_post_profile` (nhiều-nhiều với `t_profile`, `ON DELETE CASCADE`). **Điều chỉnh:** `DATE` của H2 (MODE=Oracle) và Oracle đều trả về `TIMESTAMP` nên entity map `LocalDate` bằng `@JdbcTypeCode(SqlTypes.TIMESTAMP)`; chỉ phần ngày được dùng.
- **API:** `GET/POST /api/photos`, `PUT/DELETE /api/photos/{id}`. `InstagramUrl.normalize` đưa mọi link chia sẻ (host `instagram.com`/`www.`/`m.`, tiền tố `/{username}`, query, fragment, thiếu scheme) về `https://www.instagram.com/{p|reel|tv}/{code}/`; trùng link → 409 `PHOTO_POST_EXISTS` kèm `title` bài cũ (khi sửa, chính bài đó không tính). Ảnh phải upload bằng `?maxSide=` (cần `width`/`height`), thiếu thì 400 trên `mediaId`. Mọi lỗi field trả cùng lúc (`INVALID_BLOCK` + `errors[]`). Đổi/xoá ảnh thì ảnh cũ bị xoá nếu không ai dùng.
- **Trang `/photos` (admin + public):** lưới bento CSS (4/3/2 cột, hàng 200px/160px, `grid-auto-flow: dense`), hình dạng ô từ tỉ lệ ảnh (`tileShape`: ≥1.2 cao 1×2, ≤0.8 rộng 2×1), chip `Official/Media/Fan` và `n photos`, tiêu đề + ngày (`formatDayRange`, tách chuỗi `yyyy-mm-dd`, không dùng `new Date()` nên không lệch ngày theo múi giờ), 24 ô rồi `Load more`; bộ lọc người `PeopleFilter` (dùng chung với Works) giữ ở `?who=`. Admin: `Add post` (dialog Radix: dán link, kéo thả / chọn / Ctrl+V ảnh, tiêu đề, ngày, ngày kết thúc, nguồn, người, số ảnh; chỉ Ctrl+V có ảnh mới bị chặn, dán chữ vẫn bình thường) và menu `⋯` mỗi ô (Edit, Delete có xác nhận).
- **Public:** `data/photos.json` (ảnh đổi sang `/media/...`; bài mất file ảnh thì bỏ và WARN). NavBar: `Get Engsub | Vietsub | Vietsub list | Profile | Photos | Novels`; `/photos` thêm vào `SpaForwardController`.
- **Test:** `mvn test -Dskip.npm` 991+ pass (`InstagramUrlTest`, `PhotoServiceTest`, `PhotoControllerTest`, `PhotoPostRepositoryTest`, `SiteExporterTest`), `npm test` (`PhotosPage`, `PhotoPostDialog`, `PeopleFilter`, `dates`, `tileShape`, `photos`, `NavBar`); `PersistenceOracleIT` thêm hai bảng và test ngày trên Oracle.

### 2026-11-10: Menu Works (Flyway V15) ✅ (chưa merge, chưa deploy)
Spec: [docs/superpowers/specs/2026-11-10-works-design.md](docs/superpowers/specs/2026-11-10-works-design.md), plan: [docs/superpowers/plans/2026-11-10-works.md](docs/superpowers/plans/2026-11-10-works.md). Cùng nhánh `feat/profile-single-page` (một PR chung với Profile và Photos). **Migration `V15__works.sql` chưa chạy trên DB thật nào.** Cần Publish again để bản public có `works.json` và `works/{id}.json`.
- **Schema V15:** `t_person` (danh bạ: tên + avatar), `t_work` (bìa, `release_date` NULL = Coming Soon, `category` 8 giá trị cố định, `subcategory`, `profile_id` làm huy hiệu, mô tả), `t_work_link` (PILOT/TRAILER/X/INSTAGRAM/OTHER, nhãn, URL, `icon` NULL = tự nhận), `t_work_credit` (người + vai + tên nhân vật). Link và credit xoá theo work (`ON DELETE CASCADE`); không có unique `(work_id, person_id)` vì ghi lại cả danh sách sẽ va chạm giữa chừng, nên service kiểm tra.
- **Quy tắc (ở `WorkValidator`, mọi lỗi trả cùng lúc với đường dẫn như `links[2].url`):** tối đa 20 link, mỗi loại cố định (khác OTHER) một lần, URL http(s) ≤ 500, nhãn 1-60 (để trống thì dùng nhãn mặc định), icon thuộc danh sách; tối đa 30 người, một người một lần, vai ≤ 40, nhân vật ≤ 100 và **bị xoá khi category khác FILM_TV**; tiêu đề 1-200, subcategory ≤ 50, mô tả ≤ 2000. Xoá người đang được credit → 409 `PERSON_IN_USE` kèm danh sách tên work (`Used by: A, B`). Tên người duy nhất không phân biệt hoa thường. Đổi/xoá bìa hoặc avatar thì file cũ bị xoá nếu không ai dùng.
- **`YouTubeIds.videoId`** (package `common`) dùng chung cho trailer của truyện và của work (`NovelValidator` gọi nó; vẫn nhận id trần 11 ký tự như trước). `WorkDto.trailerVideoId` lấy từ link TRAILER nếu là YouTube.
- **Frontend:** `/works` (lọc người `?who=` + pill category `?cat=`, đếm kết quả, thẻ poster 4:5, Coming Soon đứng đầu), `/works/:id` (ảnh bìa mở lightbox, chip, nút link có icon, mô tả, trailer là poster rồi mới nạp iframe `youtube-nocookie`, mục Cast / Artists / People), `/works/new` và `/works/:id/edit` (bìa, ngày, category, subcategory gợi ý, huy hiệu, `LinksEditor` quick-add + kéo thả, `CreditsEditor` + `PersonPicker` tìm / tạo người, Ctrl+S, Delete), nút `People` mở `PeopleDialog` (đổi tên, đổi avatar 400px, xoá). `LinkIcon` (`components/ui`) gom bảng host → icon (thêm Netflix, Apple Music, Line) và `BrandIcon` của Profile gọi lại nó; `SortableList` dùng dnd-kit. NavBar: `Get Engsub | Vietsub | Vietsub list | Profile | Works | Photos | Novels`; `/works...` thêm vào `SpaForwardController`.
- **Quy tắc ảnh:** `t_work.cover_media_id` và `t_person.avatar_media_id` đã nằm trong `MediaRepository.isReferenced` / `findUnreferencedCreatedBefore`.
- **Lệch so với plan:** gộp Task 6 và 7 vào một commit; xác thực nằm trong `WorkValidator` (không cần DB) + `WorkService` (cần DB); lỗi 400 dùng `INVALID_WORK`.

### 2026-11-10: Lô cải tiến 2 (video dài, theater, cỡ chữ, backup Oracle, Select, cuộn đầu trang) ✅ (chưa merge, chưa deploy)

Nhánh `feat/enhancements-batch-2`. Plan: [docs/superpowers/plans/2026-11-10-enhancements-batch-2.md](docs/superpowers/plans/2026-11-10-enhancements-batch-2.md).

- **Video dài dịch theo đoạn:** giới hạn 180 phút, đoạn tối đa 45 phút (`gemini.part-duration`), từ đoạn 2 kèm 8 dòng cuối đoạn trước; đoạn xong ghi vào `data/translate-partial/<id>.json`, Translate again dịch tiếp từ đoạn lỗi; trạng thái `Translating part 2/3 with Gemini (...)`.
- **Trang xem:** chế độ rạp (nút + phím T) và cỡ chữ phụ đề S/M/L (mặc định S = cỡ cũ), nhớ trong localStorage, cả admin và public.
- **Backup Oracle:** `scripts/backup-db.ps1` (expdp, giữ 14 bản trong `data/backups/`), `restore-db.ps1`, `register-backup-task.ps1` (tác vụ `SubtitleStudio DB backup` 12:00 hằng ngày, chạy bù). Quy tắc: backup trước mỗi lần deploy. Đã thử khôi phục vào schema tạm `SS_RESTORE_TEST`: 15 bảng, số dòng khớp hết, đã xoá schema tạm.
- **Select dùng chung** (Radix) thay 5 `<select>` gốc; `ScrollToTop` cho cả hai app.
- **Cần làm:** chạy `scripts/register-backup-task.ps1` trên máy khác nếu có; deploy không cần migration mới.

### 2026-11-11: UI polish (hệ thống điều khiển, chuyển động, Works/Photos) ✅ (chưa merge, chưa deploy; cần deploy vì có V16)

Nhánh `feat/ui-polish`. Spec: [docs/superpowers/specs/2026-11-11-ui-polish-design.md](docs/superpowers/specs/2026-11-11-ui-polish-design.md), plan: [docs/superpowers/plans/2026-11-11-ui-polish.md](docs/superpowers/plans/2026-11-11-ui-polish.md).

- **Nền tảng (Task 2-5):** token cỡ điều khiển (`--control-s/m/l` = 32/40/48 px) và chuyển động (`--dur-*`, `--ease-*`, về 0 khi `prefers-reduced-motion`); một họ nút `.button` (S/M/L, icon, `--primary/--ghost/--danger/--danger-solid`), `--small` đổi tên thành `--s`; ô nhập dùng chung selector `:where(input…, select, textarea, .field-control)` cao 40 px; `.form-actions`. Test `styles/controls.test.ts` chặn CSS riêng cỡ nút.
- **Component dùng chung:** `Field` (label/hint/error + aria), `DatePicker` (`react-day-picker` 9.14.0, chuỗi `yyyy-mm-dd` không lệch múi giờ, hiện `dd/MM/yyyy`), `NumberField`, `ImageDropzone` (thay `ImagePicker`; Ctrl+V chỉ nhận khi focus trong chính nó hoặc trong dialog chứa nó), `Reveal`, `Skeleton*`, `useScrollDirection` (navbar ẩn khi cuộn xuống, mờ kính khi `scrollY > 0`; thay `useHideOnScroll`), `useDelayedFlag`.
- **Chuyển động:** mọi `transition`/`animation` dùng token; popover/select mở từ trigger (`overlay-in/out`), modal fade + trượt 12 px, thẻ nhấc 2 px khi hover (chuột), toast theo token.
- **Works (Flyway V16 + frontend):** `category` thành `categories` (1–8 giá trị, giữ thứ tự) qua bảng `t_work_category` (PK `work_id, category`, `position` 1..n; migration copy mỗi work thành một dòng, test `V16MigrationTest` chạy V15 → V16 trên H2 và `PersistenceOracleIT` trên Oracle). `Work.set` gán list mới (không `clear + addAll`) để Hibernate xoá hết dòng rồi chèn lại, tránh trùng khoá khi đổi thứ tự. Work là phim khi có FILM_TV (tiêu đề "Cast", ô Character); chỉ MUSIC thì "Artists"; còn lại "People". Thẻ hiện mọi chip, lọc `?cat=` khớp work có chứa category đó, editor dùng `CategoryToggleGroup` (không bỏ được cái cuối), Release date là `DatePicker` có Clear ("Coming Soon"), link một dòng ≥ 760 px.
- **Sửa lỗi Create person:** form trong portal vẫn bubble `submit` (React) lên form Work. Đã `stopPropagation` ở 4 form trong portal: `PersonPicker` (lỗi gốc), `PeopleDialog` (đổi tên), `PhotoPostDialog`, `Add member` của Profile. Test hồi quy ở `WorkEditPage.test.tsx`.
- **Photos:** bỏ `taken_until` (V16, API, export JSON, UI); dialog dùng `DatePicker` (mặc định hôm nay), `NumberField` 1–99 (rỗng = null), `ImageDropzone`; thanh nút Cancel + Save cùng cỡ M, Save cuối. Sắp xếp lại ở client sau khi lưu có test (mới → cũ, rồi id).
- **Lệch so với plan:** Works không có sắp xếp lại ở client (mỗi lần lưu chuyển sang trang chi tiết, danh sách tải lại từ server đã sắp xếp), nên chỉ Photos có test re-sort client; thứ tự server của Works có test ở `WorkServiceTest.comingSoonStaysFirstThenNewestThenHighestId`.
- **Rà soát trang (Task 9-10):** Get Engsub: ô link và nút 48 px (L), ô chọn dịch cùng 48 px; ô tìm kiếm 40 px bo 8 px, nút Filter cỡ M, nút icon ở hàng dùng cỡ S (32 px), phân trang ô 32 px, pill category là nút S; thanh nút của form (`.form-actions`: Cancel rồi Save) dùng ở Profile, Person picker, Novel form, Work, Photos. List hiện `SkeletonList`/`SkeletonGrid` sau 150 ms thay `LoadingText`; thẻ Works/Photos/Novels hiện dần có độ trễ (`Reveal`, tối đa 8 bước) và trượt vị trí khi lọc (`layout`).
- **Đo bằng CDP** (jar build trong worktree, cổng 8099, H2 với dữ liệu mẫu): mọi `button.button` cao 32/40/48 px và mọi ô nhập 40/48 px ở 1440 và 390 px, trừ `<select>` ẩn của Radix (aria-hidden). Ảnh trước/sau ở `scratchpad/ui/before` và `scratchpad/ui/after`.
- **Lệch so với plan:** bỏ các `min-height: 44px` cảm ứng của nút trên điện thoại (spec chỉ cho 32/40/48); danh sách hàng (VideoList, VietsubList…) giữ `rowMotion` cũ (trượt khi thêm/xoá) chứ không thêm stagger lúc tải; trang public không có "trước" để chụp (chỉ chạy được bản admin ở 8080), được kiểm bằng test và các component dùng chung.

- **Sửa theo review PR #15:** màn hình cảm ứng (`pointer: coarse`) mọi `.button` (gồm `--s`, `--icon`) có vùng bấm 44 x 44 px qua `::after` trong suốt, kích thước hiển thị giữ 32/40/48 (hai nút cách nhau 8 px có thể chồng 4 px vùng bấm); ô chọn hồ sơ dịch của Get Engsub đổi nhãn rỗng thành "No profile" và rộng tối đa 16rem; nhãn icon "Generic link" của Works đổi thành "Link".

### 2026-11-11: Fanfics (Wattpad) trong Novels, phần backend ✅ (chưa merge, chưa deploy; cần deploy vì có V18)

Nhánh `feat/fanfics`. Spec: [docs/superpowers/specs/2026-11-11-fanfics-design.md](docs/superpowers/specs/2026-11-11-fanfics-design.md), plan: [docs/superpowers/plans/2026-11-11-fanfics.md](docs/superpowers/plans/2026-11-11-fanfics.md).

- **Package `fanfic`:** `WattpadLink` (chỉ nhận `wattpad.com`, `www.`, `m.`; `/story/{id}[-slug]`; link chương được nhận ra riêng để báo lỗi), `WattpadClient` (`java.net.http`, `User-Agent: SubtitleStudio`, timeout 10 giây, cấu hình `subtitlestudio.wattpad.base-url`; 404/400 là `FanficNotFoundException`, mọi lỗi khác là `WattpadUnavailableException`), `FanficService` (Wattpad chỉ được gọi ở preview, add, refresh, refresh all; không gọi trong transaction DB; refresh all tuần tự, nghỉ 500 ms giữa các truyện qua `Sleeper`, truyện lỗi được báo và giữ nguyên dữ liệu cũ), `FanficController` (`/api/fanfics`, `/preview`, `/refresh`, `/{id}/refresh`). Chống trùng theo `wattpad_id` (mọi dạng link), kiểm tra trước khi gọi Wattpad.
- **Bìa:** tải bản `-512-` (rơi về URL gốc nếu 404), `storeResized(…, 512)`; chỉ tải lại khi `cover_source_url` đổi; không tải được bìa thì vẫn lưu truyện (không bìa). `t_fanfic.cover_media_id` đã nằm trong quy tắc ảnh ở `MediaRepository`.
- **Flyway V18** `t_fanfic` (mô tả CLOB, `completed` là 0/1, thời gian đọc `round(wordCount / 230)` tính khi trả DTO). `PersistenceOracleIT` có test mô tả chứa ký tự astral (chữ toán học đậm, emoji).
- **Export:** `data/fanfics.json` (`FanficDto[]`, bìa là `/media/<key>.webp`; file bìa mất thì giữ truyện, `coverUrl` null).
- **Test:** không test nào gọi Wattpad thật (stub HTTP server cục bộ + fixture `src/test/resources/wattpad/story-396487502.json`).

### 2026-11-11: Works/Photos polish (Combobox, ô chọn ngày, link X, logo) ✅ (chưa merge, chưa deploy; cần deploy vì có V17)

Nhánh `fix/works-photos-polish`.

- **Combobox** (`components/ui/Combobox.tsx`, tự viết trên Radix Popover, không thêm thư viện): thay `<datalist>` ở vai trò credit và subcategory của Work.
- **Trailer:** bỏ `TrailerEmbed` và `trailerVideoId` (DTO, export, frontend); link TRAILER chỉ là nút link như Pilot. `YouTubeIds` giữ lại cho Novels.
- **Bộ lọc người:** `lib/people.ts` `matchesPerson`; thành viên gồm cả mục gắn nhóm, nhóm chỉ mục của nhóm (Works và Photos). Works lede: "Series, music, shows and more."
- **Ô chọn ngày:** biến `--rdp-*` đặt trên `.rdp-root` (trước đó bị thư viện đè nên xanh); chevron cam, hover cam nhạt, ngày chọn tím, hôm nay đậm; z-index popover 70, select 70, tooltip 80 (trên dialog 50/51) sửa lỗi không chọn được ngày trong dialog Add post.
- **Photos:** `PostUrl` (Instagram + X) thay `InstagramUrl`, cột `post_url` (V17, `ALTER TABLE ... RENAME COLUMN`), icon nền tảng trên thẻ, tiêu đề nhiều dòng.
- **Logo:** `frontend/public/logo.webp` ở navbar và favicon cho cả app lẫn bản public.
- **Lệch so với yêu cầu:** Combobox tự viết (không dùng `cmdk`); tooltip tăng lên z-index 80 vì dialog (51) che tooltip cũ (50).

### 2026-11-11: Fanfics (Wattpad) trong Novels, phần giao diện + kiểm tra ✅ (chưa merge, chưa deploy; cần deploy vì có V18)

- **Frontend:** `components/fanfics/` (`FanficCard` thẻ kiểu Wattpad, `format.ts` với `formatCompact` cắt không làm tròn lên và `formatReadingTime`, `FanficsTab` tìm kiếm không dấu theo title/author/tags, lọc All/Completed/Ongoing, sắp xếp Newest update/Most read/Most voted/Recently added, `AddFanficDialog` Fetch → xem trước → Save, `FanficMenu` Refresh/Delete, `NovelsTabs` + `useNovelsTab` giữ tab trong `?tab=`). Trang Novels của admin và public đều có tab Translated | Fanfics; public chỉ đọc qua `ReadSource.listFanfics` (`fanfics.json`). Mã lỗi `INVALID_FANFIC_LINK`, `FANFIC_NOT_FOUND`, `FANFIC_EXISTS`, `WATTPAD_UNAVAILABLE` có chữ riêng trong `lib/errors.ts`.
- **Lệch so với plan:** `WattpadClient` đọc `subtitlestudio.wattpad.base-url` bằng `@Value` (đúng key của plan, không qua `SubtitleStudioProperties`); không tải được bìa thì vẫn lưu truyện không có bìa (Refresh thử lại); tab Fanfics tải lại danh sách mỗi lần chuyển tab (Radix gỡ tab ẩn).
- **Kiểm tra:** `mvn test -Dskip.npm` 1128 test, `mvn verify -Poracle -Dskip.npm` (`PersistenceOracleIT` 20 test, gồm mô tả có ký tự astral và emoji), `npm test` 119 file, `npx tsc -b` sạch. Chạy jar thật trên cổng 8098 với H2 và bản sao `data/`, thêm truyện mẫu 396487502: Reads 51K, Votes 2.1K, Parts 28, Time 1h 8m, Complete.

### 2026-11-12: Lô phản hồi UI (hover thẻ Works, nhóm theo năm, ngày dd/MM/yyyy, FilterPills, nhãn Vietsub, Profile cuộn) ✅ (chưa merge, chưa deploy)

Nhánh `fix/ui-feedback-batch`, chỉ frontend.

- **Hover thẻ Works:** chỉ ảnh bìa (`.work-card__cover`) nhấc 2 px + đổ bóng, chữ đứng yên (`styles/base.css`); `.photo-tile`, `.plcard`, `.novel-card` đã có bo `--radius-frame` nên giữ nguyên.
- **Works theo năm:** `lib/groupByYear.ts` (Coming Soon trước, rồi năm giảm dần, giữ thứ tự trong nhóm); mỗi nhóm là `<section aria-labelledby>` + `<h2 class="works-year__label">` (đường kẻ `--rule` + nhãn bên phải) + `work-grid` riêng.
- **Ngày:** `lib/dates.ts` là nơi duy nhất: `formatDay` (`dd/MM/yyyy`, tách chuỗi), `formatInstant`, `formatInstantWithTime` (`dd/MM/yyyy HH:mm`, 24 giờ), cả hai theo giờ `Asia/Ho_Chi_Minh`. Bỏ `publicDate` (publicNames), `formatDate` (PlaylistsPage), `toLocaleString` (PublishButton), hàm `display` của `DatePicker`.
- **Bộ lọc:** `components/ui/FilterPills` (`role="group"`, `aria-pressed`, cuộn ngang trên điện thoại, pill chọn màu tím) dùng cho Works (thay `CategoryPills`) và Fanfics (trạng thái); khoảng cách hàng bộ lọc cùng `--space-4`.
- **Menu public:** mục `VIETSUB_LIST` hiện nhãn `Vietsub` ở trang public, admin giữ `Vietsub list`.
- **Profile:** `Reveal` cho banner, cột chân dung và từng khối ở chế độ xem (chế độ sửa không đổi, không đụng `rowMotion`/`expandMotion`).
- **Đợt 2 (cùng nhánh):** `<html lang="vi">` cho public; `SkipLink` (link bỏ qua tới `<main>`, gán `id=main` khi bấm); `FilmStrip` có nút Tạm dừng/Tiếp tục (người dùng tạm dừng thì giữ tới khi bấm lại); `html { scroll-padding-top }` theo `--topbar-h` (bỏ scroll-margin lẻ); thang `--z-*` thay mọi z-index số trần; `100dvh` cho dialog; token scrim (`--scrim`, `--scrim-strong`, `--on-scrim`…) thay màu thô; thời lượng vòng lặp trang trí qua `--dur-pulse/scrub/spin/flash` (reduced motion về 0 + `animation: none`); **trang public tiếng Việt** (`lib/i18n.ts` `useT`, menu giữ tiếng Anh, admin giữ tiếng Anh); player `--filled` trong vùng an toàn iPhone (`viewport-fit=cover`, `env(safe-area-inset-*)`); breakpoint mobile-first cho Select, Combobox, ItemListEditor, BlockView facts, VideoPlayer, CueTable, ResultPanel, WatchPage, UrlForm, NavBar, FanficsTab, AddFanficDialog, PhotoPostDialog. Đợt 3: chuyển nốt mọi `@media (max-width)` sang mobile-first (PlaylistHeader, FanficCard, PublishButton, ChapterPage, ProfilesPage, WorkEditPage, CueEditorTable, FeaturedNovels, FanCarousel, NovelRow, PublicNovelPage, ReaderBar, ReaderPage, vietsub-lists, base.css); ngoại lệ duy nhất: `.history__open img` (thuộc tính width/height của img). Nút Tạm dừng/Tiếp tục của FilmStrip nằm cùng hàng với các chấm; avatar "Tất cả" của PeopleFilter dùng icon `Users`.
- **Đợt 3 (cùng nhánh):** nút Fetch của dialog Add fanfic cao 40 px như ô link; `DatePicker` là ô nhập `dd/MM/yyyy` (cũng nhận `d/M/yyyy`, phân cách `-` hoặc `.`; `parseDay` ở `lib/dates.ts`; nhập sai báo lỗi dưới ô và không gọi `onChange`; Esc khôi phục giá trị hợp lệ gần nhất) kèm nút lịch "Open calendar"; ô Subcategory của Work gợi ý theo loại (`SUBCATEGORY_SUGGESTIONS` ở `components/works/categories.ts` cộng giá trị các work khác đang dùng) và `Combobox` có thêm `openOnFocus`; ô mô tả ảnh trong Banner editor không còn tràn khỏi thẻ.

## 9. Rủi ro đang theo dõi

- yt-dlp thay đổi theo YouTube: pin version trong Dockerfile, và bản mới có thể cần JS runtime (deno). Kiểm tra lúc làm T11.
- Video giới hạn tuổi / private / members-only: Phase 1 chỉ báo lỗi, không xử lý cookies.
- Auto-caption không có dấu câu: normalizer chỉ gộp theo độ dài và khoảng nghỉ.
- Gemini thỉnh thoảng trả câu trả lời thiếu/gộp/đánh lại id (nhất là model dự phòng `-lite`, và phụ đề có nhiều chú thích lặp hoặc câu cắt qua nhiều block): app báo "missing or mismatched lines", người dùng bấm Translate again. Xem dòng `returned an invalid answer` trong `app.log` để biết kiểu hỏng trước khi quyết định có tự khắc phục hay không.

## 10. Backlog (để phase sau)

- Playlist (lỗi nhỏ từ review 2026-11-04): `addVideo` tính vị trí `count+1` không khoá (hai tab thêm cùng lúc → trùng vị trí; cùng video hai lần → 500); N+1 query ở `PlaylistService.list/detail`; Save to playlist bỏ qua im lặng cú bấm ô khác khi đang lưu, race khi mở lại nhanh, tạo xong mà thêm lỗi thì playlist mới bị ẩn; trang sửa báo "It has been reloaded" cả khi tải lại lỗi, `:playlistId` không phải số hiện HTTP 400; nút kéo và nút xoá ô search chưa có `<Tip>`; video bị chặn nhúng làm Autoplay dừng.

| Mục | Nguồn | Ghi chú |
|---|---|---|
| Phân quyền sửa profile (hiện ai mở được app cũng sửa được) | Profile | đi cùng dự án con 2 (tài khoản) |
| Kéo thả sắp xếp khối, ảnh thumbnail, upload file nhạc | Profile | ngoài phạm vi spec Profile |
| `UrlParser` hỗ trợ `music.youtube.com/watch?v=ID` | T02 | thêm host vào whitelist + test |
| `UrlParser` hỗ trợ `youtube.com/live/ID` (livestream) | T02 | thêm nhánh path `live` giống `shorts`/`embed` + test |
| Chặn import trùng khi 2 request `fetch` cùng videoId chạy đồng thời | T08 | lock theo videoId hoặc bắt lỗi PK rồi trả về bản đã lưu |
| Review Profile (Minor): kết quả thêm/di chuyển/xoá về muộn sau khi đổi tab bị áp vào profile mới; toolbar không khoá khi đang di chuyển (bấm nhanh 2 lần có thể hiện sai thứ tự); dọn ảnh lúc khởi động nằm trong `@Transactional` nên lỗi DB có thể chặn khởi động; `BlockView` tin mọi `embedUrl` không phải Spotify; YouTube `?t=` bị bỏ, chưa nhận `live`/`music.youtube`/Spotify episode/`spotify:`; cắt `original_name` có thể tách đôi emoji; `max-request-size` = `max-file-size` nên file sát 10 MB bị 413; nút "Xong" đóng form đang sửa mà không hỏi | Profile | final review nhánh `profiles` |
| Review Phase 2 (Minor): số quá lớn trong `.srt` → 500; block bị bỏ qua không báo; file ≫5 MB có thể thành "lỗi mạng" (kiểm tra kích thước ở form); UTF-16 không BOM; player không hồi phục sau lỗi khi đổi video; lỗi YouTube 100 + timeout tải API; thêm Vietsub đồng thời → 500; sắp xếp danh sách dưới 1 giây | P2 | xem nhật ký Phase 2 |
| Hồ sơ dịch lưu trong Oracle + sửa trên web | P4 | phase cải tiến (hiện là file `./data/prompts/*.md`) |
| `SUBTITLESTUDIO_PUBLISH_URL` (tuỳ chọn) | Public site | link hiện lấy từ tên project (`https://<project>.pages.dev`); khi Cloudflare thêm hậu tố (tên đã có người dùng) thì link trong app sai → cho phép đặt link thật |
| **Kiểm tra fullscreen trên iPad thật** | UI review 2026-11-10 | Safari/iPad cũ chỉ có Fullscreen API tiền tố webkit: quy tắc W1 `.watch__main > .player:not(:fullscreen)` có thể vẫn giới hạn bề rộng player khi toàn màn hình (`:fullscreen` không khớp `:-webkit-full-screen`); cần thử trên iPad thật |
| Nhãn Manual/AI trên trang public | Public site | dữ liệu đã có `viSource`; thêm badge nhỏ ở Vietsub list nếu muốn khách thấy |
| Review Public site (Minor): Publish có thể kẹt PUBLISHING nếu executor từ chối/`Error`; tắt app phải chờ Publish đang chạy; ảnh Profile bị bỏ vẫn hiện khung zoom rỗng; code quản trị nằm trong bundle public (không chạy); `_redirects` có thể thừa với SPA mode của Pages; chèn meta noindex chỉ khớp `<head>`; đường dẫn file trong bundle lấy từ URI (percent-encoding); `mvn spring-boot:run` không có `public-site/` → lỗi chung chung; wrangler nhận toàn bộ env của app | Public site | final review nhánh `public-site` |
| Bulk import cả thư mục ảnh + Gemini đề xuất chia chương | Novels | người dùng chọn làm sau (upload theo chương trước) |
| Sửa sổ tay truyện bằng tay | Novels | hiện chỉ đọc; tự cập nhật sau mỗi chương Published |
| Tạo lại các phiên bản sổ tay sau chương N khi dịch lại/sửa chương N | Novels | hiện chỉ cảnh báo "built from an older text" ở tab Notebook |
| Hàng đợi cập nhật sổ tay mất khi app khởi động lại | Novels | trạng thái thành FAILED "interrupted", bấm Retry chạy lại chương gần nhất |
| Review Novels (Minor): tab Notebook không tự làm mới khi đang UPDATING (phải tải lại trang); xoá chương khi sổ tay của nó đang/chờ cập nhật vẫn tạo bản "after N" hoặc báo FAILED; khi sổ tay vượt 12.000 ký tự phần cắt cứng rơi vào Tóm tắt/Chương gần đây (nằm cuối); cập nhật chương N lỗi rồi chương N+1 thành công thì lỗi của N bị quên (không Retry được); chương đã Published lưu được với text rỗng | Novels | final review nhánh `feature/novels` |
| Tự khắc phục khi Gemini trả thiếu/sai block | P4 | gợi ý: hỏi lại chỉ các id thiếu/sai (giữ block đúng, request nhỏ, ít tốn quota); xem log chẩn đoán 2026-11-04 trước |
