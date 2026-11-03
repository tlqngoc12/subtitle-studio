# Phase 4: Dịch Vietsub bằng Gemini — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lấy Engsub kèm hồ sơ dịch thì app tự dịch sang Vietsub bằng Gemini (free tier, video ≤ 60 phút), lưu như Vietsub upload tay với nguồn `AUTO`, không bao giờ ghi đè Vietsub `MANUAL`.

**Architecture:** Migration `V2` thêm nguồn Vietsub và trạng thái dịch vào `video`. Package mới `translate`: `PromptProfileStore` (file Markdown), `GeminiTranslator` (SDK `google-genai`, structured output, kiểm tra `id`), `TranslationService` (UPDATE có điều kiện chống trùng lượt, chạy trên virtual thread, lưu qua `VietsubService` có khoá dòng). `SubtitleFileStore` ghi `en.srt` / `vi_auto.srt` / `vi_manual.srt`. Frontend: dropdown hồ sơ, dòng trạng thái Vietsub, polling 3 giây.

**Tech Stack:** Spring Boot 3.5.16, Flyway (Oracle SQL + placeholder), `com.google.genai:google-genai:1.78.0`, React + Vitest, `lucide-react`.

**Spec:** [docs/superpowers/specs/2026-11-03-gemini-translate-design.md](../specs/2026-11-03-gemini-translate-design.md)

## Global Constraints

- Test tự động **không gọi Gemini thật**; `GEMINI_API_KEY` không bao giờ xuất hiện trong log, exception message, hay commit.
- Không có `GEMINI_API_KEY` thì mọi chức năng hiện có chạy như cũ.
- Migration mới là `V2__vietsub_source_and_translation.sql`; không sửa `V1`. Cột chuỗi `VARCHAR2(n CHAR)`.
- Quy tắc nguồn: `AUTO` không ghi đè `MANUAL`; `MANUAL` ghi đè được `AUTO`; dán trùng link không gọi Gemini khi đã có Vietsub hoặc đang dịch.
- Tên hồ sơ `^[A-Za-z0-9_-]{1,40}$`, file ≤ 20 KB, UTF-8, bỏ qua file bắt đầu bằng `_`.
- Cấu hình mặc định: `timeout` 3m, `max-duration` 60m, `temperature` 0.3, polling frontend 3000 ms.
- Thông điệp lỗi người dùng đúng nguyên văn bảng "Thông điệp lỗi" trong spec mục 6.
- Mã lỗi API: `GEMINI_NOT_CONFIGURED` 503, `UNKNOWN_PROFILE` 400, `VIDEO_TOO_LONG` 422, `VIETSUB_MANUAL` 409, `TRANSLATION_IN_PROGRESS` 409.
- File: `{subsDir}/<id>.en.srt`, `<id>.vi_auto.srt`, `<id>.vi_manual.srt`; lỗi ghi file chỉ log WARN.
- Backend nhanh: `mvn -q test -Dskip.npm`; frontend: `cd frontend && npx vitest run`; Oracle thật: `mvn verify -Poracle -Dskip.npm` (chỉ ở task có ghi; nếu container Oracle không khởi động được, ghi ledger và báo người dùng, không chặn task).

## Review Focus

1. **Hồ sơ bị sửa thành > 20 KB hoặc không phải UTF-8 sau khi đã chọn** → dịch lại trả 400 `UNKNOWN_PROFILE`, không 500. (Task 3, `readRejectsOversizedOrNonUtf8File`; Task 6, `translateWithBrokenProfileIs400`)
2. **Gemini bọc JSON trong ```json … ``` hoặc trả text không phải JSON** dù đã yêu cầu schema → lượt dịch `FAILED` với thông điệp "thiếu/lệch câu", không exception lọt ra. (Task 4, `fencedOrInvalidJsonFails`)
3. **`duration_sec` không rõ (NULL)** → vẫn được dịch (không coi là quá dài). (Task 5, `unknownDurationIsAllowed`)
4. **Video bị xoá ở tab khác trong lúc trang đang polling** → `GET` trả 404: dừng poll video đó, bỏ khỏi danh sách, không hiện lỗi chặn trang. (Task 8, `stopsPollingWhenVideoDisappears`)
5. **Gemini trả text có `\r\n` hoặc khoảng trắng thừa** → lưu text đã `strip()` và chuẩn hoá xuống dòng thành `\n`. (Task 4, `normalisesLineBreaksAndSpaces`)

