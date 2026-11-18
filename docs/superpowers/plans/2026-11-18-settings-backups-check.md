# Settings (Gemini + Backups) and Chapter Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship three things on one branch: (1) Gemini settings editable in the app, (2) backups run by the app (Oracle
Data Pump dump plus a zip of `./data`, manual and daily), and (3) a client-side Check of the chapter text against
`## Kiểm tra` rules in the novel profile.

**Architecture:**
- Gemini overrides live in a key–value table and are merged over the `application.yml` record by a `GeminiSettings`
  bean. Every Gemini consumer reads `current()` at the point of use.
- Backups run in a single-run `BackupService`. It calls `DBMS_DATAPUMP` over JDBC into an Oracle directory that is
  bind-mounted to `./data/backups`, and zips `./data` in Java.
- The Check is a pure-TS parser and matcher, plus an overlay and a popover in the chapter editor.

**Tech Stack:** Spring Boot 3 / Java 21 / JPA + Flyway (Oracle 23ai, H2 dev/test), google-genai SDK,
React + Vite + TS, Radix, Vitest.

**Specs:**
- `docs/superpowers/specs/2026-11-18-settings-gemini-backups-design.md`
- `docs/superpowers/specs/2026-11-18-chapter-check-rules-design.md`

**Branch:** `feat/settings-backups-check` (one branch, one PR, as the user asked).

## Global Constraints

- Colors: orange `#F39A42` (`--brand`) for primary actions only, purple `#D9A1D9` (`--brand-2`) for selected/info,
  text on them `#1B2430`, red only for errors/delete. The Check uses no orange and no red.
- Screens follow `docs/ui/screen-layout.md`. Settings is level 1 (no breadcrumbs), H1 "Settings", `tabs__list`
  tabs, width `default`.
- Admin UI labels are English. Vietnamese text appears only in the profile/template content.
- API errors use `ProblemDetails.problem(status, CODE, detail)` in a `*Errors` advice in `web/`, like
  `TranslationErrors`.
- The Gemini API key is never stored, returned or logged by the settings API.
- New tables use the `T_` prefix, and `PersistenceOracleIT.onlyFlywayCreatesTables` must list them.
- DB dump naming stays `ss-YYYYMMDD-HHmmss.dmp/.log` (compatible with `scripts/restore-db.ps1`). Data zip is
  `data-YYYYMMDD-HHmmss.zip`. Keep 14 dumps and 7 zips.
- Daily backup cron: `subtitle-studio.backup.cron`, default `0 0 12 * * *`, zone `Asia/Ho_Chi_Minh`, blank = off.
- No Gemini/LLM call in the Check.
- Before reporting a task done: full `mvn test -Dskip.npm` and `cd frontend && npm test`. DB tasks also run
  `mvn verify -Poracle -Dskip.npm`.

## Review Focus

1. **A setting changed in the middle of a fallback loop.** One request must use one snapshot from start to end, and
   must not switch models halfway because Save happened. Test: in Task 3, `GeminiCallerTest.usesOneSnapshotPerCall`.
2. **The dump/zip retention deletes the wrong files.** Only `ss-*.dmp/.log` and `data-*.zip` are pruned, never
   `backup.log`, `.part` files of a running zip, or user files in `data/backups`. Test: in Task 6,
   `DataZipperTest.retentionTouchesOnlyOwnFiles`.
3. **Pasting/typing makes Check underlines drift.** Matches must be recomputed from the current text on every edit,
   and an applied suggestion must not shift other issues' offsets wrongly. Test: in Task 11,
   `findIssues re-run after apply gives correct offsets`.
4. **Vietnamese whole-word edges.** "cô" must not match inside "cố", "côn" or "Cô-ca". It must match next to
   punctuation and quotes (`“cô”`, `cô,`). Test: in Task 11, `findIssues word boundaries`.
5. **Backup now pressed twice, or the daily cron firing during a manual run.** There must be no second concurrent
   run, and the 409 must say a run is going. Test: in Task 8, `BackupServiceTest.secondRunIsRejectedWhileRunning`.

---

## Part A — Gemini settings

### Task 1: `t_app_setting` table

**Files:**
- Create: `src/main/resources/db/migration/V28__app_setting.sql`
- Create: `src/main/java/com/subtitlestudio/config/AppSetting.java` (entity),
  `src/main/java/com/subtitlestudio/config/AppSettingRepository.java`
