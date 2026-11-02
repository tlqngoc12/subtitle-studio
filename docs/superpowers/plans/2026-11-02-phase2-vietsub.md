# Phase 2: Xem video với Vietsub, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dán URL YouTube + upload `.srt` tiếng Việt (giữ timing gốc), liệt kê video có Vietsub, và phát video YouTube kèm overlay Vietsub (có toàn màn hình).

**Architecture:** Backend lưu Vietsub thành bộ phụ đề độc lập (bảng `vi_cue`) theo timing của chính file, qua `SrtParser` (package `subtitle`) và `VietsubService` (package `video`); endpoint trong `VietsubController`; một controller forward route SPA. Frontend thêm `react-router` (3 route), trang Vietsub (form + danh sách), và màn hình xem gồm hook bọc YouTube IFrame API cùng overlay thuần, test được với player giả.

**Tech Stack:** Java 21, Spring Boot 3.5.16, Spring Data JPA + H2 2.3.232, JUnit 5/AssertJ/Mockito; React 19.3.1, Vite 8, TypeScript 7, Vitest 5, React Testing Library, `react-router` 8.5.1.

**Spec:** [docs/superpowers/specs/2026-11-02-phase2-vietsub-design.md](../specs/2026-11-02-phase2-vietsub-design.md)

## Global Constraints