---

### Task 1: Migration `V2`, nguồn Vietsub trên entity và API

**Files:**
- Create: `src/main/resources/db/migration/V2__vietsub_source_and_translation.sql`
- Create: `src/main/java/com/subtitlestudio/video/ViSource.java`, `TranslationStatus.java`
- Modify: `video/Video.java`, `video/VideoDto.java`, `video/VietsubService.java`
- Test: `video/FlywaySchemaTest.java`, `video/VietsubServiceTest.java`, `oracle/PersistenceOracleIT.java`

**Interfaces:**
- Produces: `enum ViSource { MANUAL, AUTO }`, `enum TranslationStatus { TRANSLATING, FAILED }`; `Video`: `getViSource()`, `getTranslationStatus()`, `getTranslationError()`, `getTranslationProfile()`, `updateVietsub(int count, Instant at, ViSource source)` (thay bản 2 tham số), `clearVietsub()` (count 0, `viUpdatedAt` null, `viSource` null); `VideoDto` thêm `ViSource viSource, TranslationStatus translationStatus, String translationError, String translationProfile` (cuối record).

- [ ] **Step 1: Test thất bại**
  - `FlywaySchemaTest.appliesV2Migration`: `flyway_schema_history` có `version = '2'` thành công.
  - `VietsubServiceTest.uploadMarksSourceManual`: sau `add(...)`, `video.getViSource() == MANUAL`.
  - `VietsubServiceTest.clearResetsSource`: sau `clear(id)`, `getViSource()` null, `getViCueCount()` 0.
  - `PersistenceOracleIT.rejectsUnknownViSource`: lưu một video, rồi `jdbc.update("update video set vi_source='X' where id=?", id)` → `DataIntegrityViolationException` (CHECK có thật trên Oracle).
  - Test SQL backfill trên H2: `FlywaySchemaTest.v2BackfillMarksExistingVietsubManual` dùng `Flyway.configure().dataSource(<H2 mem riêng>).placeholders(Map.of("bigint","BIGINT","int","INTEGER")).target("1").load().migrate()`, insert 1 video `vi_cue_count = 3` và 1 video `0`, rồi `target("2").migrate()`: video 3 câu có `vi_source='MANUAL'`, video 0 câu `vi_source IS NULL`.

- [ ] **Step 2: Chạy** `mvn -q test -Dskip.npm -Dtest='FlywaySchemaTest,VietsubServiceTest'` → FAIL (chưa có V2 / getter).

- [ ] **Step 3: `V2`** đúng bảng spec mục 4 (4 cột, 2 CHECK đặt tên `ck_video_vi_source`, `ck_video_translation_status`) + `UPDATE video SET vi_source = 'MANUAL' WHERE vi_cue_count > 0`.

- [ ] **Step 4: Entity/DTO/Service** — `Video`: 4 field (`@Enumerated(STRING)` cho 2 enum, `length` khớp V2); `VietsubService.add` gọi `updateVietsub(n, now, ViSource.MANUAL)`; `clear` gọi `clearVietsub()`; `VideoDto.from` map 4 field. Sửa mọi chỗ gọi `updateVietsub` 2 tham số.

- [ ] **Step 5: Chạy** `mvn -q test -Dskip.npm` → BUILD SUCCESS. Nếu Docker ổn: `mvn verify -Poracle -Dskip.npm` → `PersistenceOracleIT` pass.

- [ ] **Step 6: Commit** — `git commit -m "Add Vietsub source and translation status (Flyway V2)"`

---

### Task 2: `SubtitleFileStore` — lưu `en.srt`, `vi_auto.srt`, `vi_manual.srt`

**Files:**
- Create: `video/SubtitleFileStore.java`, `video/SubtitleFilesBackfill.java`
- Modify: `video/SubtitleService.java` (fetch, refresh, delete), `video/VietsubService.java` (add, clear)
- Test: `video/SubtitleFileStoreTest.java`, `video/SubtitleServiceTest.java`, `video/VietsubServiceTest.java`, `video/SubtitleFilesBackfillTest.java`

