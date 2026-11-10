# Enhancements batch 2 (long videos, theater mode, caption size, Oracle backup, Select, scroll reset): Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Status: **waiting for the user's approval** (scope agreed in chat on 2026-11-10).

**Goal:** five changes the user asked for on 2026-11-10.

**Tech stack:**
- Spring Boot, JPA, Oracle + H2 `MODE=Oracle`
- React + Vite + Vitest + Testing Library
- Radix (adds `@radix-ui/react-select`), lucide-react
- PowerShell + Windows Task Scheduler, Oracle Data Pump (`expdp`/`impdp`) inside the `oracle` container

## Approved scope

| # | Where | Change | Colours |
|---|---|---|---|
| 1 | Get Engsub › Translate / Translate again | **Videos longer than 60 minutes are translated in parts.** See Task 1. | unchanged |
| 2a | Watch page `/vietsub/:id` (admin **and** public, `WatchPage` is shared) | **Theater mode.** See Task 2. | active button purple `--brand-2` |
| 2b | Watch page | **Caption size S / M / L.** See Task 2. | selected option purple |
| 3 | No UI | **Daily Oracle backup** + a backup before every deploy. See Task 3. | – |
| 4 | Five native `<select>`s | **Shared Radix Select component.** See Task 4. | see Task 4 |
| 5 | All routes, admin and public | **Bug fix: a new page opens scrolled down** (e.g. from the bottom of "Fetched earlier" → Watch video shows a blank area). See Task 5. | – |

Details of each item:

- **Item 1, long videos:**
  - The limit becomes **3 hours**: `gemini.max-duration: 180m`. Videos longer than that still get `VIDEO_TOO_LONG`.
  - Videos up to **45 minutes** (`gemini.part-duration: 45m`, new setting) are translated in one call, as today.
  - Longer videos are split at cue boundaries into parts of at most 45 minutes, translated one after another.
  - From part 2 on, the request also carries the last 8 lines of the previous part (English + Vietnamese) as context.
  - While running, the status shows `Translating part 2/3 with <model>…`.
  - If a part fails (quota, 503, …), the parts already finished are kept, and **Translate again** only translates the missing parts.
- **Item 2a, theater mode:**
  - A button in the player controls (lucide `RectangleHorizontal`) and the **T** key.
  - The player takes the full page width and the playlist panel moves below it.
  - The choice is remembered in localStorage `subtitle-studio.theater`.
  - **T** is added to the shortcuts popover.
- **Item 2b, caption size:**
  - Chosen in the shortcuts popover (`?`). Factors 1 / 1.25 / 1.5 of the current caption size.
  - Remembered in localStorage `subtitle-studio.captionSize`. Also applies in fullscreen.
- **Item 3, backup:**
  - `scripts/backup-db.ps1` runs `expdp` for schema `SUBTITLE_STUDIO` and copies the dump + log to `data/backups/` (ignored by git).
  - It keeps the newest **14** backups and appends one line per run to `data/backups/backup.log`.
  - A Windows scheduled task runs it daily at 12:00, and catches up after the machine was off ("run as soon as possible after a missed start").
  - The deploy procedure (docs) runs the script before `docker compose up -d --build`.
  - `scripts/restore-db.ps1` and a restore guide are added, and a restore is tested once into a scratch schema.
- **Item 4, shared Select:**
  - Replaces the five native `<select>`s:
    - Get Engsub `UrlForm`: translation profile, on the dark video frame
    - Vietsub › Profiles `ProfilesPage`: profile
    - Novels `NovelForm`: Status and Profile
    - Novels `NotebookView`: version
  - Colours: trigger border `--field-border`; hover border purple; focus ring `--focus`; open list on `--surface` with `--shadow-overlay`; highlighted item purple-tinted background; selected item shows a lucide `Check` in `--brand-2-ink`.
  - On the dark frame: `--frame` / `--on-frame`, with focus `--brand-2`.