- Modify: `src/test/java/com/subtitlestudio/oracle/PersistenceOracleIT.java` (table list)
- Test: `src/test/java/com/subtitlestudio/config/AppSettingRepositoryTest.java`

**Interfaces:**
- Produces: `AppSetting(String key, String value, Instant updatedAt)`, which maps to
  `t_app_setting(setting_key VARCHAR2(100) PK, setting_value VARCHAR2(4000) NOT NULL, updated_at TIMESTAMP NOT NULL)`.
  `AppSettingRepository extends JpaRepository<AppSetting, String>` with
  `List<AppSetting> findByKeyStartingWith(String prefix)`.

- [ ] **Step 1:** Test `savesAndFindsByPrefix`: save `gemini.model=x` and `other.k=y`.
  `findByKeyStartingWith("gemini.")` returns only the first.
- [ ] **Step 2:** Run `mvn test -Dskip.npm -Dtest=AppSettingRepositoryTest`. Expected: FAIL (no class).
- [ ] **Step 3:** Write the migration (use the `${bigint}`-style placeholders only if needed; plain VARCHAR2/TIMESTAMP
  work in both), the entity and the repo. Add `T_APP_SETTING` to the Oracle IT list.
- [ ] **Step 4:** Run `mvn test -Dskip.npm` and `mvn verify -Poracle -Dskip.npm`. Expected: PASS.
- [ ] **Step 5:** Commit `feat: add t_app_setting table`.

### Task 2: `GeminiSettings` bean

**Files:**
- Create: `src/main/java/com/subtitlestudio/config/GeminiSettings.java`
- Test: `src/test/java/com/subtitlestudio/config/GeminiSettingsTest.java`

**Interfaces:**
- Consumes: `SubtitleStudioProperties.Gemini` (the canonical constructor validates the thinking level and the
  cooldown) and `AppSettingRepository`.
- Produces:
  - `SubtitleStudioProperties.Gemini current()` returns the in-memory snapshot (volatile). It is built at startup
    and after each save. The API key always comes from yml.
  - `SubtitleStudioProperties.Gemini defaults()` returns the yml record.
  - `Set<String> overridden()` returns the keys among `MODEL="gemini.model"`, `FALLBACKS="gemini.fallback-models"`,
    `THINKING="gemini.thinking-level"`, `TEMPERATURE="gemini.temperature"`, `TIMEOUT="gemini.timeout"` and
    `COOLDOWN="gemini.overload-cooldown"`.
  - `@Transactional Gemini save(Form form)`, where `record Form(String model, List<String> fallbackModels,
    String thinkingLevel, Double temperature, Duration timeout, Duration overloadCooldown)`. A null, blank or
    equal-to-default field deletes the override. All writes happen in one transaction, and the snapshot is swapped
    only after commit.
  - `static GeminiSettings fixed(SubtitleStudioProperties.Gemini g)` is a test/helper instance whose `current()`
    is always `g`.
  - `InvalidSettingException(String field, String message)` (RuntimeException).

- [ ] **Step 1:** Tests:
  - `noOverridesGivesDefaults`
  - `overrideMergesOverDefaults`: model and fallbacks overridden, temperature unchanged.
  - `valueEqualToDefaultDeletesRow`
  - `blankDeletesRow`
  - `rejectsFallbackContainingMainModel`: `InvalidSettingException` with field `fallbackModels`.
  - `rejectsDuplicateFallbacks`
  - `rejectsMoreThanFiveFallbacks`
  - `rejectsTemperatureOutside0to2`
  - `rejectsTimeoutOutside10sTo10m`
  - `rejectsCooldownOver60m`
  - `rejectsUnknownThinkingLevel`
  - `failedSaveChangesNothing`: one bad field means no rows are written and `current()` is unchanged.
  - `apiKeyAlwaysFromYml`