**Interfaces:**
- Consumes: `ViSource` (Task 1), `SrtWriter.toBytes(List<Cue>, boolean bom)`.
- Produces (`@Component SubtitleFileStore(SubtitleStudioProperties)`): `void writeEnglish(String id, byte[] srt)`, `void writeViAuto(String id, byte[] srt)`, `void writeViManual(String id, byte[] raw)`, `void deleteVi(String id, ViSource source)`, `void deleteAll(String id)`, `boolean hasEnglish(String id)`, `boolean hasViManual(String id)`, `Path path(String id, String suffix)` (suffix `en`, `vi_auto`, `vi_manual`). Tất cả nuốt `IOException` và log WARN (không log nội dung file).

- [ ] **Step 1: Test thất bại**
  - `SubtitleFileStoreTest` (`@TempDir`): `writesThreeKindsSideBySide`; `overwritesSameKind`; `deleteViRemovesOnlyThatSource` (xoá AUTO giữ MANUAL và ngược lại); `deleteAllRemovesSrtAndVtt` (kể cả `<id>.en-US.vtt` sẵn có); `writeFailureIsSwallowed` (subsDir là một **file** thường → không ném).
  - `SubtitleServiceTest.fetchWritesEnglishSrt`: file `en.srt` bằng byte `srtWriter.toBytes(cues, false)`; `refreshRewritesEnglishSrt`; `deleteRemovesAllSubtitleFiles`.
  - `VietsubServiceTest.uploadStoresOriginalBytes`: upload bytes có BOM + CRLF → `vi_manual.srt` **đúng từng byte**; `clearDeletesCurrentSourceFileOnly` (đặt sẵn `vi_auto.srt`, clear video MANUAL → còn `vi_auto.srt`, mất `vi_manual.srt`).
  - `SubtitleFilesBackfillTest`: video có cue nhưng thiếu `en.srt` → tạo; video `MANUAL` thiếu `vi_manual.srt` → dựng từ `vi_cue`; file đã có → không ghi đè (so mtime/bytes).

- [ ] **Step 2: Chạy** các class trên → FAIL.

- [ ] **Step 3: Cài đặt** `SubtitleFileStore`; gọi từ `SubtitleService` (sau khi transaction lưu cue thành công) và `VietsubService` (`add` nhận `byte[] srt` gốc — ghi chính mảng đó; `clear` xoá theo `viSource` đọc **trước** khi clear). `SubtitleFilesBackfill`: `@EventListener(ApplicationReadyEvent.class)`, duyệt `videos.findAll()`.

- [ ] **Step 4: Chạy** `mvn -q test -Dskip.npm` → BUILD SUCCESS.

- [ ] **Step 5: Commit** — `git commit -m "Keep en/vi_auto/vi_manual .srt files next to the .vtt"`

---

### Task 3: Cấu hình Gemini, hồ sơ dịch, `GET /api/prompt-profiles`

**Files:**
- Modify: `config/SubtitleStudioProperties.java`, `src/main/resources/application.yml`, `src/test/resources/application-test.yml`
- Create: `translate/PromptProfileStore.java`, `translate/UnknownProfileException.java`, `translate/PromptProfileController.java`, `translate/PromptProfilesDto.java`, `src/main/resources/prompts/_example.md`
- Modify: `web/ApiExceptionHandler.java`
- Test: `translate/PromptProfileStoreTest.java`, `translate/PromptProfileControllerTest.java`, `SubtitleStudioApplicationTests.java`

**Interfaces:**
- Produces: `SubtitleStudioProperties` thêm `@Valid @NotNull Gemini gemini` với `record Gemini(String apiKey, @NotBlank String model, @NotNull Duration timeout, @NotNull Duration maxDuration, double temperature) { boolean configured() }` và `Path promptsDir()` = `dataDir/prompts`. `PromptProfileStore`: `List<String> list()`, `String read(String name)` (ném `UnknownProfileException`), `void installExampleIfMissing()`. `PromptProfilesDto(boolean configured, List<String> profiles)`.
- `application.yml`: `subtitle-studio.gemini: { api-key: ${GEMINI_API_KEY:}, model: gemini-3.8-flash, timeout: 3m, max-duration: 60m, temperature: 0.3 }`. Test profile: `api-key: test-key` (để `configured()` true trong test; không phải key thật).