- **Item 5, scroll reset:**
  - Every PUSH/REPLACE navigation to a different pathname scrolls to the top.
  - Back/Forward (POP), query-only changes (`?tab=`, `?q=`, `?page=`) and `#hash` links do not.

## Global constraints

- Branch: `git checkout main && git pull && git checkout -b feat/enhancements-batch-2`.
  - One PR at the end, base `main`.
  - Do not merge and do not deploy without the user's approval.
- Do not stack PRs.
- UI copy is in English. Brand colours follow CLAUDE.md, icons come only from `lucide-react`, and new CSS goes next to its component.
- New package versions are exact (no `^`), and `package-lock.json` is committed.
- `@radix-ui/react-select`: use the version from the same Radix release as the installed `react-dialog 1.3.1` / `react-popover 1.3.1` (check with `npm view`).
- Tests:
  - `mvn test -Dskip.npm`
  - `cd frontend && npx vitest run`
  - `npx tsc -b --noEmit`
  - Never stage `frontend/tsconfig.tsbuildinfo`. Stage by path, never `git add -A`.
  - `data/` now tracks `prompts/` and `subs/`. Do not commit anything from `data/` in this batch.
- TDD for every code task: write the test, see it fail for the right reason, then write the code.
- One commit per task. Messages are in English and end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Never log subtitle text or Gemini answers (CLAUDE.md, Gemini section).

---

## Task 1: Translate long videos in parts

**Files:**
- `translate/TranslationService.java`
- new `translate/TranslationParts.java` (pure splitting logic)
- new `translate/PartialTranslationStore.java`
- `translate/VideoContext.java`
- `translate/GeminiTranslatorImpl.java` (prompt)
- `config/SubtitleStudioProperties.java`
- `application.yml`
- the DTO/API that exposes `activeModel` today
- the frontend translation status (`VietsubStatus` or wherever `Translating with <model>…` is rendered)
- tests

**Splitting (`TranslationParts`, unit-tested):**
- [ ] Input: the English cues (idx, startMs, endMs) and the part duration.
  - A cue goes in the current part while `cue.startMs - part.startMs < partDuration`. Otherwise a new part starts at this cue.
  - Never split a cue, and never produce an empty part.
  - A video ≤ part duration gives exactly 1 part.
- [ ] Tests:
  - 40 min gives 1 part.
  - 100 min gives 3 parts, with boundaries on cue starts.
  - A single cue that is longer than the part duration gives 1 part.
  - A long silence gap does not create an empty part.

**Settings:**
- [ ] `subtitle-studio.gemini.max-duration: 180m`.
- [ ] New `part-duration: 45m`, `@NotNull`, bound in `SubtitleStudioProperties.Gemini`.
- [ ] Update `application.yml` and the test config.

**Context between parts:**
- [ ] Add `List<ExamplePair> previousLines` to `VideoContext` (empty for part 1).
- [ ] `GeminiTranslatorImpl` adds a section `# Đoạn ngay trước (để giữ mạch, KHÔNG dịch lại)` with these pairs, only when the list is not empty.
- [ ] Test with `FakeGeminiServer` that the section is present for part 2 and absent for part 1.

**Partial results (`PartialTranslationStore`):**
- [ ] File: `<data-dir>/translate-partial/<videoId>.json`, containing `{profile, cueCount, parts: [{index, lines: [{idx, text}], model}]}`.
  - The folder is under `/data/*`, so git ignores it. Check this with `git check-ignore -v`.
  - Write atomically: temp file, then `ATOMIC_MOVE`.