- [ ] **Step 2:** Run `-Dtest=GeminiSettingsTest`. Expected: FAIL.
- [ ] **Step 3:** Implement. Store the fallbacks comma-separated, and Durations as ISO-8601 (`Duration.toString()`).
  Validate by building the merged record (reusing the record's own checks) plus the extra rules above.
- [ ] **Step 4:** Run `-Dtest=GeminiSettingsTest`. Expected: PASS.
- [ ] **Step 5:** Commit `feat: GeminiSettings merges DB overrides over yml`.

### Task 3: Gemini consumers read `GeminiSettings.current()`

**Files (modify):** every main class found by `grep -rn "\.gemini()" src/main/java`. Known list:
- `translate/GeminiCaller`, `GeminiTranslatorImpl`, `ProfileAnalyzer`, `GeminiQuotaController`,
  `PromptProfileController`
- `novel/GeminiChapterTranslator`, `GeminiTextChapterTranslator`, `NovelProfileAnalyzer`,
  `ChapterTranslationService`, `ChapterService`, `NovelService`, `NovelProfileController`
- `playlist/PlaylistService`

Test files: the existing tests that build these classes (about 24 `new X(...)` sites) switch to
`GeminiSettings.fixed(gemini)`.

**Interfaces:**
- Consumes: `GeminiSettings.current()` and `GeminiSettings.fixed(...)` (Task 2).
- Produces:
  - Constructors take `GeminiSettings` where they took `SubtitleStudioProperties.Gemini`.
  - `GeminiCaller.modelOrder(Gemini)` stays static.
  - Inside a method, read `var g = settings.current();` once at the start and use `g` for the whole call,
    including the fallback loop.
  - `mainModel` fields become a read of `settings.current().model()` at use.

- [ ] **Step 1:** Test `GeminiCallerTest.usesOneSnapshotPerCall`. A `GeminiSettings` stub returns snapshot A on the
  first `current()` and B afterwards. A call that falls back from model 1 to model 2 must only try A's models.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Refactor all consumers. Keep the behavior identical when nothing is overridden.
- [ ] **Step 4:** Run `mvn test -Dskip.npm` (full suite, including `SubtitleStudioApplicationTests`). Expected:
  PASS.
- [ ] **Step 5:** Commit `refactor: Gemini consumers read live settings`.

### Task 4: Settings API

**Files:**
- Create: `src/main/java/com/subtitlestudio/config/GeminiSettingsController.java`,
  `src/main/java/com/subtitlestudio/translate/GeminiModelLister.java`,
  `src/main/java/com/subtitlestudio/web/SettingsErrors.java`
- Test: `src/test/java/com/subtitlestudio/config/GeminiSettingsControllerTest.java`,
  `src/test/java/com/subtitlestudio/translate/GeminiModelListerTest.java`

**Interfaces:**
- `GET /api/settings/gemini` and `PUT /api/settings/gemini` (body = `GeminiSettings.Form` as JSON; durations as
  seconds in JSON: `timeoutSeconds`, `overloadCooldownMinutes`). Both return
  `SettingsDto(Values effective, Values defaults, List<String> overridden, boolean configured)`, where
  `Values(String model, List<String> fallbackModels, String thinkingLevel, double temperature, long timeoutSeconds,
  long overloadCooldownMinutes)`. There is no apiKey field.
- `GET /api/settings/gemini/models` returns `List<String>` via `GeminiModelLister.list()`:
  - The SDK's `client.models.list(...)` keeps names starting with `gemini-` (with the `models/` prefix stripped)
    whose supported actions include `generateContent`, sorted.
  - Results are cached for 1 h.
  - Any exception or a missing key gives `List.of()` and a WARN log without the key.
- `InvalidSettingException` returns 400 code `INVALID_SETTING`, detail = message, plus property `field`.

- [ ] **Step 1:** Controller tests:
  - `getReturnsEffectiveDefaultsOverridden`
  - `putSavesAndReturns`
  - `putInvalidReturns400WithField`
  - `responseNeverContainsApiKey`: assert the JSON body does not contain the test key string.

  Lister tests, with the SDK call behind a small seam (`Supplier<List<Model>>`):
  - `filtersAndSorts`
  - `failureGivesEmpty`
  - `cachesForOneHour`
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `mvn test -Dskip.npm`. Expected: PASS.
- [ ] **Step 5:** Commit `feat: Gemini settings API and model list`.

## Part B — Backups

### Task 5: Spike — Oracle writes into the bind-mounted `./data/backups`

**Files:**
- Modify: `docker-compose.yml`. The oracle service gets the volumes `./data/backups:/opt/oracle/backups` and
  `./docker/oracle-startdb:/container-entrypoint-startdb.d:ro`.
- Create: `docker/oracle-startdb/10-backup-dir.sql`. It switches to `FREEPDB1`
  (`ALTER SESSION SET CONTAINER=FREEPDB1;`), then runs
  `CREATE OR REPLACE DIRECTORY SS_BACKUP_DIR AS '/opt/oracle/backups';` and
  `GRANT READ, WRITE ON DIRECTORY SS_BACKUP_DIR TO SUBTITLE_STUDIO;`. Add any Data Pump grant the app user turns
  out to need.

- [ ] **Step 1:** Back up first: `powershell -File scripts/backup-db.ps1`. Expected: exit 0 and a new `ss-*.dmp`.
- [ ] **Step 2:** Run `docker compose up -d oracle` (it recreates the container, keeps the volume) and wait until
  healthy. Check that `docker compose logs oracle` shows the startdb script ran without ORA- errors.
- [ ] **Step 3:** As `SUBTITLE_STUDIO`, run a minimal `DBMS_DATAPUMP` schema export to
  `SS_BACKUP_DIR` with sqlplus inside the container. Expected: `data/backups/spike.dmp` exists on the host with a
  size above 0 and is readable. Delete it afterwards.
- [ ] **Step 4:** If Step 3 fails on permissions, STOP and report to the controller with the error. Do not switch
  to the named-volume fallback without the user being told (spec: "builder's call; tell the user").
- [ ] **Step 5:** Commit `chore: Oracle backup directory mounted to data/backups` and record the spike result in
  the commit body.

### Task 6: `DataZipper`

**Files:**
- Create: `src/main/java/com/subtitlestudio/backup/DataZipper.java`
- Test: `src/test/java/com/subtitlestudio/backup/DataZipperTest.java`

**Interfaces:**
- Produces:
  - `Path zip(Path dataDir, Path backupsDir, String name)`, which writes `name + ".zip.part"`, renames it to
    `.zip` and returns the final path.
  - Excludes, relative to `dataDir`: `backups/`, `logs/`, `translate-partial/`, `dev.mv.db`, `dev.trace.db`.
  - `static void prune(Path backupsDir, String globPrefix, String ext, int keep)` deletes the oldest by name. For
    `.dmp` it also deletes the paired `.log`.

- [ ] **Step 1:** Tests (with `@TempDir`):
  - `zipsEverythingExceptExcluded`: entries contain `media/a.jpg`, `prompts/novels/x.md`, `subs/1.vtt`, and none
    of the excluded paths.
  - `writesPartThenRenames`: no `.part` is left behind.
  - `retentionKeepsNewest`: 9 zips → 7.
  - `retentionTouchesOnlyOwnFiles`: `backup.log`, `notes.txt` and `data-…zip.part` survive.
  - `pruneDumpRemovesPairedLog`
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement with `java.util.zip.ZipOutputStream` and `Files.walk`. A file that vanishes mid-walk is
  skipped, not fatal.
- [ ] **Step 4:** Run `mvn test -Dskip.npm`. Expected: PASS.
- [ ] **Step 5:** Commit `feat: zip ./data for backups`.

### Task 7: `DbExporter` (Data Pump over JDBC)

**Files:**
- Create: `src/main/java/com/subtitlestudio/backup/DbExporter.java`
- Test: `src/test/java/com/subtitlestudio/backup/DbExporterOracleIT.java` (only if the Testcontainers Oracle can
  get the directory and grant; otherwise document a manual check in the PR)

**Interfaces:**
- Produces:
  - `boolean supported()`: true only when the JDBC URL is Oracle.
  - `long export(String name)`: runs `DBMS_DATAPUMP.OPEN('EXPORT','SCHEMA')`, adds the file `name.dmp` and the log
    `name.log` in `SS_BACKUP_DIR`, then sets `METADATA_FILTER SCHEMA_EXPR IN ('SUBTITLE_STUDIO')` and
    `FLASHBACK_TIME = 'SYSTIMESTAMP'`, then `START_JOB` and `WAIT_FOR_JOB`. It returns the dump size read from
    `{dataDir}/backups/name.dmp`.
  - `DbExportException(String message)` is thrown on a job state other than COMPLETED, or on an ORA- error (the
    message carries the ORA codes only). Partial files are deleted before throwing.

- [ ] **Step 1:** IT `exportsOwnSchemaIntoBackupDir`, if feasible. Unit test `notSupportedOnH2`.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement as one anonymous PL/SQL block through `JdbcTemplate`/`CallableStatement`.
- [ ] **Step 4:** Run `mvn test -Dskip.npm` and `mvn verify -Poracle -Dskip.npm`. Expected: PASS.
- [ ] **Step 5:** Commit `feat: export the schema with DBMS_DATAPUMP`.

### Task 8: `BackupService`, schedule and API

**Files:**
- Create: `backup/BackupService.java`, `backup/BackupController.java`, `backup/BackupLog.java`,
  `web/BackupErrors.java`
- Modify: `config/SubtitleStudioProperties.java` (add `Backup(String cron)`), `application.yml`
  (`subtitle-studio.backup.cron: "0 0 12 * * *"`), and enable scheduling (`@EnableScheduling` on a config class)
- Test: `backup/BackupServiceTest.java`, `backup/BackupControllerTest.java`, `backup/BackupLogTest.java`

**Interfaces:**
- `BackupService`:
  - `boolean start()` returns false if a run is already going (an `AtomicBoolean`). The run itself happens on a
    virtual thread.
  - The run order:
    1. DB: `exporter.supported()` ? `export(ss-<ts>)` : log `FAILED Database backup needs Oracle`.
    2. Zip: `data-<ts>`.
    3. Prune: 14 dumps, 7 zips.
  - Each part appends a line through `BackupLog`. If the DB part fails, the zip still runs.
  - `Status status()` returns `Status(boolean running, LastRun last, List<Item> items)`, where
    `LastRun(Instant at, boolean ok, String message)` and
    `Item(String name, String kind /* DATABASE|DATA */, long sizeBytes, Instant createdAt)`.
  - The timestamp `<ts>` is `yyyyMMdd-HHmmss` in `Asia/Ho_Chi_Minh`.
- `@Scheduled(cron = "${subtitle-studio.backup.cron:-}", zone = "Asia/Ho_Chi_Minh")` calls `start()`. A blank cron
  is off (use Spring's `"-"` disabled value).
- `BackupLog`:
  - It appends `<ISO offset time> OK <file> <MB with 1 decimal> MB` or `<time> FAILED <reason>` to
    `data/backups/backup.log`, the same format as `backup-db.ps1`.
  - `LastRun last()` parses the last line. Lines written by the script are parsed too.
- API:
  - `GET /api/backups` returns `Status`.
  - `POST /api/backups` returns 202, or 409 `BACKUP_RUNNING` when a run is going.

- [ ] **Step 1:** Tests:
  - `BackupServiceTest`, with a fake exporter and zipper:
    - `runsDbThenZipThenPrunes`
    - `dbFailureStillZipsAndReportsFailed`
    - `secondRunIsRejectedWhileRunning`
    - `h2SkipsDbWithMessage`
    - `listsItemsNewestFirst`
  - `BackupLogTest`:
    - `appendsScriptFormat`
    - `parsesScriptWrittenLines`
  - `BackupControllerTest`:
    - `postReturns202`
    - `postWhileRunningReturns409`
    - `getReturnsStatus`
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `mvn test -Dskip.npm`. Expected: PASS.
- [ ] **Step 5:** Commit `feat: backup service, daily schedule and API`.

## Part C — Settings UI

### Task 9: Settings menu and Gemini tab

**Files:**
- Create: `frontend/src/api/settings.ts`, `frontend/src/pages/SettingsPage.tsx` (tabs Gemini | Backups, routes
  `/settings/gemini`, `/settings/backups`, and `/settings` redirecting to gemini),
  `frontend/src/components/settings/GeminiSettingsForm.tsx`, `frontend/src/components/settings/ModelListEditor.tsx`
- Modify: `frontend/src/App.tsx` (routes, lazy like the others), `frontend/src/components/NavBar.tsx` (a
  `SETTINGS` section, last in `ADMIN_SECTIONS` only)
- Test: `SettingsPage.test.tsx`, `GeminiSettingsForm.test.tsx`, `NavBar.test.tsx` (Settings shows in admin and not
  in public)

**Interfaces:**
- `api/settings.ts`: `getGeminiSettings()`, `saveGeminiSettings(values)`, `getGeminiModels(): Promise<string[]>`.
  The `Values`/`SettingsDto` types mirror Task 4.
- Form:
  - Use the existing `ui/Combobox` for the model, with free text allowed, and `ui/Select` for the thinking level.
  - Each field shows "Default: X" as a hint and a Reset link when it is overridden. Reset sends the default
    value, which deletes the override.
  - `FormActions` has Save (primary) and Cancel.
  - A 400 shows on the field named by `field`.
  - With `configured=false`, a muted Alert says "Translation is off until GEMINI_API_KEY is set."
  - When the model list is empty, a muted note says "Could not load the model list".

- [ ] **Step 1:** Tests:
  - `rendersEffectiveValuesAndDefaults`
  - `reorderAndRemoveFallback`
  - `resetFieldSendsDefault`
  - `freeTextModelAccepted`
  - `showsFieldError`
  - `navShowsSettingsInAdminOnly`
- [ ] **Step 2:** Run `cd frontend && npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `cd frontend && npm test`. Expected: PASS.
- [ ] **Step 5:** Commit `feat: Settings menu with Gemini tab`.

### Task 10: Backups tab

**Files:**
- Create: `frontend/src/api/backups.ts`, `frontend/src/components/settings/BackupsPanel.tsx`
- Test: `BackupsPanel.test.tsx`

**Interfaces:**
- `getBackups()` and `startBackup()`. A 409 shows the toast "A backup is already running".
- **Backup now** is the header action (primary, orange). It shows "Backing up…" and is disabled while `running`.
  The tab polls every 3 s while `running` and stops after.
- The last-run line: time, OK/FAILED and the message. A failure uses the error style.
- The table has the columns Date | Kind | Size | Restore. The Restore cell is a copy button that copies
  `.\scripts\restore-db.ps1 -Dump data\backups\<name>` for DATABASE rows, and `Expand-Archive data\backups\<name>
  -DestinationPath data -Force` for DATA rows.
- Restore help uses the existing `DisclosureSummary`, collapsed. Its text is copied from the spec ("Backups tab"
  section).

- [ ] **Step 1:** Tests:
  - `listsBackupsNewestFirst`
  - `backupNowStartsAndPollsUntilDone`, using fake timers.
  - `conflictShowsToast`
  - `copyRestoreCommandPerKind`
  - `failedLastRunShown`
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `cd frontend && npm test`. Expected: PASS.
- [ ] **Step 5:** Commit `feat: Backups tab`.

## Part D — Chapter Check

### Task 11: Rule parser and matcher, plus the template section

**Files:**
- Create: `frontend/src/lib/checkRules.ts`
- Modify: `src/main/resources/prompts/_novel_template_{th,en,es}.md`. Add this before `## Tóm tắt nội dung chính`:
  ```
  ## Kiểm tra
  - (Thêm dòng dạng "cụm sai" → "gợi ý" | "gợi ý khác" (lý do). Nút Check ở trang chương dùng các dòng này.)

  ```
- Test: `frontend/src/lib/checkRules.test.ts`. Also check `NovelProfileTemplateTest` still passes; add an
  assertion there that the section is present.

**Interfaces:**
- `interface CheckRule { wrong: string; suggestions: string[]; reason: string | null }`
- `parseCheckRules(profile: string): { rules: CheckRule[]; ignored: number }`
  - The section runs from `## Kiểm tra` up to the next `## ` or the end of the file.
  - A rule line is `- "<wrong>" (→|->) <"s1" | "s2" | (tránh dùng) | nothing> [(<reason>)]`. Straight or curly
    quotes are accepted.
  - A non-empty `- ` line that does not parse counts as `ignored`, except a line whose text starts with `(`, which
    is a hint.
- `interface Issue { start: number; end: number; rule: CheckRule }`
- `findIssues(text: string, rules: CheckRule[]): Issue[]`
  - Case-insensitive, NFC on both sides.
  - The boundary chars must not match `/[\p{L}\p{N}]/u`.
  - Lines equal to `[[image:N]]` are skipped.
  - On overlap, the longer `wrong` wins, then the earlier one. The result is sorted by `start`.
- `applySuggestion(text: string, issue: Issue, suggestion: string): string` makes the first letter's case follow
  the matched text.

- [ ] **Step 1:** Tests:
  - Parser: `arrows`, `multiple suggestions`, `flag-only (tránh dùng)`, `reason`, `curly quotes`,
    `hint line not counted`, `bad line counted`, `section bounds`.
  - `findIssues word boundaries` (cases: "cố", "côn", "Cô-ca" no match; `“cô”`, `cô,` match), `case-insensitive`,
    `NFC`, `overlap longer wins`, `markers skipped`.
  - `findIssues re-run after apply gives correct offsets`.
  - `applySuggestion keeps capital`.
- [ ] **Step 2:** Run `cd frontend && npm test -- checkRules`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `cd frontend && npm test` and `mvn test -Dskip.npm -Dtest=NovelProfileTemplateTest`.
  Expected: PASS.
- [ ] **Step 5:** Commit `feat: check rules parser and matcher; templates get ## Kiểm tra`.

### Task 12: Check in the chapter editor

**Files:**
- Create: `frontend/src/components/novel/CheckHighlights.tsx`. Generalize the mirror logic of `FindHighlights` into
  a shared hook, or reuse it; this is the builder's call, but don't duplicate the style list.
  Also create `frontend/src/components/chapter/CheckToggle.tsx` and
  `frontend/src/components/chapter/CheckPopover.tsx` (Radix Popover with a virtual anchor at the span's box from
  the mirror).
- Modify: `frontend/src/components/chapter/ChapterTextEditor.tsx` (the label row gets the toggle on the right) and
  `ChapterPage.css` (wavy underline `text-decoration: underline wavy var(--brand-2)` in the mirror).
- Test: `frontend/src/components/chapter/ChapterCheck.test.tsx`

**Interfaces:**
- Consumes: `parseCheckRules`, `findIssues`, `applySuggestion` (Task 11) and `getNovelProfile(novelId)`
  (`api/novelProfile.ts`; a 404/`NO_NOVEL_PROFILE` means no rules).
- Behavior, as in the spec "UI" section:
  - The toggle reads `Check · N`. When on, it uses the purple selected style.
  - It is disabled with a tooltip "This novel has no profile" or "No rules in ## Kiểm tra". It is also disabled
    when `locked`.
  - Matching re-runs on edit, debounced 150 ms.
  - The profile is refetched each time the toggle is switched on.
  - When the caret is inside an issue, the popover opens. It shows the reason (muted) and the chips.
  - **Double-click** or **Enter** on a chip applies the suggestion; Esc closes the popover.
  - Apply uses `textarea.setRangeText` via `document.execCommand('insertText')` when available, so Ctrl+Z works,
    and falls back to `onTextChange(applySuggestion(...))`.
  - ‹ › moves the caret to the previous or next issue.
  - The summary shows `"{ignored} lines in ## Kiểm tra could not be read"` when `ignored > 0`.

- [ ] **Step 1:** Tests:
  - `toggleShowsCount`
  - `disabledWithoutRules`
  - `caretInIssueOpensPopover`
  - `doubleClickChipApplies`
  - `enterOnChipApplies`
  - `singleClickDoesNotApply`
  - `escCloses`
  - `nextPrevMovesCaret`
  - `ignoredLinesNoticeShown`
  - `disabledWhileLocked`
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `cd frontend && npm test`. Expected: PASS.
- [ ] **Step 5:** Commit `feat: Check button underlines profile rule hits in Chapter text`.

## Part E — Docs and PR

### Task 13: Docs, full verification, PR

**Files:**
- Modify: `README.md` (config table: the `subtitle-studio.backup.cron` row; a note that the Gemini fields can be
  overridden in Settings), `CLAUDE.md` (the backup flow now lives in the app; the `## Kiểm tra` format), and
  `PROGRESS.md` (one entry).

- [ ] **Step 1:** Update the docs.
- [ ] **Step 2:** Run `mvn test -Dskip.npm`, `mvn verify -Poracle -Dskip.npm` and `cd frontend && npm test &&
  npm run build`. Expected: all green, and record the counts.
- [ ] **Step 3:** Commit `docs: settings, backups and check`. Push, then run `gh pr create --base main` with an
  English title and body that covers:
  - a summary
  - the tests run, with their results
  - screenshots of Settings › Gemini, Settings › Backups and the Check popover
  - links to both specs and this plan
  - the spike result
  - the deploy notes from the settings spec (back up first; `docker compose up -d --build`, which recreates oracle;
    press Backup now once; `Unregister-ScheduledTask -TaskName 'SubtitleStudio DB backup' -Confirm:$false`)

  End the body with the Claude Code line. **Do not merge.**