- [ ] **Step 1: Test thất bại**
  - `PromptProfileStoreTest` (`@TempDir`): `listsValidProfilesSortedCaseInsensitive` (`b.md`, `A.md` → `[A, b]`); `skipsUnderscoreInvalidNamesAndNonMarkdown` (`_example.md`, `bad name.md`, `x.txt`, `` `${"a".repeat(41)}`.md``); `missingDirectoryListsNothing`; `readReturnsUtf8Content` (có tiếng Việt và Thái); `readRejectsTraversalAndUnknown` (`../x`, `nope` → `UnknownProfileException`); `readRejectsOversizedOrNonUtf8File` (20 KB + 1 byte; bytes `0xC3 0x28`) → `UnknownProfileException`; `listHidesOversizedOrNonUtf8File`; `installsExampleOnlyWhenDirectoryMissing`.
  - `PromptProfileControllerTest` (`@WebMvcTest`): `GET /api/prompt-profiles` → `{"configured":true,"profiles":["EmiBonnie"]}`; với `configured=false` → `"configured":false`.
  - `SubtitleStudioApplicationTests.bindsGeminiDefaults`: `timeout` 3m, `maxDuration` 60m, `temperature` 0.3.

- [ ] **Step 2: Chạy** → FAIL.

- [ ] **Step 3: Cài đặt.** `_example.md` có 5 mục (Bối cảnh, Nhân vật, Xưng hô, Tên riêng và thuật ngữ, Văn phong) bằng tiếng Việt, mỗi mục 1–2 dòng ví dụ. `installExampleIfMissing` gọi khi `ApplicationReadyEvent`, copy `classpath:prompts/_example.md`. `ApiExceptionHandler`: `UnknownProfileException` → 400 `UNKNOWN_PROFILE`.
  Ruling ghi sẵn: spec nói file mẫu ở "gốc repo"; đặt ở `src/main/resources/prompts/` để có trong jar/Docker — cùng ý đồ.

- [ ] **Step 4: Chạy** `mvn -q test -Dskip.npm` → BUILD SUCCESS.

- [ ] **Step 5: Commit** — `git commit -m "Add Gemini settings and prompt profiles (GET /api/prompt-profiles)"`

---

### Task 4: `GeminiTranslator` — request, kiểm tra đầu ra, map lỗi

**Files:**
- Modify: `pom.xml` (`com.google.genai:google-genai:1.78.0`)
- Create: `translate/GeminiTranslator.java`, `translate/GeminiTranslatorImpl.java`, `translate/SourceLine.java`, `translate/TranslatedLine.java`, `translate/VideoContext.java`, `translate/TranslationFailedException.java`, `translate/TranslationOutput.java`
- Test: `translate/TranslationOutputTest.java`, `translate/GeminiTranslatorImplTest.java`, `translate/FakeGeminiServer.java`

**Interfaces:**
- Produces: `record SourceLine(int id, String text)`, `record TranslatedLine(int id, String text)`, `record VideoContext(String title, String channel)`; `interface GeminiTranslator { List<TranslatedLine> translate(VideoContext video, String profile, List<SourceLine> lines); }`; `class TranslationFailedException extends RuntimeException { String userMessage() }`; `static List<TranslatedLine> TranslationOutput.validate(List<SourceLine> sent, List<TranslatedLine> got)` — trả theo thứ tự `id` của `sent`, text đã `strip()` và `\r\n`/`\r` → `\n`; sai thì ném với thông điệp `"Gemini trả về thiếu/lệch câu (" + valid + "/" + sent.size() + " câu hợp lệ), thử dịch lại."` (`valid` = số `id` của `sent` có đúng một phần tử với text không rỗng).
- `GeminiTranslatorImpl(SubtitleStudioProperties, ObjectMapper)` + constructor package-private nhận `String baseUrl` cho test. System instruction là hằng `SYSTEM_RULES` (nội dung spec mục 3, tiếng Việt). Nội dung gửi: phần hồ sơ, rồi JSON `{"title":…, "channel":…, "lines":[{"id":…,"text":…}]}`. Config: `responseMimeType("application/json")`, `responseSchema` mảng object `{id: INTEGER, text: STRING}` required cả hai, `temperature`, timeout từ cấu hình.