- Làm theo TDD: test viết trước, chạy thấy fail đúng lý do, rồi mới viết code (CLAUDE.md).
- Code, comment, message exception/log viết **tiếng Anh**; chuỗi hiển thị trên frontend viết **tiếng Việt** (CLAUDE.md).
- `String.format`, `toLowerCase`/`toUpperCase` dùng `Locale.ROOT`.
- Version npm cố định, không dùng `^`.
- Độ dài tối đa một câu Vietsub: **1000 ký tự**. Giới hạn upload: **5 MB**.
- Cột mới `video.vi_cue_count` phải là `INT DEFAULT 0 NOT NULL` (DB thật của Phase 1 đã có dòng).
- Thêm Vietsub **thay toàn bộ** bản cũ; file `.srt` được parse **trước** mọi lời gọi YouTube.
- Frontend render text phụ đề dạng văn bản thuần, không dùng `dangerouslySetInnerHTML`.
- Trước khi báo xong mỗi task: chạy `mvn test` (đủ backend + frontend). Commit message dạng `P2-T0x: ...` kèm dòng `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- **Xoá video ở trang Phase 1 khi video đó có Vietsub** → xoá được, không lỗi khoá ngoại, Vietsub cũng mất. Test: Task 2 `deleteVideoAlsoDeletesVietsub`.
- **File `.srt` hỏng kèm URL video chưa có trong app** → báo `INVALID_SRT` ngay, không gọi YouTube, không tạo video. Test: Task 2 `invalidSrtFailsBeforeAnyNetworkCall`.
- **File lưu bằng UTF-16 (Notepad "Unicode")** → `INVALID_SRT` với hướng dẫn lưu UTF-8. Test: Task 1 `rejectsUtf16File`.
- **Tiếng Việt dạng NFD** (dấu tách rời) → lưu dạng NFC. Test: Task 2 `storesTextAsNfc`.
- **Text có thẻ HTML** (`<i>`, `<script>`) → hiện nguyên văn, không tạo phần tử HTML. Test: Task 5 `rendersMarkupAsPlainText`.

---

## File Structure

**Backend (tạo mới)**
- `subtitle/SrtEntry.java`, `subtitle/SrtParseResult.java`, `subtitle/SrtParser.java`, `subtitle/InvalidSrtException.java`
- `video/ViCue.java` (record), `video/ViCueEntity.java`, `video/ViCueRepository.java`, `video/VietsubService.java`, `video/VietsubController.java`
- `web/SpaForwardController.java`
- Test: `test/MutableClock.java` (tách từ `SubtitleServiceTest`), `video/VietsubServiceTest.java`, `video/SchemaUpgradeTest.java`, `video/VietsubControllerTest.java`, `web/SpaForwardControllerTest.java`, `resources/schema/phase1.sql`

**Backend (sửa)**
- `video/Video.java`, `video/SubtitleService.java`, `video/VideoDto.java`, `web/ApiExceptionHandler.java`, `src/main/resources/application.yml`; test `video/SubtitleServiceTest.java`, `video/VideoControllerTest.java`

**Frontend (tạo mới)**
- `src/pages/HomePage.tsx` (nội dung trang Phase 1, tách từ `App.tsx`) + `HomePage.test.tsx` (chuyển từ `App.test.tsx`)
- `src/pages/VietsubPage.tsx` + test, `src/components/NavBar.tsx`, `src/components/VietsubForm.tsx`, `src/components/VietsubList.tsx`
- `src/pages/WatchPage.tsx` + test, `src/components/VideoPlayer.tsx`, `src/components/SubtitleOverlay.tsx` + test
- `src/player/youtube.ts`, `src/player/useYouTubePlayer.ts`, `src/lib/findActiveCue.ts` + test

**Frontend (sửa / xoá)**
- Sửa: `package.json`, `src/main.tsx`, `src/App.tsx`, `src/api/client.ts`, `src/lib/errors.ts` (+ test), `src/components/VideoList.tsx`, `src/styles.css`
- Xoá: `src/App.test.tsx` (chuyển thành `HomePage.test.tsx`)

---

### Task 1: `SrtParser` (P2-T01)

**Files:**
- Create: `src/main/java/com/subtitlestudio/subtitle/SrtEntry.java`, `SrtParseResult.java`, `SrtParser.java`, `InvalidSrtException.java`
- Test: `src/test/java/com/subtitlestudio/subtitle/SrtParserTest.java`

**Interfaces:**
- Produces:
  - `record SrtEntry(int index, long startMs, long endMs, String text)`: `text` gồm các dòng đã `strip`, nối bằng `\n`.
  - `record SrtParseResult(List<SrtEntry> entries, int skippedBlocks)`
  - `@Component class SrtParser { SrtParseResult parse(byte[] content) }`
  - `class InvalidSrtException extends RuntimeException { InvalidSrtException(String message) }`

- [ ] **Step 1: Viết test fail**

```java
@Test void parsesBlocksWithCrlfAndBom()            // "﻿1\r\n00:00:01,000 --> 00:00:02,500\r\nXin chào\r\n\r\n2\r\n..." → entry 0 = (1, 1000, 2500, "Xin chào")
@Test void acceptsLfAndCrOnlyLineEndings()
@Test void acceptsDotAsMillisecondSeparator()      // "00:00:01.000 --> 00:00:02.000" → startMs 1000
@Test void acceptsHoursAboveTwoDigits()            // "100:00:00,000 --> ..." → startMs 360_000_000
@Test void joinsMultiLineTextWithNewline()         // "  dòng một \n dòng hai" → "dòng một\ndòng hai"
@Test void dropsEmptyTextLines()
@Test void usesPositionWhenIndexLineMissing()      // block bắt đầu bằng dòng timing → index = thứ tự (1-based)
@Test void toleratesExtraBlankLinesAndMissingTrailingNewline()
@Test void skipsBlocksWithoutValidTiming()         // 1 block hỏng + 2 block tốt → 2 entry, skippedBlocks 1
@Test void keepsMarkupAsIs()                       // "<i>nghiêng</i>" giữ nguyên
@Test void rejectsFileWithNoReadableBlock()        // InvalidSrtException
@Test void rejectsEmptyContent()                   // InvalidSrtException
@Test void rejectsUtf16File()                      // FF FE + UTF_16LE → InvalidSrtException, message chứa "UTF-8"
@Test void rejectsInvalidUtf8Bytes()               // ... + 0xC3 0x28 → InvalidSrtException
```

- [ ] **Step 2: Chạy test, xác nhận fail**

Stub `parse` trả `new SrtParseResult(List.of(), 0)`.
Run: `mvn test -Dskip.npm -Dtest=SrtParserTest`
Expected: FAIL ở assertion.

- [ ] **Step 3: Cài đặt `parse(byte[] content)`**

Giải mã bằng decoder UTF-8 `CodingErrorAction.REPORT`; bytes bắt đầu `FF FE`/`FE FF` → `InvalidSrtException("Subtitle file must be UTF-8 encoded (found UTF-16)")`; lỗi giải mã → `InvalidSrtException("Subtitle file must be UTF-8 encoded")`. Bỏ BOM, chuẩn hoá line ending, tách block bằng `\n{2,}`. Timing regex `^(\d+):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d+):(\d{2}):(\d{2})[,.](\d{3})`. Không có entry → `InvalidSrtException("No subtitle blocks found")`.

- [ ] **Step 4: Chạy test, xác nhận pass**

Run: `mvn test -Dskip.npm -Dtest=SrtParserTest`
Expected: PASS (14 test).

- [ ] **Step 5: Commit**

```bash
git add src/main/java/com/subtitlestudio/subtitle/Srt*.java src/main/java/com/subtitlestudio/subtitle/InvalidSrtException.java src/test/java/com/subtitlestudio/subtitle/SrtParserTest.java
git commit -m "P2-T01: SrtParser"
```

---

### Task 2: Lưu Vietsub + nâng cấp schema (P2-T02)

**Files:**
- Create: `video/ViCue.java`, `video/ViCueEntity.java`, `video/ViCueRepository.java`, `video/VietsubService.java`
- Modify: `video/Video.java`, `video/SubtitleService.java`
- Create (test): `src/test/java/com/subtitlestudio/test/MutableClock.java`, `video/VietsubServiceTest.java`, `video/SchemaUpgradeTest.java`, `src/test/resources/schema/phase1.sql`
- Modify (test): `video/SubtitleServiceTest.java` (dùng `MutableClock` dùng chung; thêm test xoá)

**Interfaces:**
- Consumes: `SrtParser.parse`, `SrtEntry`, `InvalidSrtException` (Task 1); `UrlParser.parse`, `SubtitleService.fetch(String url): FetchResult` (Phase 1).
- Produces:
  - `record ViCue(long startMs, long endMs, String text)`
  - `@Entity @Table(name = "vi_cue", unique (video_id, idx), index video_id) class ViCueEntity { ViCueEntity(Video video, int idx, long startMs, long endMs, String text); ViCue toViCue() }`, cột `text VARCHAR(1000) NOT NULL`.
  - `interface ViCueRepository extends JpaRepository<ViCueEntity, Long> { List<ViCueEntity> findByVideo_IdOrderByIdxAsc(String videoId); @Modifying(flushAutomatically = true, clearAutomatically = true) @Query("delete from ViCueEntity c where c.video.id = :videoId") int deleteByVideoId(@Param("videoId") String videoId); }`
  - `Video`: `int getViCueCount()`, `Instant getViUpdatedAt()`, `void updateVietsub(int count, Instant at)` (`at` có thể `null`).
  - `@Service class VietsubService { static final int MAX_TEXT_LENGTH = 1000; Video add(String url, byte[] srt); void clear(String id); List<ViCue> getCues(String id) }`
  - `test.MutableClock(Instant start)` với `advance(Duration)`, `reset()`.

- [ ] **Step 1: Tạo fixture schema Phase 1**

`src/test/resources/schema/phase1.sql` (rút từ DB thật của `v0.1.0` bằng `org.h2.tools.Script -options NODATA`):

```sql
CREATE TABLE VIDEO(ID VARCHAR(11) NOT NULL PRIMARY KEY, CHANNEL VARCHAR(255), CUE_COUNT INTEGER NOT NULL,
  DURATION_SEC INTEGER, FETCHED_AT TIMESTAMP(6) WITH TIME ZONE NOT NULL, SUB_LANG VARCHAR(16) NOT NULL,
  SUB_SOURCE ENUM('AUTO','MANUAL') NOT NULL, TITLE VARCHAR(500) NOT NULL);