- [ ] `runTranslation` for a video with more than one part:
  1. Load any partial file. Keep its finished parts only when `profile` **and** `cueCount` match. Otherwise delete it.
  2. For each missing part, in order:
     - set the active part (`2/3`);
     - call `translator.translate(...)` with that part's lines and the context (previous lines = last 8 of the previous part, taken from the stored part or the one just translated);
     - save the part to the partial file immediately.
  3. When every part is done, join them in idx order and call `vietsub.saveAuto(...)` as today.
     - The model stored is the distinct models in order of use, joined by `, `, the same as Novels batch 1.
     - Then delete the partial file.
  4. If a part throws, run today's `fail(...)` path with a message that mentions the progress, e.g. `Could not translate part 2/3: <reason>. Translate again continues from part 2.` The partial file stays.
- [ ] Deleting a video, or clearing its Vietsub, deletes the partial file. Reuse the existing `VideoRemovalEvent` listener pattern, or call the store from the same place that deletes subtitle files.
- [ ] A one-part video does **not** create a partial file (behaviour unchanged).
- [ ] Logging: `translate <id>: part 2/3, N lines, model X`. Ids and counts only.

**Active part in the UI:**
- [ ] Next to `activeModel`, keep `activePart` (e.g. `"2/3"`, null for one-part videos) and expose it where `activeModel` is exposed today.
- [ ] Frontend: `Translating part 2/3 with <model>…`. With no part, keep the current text.

**Tests (`TranslationServiceTest` with a fake translator):**
- [ ] A 100-minute video makes 3 translator calls with the right line ranges, and `previousLines` is filled for parts 2 and 3.
- [ ] Part 2 fails:
  - the status is FAILED with a message mentioning part 2;
  - the partial file holds part 1;
  - "Translate again" makes **only** calls for parts 2 and 3, and the final Vietsub contains every line in order.
- [ ] A partial file from another profile, or with a different `cueCount`, is ignored and deleted.
- [ ] A 3h01 video gives `VIDEO_TOO_LONG`, and a 2h59 video is accepted.
- [ ] A 40-minute video makes 1 call and creates no partial file.
- [ ] No subtitle text appears in the logs (`OutputCaptureExtension`).

**Docs:**
- [ ] CLAUDE.md, Gemini section: parts, the `part-duration` setting, the partial file, and the 3h limit.
- [ ] PROGRESS.md: remove the backlog line "Video > 60 phút".

## Task 2: Theater mode + caption size S/M/L

**Files:**
- `pages/WatchPage.tsx` (+ `.css`)
- `components/VideoPlayer.tsx` (+ `.css`)
- `components/SubtitleOverlay.tsx` (+ `.css`)
- `components/ShortcutsHelp.tsx`
- `lib/usePlayerShortcuts.ts`
- new `lib/viewerPrefs.ts` (localStorage helpers, same try/catch pattern as `data/watched.ts`)
- tests

- [ ] `viewerPrefs`: `getTheater()`/`setTheater(bool)` and `getCaptionSize()`/`setCaptionSize('s'|'m'|'l')`.
  - A storage error falls back to in-memory values (same as `watched.ts`).
  - Unit test: a throwing `localStorage` does not break anything.
- [ ] **Theater button** in the player controls, next to fullscreen:
  - `aria-label` "Theater mode" / "Exit theater mode", `aria-pressed`, lucide `RectangleHorizontal`.
  - Uses `title`, not `<Tip>`: same exception as the fullscreen button, see CLAUDE.md.
  - Active state is purple `--brand-2`.
- [ ] **T** key in `usePlayerShortcuts` toggles theater mode. It follows the same skip rules as the others: typing, modifiers, dialogs.
- [ ] Theater layout:
  - `.watch--theater`: the player uses the full content width, and the playlist panel goes below the player (also with `?playlist=`).
  - On ≤ 760 px nothing changes visually (it is already stacked), but the state still saves.
  - Keep the existing laptop-fit rule (W1) working when theater mode is off.
- [ ] **Caption size** radio group "Caption size" with options **S / M / L** in the `ShortcutsHelp` popover.
  - Selected option is purple, with a ≥ 44 px touch target.
  - `SubtitleOverlay` applies `--caption-scale` (1 / 1.25 / 1.5) on top of its current responsive size.
  - It must also apply in fullscreen and in iPhone pseudo-fullscreen.