- [ ] **Step 1: Test thất bại**
  - `TranslationOutputTest`: `acceptsExactIdsInSentOrder` (got đảo thứ tự); `keepsDialogueDashesAndNewlines`; `normalisesLineBreaksAndSpaces` (`"  Xin chào\r\n- Chào  "` → `"Xin chào\n- Chào"`); `rejectsMissingExtraDuplicateOrBlank` (4 trường hợp, mỗi cái kiểm tra thông điệp có đúng `x/y`).
  - `FakeGeminiServer` (JDK `com.sun.net.httpserver.HttpServer`, cổng 0): ghi lại body request; trả JSON cấu hình được, mã HTTP cấu hình được, độ trễ cấu hình được.
  - `GeminiTranslatorImplTest`: `sendsRulesProfileSchemaAndLines` (body có system instruction chứa "mỗi id", hồ sơ nguyên văn, `responseMimeType`, schema, model trong path, `temperature` 0.3, `lines` đúng thứ tự); `parsesStructuredOutput`; `quota429Fails` → `"Hết lượt miễn phí của Gemini, thử lại sau."`; `badKey401And403Fail` → `"GEMINI_API_KEY không hợp lệ."`; `timeoutFails` (độ trễ > timeout đặt 1s trong test) → `"Gemini không phản hồi kịp."`; `safetyBlockFails` (`finishReason` `SAFETY`, không có text) → `"Gemini từ chối dịch nội dung này."`; `fencedOrInvalidJsonFails` (text ```` ```json[...]``` ```` và `"xin lỗi"`) → thông điệp thiếu/lệch câu; `otherErrorsNeverLeakKey` (500 → message bắt đầu `"Không dịch được: "` và không chứa `test-key`).

- [ ] **Step 2: Chạy** → FAIL.

- [ ] **Step 3: Cài đặt** bằng SDK: `Client.builder().apiKey(..).httpOptions(HttpOptions.builder().baseUrl(..).timeout(ms).build())`, `client.models.generateContent(model, contents, config)`. Map lỗi: `ClientException`/`ServerException` theo `code()`; timeout theo exception gây ra bởi hết thời gian; block khi `finishReason` khác `STOP` hoặc không có text; parse JSON bằng `ObjectMapper` thành `List<TranslatedLine>` rồi `TranslationOutput.validate`. Nếu SDK 1.78.0 không cho đặt `baseUrl`/timeout như trên: ghi Ruling, bọc lời gọi sau interface hẹp `GeminiCall { String generate(String system, String user) }` và test phần dựng request/parse qua interface đó (spec mục 10).

- [ ] **Step 4: Chạy** `mvn -q test -Dskip.npm` → BUILD SUCCESS.

- [ ] **Step 5: Commit** — `git commit -m "Gemini translator: structured output, id checks, error mapping"`

---

### Task 5: `TranslationService` — điều kiện, chạy nền, lưu kết quả

**Files:**
- Create: `translate/TranslationService.java`, `translate/SkipReason.java`, `translate/TranslationConfig.java` (bean executor), các exception `GeminiNotConfiguredException`, `VideoTooLongException`, `VietsubManualException`, `TranslationInProgressException`
- Modify: `video/VideoRepository.java`, `video/VietsubService.java`, `web/ApiExceptionHandler.java`
- Test: `translate/TranslationServiceTest.java`

**Interfaces:**
- Consumes: `PromptProfileStore.read`, `GeminiTranslator.translate`, `CueRepository.findByVideo_IdOrderByIdxAsc`, `SubtitleFileStore.writeViAuto`, `SrtWriter.toBytes`.
- Produces:
  - `enum SkipReason { GEMINI_NOT_CONFIGURED, VIDEO_TOO_LONG, VIETSUB_MANUAL, VIETSUB_EXISTS, TRANSLATION_IN_PROGRESS }`
  - `TranslationService`: `SkipReason startFromFetch(String videoId, String profile)` (null = đã bắt đầu; hồ sơ đã được kiểm tra trước ở controller); `void retranslate(String videoId, String profile)` (ném exception theo bảng spec mục 6); `@EventListener(ApplicationReadyEvent) void markInterrupted()`.
  - `VideoRepository`: `@Modifying(clearAutomatically = true) @Query int markTranslating(String id, String profile)` (đúng câu UPDATE spec mục 6); `@Modifying int markFailed(String id, String message)`; `@Modifying int failAllTranslating(String message)`; `@Lock(PESSIMISTIC_WRITE) @Query("select v from Video v where v.id = :id") Optional<Video> findForUpdate(String id)`.
  - `VietsubService.saveAuto(String id, List<ViCue> cues, String profile): boolean` — transaction + `findForUpdate`; video mất → `false`; `MANUAL` → đặt `translation_status` null, `false`; còn lại thay `vi_cue`, `updateVietsub(n, now, AUTO)`, `translation_status` null, `translation_profile` = profile, `true`; ghi `vi_auto.srt` sau commit.
  - Bean `@Qualifier("translationExecutor") Executor` = `Executors.newVirtualThreadPerTaskExecutor()`; test thay bằng `Runnable::run`.

