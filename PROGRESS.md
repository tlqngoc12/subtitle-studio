# Subtitle Studio: Tổng quan và tiến độ

> Cập nhật lần cuối: 2026-11-02
> Plan chi tiết: [PLAN.md](PLAN.md)

## 1. Project là gì

Web app chạy local: **dán link YouTube → lấy phụ đề tiếng Anh → làm sạch (khử lặp auto-caption) → xuất file `.srt`** để dịch tay sang tiếng Việt.

Phase 1 chỉ làm phần lấy Engsub và xuất `.srt`. Các phase sau gồm upload Vietsub, player overlay, sửa trên web và engine dịch (xem [PLAN.md](PLAN.md), mục 9).

## 2. Tech stack

| Thành phần | Lựa chọn |
|---|---|
| Ngôn ngữ / framework | Java 21, Spring Boot **3.5.16**, Maven |
| Persistence | Spring Data JPA + H2 file mode (`./data/subtitle-studio`) |
| Lấy phụ đề | `yt-dlp` qua `ProcessBuilder` |
| Frontend | 1 trang HTML + vanilla JS (`src/main/resources/static`) |
| Test | JUnit 5, AssertJ, Mockito, `@WebMvcTest`, `@DataJpaTest` |
| Chạy | Docker (JRE 21 + python3 + yt-dlp), volume `/data` |

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
        │   └── url/UrlParserTest.java
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

Package con sẽ được tạo khi task tương ứng cần đến:

| Package | Task | Nội dung |
|---|---|---|
| `com.subtitlestudio.video` | T08–T09 | Entity, Repository, `SubtitleService`, Controller |
| `com.subtitlestudio.web` | T09 | `@RestControllerAdvice` |

## 4. Cấu hình (`application.yml`)

```yaml
subtitle-studio:
  ytdlp:
    path: yt-dlp     # đường dẫn binary yt-dlp
    timeout: 60s     # quá thời gian thì kill process
  data-dir: ./data   # chứa DB H2 và data/subs/*.vtt
```

`SubtitleStudioProperties.subsDir()` trả về `{data-dir}/subs`.

## 5. Cách chạy

```bash
# chạy toàn bộ test (dùng H2 in-memory, không tạo ./data)
mvn test

# chạy app (tạo ./data/subtitle-studio.mv.db)
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
| T08 | Entity + Repository + `SubtitleService` | ⏭️ Tiếp theo | |
| T09 | Controller + `@RestControllerAdvice` | ⬜ Chưa làm | |
| T10 | Frontend `index.html` + `app.js` | ⬜ Chưa làm | |
| T11 | Dockerfile + docker-compose + README | ⬜ Chưa làm | |

**Tổng: 7/11 task. `mvn test`: 145/145 pass.**

**Definition of Done:** dán link 3 video thật (1 có manual sub, 1 chỉ có auto sub, 1 dài trên 1 giờ). File `.srt` phải mở đúng trong VLC, không có dòng lặp, timing khớp với lời nói.

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

## 8. Quyết định và lưu ý kỹ thuật

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
- **Chưa kiểm tra:** khởi động app thật bằng `mvn spring-boot:run` với H2 file mode (hiện mới chạy test).

## 9. Rủi ro đang theo dõi

- yt-dlp thay đổi theo YouTube: pin version trong Dockerfile, và bản mới có thể cần JS runtime (deno). Kiểm tra lúc làm T11.
- Video giới hạn tuổi / private / members-only: Phase 1 chỉ báo lỗi, không xử lý cookies.
- Auto-caption không có dấu câu: normalizer chỉ gộp theo độ dài và khoảng nghỉ.

## 10. Backlog (để phase sau)

| Mục | Nguồn | Ghi chú |
|---|---|---|
| `UrlParser` hỗ trợ `music.youtube.com/watch?v=ID` | T02 | thêm host vào whitelist + test |
| `UrlParser` hỗ trợ `youtube.com/live/ID` (livestream) | T02 | thêm nhánh path `live` giống `shorts`/`embed` + test |