- [ ] Add **T** and the caption size to the shortcuts list text.
- [ ] Tests (RTL):
  - the T key and the button both toggle the class and `aria-pressed`, and the state persists after a remount;
  - T is ignored while typing in an input;
  - choosing L sets the scale on the overlay and persists;
  - the public `PublicApp` watch page also has both controls.

## Task 3: Oracle backup (daily + before deploy)

**Files:**
- new `scripts/backup-db.ps1`
- new `scripts/restore-db.ps1`
- new `scripts/register-backup-task.ps1`
- README.md (new "Backup & restore" section)
- CLAUDE.md (deploy note)
- `.gitignore`: check that `data/backups/` stays ignored; it should already, because of `/data/*`

**`backup-db.ps1` (Windows PowerShell 5.1 compatible):**
- [ ] Read `ORACLE_PASSWORD` from the repo's `.env`. Never print it, and never put it on a command line that ends up in the logs.
  - Pass it through `docker compose exec -T -e` or stdin.
  - Connect as `system`, because the app user may lack the `DATA_PUMP_DIR` grant. If you find a cleaner grant-based way, document it.
- [ ] Steps:
  1. Check that the `oracle` service is running and healthy. If not, write `FAILED: oracle not running` to the log and exit 1.
  2. `expdp` with `schemas=SUBTITLE_STUDIO directory=DATA_PUMP_DIR dumpfile=ss-<yyyyMMdd-HHmmss>.dmp logfile=ss-<…>.log`.
  3. Find the directory path with `select directory_path from dba_directories where directory_name='DATA_PUMP_DIR'`. Copy the dump and the log out with `docker compose cp` into `data/backups/`, then delete them inside the container. The named volume must not grow.
  4. Keep the newest 14 `ss-*.dmp` files (and their logs), and delete older ones.
  5. Append to `data/backups/backup.log`: `<iso time> OK ss-….dmp <size MB>`, or `<iso time> FAILED <short reason>`.
- [ ] The script runs from any working directory: it resolves the repo root from `$PSScriptRoot`.

**`register-backup-task.ps1`:**
- [ ] `Register-ScheduledTask` named `SubtitleStudio DB backup`:
  - daily trigger at 12:00;
  - `StartWhenAvailable`, so it runs after a missed start;
  - runs as the current user only when logged on, because Docker Desktop needs the user session;
  - action `powershell.exe -NoProfile -ExecutionPolicy Bypass -File <repo>\scripts\backup-db.ps1`.
- [ ] Idempotent: re-running it updates the task.
- [ ] **Run it once on this machine** after the user has approved the plan. It is part of this task.

**`restore-db.ps1 -Dump <file> [-TargetSchema <name>]`:**
- [ ] Copies the dump into the container and runs `impdp`.
  - With `-TargetSchema` it uses `remap_schema=SUBTITLE_STUDIO:<name>`, for testing.
  - Without it, it restores over `SUBTITLE_STUDIO`, after asking for typed confirmation (`Read-Host` is fine here because a human runs it). The guide says to stop the app container first.
- [ ] **Run the restore test once:**
  1. Back up.
  2. Restore into `SS_RESTORE_TEST`.
  3. Compare row counts of every table between the two schemas.
  4. Drop `SS_RESTORE_TEST`.
  5. Report the counts in the PR.

**Docs:**
- [ ] README "Backup & restore": where the files are, how to run by hand, how to check `backup.log`, and the restore steps.
- [ ] CLAUDE.md deploy rule: run `scripts/backup-db.ps1` before `docker compose up -d --build`, and abort the deploy if it fails.

## Task 4: Shared Select (Radix)

**Files:**
- new `components/ui/Select.tsx` + `Select.css` + `Select.test.tsx`
- `UrlForm.tsx`
- `ProfilesPage.tsx`
- `NovelForm.tsx`
- `NotebookView.tsx`
- their tests
- CLAUDE.md, shared components list