CREATE TABLE CUE(ID BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL PRIMARY KEY, END_MS BIGINT NOT NULL,
  IDX INTEGER NOT NULL, START_MS BIGINT NOT NULL, TEXT_EN VARCHAR(1000) NOT NULL, TEXT_VI VARCHAR(1000),
  VIDEO_ID VARCHAR(11) NOT NULL, CONSTRAINT UK_CUE_VIDEO_IDX UNIQUE (VIDEO_ID, IDX),
  CONSTRAINT FK_CUE_VIDEO FOREIGN KEY (VIDEO_ID) REFERENCES VIDEO(ID));
CREATE INDEX IX_CUE_VIDEO ON CUE(VIDEO_ID);
INSERT INTO VIDEO VALUES ('dQw4w9WgXcQ', 'Channel', 1, 60, TIMESTAMP WITH TIME ZONE '2026-11-01 10:00:00+00', 'en', 'MANUAL', 'Old video');
INSERT INTO CUE(END_MS, IDX, START_MS, TEXT_EN, VIDEO_ID) VALUES (2000, 0, 1000, 'hello', 'dQw4w9WgXcQ');
```

- [ ] **Step 2: Viết test fail**

`SchemaUpgradeTest` (`@SpringBootTest`, không dùng profile `test`; static initializer tạo thư mục tạm, chạy `phase1.sql` vào `jdbc:h2:file:<tmp>/db` bằng `RunScript.execute`; `@DynamicPropertySource` đặt `spring.datasource.url` cùng URL và `subtitle-studio.data-dir=<tmp>`):

```java
@Test void startsOnPhase1DatabaseWithNoVietsub() // videos.findById("dQw4w9WgXcQ").get().getViCueCount() == 0; getViUpdatedAt() == null
```

`VietsubServiceTest` (`@DataJpaTest` + `@ActiveProfiles("test")` + `@Import({VietsubService.class, SrtParser.class, UrlParser.class, Config})`, `Config` cung cấp `MutableClock`; `@MockitoBean SubtitleService`; video `ID` được lưu sẵn trong `@BeforeEach` trừ khi test ghi khác; helper `srt(String... blocks)` dựng bytes UTF-8):

```java
@Test void addStoresCuesForExistingVideo()          // 2 block → getCues == [ViCue(1000,2000,"Xin chào"), ViCue(3000,4000,"Tạm biệt")]; viCueCount 2; viUpdatedAt == clock; verify(subtitleService, never()).fetch(any())
@Test void addFetchesVideoWhenMissing()             // video chưa có; subtitleService.fetch(url) được stub để lưu video rồi trả FetchResult → Vietsub được lưu; verify fetch(url) gọi 1 lần
@Test void addReplacesPreviousVietsub()             // lần 1: 2 câu; lần 2: 1 câu → getCues chỉ còn câu mới; viCueCount 1
@Test void invalidSrtFailsBeforeAnyNetworkCall()    // video chưa có, bytes "garbage" → InvalidSrtException; verify(subtitleService, never()).fetch(any()); videos.count()==0
@Test void invalidUrlFailsFast()                     // url "https://evil.com/x" → InvalidUrlException
@Test void sortsCuesByStartTime()                    // file có block 3000 trước block 1000 → getCues theo 1000, 3000
@Test void dropsCuesWithoutTextOrWithInvalidTiming() // block có end <= start bị bỏ
@Test void rejectsCueLongerThan1000Chars()           // "a".repeat(1001) → InvalidSrtException chứa "1000"; "a".repeat(1000) → lưu được
@Test void storesTextAsNfc()                          // Normalizer.normalize("Học", NFD) → lưu "Học" NFC
@Test void clearRemovesVietsub()                      // viCueCount 0, viUpdatedAt null, getCues rỗng
@Test void unknownVideoThrowsNotFound()               // clear/getCues với id không có → VideoNotFoundException
@Test void getCuesIsEmptyWhenNoVietsub()
```

Thêm vào `SubtitleServiceTest`:

```java
@Test void deleteVideoAlsoDeletesVietsub()   // fetch video, lưu 1 ViCueEntity qua ViCueRepository, delete(ID) → không lỗi; viCues.findByVideo_IdOrderByIdxAsc(ID) rỗng
```

- [ ] **Step 3: Chạy test, xác nhận fail**

Thêm stub các class/method mới để compile (`VietsubService` trả giá trị rỗng).
Run: `mvn test -Dskip.npm -Dtest='VietsubServiceTest,SchemaUpgradeTest,SubtitleServiceTest'`
Expected: FAIL ở assertion; `SchemaUpgradeTest` fail vì `Video` chưa có `vi_cue_count`.

- [ ] **Step 4: Cài đặt**

- `Video`: `@Column(name = "vi_cue_count", nullable = false, columnDefinition = "INT DEFAULT 0 NOT NULL") private int viCueCount;` và `@Column(name = "vi_updated_at") private Instant viUpdatedAt;`.
- `VietsubService.add` theo spec mục 5 (bước 1–7): parse + chuẩn hoá **ngoài transaction**; nếu `!videos.existsById(id)` gọi `subtitleService.fetch(url)`; ghi trong `TransactionTemplate`: `viCues.deleteByVideoId(id)` → load lại `Video` → `saveAll` → `updateVietsub(count, clock.instant())`.
- `SubtitleService.delete`: gọi `viCues.deleteByVideoId(id)` trước `cues.deleteByVideoId(id)`.

- [ ] **Step 5: Chạy test, xác nhận pass**

Run: `mvn test -Dskip.npm`
Expected: PASS toàn bộ backend.

- [ ] **Step 6: Commit**

```bash
git add src/main src/test
git commit -m "P2-T02: store Vietsub (vi_cue), schema upgrade from Phase 1, delete cascades"
```

---

### Task 3: REST endpoint + lỗi + forward SPA (P2-T03)

**Files:**
- Create: `video/VietsubController.java`, `web/SpaForwardController.java`
- Modify: `video/VideoDto.java`, `web/ApiExceptionHandler.java`, `src/main/resources/application.yml`
- Test: `video/VietsubControllerTest.java`, `web/SpaForwardControllerTest.java`; sửa `video/VideoControllerTest.java`

**Interfaces:**
- Consumes: `VietsubService` (Task 2), `InvalidSrtException` (Task 1).
- Produces (HTTP, frontend dùng ở Task 4–5):
  - `VideoDto` thêm `int viCueCount`, `Instant viUpdatedAt` (JSON ISO hoặc `null`).
  - `POST /api/vietsub` multipart: `url` (text part), `file` (file part) → 200 `VideoDto`.
  - `GET /api/videos/{id}/vietsub` → `[{ "startMs", "endMs", "text" }]`.
  - `DELETE /api/videos/{id}/vietsub` → 204.
  - Lỗi: `INVALID_SRT` 400 (detail = message của exception), `FILE_TOO_LARGE` 413.

- [ ] **Step 1: Viết test fail**

`VietsubControllerTest` (`@WebMvcTest(VietsubController.class)`, `@Import(ApiExceptionHandler.class)`, `@MockitoBean VietsubService`):

```java
@Test void addReturnsVideo()               // multipart("/api/vietsub").file(MockMultipartFile("file","vi.srt",...)).param("url", URL) → 200; $.id==ID; $.viCueCount==2; verify(service).add(URL, bytes)
@Test void invalidSrtReturns400()          // service ném InvalidSrtException("Block 3 is longer than 1000 characters") → problem 400, code INVALID_SRT, detail chứa "Block 3"
@Test void tooLargeReturns413()            // service ném new MaxUploadSizeExceededException(5 * 1024 * 1024) → 413 FILE_TOO_LARGE
@Test void invalidUrlReturns400()          // InvalidUrlException → INVALID_URL
@Test void listsCues()                     // getCues → [{startMs:1000,endMs:2000,text:"Xin chào"}]
@Test void unknownVideoReturns404()        // VIDEO_NOT_FOUND
@Test void deleteReturns204()              // verify(service).clear(ID)
```

Sửa `VideoControllerTest`: helper `video()` gọi `updateVietsub(3, Instant.parse("2026-11-02T11:00:00Z"))`; thêm `jsonPath("$.viCueCount").value(3)` và `jsonPath("$.viUpdatedAt").value("2026-11-02T11:00:00Z")` vào test tạo mới.

`SpaForwardControllerTest` (`@WebMvcTest(SpaForwardController.class)`, `@Import(ApiExceptionHandler.class)`):

```java
@Test void forwardsVietsubRoutesToIndex()   // "/vietsub", "/vietsub/", "/vietsub/dQw4w9WgXcQ", "/vietsub/dQw4w9WgXcQ/" → forwardedUrl("/index.html")
@Test void unknownApiPathStillReturns404()  // GET /api/khong-co → 404
```

- [ ] **Step 2: Chạy test, xác nhận fail**

Run: `mvn test -Dskip.npm -Dtest='VietsubControllerTest,SpaForwardControllerTest,VideoControllerTest*'`
Expected: FAIL.

- [ ] **Step 3: Cài đặt**

- `VietsubController`: `@PostMapping(path = "/api/vietsub", consumes = MULTIPART_FORM_DATA_VALUE) VideoDto add(@RequestParam("url") String url, @RequestPart("file") MultipartFile file)`; `@GetMapping("/api/videos/{id}/vietsub") List<ViCue>`; `@DeleteMapping("/api/videos/{id}/vietsub") ResponseEntity<Void>`.
- `ApiExceptionHandler`: `@ExceptionHandler(InvalidSrtException.class)` → 400 `INVALID_SRT`; override `handleMaxUploadSizeExceededException(...)` của class cha → `ProblemDetail` 413, `code = "FILE_TOO_LARGE"`, detail `"Upload exceeds 5 MB"`.
- `SpaForwardController` (`@Controller`): `@GetMapping({"/vietsub", "/vietsub/", "/vietsub/{id}", "/vietsub/{id}/"}) String spa() { return "forward:/index.html"; }`.
- `application.yml`: `spring.servlet.multipart.max-file-size: 5MB`, `max-request-size: 5MB`.
- `VideoDto.from` thêm hai field.

- [ ] **Step 4: Chạy test, xác nhận pass**

Run: `mvn test -Dskip.npm`
Expected: PASS toàn bộ backend.

- [ ] **Step 5: Commit**

```bash
git add src/main src/test
git commit -m "P2-T03: Vietsub endpoints, INVALID_SRT/FILE_TOO_LARGE, SPA forward"
```

---

### Task 4: Router + trang Vietsub (P2-T04)

**Files:**
- Modify: `frontend/package.json` (`"react-router": "8.5.1"`), `src/main.tsx`, `src/App.tsx`, `src/api/client.ts`, `src/lib/errors.ts`, `src/lib/errors.test.ts`, `src/components/VideoList.tsx`, `src/styles.css`
- Create: `src/pages/HomePage.tsx`, `src/pages/HomePage.test.tsx`, `src/pages/VietsubPage.tsx`, `src/pages/VietsubPage.test.tsx`, `src/components/NavBar.tsx`, `src/components/VietsubForm.tsx`, `src/components/VietsubList.tsx`
- Delete: `src/App.test.tsx`

**Interfaces:**
- Consumes: HTTP API của Task 3.
- Produces (cho Task 5):
  - `client.ts`: `VideoDto.viCueCount: number`, `VideoDto.viUpdatedAt: string | null`; `interface ViCue { startMs: number; endMs: number; text: string }`; `getVideo(id): Promise<VideoDto>`; `addVietsub(url: string, file: File): Promise<VideoDto>` (POST `FormData` với `url`, `file`); `getVietsub(id): Promise<ViCue[]>`; `deleteVietsub(id): Promise<void>`.
  - `errors.ts`: `INVALID_SRT` → title "Không đọc được file .srt." + hint = detail của server; `FILE_TOO_LARGE` → "File quá lớn (tối đa 5 MB).".
  - `App.tsx`: `<NavBar />` + `<Routes>` với `/` → `HomePage`, `/vietsub` → `VietsubPage` (route `/vietsub/:id` thêm ở Task 5).

- [ ] **Step 1: Cài dependency**

Run: `cd frontend && npm install react-router@8.5.1 --save-exact`
Expected: `package.json` có `"react-router": "8.5.1"`.

- [ ] **Step 2: Viết test fail**

`errors.test.ts`: thêm `INVALID_SRT` (title chứa "Không đọc được file .srt", hint == detail) và `FILE_TOO_LARGE` (title chứa "tối đa 5 MB").

`HomePage.test.tsx`: chuyển nguyên các test của `App.test.tsx`, render `<MemoryRouter><HomePage /></MemoryRouter>`; thêm:

```tsx
it('links to the Vietsub player for videos that have Vietsub') // viCueCount 3 → link "Xem Vietsub của Học Spring Boot" href "/vietsub/dQw4w9WgXcQ"; video viCueCount 0 không có link
```

`VietsubPage.test.tsx` (render trong `<MemoryRouter initialEntries={['/vietsub']}>` với route `/vietsub/:id` → `<p>watch {id}</p>` để kiểm tra điều hướng; fetch giả như Phase 1):

```tsx
it('shows the nav with Vietsub as current page')          // link "Vietsub" có aria-current="page"; link "Lấy Engsub" href "/"
it('lists only videos with Vietsub, newest update first')  // 3 video: viCueCount 0 / 5 (viUpdatedAt 10:00) / 7 (11:00) → 2 listitem, cái 7 câu trước; hiện "7 câu"
it('invites the user when no video has Vietsub')           // "Chưa có video nào có Vietsub."
it('adds Vietsub and opens the player')                    // gõ URL, upload file "vi.srt" vào ô "File Vietsub (.srt)", bấm "Thêm Vietsub" → POST /api/vietsub với FormData có url + file; sau đó thấy "watch dQw4w9WgXcQ"
it('disables the button while adding')                     // POST bị treo → nút "Đang thêm…" disabled
it('does not submit without both url and file')            // chỉ có URL → không có POST
it('shows the INVALID_SRT error with server detail')       // 400 → alert chứa "Không đọc được file .srt" và detail
it('replaces Vietsub from the list')                       // upload vào input "Thay Vietsub của <title>" → POST /api/vietsub với url == id; danh sách cập nhật số câu
it('deletes Vietsub after confirmation')                   // confirm true → DELETE /api/videos/ID/vietsub; dòng biến mất
it('keeps Vietsub when deletion is not confirmed')
```

- [ ] **Step 3: Chạy test, xác nhận fail**

Run: `cd frontend && npm test`
Expected: FAIL (page, nav, client function chưa có).

- [ ] **Step 4: Cài đặt**

- `main.tsx` bọc `<BrowserRouter>`; `App.tsx` = `NavBar` + `Routes`; nội dung trang Phase 1 cũ chuyển nguyên sang `HomePage.tsx`.
- `NavBar`: dùng `NavLink` (tự đặt `aria-current="page"`).
- `VideoList` (Phase 1): thêm link "Xem Vietsub" (`aria-label="Xem Vietsub của <title>"`) khi `viCueCount > 0`.
- `VietsubForm`: `<label>` "Link YouTube" + input text, `<label>` "File Vietsub (.srt)" + input file `accept=".srt"`, nút submit; gọi `onSubmit(url, file)`.
- `VietsubList`: mỗi dòng có link "Xem" (`/vietsub/:id`), `<label>` "Thay Vietsub" bọc input file ẩn (`aria-label="Thay Vietsub của <title>"`), nút "Xoá Vietsub" (`aria-label="Xoá Vietsub của <title>"`).
- `VietsubPage`: tải `listVideos()`, lọc `viCueCount > 0`, sắp `viUpdatedAt` giảm dần; thêm thành công → `navigate('/vietsub/' + id)`; thay thành công → cập nhật dòng; lỗi → khung `role="alert"` như Phase 1.
- `styles.css`: thanh điều hướng, form Vietsub (dùng lại token của Phase 1).

- [ ] **Step 5: Chạy test, xác nhận pass**

Run: `cd frontend && npm test && npm run build`
Expected: PASS, build không lỗi type.

- [ ] **Step 6: Commit**

```bash
git add frontend
git commit -m "P2-T04: router, nav, Vietsub page (add/replace/delete), Vietsub link on Phase 1 list"
```

---

### Task 5: Màn hình xem (P2-T05)

**Files:**
- Create: `src/player/youtube.ts`, `src/player/useYouTubePlayer.ts`, `src/lib/findActiveCue.ts`, `src/lib/findActiveCue.test.ts`, `src/components/SubtitleOverlay.tsx`, `src/components/SubtitleOverlay.test.tsx`, `src/components/VideoPlayer.tsx`, `src/pages/WatchPage.tsx`, `src/pages/WatchPage.test.tsx`
- Modify: `src/App.tsx` (route `/vietsub/:id`), `src/styles.css`

**Interfaces:**
- Consumes: `getVideo`, `getVietsub`, `ViCue` (Task 4).
- Produces:
  - `youtube.ts`: `loadYouTubeApi(): Promise<YTNamespace>`: promise dùng chung; chèn `<script src="https://www.youtube.com/iframe_api">` một lần, resolve trong `window.onYouTubeIframeAPIReady`, reject khi script lỗi. Khai báo kiểu tối thiểu `YTNamespace`/`YTPlayer` ngay trong file (không thêm `@types/youtube`).
  - `useYouTubePlayer(container: RefObject<HTMLDivElement | null>, videoId: string): { currentMs: number; state: 'loading' | 'ready' | 'playing' | 'paused' | 'ended'; error: 'EMBED_BLOCKED' | 'LOAD_FAILED' | null }`: `new YT.Player(el, { videoId, host: 'https://www.youtube-nocookie.com', playerVars: { fs: 0, playsinline: 1, rel: 0, iv_load_policy: 3 }, events })`; lỗi `101`/`150` → `EMBED_BLOCKED`; khi `playing` cập nhật `currentMs` theo `requestAnimationFrame`, huỷ khi đổi state/unmount; `destroy()` khi unmount.
  - `findActiveCue(cues: ViCue[], ms: number): ViCue | null`: `cues` đã sắp theo `startMs`; câu chứa `ms` (`startMs <= ms < endMs`), ưu tiên câu bắt đầu muộn nhất.
  - `SubtitleOverlay` props `{ cue: ViCue | null }`.
  - `VideoPlayer` props `{ containerRef: RefObject<HTMLDivElement | null>; cue: ViCue | null; error: 'EMBED_BLOCKED' | 'LOAD_FAILED' | null }`.

- [ ] **Step 1: Viết test fail**

`findActiveCue.test.ts` (cues `[0–1000) "a"`, `[1000–2000) "b"`, `[3000–4000) "c"`):

```ts
it('returns the cue containing the time')                   // 1500 → "b"
it('treats start as inclusive and end as exclusive')        // 1000 → "b"; 999 → "a"
it('returns null in a gap, before the first and after the last cue') // 2500, -1, 4000 → null
it('prefers the latest-starting cue when cues overlap')     // thêm [3500–5000) "d"; 3600 → "d"
it('returns null for an empty list')
```

`SubtitleOverlay.test.tsx`:

```tsx
it('shows the cue text keeping line breaks')   // "dòng 1\ndòng 2" → cả hai dòng hiện
it('shows nothing without a cue')              // container không có text
it('rendersMarkupAsPlainText')                 // "<i>xin</i><script>x</script>" → nguyên chuỗi hiện ra; container.querySelector('i, script') === null
```

`WatchPage.test.tsx` (`vi.mock('../player/useYouTubePlayer', ...)` trả object điều khiển bởi biến dùng chung; render `<MemoryRouter initialEntries={['/vietsub/dQw4w9WgXcQ']}>` với route `/vietsub/:id`; fetch giả trả video + vietsub):

```tsx
it('shows the video title and a link back to the Vietsub list') // heading "Học Spring Boot"; link "Danh sách Vietsub" href "/vietsub"
it('shows the subtitle for the current time')                     // currentMs 1500 → overlay "Tạm biệt"; currentMs 2500 → không có text phụ đề
it('enters fullscreen on the player frame')                       // HTMLElement.prototype.requestFullscreen = vi.fn(); click "Toàn màn hình" → gọi trên khung player
it('explains when embedding is blocked')                          // error EMBED_BLOCKED → "Video này không cho phép phát nhúng trong app."
it('explains when the player cannot load')                        // LOAD_FAILED → "Không tải được trình phát YouTube"
it('says when the video has no Vietsub')                          // viCueCount 0 → "Video này chưa có Vietsub." + link "/vietsub"
it('shows not found for an unknown video')                        // GET 404 → alert VIDEO_NOT_FOUND
```

- [ ] **Step 2: Chạy test, xác nhận fail**

Run: `cd frontend && npm test`
Expected: FAIL.

- [ ] **Step 3: Cài đặt**

- `findActiveCue`: binary search vị trí cuối cùng có `startMs <= ms`, kiểm tra `ms < endMs`, lùi lại khi câu trước còn chứa `ms` (xử lý chồng nhau).
- `WatchPage`: đọc `id`; tải `getVideo` + `getVietsub`; `useYouTubePlayer(playerRef, id)`; `cue = findActiveCue(cues, currentMs)`.
- `VideoPlayer`: khung `div` (ref nội bộ để gọi `requestFullscreen()`), bên trong `div` gắn `containerRef` cho iframe, `SubtitleOverlay`, nút "Toàn màn hình"; `error` → thông báo thay cho player.
- `styles.css`: khung `aspect-ratio: 16 / 9; container-type: inline-size; position: relative`; overlay ở đáy, `pointer-events: none`, `white-space: pre-line`, chữ trắng, nền `rgb(0 0 0 / 0.6)`, `font-size: clamp(14px, 3.2cqw, 44px)`; `:fullscreen` cho khung chiếm toàn màn hình.

- [ ] **Step 4: Chạy test, xác nhận pass**

Run: `cd frontend && npm test && npm run build`
Expected: PASS, build không lỗi.

- [ ] **Step 5: Commit**

```bash
git add frontend
git commit -m "P2-T05: watch page with YouTube player, Vietsub overlay and fullscreen"
```

---

### Task 6: Kiểm chứng với video thật + tài liệu (P2-T06)

**Files:**
- Modify: `README.md`, `PROGRESS.md`, `PLAN.md` (mục 9), `CLAUDE.md` (Phase hiện tại)

**Interfaces:**
- Consumes: toàn bộ Task 1–5.

- [ ] **Step 1: Chạy toàn bộ test**

Run: `mvn test`
Expected: PASS backend và frontend.

- [ ] **Step 2: Chạy Definition of Done (spec mục 10) trên app thật**

`mvn package`, chạy jar (yt-dlp + deno trong PATH) trên **bản sao** của DB thật `./data` (để không làm hỏng dữ liệu nếu có lỗi), với video `9SGDpanrc8U`:
1. Dịch vài chục dòng đầu của `.srt` (giữ timing), thêm Vietsub qua trang `/vietsub` → chuyển sang màn hình xem.
2. Phát: Vietsub khớp lời nói; pause/tua vẫn đúng.
3. "Toàn màn hình": Vietsub vẫn hiện.
4. Thêm Vietsub bằng URL video chưa có trong app → tự lấy thông tin rồi lưu.
5. "Thay Vietsub" bằng file khác → màn hình xem dùng bản mới.
6. Xoá video ở trang Phase 1 → không lỗi, biến mất khỏi danh sách Vietsub.
7. App khởi động trên bản sao DB Phase 1 → không lỗi, danh sách đủ video cũ.

Bước 2, 3 cần người dùng xem bằng mắt; ghi kết quả.

- [ ] **Step 3: Cập nhật tài liệu**

README: mục "Xem video với Vietsub" (dịch `.srt` giữ timing → trang Vietsub → Xem), 3 endpoint mới, 2 code lỗi mới. PROGRESS: bảng P2-T01…T06, nhật ký, bug, kết quả DoD. PLAN mục 9: Phase 2 xong (rút gọn), link spec và plan; chế độ kiểm tra song ngữ chuyển sang Phase 3.

- [ ] **Step 4: Commit**

```bash
git add README.md PROGRESS.md PLAN.md CLAUDE.md
git commit -m "P2-T06: real-video verification and docs for Phase 2"
```

Gắn tag `v0.2.0`, merge vào `main` và push chỉ khi người dùng đồng ý.
