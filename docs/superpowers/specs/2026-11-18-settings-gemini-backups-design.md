# Settings: Gemini and Backups — design

Date: 2026-11-18. Branch: `feat/settings-gemini-backups`. Size: project (one migration, backend settings layer
touching ~12 Gemini consumers, an Oracle Data Pump job run from the app, a data-folder zip, a scheduler, a new
admin menu with two tabs, a docker-compose change).

## Why

- **Gemini settings.** Adding two fallback models today (PR #54) took a YAML edit, a PR and a full image rebuild.
  The user tunes the model list, the thinking level and the temperature often enough that this should be a form in
  the app that takes effect on the next request.
- **Backups.** Only the Oracle schema is backed up today: `scripts/backup-db.ps1` runs `expdp` at 12:00 daily
  from a Windows scheduled task and keeps 14 dumps in `data/backups`. Nothing in `./data` is backed up, including
  `media/` (85 MB of images), `prompts/` (translation profiles) and `subs/`. The task also only runs while the user is
  logged in, and there is no way to see from the app whether the last backup worked.

## Goals

1. A **Settings** menu in the admin site with two tabs: **Gemini** and **Backups**.
2. **Gemini tab:** edit the main model, the fallback models (ordered), the thinking level, the temperature, the
   timeout and the overload cooldown. The values are saved in the DB and apply to the next Gemini request without a
   restart. Each field can be reset to the `application.yml` default.
3. **Backups tab:** **Backup now** makes a DB dump and a zip of `./data`. The tab lists the existing backups with
   their date, kind and size, shows the result of the last run, and gives the restore commands.
4. The app runs the same backup **daily** by itself, replacing the Windows scheduled task.

## Non-goals

- **Feature 6 (shared character pronouns)** was dropped by the user. It is not part of this work.
- The Gemini API key stays in `.env`. It is not shown, edited or stored in the DB.
- Other settings stay in `application.yml`: Vietsub `max-duration`/`part-duration`, publish, watermark, novel
  media resolution.
- **No restore button.** A DB restore drops the schema the app is connected to, so the app must be stopped
  first and cannot do it itself. The tab shows the commands instead.
- No backup download, upload or delete from the UI (retention deletes old backups), no off-machine copy.
- No quota/usage dashboard (an earlier suggestion; separate work).
- The public site gets nothing.

## Anti-goals

- A backup that **looks** fine but cannot be restored. A DB dump must keep working with the existing
  `scripts/restore-db.ps1`: same `ss-YYYYMMDD-HHmmss.dmp` naming, schema `SUBTITLE_STUDIO`, `DATA_PUMP`-compatible.
- A bad setting that breaks translation silently. Invalid values are rejected on save with a clear message, and
  never half-applied.
- Giving the app container control of Docker (docker socket mount). This was rejected in brainstorming.

## Approaches considered

**Gemini settings storage**
- *Picked:* a key–value table `t_app_setting` (Flyway V28). Overrides on top of `application.yml`, read through a
  new `GeminiSettings` bean on every call. Consistent with the rest of the app state, and the daily DB backup covers it.
- *Rejected:* a JSON file in `./data`. It is simpler, but would be a second source of truth outside the DB, and would
  not be transactional with the rest of the app.

**Backups (user picked A)**
- **A (picked):** the app does both backups itself. The DB is exported with `DBMS_DATAPUMP` over JDBC as the app
  user, which exports its own schema, into an Oracle directory object that is bind-mounted to the host's
  `./data/backups`. The data folder is zipped by the app in Java.
- B (rejected): the app only lists backups and writes a "request" file, and a host scheduled task polls and runs the
  PowerShell script. It adds latency and still depends on the logged-in Windows session.
- C (rejected): mount the docker socket into the app container. That gives the app host-root power.

## Design

### Menu and routes (admin only)

| Menu | Route | Content |
|---|---|---|
| Settings (new, last item in the admin nav) | `/settings` | redirects to `/settings/gemini` |
| Settings › Gemini (tab-route, level 1) | `/settings/gemini` | Gemini form |
| Settings › Backups (tab-route, level 1) | `/settings/backups` | Backup now + list + restore help |

Follow `docs/ui/screen-layout.md`: H1 "Settings", tabs under the header (`tabs__list`), no breadcrumbs (level 1),
width `default`. Colors follow the project rule: orange `#F39A42` for the primary action, purple `#D9A1D9` for
selected/info, red only for errors. Labels are English like the rest of the admin UI.

### Gemini tab

Form (one column, `FormActions` sticky at the bottom with Save / Cancel):

| Field | Control | Validation (same as the `SubtitleStudioProperties.Gemini` record today) |
|---|---|---|
| Main model | combobox: models from Gemini, free text allowed | not blank |
| Fallback models | ordered list: add (same combobox), remove, move up/down | no duplicates, must not contain the main model, 0–5 entries |
| Thinking level | select: Default (blank) / minimal / low / medium / high | as today |
| Temperature | number 0–2, step 0.1 | 0 ≤ t ≤ 2 |
| Timeout | number of seconds | 10 s – 10 min |
| Overload cooldown | number of minutes | 0 – 60 min (as today) |

- Each field shows its `application.yml` default as hint text, plus a **Reset** link when an override is set.
  Reset deletes the override row.
- **Model list:** `GET /api/settings/gemini/models` calls the Gemini `models.list` API through the official SDK.
  It keeps models whose name starts with `gemini-` and that support `generateContent`, sorted by name, and caches
  them for 1 hour. If the call fails or no key is set, it returns an empty list and the combobox becomes free text
  with a muted note "Could not load the model list". A model name that is not in the list is still accepted.
- With no API key, the tab still works. A muted banner says translation is off until `GEMINI_API_KEY` is set.
- **Save** is all-or-nothing (one transaction). The response is the effective settings.

**Backend**
- `t_app_setting(setting_key VARCHAR2(100) PK, setting_value VARCHAR2(4000) NOT NULL, updated_at TIMESTAMP NOT NULL)`.
  Keys: `gemini.model`, `gemini.fallback-models` (comma-separated), `gemini.thinking-level`, `gemini.temperature`,
  `gemini.timeout` (ISO-8601 duration), `gemini.overload-cooldown`. Update `PersistenceOracleIT.onlyFlywayCreatesTables`.
- `GeminiSettings` (Spring bean): `current()` returns a `SubtitleStudioProperties.Gemini` record built from the yml
  record plus the overrides. It holds an in-memory snapshot that is replaced after a successful save, so there is no
  DB read per Gemini call. The API key always comes from the yml record.
- Every class that keeps `properties.gemini()` in a field reads `geminiSettings.current()` at the point of use
  instead. This covers `GeminiCaller`, `GeminiTranslatorImpl`, `GeminiChapterTranslator`,
  `GeminiTextChapterTranslator`, `ProfileAnalyzer`, `NovelProfileAnalyzer`, `ChapterTranslationService`,
  `GeminiQuotaController` and the `mainModel` fields in `ChapterService`, `NovelService` and `PlaylistService`.
  The builder finds the full list with a grep for `.gemini()`. One request (including its fallback loop) uses one
  snapshot from start to end.
- `configured()` keeps meaning "API key set".
- API: `GET /api/settings/gemini` returns `{effective, defaults, overridden: [keys], configured}`.
  `PUT /api/settings/gemini` takes the full form and returns the same shape. A blank or omitted field, or one equal
  to the default, deletes the override. Validation errors return 400 with a field-level message, in the existing
  error format.

### Backups tab

**Layout**
- Header action: **Backup now** (primary, orange). While a run is going, the button is disabled and shows
  "Backing up…".
- A status line for the last run: time, OK/FAILED, and the failure reason. It reads `data/backups/backup.log`, the
  same file the script writes.
- A table of backups, newest first, with columns Date | Kind (Database / Data files) | Size | Restore (a
  copy-command button). The DB and data backups of one run share a timestamp and appear as two rows.
- Restore help, collapsed by default:
  - **DB:** `docker compose stop subtitle-studio` → `.\scripts\restore-db.ps1 -Dump data\backups\<file>.dmp` →
    `docker compose start subtitle-studio`. A test restore into a new schema uses `-TargetSchema SS_RESTORE_TEST`.
  - **Data files:** stop the app → unzip `<file>.zip` over `./data` → start the app.

**What one run does** (manual or daily; only one at a time, and a second request gets 409 `BACKUP_RUNNING`)
1. **DB:** `DBMS_DATAPUMP` schema-mode export of `SUBTITLE_STUDIO`, run as the app user.
   - Files: `ss-YYYYMMDD-HHmmss.dmp` and `.log` in the Oracle directory `SS_BACKUP_DIR`.
   - Consistent snapshot: `FLASHBACK_TIME = SYSTIMESTAMP`.
   - The app waits for the job (`WAIT_FOR_JOB`). If the job fails, the run deletes the partial files and records
     FAILED with the ORA- code.
2. **Data:** `data-YYYYMMDD-HHmmss.zip` in `data/backups`, holding everything under `./data` **except**:
   - `backups/`
   - `dev.mv.db`, `dev.trace.db` (H2 dev)
   - `logs/`
   - `translate-partial/`
   - `novel-render/` (regenerable cache of public chapter images, far bigger than everything else)

   The zip is written to `.zip.part` and renamed when it is complete. Files that change while zipping are copied
   as read; a run never fails because of that.
3. **Retention:** keep the newest **14** `ss-*.dmp` (with their `.log`), the same as the script, and the newest
   **7** `data-*.zip` (my call: about 90 MB each).
4. **Log:** append one line per part to `data/backups/backup.log`, in the script's format:
   - `<ISO time> OK ss-….dmp 12.3 MB`
   - `<ISO time> OK data-….zip 90.1 MB`
   - `<ISO time> FAILED <reason>`
5. If the DB part fails, the data part still runs, and the run is reported as FAILED (partial).

**Schedule:** daily at **12:00 Asia/Ho_Chi_Minh** (`@Scheduled` cron, configurable as
`subtitle-studio.backup.cron` in yml, blank = off). This replaces the Windows task. After deploy the user runs
`Unregister-ScheduledTask -TaskName 'SubtitleStudio DB backup'` (put in the PR's deploy notes). `backup-db.ps1`
and `restore-db.ps1` stay as manual tools.

**API**
- `GET /api/backups` returns `{running, last: {at, ok, message}, items: [{name, kind, sizeBytes, createdAt}]}`.
- `POST /api/backups` starts a run asynchronously and returns 202. It returns 409 if a run is going.
- The UI polls `GET` every 3 s while `running`.

**Oracle / docker-compose**
- Bind-mount `./data/backups` into the oracle container at `/opt/oracle/backups`.
- At every Oracle start, a script in the gvenzl image's `/container-entrypoint-startdb.d/` (mounted from
  `docker/oracle-startdb/`) runs as SYSTEM in `FREEPDB1`. It is idempotent:
  `CREATE OR REPLACE DIRECTORY SS_BACKUP_DIR AS '/opt/oracle/backups'; GRANT READ, WRITE ON DIRECTORY SS_BACKUP_DIR TO SUBTITLE_STUDIO;`
  It must run on the existing database: init scripts only run when the DB is created, which is why this goes in
  startdb.
- The app container already sees `./data/backups` as `/data/backups`, so it lists and zips with plain Java file I/O.

**Risk, spike first:** the compose file says bind mounts on Windows hit permission errors for Oracle (uid 54321).
That was about the datafiles; a plain dump directory may be fine. **The first task of the plan is a spike** that
proves Oracle can write a dump through the bind mount and that the host can read it. If it cannot, the fallback
(the builder's call; tell the user) is a named volume `ss-backups` shared by both containers. The app then copies
finished dumps from it into `./data/backups`.

### H2 dev

Running outside Docker on H2 there is no Data Pump. The DB part is skipped with the message "Database backup needs
Oracle". The data zip still works, so the tab is usable in dev.

## Tests (the builder decides the detail)

- `GeminiSettings`: merge, override, reset, validation, snapshot replacement. Existing tests that construct
  `SubtitleStudioProperties.Gemini` keep working (for example through a small constant-settings test helper).
- Controllers: GET/PUT settings (400 cases), backups GET/POST/409.
- The data zip: exclusions, `.part` rename, retention.
- Oracle IT: the Data Pump export into a temp directory, if feasible in Testcontainers. Otherwise the spike
  result plus a manual check is documented in the PR.
- Frontend: Settings tabs, Gemini form (reorder, reset, free-text model), Backups list and polling.

## Left to the builder

- Package names, DTO names, component split, the exact combobox component (prefer an existing Radix/`ui` component
  over a hand-made one).
- How the Data Pump call is coded (a PL/SQL block via `JdbcTemplate`, or a stored helper).
- The named-volume fallback details, if the spike fails.
- The zip compression level.

## Deploy notes (for the PR)

1. Back up first (the existing script).
2. `docker compose up -d --build` (oracle restarts too, so the startdb script runs).
3. Press Backup now once and check both files appear in `data/backups`.
4. `Unregister-ScheduledTask -TaskName 'SubtitleStudio DB backup' -Confirm:$false`.