- [ ] `npm i -E @radix-ui/react-select@<version>`.
- [ ] `Select` API: `{ id, value, onChange, options: {value, label}[], disabled?, 'aria-invalid'?, 'aria-describedby'?, variant?: 'default' | 'frame', placeholder? }`.
  - The trigger must be labelled by the existing `<label htmlFor={id}>`, so keep the `id` on the trigger and check `getByLabelText` works.
  - Use a lucide `ChevronDown` in the trigger and a `Check` on the selected item.
  - The list renders in a portal and is keyboard accessible (Radix default).
- [ ] **Empty values:** Radix `Select.Item` does not allow `value=""`.
  - `NovelForm` Profile has `""` ("None (Translate is off)") and `NotebookView` may use `''`.
  - Map `""` to an internal sentinel such as `__none__` inside `Select`, so callers keep their `""` semantics.
  - Test this.
- [ ] Styling per the scope table. Use tokens only, with no hard-coded hex. The trigger has the same height as text inputs and a ≥ 44 px touch target on ≤ 520 px.
- [ ] Test setup: jsdom lacks `hasPointerCapture`, `scrollIntoView` and `releasePointerCapture`. Add no-op polyfills in the Vitest setup file, only if missing.
- [ ] Tests:
  - `Select`: open, pick an option, `onChange` gets the value; keyboard (Enter/ArrowDown) works; disabled does not open; the `""` sentinel round-trips.
  - Each of the 5 call sites: update its tests to the new roles (`combobox` / `option`), with behaviour unchanged.
- [ ] Grep for `<select` in `frontend/src` (excluding tests). None should remain, unless a call site has a good reason, which must be written in the PR.

## Task 5: Scroll to top on navigation

**Files:**
- new `components/ScrollToTop.tsx` + test
- `App.tsx`
- `PublicApp.tsx`

- [ ] `ScrollToTop`:
  - `useLocation()` + `useNavigationType()`.
  - When the pathname changed and the type is not `POP`, call `window.scrollTo(0, 0)`.
  - Ignore search-only and hash-only changes.
- [ ] Mount it once inside the router in both apps.
- [ ] Tests:
  - PUSH to another path scrolls to the top (spy `window.scrollTo`);
  - POP does not;
  - a change of `?tab=` alone does not.
- [ ] Check the reader pages (Novels chapter → next chapter is a PUSH to a new path), where scrolling to the top is the wanted behaviour, and the watch page Shift+N (new path, top is fine). Note both in the PR.

## Task 6: Docs + final review

- [ ] PROGRESS.md:
  - add a short entry;
  - remove the backlog rows for Theater mode, caption size and "Video > 60 phút".
- [ ] CLAUDE.md: the shared component `Select`, the T shortcut, the caption size, the backup rule and the Gemini parts.
- [ ] Run the full suites, then one review of the whole branch (user preference: review once at the end, not per task).
- [ ] Push and open a PR (English title and body: summary, test commands + results, restore-test row counts, screenshots of the Select and theater mode if possible). End the body with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- [ ] Do not merge or deploy until the user approves.

## Review focus

1. A partial file left by a failed run, followed by a **profile change** or a new Engsub (different cue count), is discarded, so parts from two different runs are never mixed (Task 1).
2. A part that fails mid-way leaves the video FAILED, not TRANSLATING, and `activeModel`/`activePart` are cleared (Task 1).
3. Restart while translating part 2: the existing `markInterrupted` sets FAILED, and Translate again resumes from part 2 (Task 1).
4. The backup script never prints the password, and leaves no dump inside the Oracle volume (Task 3).
5. `Select` with value `""` (Novel profile "None") saves `""`/null exactly as before (Task 4).
6. Back button after scrolling a long list returns near the previous position, or at least does not jump to the top (Task 5).