- [ ] **Step 1: Test thất bại** (`@DataJpaTest` + `Replace.NONE` + `@Import` các bean thật, `GeminiTranslator` giả, executor đồng bộ, `Clock` cố định):
  - `startsAndSavesAutoVietsub`: cue `idx` 0..2 → `vi_cue` 3 dòng với timecode cue gốc, `viSource=AUTO`, `translationStatus` null, `translationProfile="EmiBonnie"`, file `vi_auto.srt` có 3 block.
  - Một test cho mỗi dòng bảng điều kiện spec mục 6, cả hai lối vào: `notConfigured…`, `tooLong…` (3601 s), `manual…`, `inProgress…`, `autoExistsSkipsFromFetch` / `autoExistsRetranslates`; translator giả **không** được gọi khi bị bỏ qua.
  - `unknownDurationIsAllowed` (`durationSec` null → dịch).
  - `doubleStartCreatesOneRun` (executor giữ việc lại, gọi `startFromFetch` hai lần → lần hai `TRANSLATION_IN_PROGRESS`, translator gọi 1 lần).
  - `manualUploadDuringTranslationWins` (translator giả gọi `vietsubService.add(...)` trước khi trả) → Vietsub là bản tay, `viSource=MANUAL`, `translationStatus` null.
  - `videoDeletedDuringTranslationIsIgnored`.
  - `failureMarksFailedWithMessage` (translator ném `TranslationFailedException("Hết lượt…")`) → `FAILED`, `translationError` đúng chuỗi; `unexpectedErrorMarksFailedGeneric` (RuntimeException) → bắt đầu `"Không dịch được: "`, ≤ 500 ký tự.
  - `retryAfterFailureClearsError` (FAILED → retranslate → `translationError` null khi bắt đầu).
  - `markInterruptedFailsRunning` → `"Bị gián đoạn do app khởi động lại, hãy dịch lại."`.

- [ ] **Step 2: Chạy** → FAIL.

- [ ] **Step 3: Cài đặt.** Thứ tự điều kiện đúng bảng spec. Lượt nền bọc toàn bộ trong try/catch: `TranslationFailedException` → `markFailed(id, userMessage)`; lỗi khác → `markFailed(id, ("Không dịch được: " + tóm tắt).substring(0, ≤500))`, log WARN không kèm key. `ApiExceptionHandler`: 4 exception mới → mã/HTTP trong Global Constraints.

- [ ] **Step 4: Chạy** `mvn -q test -Dskip.npm` → BUILD SUCCESS.

- [ ] **Step 5: Commit** — `git commit -m "Translation service: guarded start, background run, AUTO never replaces MANUAL"`

---

### Task 6: API dịch — `profile` khi Lấy Engsub, `POST /translate`

**Files:**
- Modify: `video/FetchRequest.java` (`record FetchRequest(String url, String profile)`), `video/VideoController.java`
- Create: `video/FetchResponse.java`, `translate/TranslateRequest.java`
- Test: `video/VideoControllerTest.java`, `translate/TranslateEndpointTest.java` (hoặc trong `VideoControllerTest`)

**Interfaces:**
- Consumes: `PromptProfileStore.read`, `TranslationService.startFromFetch/retranslate`, `SubtitleService.fetch/get`.
- Produces: `record FetchResponse(@JsonUnwrapped VideoDto video, SkipReason skipReason)` — JSON phẳng như `VideoDto` + `"skipReason"`; `POST /api/videos/{id}/translate` body `record TranslateRequest(String profile)` → 202 + `VideoDto` (đã nạp lại sau khi bắt đầu, `translationStatus=TRANSLATING`).

- [ ] **Step 1: Test thất bại** (`@WebMvcTest`, mock service):
  - `fetchWithoutProfileKeepsOldShape` (không gọi translation; `skipReason` null).
  - `fetchWithProfileStartsTranslation` (gọi `read` **trước** `fetch`; phản hồi có `translationStatus":"TRANSLATING"`).
  - `fetchWithUnknownProfileIs400BeforeYtDlp` (`fetch` không được gọi; `code=UNKNOWN_PROFILE`).
  - `fetchReportsSkipReason` (`VIETSUB_MANUAL`).
  - `translateStarts202`; `translateWithBrokenProfileIs400`; `translateManualIs409`; `translateInProgressIs409`; `translateTooLongIs422`; `translateNotConfiguredIs503`; `translateUnknownVideoIs404`.
  - Giữ nguyên các test hiện có của `POST /api/videos` (201/200, `Location`).

