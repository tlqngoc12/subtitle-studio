# Phase 2: Vietsub thủ công, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upload `.srt` tiếng Việt đã dịch (kể cả dịch dở), khớp vào từng câu gốc theo timecode, xem video YouTube với overlay Vietsub ở hai chế độ Kiểm tra/Xem, và xuất `.vi.srt`.

**Architecture:** Backend thêm hai thành phần thuần trong package `subtitle` (`SrtParser`, `TranslationMatcher`), một `TranslationService` trong package `video`, endpoint mới trong `TranslationController`, và một controller forward route SPA. Frontend thêm `react-router` (trang chủ và trang video), một hook bọc YouTube IFrame API, và các component overlay/danh sách câu thuần, test được với player giả.

**Tech Stack:** Java 21, Spring Boot 3.5.16, Spring Data JPA + H2 2.3.232, JUnit 5/AssertJ/Mockito; React 19.3.1, Vite 8, TypeScript 7, Vitest 5, React Testing Library, `react-router` 8.5.1.

**Spec:** [docs/superpowers/specs/2026-11-02-phase2-vietsub-design.md](../specs/2026-11-02-phase2-vietsub-design.md)

## Global Constraints

- Làm theo TDD: test viết trước, chạy thấy fail đúng lý do, rồi mới viết code (CLAUDE.md).
- Code, comment, message exception/log viết **tiếng Anh**; chuỗi hiển thị trên frontend viết **tiếng Việt** (CLAUDE.md).
- `String.format`, `toLowerCase`/`toUpperCase` dùng `Locale.ROOT`.
- Version npm cố định, không dùng `^`.
- Ngưỡng khớp timecode: **±100 ms**. Độ dài tối đa `text_vi`: **1000 ký tự**. Giới hạn upload: **5 MB**.
- Cột mới `video.translated_count` phải là `INT DEFAULT 0 NOT NULL` (DB thật của Phase 1 đã có dòng).
- Upload **thay thế toàn bộ** bản dịch; khi không có câu nào đã dịch thì **không thay đổi gì**.
- Frontend render text phụ đề dạng văn bản thuần, không dùng `dangerouslySetInnerHTML`.
- Golden file là phụ đề thật: chỉ lưu trong `src/test/resources/golden/` (gitignore), không commit.
- Trước khi báo xong mỗi task: chạy `mvn test` (đủ backend + frontend). Commit message dạng `P2-T0x: ...` kèm dòng `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- **Upload lại chính file `.srt` tiếng Anh chưa dịch** → mọi dòng là `untranslated` → `TRANSLATION_NOT_MATCHED`, bản dịch cũ giữ nguyên. Test: Task 3 `uploadOfUntranslatedEnglishExportKeepsExistingTranslation`.
- **File lưu bằng UTF-16 (Notepad "Unicode") hoặc mã hoá khác UTF-8** → `INVALID_SRT` kèm hướng dẫn lưu UTF-8, không lưu chữ hỏng. Test: Task 1 `rejectsUtf16File`, `rejectsInvalidUtf8Bytes`.
- **Tiếng Việt dạng NFD** (dấu tách rời, do một số editor trên macOS) → lưu và hiển thị dạng NFC. Test: Task 2 `storesTranslationAsNfc`.
- **Upload lại file `.vi.srt` do chính app xuất ra** (đã đánh số lại, chỉ có câu đã dịch) → khớp đúng theo timecode, kết quả giống hệt. Test: Task 3 `exportedViSrtRoundTrips`.
- **Text có thẻ HTML** (`<i>`, `<script>`) → hiện nguyên văn, không tạo phần tử HTML. Test: Task 6 `rendersMarkupAsPlainText`.

---

## File Structure

**Backend (tạo mới)**
- `src/main/java/com/subtitlestudio/subtitle/SrtEntry.java`: record một block `.srt`.
- `src/main/java/com/subtitlestudio/subtitle/SrtParseResult.java`: record kết quả parse.
- `src/main/java/com/subtitlestudio/subtitle/SrtParser.java`: đọc `.srt`.
- `src/main/java/com/subtitlestudio/subtitle/InvalidSrtException.java`
- `src/main/java/com/subtitlestudio/subtitle/CueRef.java`: câu gốc dùng để khớp.
- `src/main/java/com/subtitlestudio/subtitle/UnmatchedReason.java`, `UnmatchedLine.java`, `MatchResult.java`
- `src/main/java/com/subtitlestudio/subtitle/TranslationMatcher.java`
- `src/main/java/com/subtitlestudio/video/TranslationService.java`, `TranslationReport.java`, `SrtExport.java`, `StoredCue.java`
- `src/main/java/com/subtitlestudio/video/TranslationNotMatchedException.java`, `NoTranslationException.java`, `TranslationExistsException.java`
- `src/main/java/com/subtitlestudio/video/TranslationController.java`
- `src/main/java/com/subtitlestudio/web/SpaForwardController.java`

**Backend (sửa)**
- `video/Video.java`, `video/CueEntity.java`, `video/CueRepository.java`, `video/SubtitleService.java`, `video/VideoDto.java`, `video/CueDto.java`, `video/VideoController.java`, `subtitle/SrtWriter.java`, `web/ApiExceptionHandler.java`, `src/main/resources/application.yml`

**Frontend (tạo mới)**
- `frontend/src/pages/HomePage.tsx` (+ `HomePage.test.tsx`): nội dung trang chủ hiện tại, tách khỏi `App.tsx`.
- `frontend/src/pages/VideoPage.tsx` (+ `VideoPage.test.tsx`)
- `frontend/src/components/TranslationToolbar.tsx`, `UploadReport.tsx`, `CueList.tsx`, `SubtitleOverlay.tsx`, `VideoPlayer.tsx`, `ModeToggle.tsx`
- `frontend/src/player/youtube.ts`, `frontend/src/player/useYouTubePlayer.ts`
- `frontend/src/lib/findActiveCue.ts` (+ test)

**Frontend (sửa / xoá)**
- Sửa: `App.tsx`, `main.tsx`, `api/client.ts`, `lib/errors.ts` (+ test), `components/VideoList.tsx`, `styles.css`, `package.json`
- Xoá: `components/ResultPanel.tsx`, `components/CueTable.tsx` (thay bằng trang video và `CueList`), `App.test.tsx` (chia thành test của từng trang)

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

Test (input viết bằng chuỗi Java, đổi sang byte UTF-8, trừ khi ghi khác):

```java
@Test void parsesBlocksWithCrlfAndBom()            // "﻿1\r\n00:00:01,000 --> 00:00:02,500\r\nXin chào\r\n\r\n2\r\n..." → 2 entry; entry 0 = (1, 1000, 2500, "Xin chào")
@Test void acceptsLfAndCrOnlyLineEndings()
@Test void acceptsDotAsMillisecondSeparator()      // "00:00:01.000 --> 00:00:02.000" → startMs 1000
@Test void acceptsHoursAboveTwoDigits()            // "100:00:00,000 --> 100:00:01,000" → startMs 360_000_000
@Test void joinsMultiLineTextWithNewline()         // "  dòng một \n dòng hai" → "dòng một\ndòng hai"
@Test void dropsEmptyTextLines()
@Test void usesPositionWhenIndexLineMissing()      // block bắt đầu bằng dòng timing → index = thứ tự xuất hiện (1-based)
@Test void toleratesExtraBlankLinesAndMissingTrailingNewline()
@Test void skipsBlocksWithoutValidTiming()         // 1 block hỏng + 2 block tốt → entries.size()==2, skippedBlocks==1
@Test void keepsMarkupAsIs()                       // "<i>nghiêng</i>" giữ nguyên
@Test void rejectsFileWithNoReadableBlock()        // "hello\nworld" → InvalidSrtException
@Test void rejectsEmptyContent()                   // new byte[0] → InvalidSrtException
@Test void rejectsUtf16File()                      // bytes FF FE + "1\r\n00:00:01,000 --> ..." mã hoá UTF_16LE → InvalidSrtException, message chứa "UTF-8"
@Test void rejectsInvalidUtf8Bytes()               // "1\n00:00:01,000 --> 00:00:02,000\n" + byte 0xC3 0x28 → InvalidSrtException
```

- [ ] **Step 2: Chạy test, xác nhận fail**

Tạo stub `parse` trả `new SrtParseResult(List.of(), 0)` và stub exception để test compile.
Run: `mvn test -Dskip.npm -Dtest=SrtParserTest`
Expected: FAIL ở assertion (không phải lỗi compile).

- [ ] **Step 3: Cài đặt `SrtParser.parse(byte[] content)`**

- Giải mã bằng `StandardCharsets.UTF_8.newDecoder()` với `CodingErrorAction.REPORT` cho cả malformed và unmappable; lỗi giải mã → `InvalidSrtException("Subtitle file must be UTF-8 encoded")`. Bytes bắt đầu bằng `FF FE` hoặc `FE FF` → cùng exception, trước khi giải mã.
- Bỏ BOM `﻿`, đổi `\r\n` và `\r` thành `\n`, tách block bằng `\n{2,}` (giống `VttParser`).
- Dòng timing khớp regex `^(\d+):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d+):(\d{2}):(\d{2})[,.](\d{3})`.
- Dòng đầu của block là số nguyên và dòng thứ hai là timing → `index` là số đó; dòng đầu là timing → `index` = thứ tự block (1-based); block không có dòng timing ở vị trí 0 hoặc 1 → `skippedBlocks++`.
- Không có entry nào → `InvalidSrtException("No subtitle blocks found")`.

- [ ] **Step 4: Chạy test, xác nhận pass**

Run: `mvn test -Dskip.npm -Dtest=SrtParserTest`
Expected: PASS (14 test).

- [ ] **Step 5: Commit**

```bash
git add src/main/java/com/subtitlestudio/subtitle/Srt*.java src/main/java/com/subtitlestudio/subtitle/InvalidSrtException.java src/test/java/com/subtitlestudio/subtitle/SrtParserTest.java
git commit -m "P2-T01: SrtParser"
```

---

### Task 2: `TranslationMatcher` (P2-T02)

**Files:**
- Create: `subtitle/CueRef.java`, `subtitle/UnmatchedReason.java`, `subtitle/UnmatchedLine.java`, `subtitle/MatchResult.java`, `subtitle/TranslationMatcher.java`
- Test: `src/test/java/com/subtitlestudio/subtitle/TranslationMatcherTest.java`

**Interfaces:**
- Consumes: `SrtEntry` (Task 1).
- Produces:
  - `record CueRef(int idx, long startMs, String textEn)`
  - `enum UnmatchedReason { NO_MATCHING_TIME, DUPLICATE_TIME, TOO_LONG }`
  - `record UnmatchedLine(int index, long startMs, String text, UnmatchedReason reason)`
  - `record MatchResult(Map<Integer, String> textViByIdx, int untranslated, List<UnmatchedLine> unmatched)`: `translated()` = `textViByIdx.size()`.
  - `@Component class TranslationMatcher { static final long TOLERANCE_MS = 100; static final int MAX_TEXT_LENGTH = 1000; MatchResult match(List<CueRef> cues, List<SrtEntry> entries) }`: `cues` có thể chưa sắp xếp; matcher tự sắp theo `startMs`.

- [ ] **Step 1: Viết test fail**

Dữ liệu gốc dùng chung: `cues = [CueRef(0, 1_000, "hello there"), CueRef(1, 5_000, "how are you"), CueRef(2, 9_000, "fine thanks")]`.

```java
@Test void matchesByExactStartTime()                // entry start 5_000 "bạn khỏe không" → textViByIdx = {1="bạn khỏe không"}
@Test void acceptsDifferenceOf100ms()               // start 5_100 → khớp idx 1
@Test void rejectsDifferenceOf101ms()               // start 5_101 → unmatched NO_MATCHING_TIME, textViByIdx rỗng
@Test void picksNearestCueWhenTwoAreClose()         // cues thêm CueRef(3, 5_150, "x"); entry 5_120 → khớp idx 3
@Test void lineStillInEnglishCountsAsUntranslated() // entry 1_000 "  Hello   THERE " → untranslated==1, textViByIdx rỗng
@Test void missingBlockInMiddleDoesNotShiftOthers() // entries cho 1_000 và 9_000 (thiếu 5_000) → {0=..., 2=...}
@Test void duplicateStartKeepsFirst()               // 2 entry cùng 5_000 → idx 1 = text entry đầu; entry sau unmatched DUPLICATE_TIME
@Test void rejectsTextLongerThan1000Chars()         // "a".repeat(1001) → unmatched TOO_LONG; "a".repeat(1000) → khớp
@Test void keepsLineBreaksInTranslation()           // "dòng 1\ndòng 2" → lưu nguyên "\n"
@Test void storesTranslationAsNfc()                 // text NFD (Normalizer.normalize("Học", NFD)) → lưu "Học" dạng NFC
@Test void handlesEmptyCueList()                    // cues rỗng → mọi entry unmatched NO_MATCHING_TIME
```

- [ ] **Step 2: Chạy test, xác nhận fail**

Stub `match` trả `new MatchResult(Map.of(), 0, List.of())`.
Run: `mvn test -Dskip.npm -Dtest=TranslationMatcherTest`
Expected: FAIL ở assertion.

- [ ] **Step 3: Cài đặt `match`**

Theo spec mục 5.2, xử lý entry theo thứ tự trong file:
1. Chuẩn hoá text entry sang NFC (`java.text.Normalizer`).
2. Binary search cue có `startMs` gần nhất; `|Δ| > TOLERANCE_MS` → `NO_MATCHING_TIME`.
3. Cue đã được entry trước chiếm → `DUPLICATE_TIME`.
4. So sánh "giống tiếng Anh": cả hai vế gộp `\s+` thành một dấu cách, `strip`, `toLowerCase(Locale.ROOT)`; bằng nhau → `untranslated++` (và cue được tính là đã chiếm).
5. `text.length() > MAX_TEXT_LENGTH` → `TOO_LONG`.
6. Còn lại → `textViByIdx.put(cue.idx(), text)`.

Dùng `LinkedHashMap` để giữ thứ tự.

- [ ] **Step 4: Chạy test, xác nhận pass**

Run: `mvn test -Dskip.npm -Dtest=TranslationMatcherTest`
Expected: PASS (11 test).

- [ ] **Step 5: Commit**

```bash
git add src/main/java/com/subtitlestudio/subtitle/{CueRef,UnmatchedReason,UnmatchedLine,MatchResult,TranslationMatcher}.java src/test/java/com/subtitlestudio/subtitle/TranslationMatcherTest.java
git commit -m "P2-T02: TranslationMatcher"
```

---

### Task 3: Schema + `TranslationService` + chặn Làm mới (P2-T03)

**Files:**
- Modify: `video/Video.java`, `video/CueEntity.java`, `video/CueRepository.java`, `video/SubtitleService.java`, `subtitle/SrtWriter.java`
- Create: `video/TranslationService.java`, `video/TranslationReport.java`, `video/SrtExport.java`, `video/StoredCue.java`, `video/TranslationNotMatchedException.java`, `video/NoTranslationException.java`, `video/TranslationExistsException.java`
- Create: `src/test/resources/schema/phase1.sql`
- Create: `src/test/java/com/subtitlestudio/test/MutableClock.java` (tách từ class lồng trong `SubtitleServiceTest`, dùng chung cho `TranslationServiceTest`)
- Test: `src/test/java/com/subtitlestudio/video/TranslationServiceTest.java`, `video/SchemaUpgradeTest.java`; sửa `video/SubtitleServiceTest.java`, `subtitle/SrtWriterTest.java`

**Interfaces:**
- Consumes: `SrtParser.parse` (Task 1), `TranslationMatcher.match`, `CueRef`, `UnmatchedLine` (Task 2).
- Produces:
  - `Video`: `int getTranslatedCount()`, `Instant getTranslatedAt()`, `void updateTranslation(int count, Instant at)` (`at` có thể `null`).
  - `CueEntity`: `void setTextVi(String textVi)`, `CueRef toCueRef()`.
  - `CueRepository`: `@Modifying(flushAutomatically = true, clearAutomatically = true) @Query("update CueEntity c set c.textVi = null where c.video.id = :videoId") int clearTextVi(@Param("videoId") String videoId)`; `List<CueEntity> findByVideo_IdAndTextViIsNotNullOrderByIdxAsc(String videoId)`.
  - `record StoredCue(int idx, long startMs, long endMs, String textEn, String textVi)`
  - `record TranslationReport(int totalCues, int translated, int untranslated, List<UnmatchedLine> unmatched, int skippedBlocks)`
  - `record SrtExport(String fileName, byte[] body)`
  - `@Service class TranslationService { TranslationReport upload(String id, byte[] content); void clear(String id); SrtExport exportVi(String id, boolean bom) }`
  - `SubtitleService`: `List<StoredCue> getStoredCues(String id)` (ném `VideoNotFoundException`); `refresh` ném `TranslationExistsException(id)` khi `translatedCount > 0`, trước khi gọi yt-dlp.
  - `SrtWriter`: `String fileName(String title, String videoId, String lang)`; `fileName(title, id)` cũ gọi bản mới với `"en"`.
  - Exception (đều `extends RuntimeException`, constructor nhận `String videoId`): `TranslationNotMatchedException`, `NoTranslationException`, `TranslationExistsException`.

- [ ] **Step 1: Tạo fixture schema Phase 1**

`src/test/resources/schema/phase1.sql`: lấy từ DB thật của `v0.1.0` (`org.h2.tools.Script ... -options NODATA`), rút gọn còn:

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

`SchemaUpgradeTest` (`@SpringBootTest`, không dùng profile `test`; `@DynamicPropertySource` đặt `spring.datasource.url=jdbc:h2:file:<tempDir>/db` và `subtitle-studio.data-dir=<tempDir>`; trong static initializer, mở `DriverManager.getConnection` tới cùng URL và chạy `phase1.sql` qua `RunScript.execute`):

```java
@Test void startsOnPhase1DatabaseAndDefaultsTranslatedCountToZero()
// videos.findById("dQw4w9WgXcQ").get().getTranslatedCount() == 0; getTranslatedAt() == null
```

`TranslationServiceTest` (`@DataJpaTest` + `@Import({TranslationService.class, SrtParser.class, TranslationMatcher.class, SrtWriter.class, Config with MutableClock})`, dữ liệu: video `ID` có 3 cue `(0, 1000-2000, "hello there")`, `(1, 5000-6000, "how are you")`, `(2, 9000-10000, "fine thanks")`, file upload dựng bằng helper `srt(String... blocks)`):

```java
@Test void uploadStoresMatchedTranslationsAndCounts()      // dịch idx 0,1; idx 2 còn tiếng Anh → report(3, 2, 1, [], 0); video.translatedCount==2; translatedAt==clock
@Test void uploadReplacesPreviousTranslationCompletely()   // lần 1 dịch idx 0,1; lần 2 chỉ dịch idx 2 → chỉ idx 2 có textVi; translatedCount==1
@Test void uploadWithNothingTranslatedThrowsAndKeepsOld()  // có bản dịch; upload file toàn tiếng Anh → TranslationNotMatchedException; dữ liệu cũ còn nguyên
@Test void uploadOfUntranslatedEnglishExportKeepsExistingTranslation() // upload đúng bytes của SrtWriter.toBytes(cue tiếng Anh) → TranslationNotMatchedException
@Test void reportListsUnmatchedLines()                      // thêm block start 7_000 → unmatched [ (index, 7000, text, NO_MATCHING_TIME) ]
@Test void invalidFilePropagatesInvalidSrt()                // "garbage" → InvalidSrtException; không đổi gì
@Test void uploadToUnknownVideoThrowsNotFound()
@Test void clearRemovesAllTranslations()                    // translatedCount 0, translatedAt null, mọi textVi null
@Test void exportViContainsOnlyTranslatedCuesRenumbered()   // dịch idx 0 và 2 → body "1\r\n00:00:01,000 --> 00:00:02,000\r\n<vi0>\r\n\r\n2\r\n00:00:09,000 --> 00:00:10,000\r\n<vi2>\r\n\r\n"; fileName "<title>_<id>.vi.srt"
@Test void exportViWithoutTranslationThrows()               // NoTranslationException
@Test void exportedViSrtRoundTrips()                        // upload → exportVi → clear → upload body vừa xuất → cùng textVi cho mọi idx
```

Thêm vào `SubtitleServiceTest`:

```java
@Test void refreshIsBlockedWhenTranslationExists()   // video có translatedCount>0 → TranslationExistsException; verify(ytDlp, never()).fetchInfo(anyString())
@Test void storedCuesIncludeTextVi()                 // getStoredCues trả textVi null cho câu chưa dịch
```

Thêm vào `SrtWriterTest`: `fileNameUsesGivenLanguage()` → `fileName("T", ID, "vi")` == `"T_dQw4w9WgXcQ.vi.srt"`.

- [ ] **Step 3: Chạy test, xác nhận fail**

Thêm stub các method/record mới để compile.
Run: `mvn test -Dskip.npm -Dtest='TranslationServiceTest,SchemaUpgradeTest,SubtitleServiceTest,SrtWriterTest*'`
Expected: FAIL ở assertion; `SchemaUpgradeTest` fail vì cột `translated_count` chưa có trong entity.

- [ ] **Step 4: Cài đặt**

- `Video`: `@Column(name = "translated_count", nullable = false, columnDefinition = "INT DEFAULT 0 NOT NULL") private int translatedCount;` và `@Column(name = "translated_at") private Instant translatedAt;`.
- `TranslationService.upload` theo spec mục 5.3: kiểm tra tồn tại → parse + match **ngoài transaction** → `translated == 0` thì ném → trong `TransactionTemplate`: `clearTextVi`, load lại cue theo `findByVideo_IdOrderByIdxAsc`, `setTextVi` cho idx có trong map, `video.updateTranslation(translated, clock.instant())`.
- `clear`: `clearTextVi` + `updateTranslation(0, null)`.
- `exportVi`: dùng `findByVideo_IdAndTextViIsNotNullOrderByIdxAsc`, map sang `new Cue(startMs, endMs, textVi)`, `SrtWriter.toBytes(..., bom)`, tên file `SrtWriter.fileName(title, id, "vi")`.
- `SubtitleService.refresh`: đọc video, `getTranslatedCount() > 0` → `TranslationExistsException` trước `download(id)`.

- [ ] **Step 5: Chạy test, xác nhận pass**

Run: `mvn test -Dskip.npm`
Expected: PASS toàn bộ backend.

- [ ] **Step 6: Commit**

```bash
git add src/main src/test
git commit -m "P2-T03: translation storage, upload/clear/export service, block refresh"
```

---

### Task 4: REST endpoint + lỗi + forward SPA (P2-T04)

**Files:**
- Create: `video/TranslationController.java`, `web/SpaForwardController.java`
- Modify: `video/VideoDto.java`, `video/CueDto.java`, `video/VideoController.java`, `web/ApiExceptionHandler.java`, `src/main/resources/application.yml`
- Test: `video/TranslationControllerTest.java`, `web/SpaForwardControllerTest.java`; sửa `video/VideoControllerTest.java`

**Interfaces:**
- Consumes: `TranslationService` (Task 3), `SubtitleService.getStoredCues`, các exception của Task 1 và Task 3.
- Produces (HTTP, frontend dùng ở Task 5):
  - `VideoDto` thêm `int translatedCount`.
  - `CueDto(int idx, long startMs, long endMs, String text, String textVi)`: `text` vẫn là tiếng Anh.
  - `PUT /api/videos/{id}/translation` (multipart, part `file`) → 200 `TranslationReport` JSON: `{totalCues, translated, untranslated, unmatched:[{index,startMs,text,reason}], skippedBlocks}`.
  - `DELETE /api/videos/{id}/translation` → 204.
  - `GET /api/videos/{id}/subtitle.vi.srt[?bom=true]` → `application/x-subrip;charset=UTF-8`, `Content-Disposition` attachment với `filename*=UTF-8''…vi.srt`.
  - Lỗi: `INVALID_SRT` 400, `TRANSLATION_NOT_MATCHED` 422, `NO_TRANSLATION` 404, `TRANSLATION_EXISTS` 409, `FILE_TOO_LARGE` 413.

- [ ] **Step 1: Viết test fail**

`TranslationControllerTest` (`@WebMvcTest(TranslationController.class)`, `@Import(ApiExceptionHandler.class)`, `@MockitoBean TranslationService`):

```java
@Test void uploadReturnsReport()               // multipart(...).file(new MockMultipartFile("file","a.srt","application/x-subrip",bytes)) with PUT → 200; $.translated==2; $.unmatched[0].reason=="NO_MATCHING_TIME"
@Test void invalidSrtReturns400()              // service ném InvalidSrtException → problem 400 code INVALID_SRT
@Test void notMatchedReturns422()              // TRANSLATION_NOT_MATCHED
@Test void tooLargeReturns413()                // service ném new MaxUploadSizeExceededException(5*1024*1024) → 413 FILE_TOO_LARGE
@Test void unknownVideoReturns404()            // VIDEO_NOT_FOUND
@Test void deleteReturns204()                  // verify(service).clear(ID)
@Test void downloadsViSrt()                    // exportVi → SrtExport("Học_ID.vi.srt", bytes) → 200, content type application/x-subrip, header chứa "filename*=UTF-8''H%E1%BB%8Dc_" + ID + ".vi.srt"
@Test void downloadWithoutTranslationReturns404() // NO_TRANSLATION
```

Sửa `VideoControllerTest`:

```java
// video() helper: v.updateTranslation(1, ...) → $.translatedCount == 1
@Test void cuesIncludeTextVi()        // getStoredCues → $[0].text == "hello", $[0].textVi == "xin chào", $[1].textVi == null
@Test void refreshBlockedReturns409() // refresh ném TranslationExistsException → 409 TRANSLATION_EXISTS
```

`SpaForwardControllerTest` (`@WebMvcTest(SpaForwardController.class)`, `@Import(ApiExceptionHandler.class)`):

```java
@Test void forwardsVideoPageToIndex()          // GET /videos/dQw4w9WgXcQ → forwardedUrl("/index.html"); cũng đúng với "/videos/dQw4w9WgXcQ/"
@Test void unknownApiPathStillReturns404()     // GET /api/khong-co → status 404
```

- [ ] **Step 2: Chạy test, xác nhận fail**

Run: `mvn test -Dskip.npm -Dtest='TranslationControllerTest,SpaForwardControllerTest,VideoControllerTest*'`
Expected: FAIL (endpoint chưa có, field chưa có).

- [ ] **Step 3: Cài đặt**

- `TranslationController` (`@RequestMapping("/api/videos/{id}")`): `@PutMapping(path = "/translation", consumes = MULTIPART_FORM_DATA_VALUE)` nhận `@RequestPart("file") MultipartFile file` → `service.upload(id, file.getBytes())`; `@DeleteMapping("/translation")`; `@GetMapping("/subtitle.vi.srt")` dựng response giống `VideoController.downloadSrt` (dùng lại `VideoController.SUBRIP`).
- `ApiExceptionHandler`: thêm 4 `@ExceptionHandler` theo bảng lỗi; override `handleMaxUploadSizeExceededException(...)` của class cha để trả `ProblemDetail` 413 với `code = "FILE_TOO_LARGE"` và detail `"Upload exceeds 5 MB"`.
- `SpaForwardController` (`@Controller`): `@GetMapping({"/videos/{id}", "/videos/{id}/"}) String video() { return "forward:/index.html"; }`.
- `application.yml`: `spring.servlet.multipart.max-file-size: 5MB`, `max-request-size: 5MB`.
- `VideoController.cues` dùng `getStoredCues`; `VideoDto.from` thêm `translatedCount`.

- [ ] **Step 4: Chạy test, xác nhận pass**

Run: `mvn test -Dskip.npm`
Expected: PASS toàn bộ backend.

- [ ] **Step 5: Commit**

```bash
git add src/main src/test
git commit -m "P2-T04: translation endpoints, new error codes, SPA forward"
```

---

### Task 5: Frontend router + trang video (chưa có player) (P2-T05)

**Files:**
- Modify: `frontend/package.json` (thêm `"react-router": "8.5.1"`), `src/main.tsx`, `src/App.tsx`, `src/api/client.ts`, `src/lib/errors.ts`, `src/lib/errors.test.ts`, `src/components/VideoList.tsx`, `src/styles.css`
- Create: `src/pages/HomePage.tsx`, `src/pages/HomePage.test.tsx`, `src/pages/VideoPage.tsx`, `src/pages/VideoPage.test.tsx`, `src/components/TranslationToolbar.tsx`, `src/components/UploadReport.tsx`, `src/components/CueList.tsx`
- Delete: `src/App.test.tsx` (chuyển test sang `HomePage.test.tsx`), `src/components/ResultPanel.tsx`, `src/components/CueTable.tsx`

**Interfaces:**
- Consumes: HTTP API của Task 4.
- Produces (cho Task 6):
  - `client.ts`: `VideoDto.translatedCount: number`; `CueDto.textVi: string | null`; `type UnmatchedReason = 'NO_MATCHING_TIME' | 'DUPLICATE_TIME' | 'TOO_LONG'`; `interface UnmatchedLine { index: number; startMs: number; text: string; reason: UnmatchedReason }`; `interface TranslationReport { totalCues: number; translated: number; untranslated: number; unmatched: UnmatchedLine[]; skippedBlocks: number }`; `getVideo(id): Promise<VideoDto>`; `uploadTranslation(id, file: File): Promise<TranslationReport>` (PUT `FormData` với field `file`); `deleteTranslation(id): Promise<void>`; `viSrtUrl(id): string`.
  - `errors.ts`: message cho `INVALID_SRT`, `TRANSLATION_NOT_MATCHED`, `NO_TRANSLATION`, `TRANSLATION_EXISTS`, `FILE_TOO_LARGE` đúng câu ở spec mục 7; `unmatchedReasonLabel(reason: UnmatchedReason): string` đúng 3 câu ở spec mục 7.
  - `CueList` props: `{ cues: CueDto[]; activeIdx?: number | null; onSelect?: (cue: CueDto) => void }`. Mỗi dòng là `<li>` chứa nút `aria-label` `"Tua tới <timecode>"` khi có `onSelect`; dòng có `idx === activeIdx` có `aria-current="true"`. Câu chưa dịch hiện chữ "chưa dịch".
  - `VideoPage` đọc `id` từ `useParams`, giữ state `video`, `cues`, `report`, `error`, và có vùng `<div data-slot="player" />` để Task 6 gắn player.

- [ ] **Step 1: Cài dependency**

Run: `cd frontend && npm install react-router@8.5.1 --save-exact`
Expected: `package.json` có `"react-router": "8.5.1"`.

- [ ] **Step 2: Viết test fail**

`errors.test.ts` thêm `it.each` cho 5 code mới (kiểm tra `title` chứa một cụm đặc trưng của câu trong spec) và `unmatchedReasonLabel`.

`HomePage.test.tsx`: chuyển các test của `App.test.tsx` cũ, render trong `<MemoryRouter>` kèm `<Routes>`, và sửa theo hành vi mới:

```tsx
it('navigates to the video page after fetching')          // POST 201 → thấy heading của VideoPage (route /videos/:id render <p>video page {id}</p> trong test)
it('opens a video from the history list')                  // click "Mở Học Spring Boot" → route /videos/dQw4w9WgXcQ
it('shows translation progress in the history list')       // translatedCount 200, cueCount 1152 → "đã dịch 200/1152"
it('hides progress when nothing is translated')
it('explains that refresh is blocked by an existing translation') // refresh 409 TRANSLATION_EXISTS → alert chứa "đã có bản dịch"
```

(Giữ nguyên các test lỗi, xoá, làm mới, danh sách rỗng của `App.test.tsx`.)

`VideoPage.test.tsx` (render `<MemoryRouter initialEntries={['/videos/dQw4w9WgXcQ']}>`, fake fetch như Phase 1):

```tsx
it('shows video info, badge and translation progress')    // tiêu đề, kênh, "Auto-generated", "đã dịch 1/2 câu"
it('lists cues with English and Vietnamese text')          // CueList: "hello" + "xin chào"; câu 2 có "chưa dịch"
it('links to the English and Vietnamese srt downloads')   // href /api/videos/ID/subtitle.srt và /subtitle.vi.srt
it('disables the vi.srt download when nothing is translated') // translatedCount 0 → nút/link "Tải .vi.srt" aria-disabled="true", không có href
it('uploads a translation and shows the report')          // userEvent.upload(input "Upload bản dịch", file) → PUT với FormData; hiện "Đã nhận 1 câu đã dịch, 1 câu còn tiếng Anh, 1 dòng không khớp"; mở chi tiết thấy lý do "Không có câu gốc trùng thời điểm"
it('refreshes video and cues after upload')               // sau upload, GET /api/videos/ID và /cues được gọi lại; tiến độ cập nhật
it('shows the not-matched error and keeps old data')      // 422 → alert chứa "Bản dịch cũ được giữ nguyên"
it('deletes the translation after confirmation')          // confirm true → DELETE; nút "Xoá bản dịch" chỉ hiện khi translatedCount>0
it('shows not found for an unknown video')                // GET 404 VIDEO_NOT_FOUND → alert + link "Về danh sách"
it('links back to the home page')                         // link "Danh sách" → href "/"
```

- [ ] **Step 3: Chạy test, xác nhận fail**

Run: `cd frontend && npm test`
Expected: FAIL (page và client function chưa có).

- [ ] **Step 4: Cài đặt**

- `main.tsx` bọc `<BrowserRouter>`; `App.tsx` chỉ còn `<Routes>` với `/` → `HomePage`, `/videos/:id` → `VideoPage`.
- `HomePage`: nội dung trang chủ cũ, bỏ `ResultPanel`; fetch thành công → `navigate('/videos/' + id)`; mở từ danh sách → `navigate`.
- `VideoList`: thêm "đã dịch X/Y" vào dòng phụ khi `translatedCount > 0`.
- `VideoPage`: bố cục theo spec mục 6.2 (vùng player để trống cho Task 6); `TranslationToolbar` (tải `.srt`, input file ẩn kèm `<label>` "Upload bản dịch", tải `.vi.srt`, xoá bản dịch); `UploadReport` dùng `<details>` cho danh sách dòng không khớp.
- `styles.css`: layout trang video (2 cột ≥ 760 px, 1 cột dưới), thanh tiến độ (`<progress>` có `aria-label`).

- [ ] **Step 5: Chạy test, xác nhận pass**

Run: `cd frontend && npm test && npm run build`
Expected: PASS, build không lỗi type.

- [ ] **Step 6: Commit**

```bash
git add frontend
git commit -m "P2-T05: router, video page with upload/report/delete, progress in list"
```

---

### Task 6: Player, overlay, hai chế độ, fullscreen (P2-T06)

**Files:**
- Create: `src/player/youtube.ts`, `src/player/useYouTubePlayer.ts`, `src/lib/findActiveCue.ts`, `src/lib/findActiveCue.test.ts`, `src/components/SubtitleOverlay.tsx`, `src/components/SubtitleOverlay.test.tsx`, `src/components/VideoPlayer.tsx`, `src/components/ModeToggle.tsx`
- Modify: `src/pages/VideoPage.tsx`, `src/pages/VideoPage.test.tsx`, `src/styles.css`

**Interfaces:**
- Consumes: `CueDto`, `CueList` (Task 5).
- Produces:
  - `youtube.ts`: `loadYouTubeApi(): Promise<typeof YT>` (singleton promise; chèn `<script src="https://www.youtube.com/iframe_api">` một lần, resolve trong `window.onYouTubeIframeAPIReady`). Khai báo kiểu tối thiểu cho `YT.Player` trong file này (không thêm package `@types/youtube`).
  - `useYouTubePlayer(container: RefObject<HTMLDivElement | null>, videoId: string): { currentMs: number; seekTo(ms: number): void; state: 'loading' | 'ready' | 'playing' | 'paused' | 'ended'; error: 'EMBED_BLOCKED' | 'LOAD_FAILED' | null }`. Player tạo với `host: 'https://www.youtube-nocookie.com'`, `playerVars: { fs: 0, playsinline: 1, rel: 0, iv_load_policy: 3 }`. Lỗi `101`/`150` → `EMBED_BLOCKED`; script lỗi → `LOAD_FAILED`. Khi `state === 'playing'` cập nhật `currentMs` theo `requestAnimationFrame`; huỷ khi đổi state hoặc unmount; `destroy()` player khi unmount.
  - `findActiveCue(cues: CueDto[], ms: number): CueDto | null`: `cues` đã sắp theo `startMs`; trả cue có `startMs <= ms < endMs`.
  - `type ViewMode = 'review' | 'watch'`; `SubtitleOverlay` props `{ cue: CueDto | null; mode: ViewMode }`.
  - `VideoPlayer` props `{ containerRef: RefObject<HTMLDivElement | null>; cue: CueDto | null; mode: ViewMode; error: 'EMBED_BLOCKED' | 'LOAD_FAILED' | null }`: khung 16:9 chứa div player (gắn `containerRef`), overlay và nút "Toàn màn hình" gọi `requestFullscreen()` trên khung.
  - `ModeToggle` props `{ mode: ViewMode; onChange(mode: ViewMode): void }`: hai nút "Kiểm tra"/"Xem" với `aria-pressed`.

- [ ] **Step 1: Viết test fail**

`findActiveCue.test.ts` (cues `[0–1000), [1000–2000), [3000–4000)`):

```ts
it('returns the cue containing the time')            // 1500 → cue 2
it('treats start as inclusive and end as exclusive') // 1000 → cue 2; 999 → cue 1
it('returns null in a gap')                          // 2500 → null
it('returns null before the first and after the last cue') // -1, 4000 → null
it('returns null for an empty list')
```

`SubtitleOverlay.test.tsx`:

```tsx
it('review mode shows Vietnamese with English below')    // textVi "xin chào", text "hello" → cả hai
it('review mode marks untranslated cues')                // textVi null → "hello" + "chưa dịch"
it('watch mode shows only Vietnamese')                   // không có "hello"
it('watch mode shows nothing for untranslated cues')     // container rỗng (không có text)
it('shows nothing when there is no active cue')
it('rendersMarkupAsPlainText')                           // textVi "<i>xin</i><script>x</script>" → getByText chứa nguyên chuỗi; container.querySelector('i, script') === null
```

`VideoPage.test.tsx` thêm (mock module bằng `vi.mock('../player/useYouTubePlayer', ...)`; test điều khiển `currentMs`, `state`, `error` qua biến dùng chung và kiểm tra `seekTo` là `vi.fn()`):

```tsx
it('shows the cue at the current time in the overlay')   // currentMs 1500 → overlay chứa text của cue 2
it('highlights the active cue in the list')              // dòng cue 2 có aria-current="true"
it('seeks when a cue is clicked')                        // click "Tua tới 00:00:03,000" → seekTo(3000)
it('defaults to review mode when translation is incomplete') // translatedCount < cueCount → "Kiểm tra" aria-pressed=true; danh sách câu hiện
it('defaults to watch mode when fully translated')       // translatedCount == cueCount → "Xem" aria-pressed=true; danh sách câu ẩn
it('switches modes')                                     // click "Xem" → danh sách câu biến mất
it('enters fullscreen on the player frame')              // HTMLElement.prototype.requestFullscreen = vi.fn(); click "Toàn màn hình" → gọi trên phần tử khung player
it('explains when embedding is blocked')                 // error EMBED_BLOCKED → "Video này không cho phép phát nhúng. Bạn vẫn tải được .srt và .vi.srt."
```

- [ ] **Step 2: Chạy test, xác nhận fail**

Run: `cd frontend && npm test`
Expected: FAIL.

- [ ] **Step 3: Cài đặt**

- `findActiveCue`: binary search theo `startMs`.
- `SubtitleOverlay`: `pointer-events: none`; hai dòng (`.overlay__vi`, `.overlay__en`); không render gì khi không có nội dung theo bảng ở spec mục 6.4.
- `VideoPage`: gọi `useYouTubePlayer(playerRef, id)`; `active = findActiveCue(cues, currentMs)`; chế độ mặc định theo spec mục 6.4 (tính một lần khi dữ liệu tải xong); render `ModeToggle`, `VideoPlayer`, và `CueList` (chỉ ở `review`) với `activeIdx` và `onSelect={c => seekTo(c.startMs)}`; `CueList` cuộn dòng active vào khung nhìn bằng `scrollIntoView({ block: 'nearest' })` (bỏ qua khi `prefers-reduced-motion`).
- `styles.css`: khung player `aspect-ratio: 16/9; container-type: inline-size`; chữ overlay `font-size: clamp(14px, 3.2cqw, 40px)`, nền tối bán trong suốt, chữ trắng; dòng tiếng Anh nhỏ hơn, màu nhạt; khung khi fullscreen chiếm toàn màn hình (`:fullscreen`).

- [ ] **Step 4: Chạy test, xác nhận pass**

Run: `cd frontend && npm test && npm run build`
Expected: PASS, build không lỗi.

- [ ] **Step 5: Commit**

```bash
git add frontend
git commit -m "P2-T06: YouTube player with subtitle overlay, review/watch modes, fullscreen"
```

---

### Task 7: Kiểm chứng với video thật + tài liệu (P2-T07)

**Files:**
- Modify: `README.md` (endpoint mới, cách dùng bản dịch), `PROGRESS.md` (Phase 2: bảng tiến độ, nhật ký, quyết định), `PLAN.md` (mục 9: Phase 2 đã có spec/plan và đã xong), `CLAUDE.md` (Phase hiện tại)
- Local only (gitignore): `src/test/resources/golden/9SGDpanrc8U.AUTO.vtt` (đã có), thêm `golden/9SGDpanrc8U.vi-partial.srt` và `golden/9SGDpanrc8U.vi-report.json`
- Test: `src/test/java/com/subtitlestudio/subtitle/GoldenTranslationTest.java` (bỏ qua khi thiếu file, giống `GoldenSubtitleTest`)

**Interfaces:**
- Consumes: toàn bộ Task 1–6.

- [ ] **Step 1: Viết golden test cho bản dịch dở**

`GoldenTranslationTest`: với mỗi `golden/<id>.vi-partial.srt`, dựng `CueRef` từ `golden/<id>.srt` (qua `SrtParser`, `idx` = thứ tự), chạy `TranslationMatcher` với file dịch dở, so `translated`, `untranslated`, số `unmatched` với `golden/<id>.vi-report.json` (`{"translated":20,"untranslated":1132,"unmatched":0}`). Thiếu file → `assumeTrue` bỏ qua.

- [ ] **Step 2: Chạy Definition of Done (spec mục 10) trên app thật**

Run: `mvn package` rồi chạy jar (yt-dlp + deno trong PATH), dùng video `9SGDpanrc8U`:
1. Dịch 20 dòng đầu trong `.srt` đã tải, upload → báo cáo "20 đã dịch, 1132 còn tiếng Anh, 0 không khớp". Lưu file thành `golden/9SGDpanrc8U.vi-partial.srt`.
2. Chế độ Kiểm tra: song ngữ đồng bộ, câu đang phát được tô sáng, click câu thì tua đúng.
3. Chế độ Xem + nút "Toàn màn hình": overlay vẫn hiện.
4. Tải `.vi.srt` → 20 câu, đánh số 1–20, timing gốc.
5. Xoá 1 block ở giữa phần đã dịch rồi upload → chỉ câu đó thiếu.
6. Làm mới → bị chặn, có hướng dẫn.
7. Khởi động jar trên DB thật `./data` của Phase 1 → không lỗi, danh sách hiện đủ video cũ.

Bước 2 và 3 cần người dùng xem bằng mắt; ghi lại kết quả.

- [ ] **Step 3: Chạy toàn bộ test**

Run: `mvn test`
Expected: PASS backend (kể cả golden khi có file local) và frontend.

- [ ] **Step 4: Cập nhật tài liệu**

README: thêm 3 endpoint, 5 code lỗi mới, mục "Dịch và xem Vietsub" (tải `.srt` → dịch giữ nguyên timecode → upload → Kiểm tra/Xem → tải `.vi.srt`). PROGRESS: bảng P2-T01…T07, nhật ký, bug tìm được, kết quả DoD. PLAN mục 9: đánh dấu Phase 2 xong, link spec và plan.

- [ ] **Step 5: Commit**

```bash
git add README.md PROGRESS.md PLAN.md CLAUDE.md src/test/java/com/subtitlestudio/subtitle/GoldenTranslationTest.java
git commit -m "P2-T07: real-video verification and docs for Phase 2"
```

Gắn tag `v0.2.0` và push chỉ khi người dùng đồng ý.