- [ ] **Step 2: Chạy** → FAIL.

- [ ] **Step 3: Cài đặt** trong `VideoController` (profile rỗng/blank coi như không có).

- [ ] **Step 4: Chạy** `mvn -q test -Dskip.npm` → BUILD SUCCESS.

- [ ] **Step 5: Commit** — `git commit -m "API: translate on fetch with a profile, POST /api/videos/{id}/translate"`

---

### Task 7: Frontend — client, dropdown hồ sơ

**Files:**
- Modify: `frontend/src/api/client.ts`, `frontend/src/lib/errors.ts`, `frontend/src/components/UrlForm.tsx`, `frontend/src/pages/HomePage.tsx`, `frontend/src/styles.css`
- Test: `frontend/src/pages/HomePage.test.tsx`, `frontend/src/lib/errors.test.ts`

**Interfaces:**
- Produces (`client.ts`): `type ViSource = 'MANUAL' | 'AUTO'`, `type TranslationStatus = 'TRANSLATING' | 'FAILED'`, `type SkipReason = 'GEMINI_NOT_CONFIGURED' | 'VIDEO_TOO_LONG' | 'VIETSUB_MANUAL' | 'VIETSUB_EXISTS' | 'TRANSLATION_IN_PROGRESS'`; `VideoDto` thêm `viSource: ViSource | null`, `translationStatus: TranslationStatus | null`, `translationError: string | null`, `translationProfile: string | null`; `fetchVideo(url: string, profile?: string): Promise<{ video: VideoDto; created: boolean; skipReason: SkipReason | null }>`; `getPromptProfiles(): Promise<{ configured: boolean; profiles: string[] }>`; `translateVideo(id: string, profile: string): Promise<VideoDto>`.
- `UrlForm` props thêm `profiles: string[]`, `configured: boolean`, `profile: string`, `onProfileChange: (p: string) => void`. Select có label ẩn "Hồ sơ dịch", option `value=""` "— Không dịch —". `localStorage` key `subtitle-studio.profile` (try/catch; giá trị không còn trong danh sách → `""`).

- [ ] **Step 1: Test thất bại**: `listsProfilesWithNoTranslationDefault`; `disablesProfilesWhenGeminiNotConfigured` (select disabled, `title` "Chưa cấu hình GEMINI_API_KEY"); `sendsChosenProfileWithFetch` (body `{"url":…,"profile":"EmiBonnie"}`); `omitsProfileWhenNoTranslation`; `remembersLastProfile` (đổi select → reload render → vẫn chọn); `forgetsProfileThatNoLongerExists`; `errors.test`: thông điệp tiếng Việt cho 5 mã mới.

- [ ] **Step 2: Chạy** `npx vitest run` → FAIL.

- [ ] **Step 3: Cài đặt**; style select trong khung tối khớp `.frame__input`; màn hẹp xếp dọc như input/nút.

- [ ] **Step 4: Chạy** `npx vitest run` + `npx tsc --noEmit` → pass.

- [ ] **Step 5: Commit** — `git commit -m "Frontend: prompt profile dropdown on Lấy Engsub"`

---

### Task 8: Frontend — dòng trạng thái Vietsub, polling, nhãn nguồn

**Files:**
- Create: `frontend/src/components/VietsubStatus.tsx`, `frontend/src/lib/useTranslationPolling.ts`
- Modify: `frontend/src/components/ResultPanel.tsx`, `frontend/src/components/VideoList.tsx`, `frontend/src/components/VietsubList.tsx`, `frontend/src/pages/HomePage.tsx`
- Test: `frontend/src/pages/HomePage.test.tsx`, `frontend/src/pages/VietsubPage.test.tsx`

**Interfaces:**
- Consumes: Task 7 client.
- Produces: `VietsubStatus({ video, profile, skipReason, onTranslate })` render đúng bảng "Dòng Vietsub" spec mục 7; `useTranslationPolling(ids: string[], onUpdate: (v: VideoDto) => void, onGone: (id: string) => void)` — `setInterval` 3000 ms gọi `getVideo` cho từng id, dừng khi mảng rỗng; 404 → `onGone`.

- [ ] **Step 1: Test thất bại** (fake timers cho polling):
  - `showsTranslatingWhileRunning` ("Đang dịch bằng Gemini (EmiBonnie)…").
  - `pollsEvery3sAndShowsAutoWhenDone` (2 lần poll: TRANSLATING → AUTO; hiện "Vietsub: Gemini · EmiBonnie", link Xem Vietsub `/vietsub/:id`, Tải .vi.srt; sau đó không gọi thêm `GET`).
  - `showsManualWithoutRetranslate` (+ chú thích xoá ở trang Vietsub).
  - `showsFailureWithRetry` (`role="alert"` chứa `translationError`; bấm Dịch lại → `POST /translate` với hồ sơ đang chọn).
  - `confirmsBeforeRetranslatingAuto` (`window.confirm` false → không POST).
  - `retranslateDisabledWithoutProfile`.
  - `showsTooLongReasonInsteadOfButton` (`skipReason` `VIDEO_TOO_LONG`).
  - `historyShowsTranslatingAndFailed` (" · Đang dịch…", " · Lỗi dịch").
  - `stopsPollingWhenVideoDisappears` (poll trả 404 → video biến khỏi danh sách, không còn gọi `GET`, không có `alert`).
  - `VietsubPage`: `managementShowsSource` (`7 câu · Gemini (EmiBonnie)`, `5 câu · Tự upload`).

- [ ] **Step 2: Chạy** → FAIL.

- [ ] **Step 3: Cài đặt**; icon `Languages`, `Loader2` (xoay bằng class có sẵn `button--spinning` hoặc tương đương); nút chỉ icon có `aria-label` + `title`.

- [ ] **Step 4: Chạy** `npx vitest run` + `npx tsc --noEmit` → pass.

- [ ] **Step 5: Commit** — `git commit -m "Frontend: Vietsub status line, 3s polling, source labels"`

---

### Task 9: Compose, tài liệu, kiểm tra tay với Gemini thật (cùng người dùng)

**Files:**
- Modify: `docker-compose.yml` (`GEMINI_API_KEY: ${GEMINI_API_KEY:-}` cho app), `.env.example` (thêm `GEMINI_API_KEY=`), `README.md`, `CLAUDE.md`, `PROGRESS.md`

- [ ] **Step 1: Docs** — README: lấy key ở Google AI Studio, đặt trong `.env`, lưu ý free tier (dữ liệu có thể được Google dùng; giới hạn xem trong AI Studio), cách viết hồ sơ trong `./data/prompts/` (trỏ tới `_example.md`). CLAUDE.md: 3 quy tắc ở Global Constraints dòng 1 + hồ sơ không commit. PROGRESS.md: nhật ký Phase 4, Backlog thêm "hồ sơ dịch lưu trong Oracle + sửa trên web (phase cải tiến)", "video > 60 phút: chia đợt dịch".

- [ ] **Step 2: Toàn bộ test** — `mvn -q test -Dskip.npm`, `npx vitest run`, và (nếu Docker ổn) `mvn verify -Poracle -Dskip.npm`. Expected: tất cả pass.

- [ ] **Step 3: Người dùng** đặt `GEMINI_API_KEY` vào `.env` và viết `./data/prompts/EmiBonnie.md` (executor hỏi và chờ; không tự tạo key).

- [ ] **Step 4: Deploy** (khi người dùng đồng ý) — `docker compose up -d --build`; chờ healthy; `GET /api/prompt-profiles` → `configured:true`, có `EmiBonnie`. Nếu model `gemini-3.8-flash` không tồn tại (lỗi 404 từ Gemini ở bước sau): ghi Ruling, đổi `subtitle-studio.gemini.model` sang tên Flash có free tier hiện hành, lặp lại.

- [ ] **Step 5: Kiểm tra tay** trên một video thật < 60 phút chưa có Vietsub, chọn `EmiBonnie`: trạng thái "Đang dịch…" → AUTO; số câu Vietsub = số câu Engsub; file `vi_auto.srt` trong `./data/subs/`; người dùng xem ở màn hình xem và đánh giá xưng hô. Thử dán trùng link → không gọi Gemini lần nữa (log không có request mới). Thử video có Vietsub MANUAL → `skipReason` `VIETSUB_MANUAL`.

- [ ] **Step 6: Commit + push** (khi người dùng đồng ý) — `git commit -m "Docs: Gemini translation (Phase 4)"`, `git push origin main`.
