# Remove Novel Notebook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete the novel notebook feature: its code, endpoints, UI, prompt section and DB data.

**Architecture:** This is a removal only. The translation prompts lose one section; everything else keeps working as before.

**Tech Stack:** Spring Boot / JPA / Flyway (Oracle + H2), React + vitest.

**Spec:** `docs/superpowers/specs/2026-11-16-remove-novel-notebook-design.md`

## Global Constraints
- **JSON:** the only JSON change is the removal of the notebook fields:
  - from `NovelDetail`: `notebookStatus`, `notebookError`, `notebookPaused`, `notebookPendingChapterNo`;
  - from `ChapterDetail`: `notebookStatus`, `notebookChapterNo`.
- **Translation prompts:** byte-identical to today except that the "Sổ tay truyện" section is gone. Today the section is `# Sổ tay truyện\n<text>\n\n` in `GeminiTextChapterTranslator.context`, plus its equivalent in `GeminiChapterTranslator`, plus any mention of "sổ tay" in their system rules. Where a rule names both "Hồ sơ dịch và sổ tay truyện", keep the rule and drop only "và sổ tay truyện".
- **Migration:** `V26__drop_novel_notebook.sql`:
  - drop `t_novel_notebook`, then sequence `t_novel_notebook_seq`;
  - drop columns `t_novel.notebook_status`, `notebook_error`, `notebook_pending_chapter_no`, `notebook_paused`, each with its own `ALTER TABLE t_novel DROP COLUMN ...` (portable across Oracle and H2);
  - drop any check constraint on those columns first (look in V5, V23).
- **Tests:**
  - delete a test only when the code it tests is deleted, and list every deleted test file in the PR;
  - tests of remaining code may lose only the notebook arguments, stubs and assertions about notebook fields;
  - other assertions stay the same.
- **Text:** commits and the PR are in English, and each commit ends with the Co-Authored-By line.

## Review Focus
1. **Startup.** `NotebookService.markInterrupted` (`ApplicationReadyEvent`) is gone, and nothing else references the dropped columns. Hibernate `validate` passes on Oracle after V26 (Oracle IT).
2. **Publishing a chapter still works,** and starts no background job (no `NotebookScheduler`).
3. **Fetch-next / translate busy checks.** `WattpadNovelService` and `ChapterTranslationService` no longer throw `NOTEBOOK_UPDATING`. The frontend `novelBusy` / `BusyLine` show only chapter-translating states.
4. **Analyze (`NovelProfileAnalyzer`) and image-chapter code** compile and pass unchanged, apart from removing notebook strip calls if any.
5. **No dangling frontend route, tab or `?tab=notebook` link.** An old `?tab=notebook` URL falls back to the default tab.

---

### Task 1: Backend removal + migration
**Files:**
- Delete: the notebook classes listed in the spec (`novel/Notebook*.java`, `novel/GeminiNotebookUpdater.java`, `novel/NovelNotebook*.java`, `novel/InvalidNotebookUpdateException.java`) and their tests.
- Modify:
  - `Novel.java`: remove the 4 fields;
  - `NovelDetail`, `ChapterDetail`: remove the notebook fields; keep the convenience constructors consistent;
  - `NovelService`, `ChapterService`, `ChapterTranslationService`, `NovelTranslationBusyException` (remove the `NOTEBOOK_UPDATING` reason), `WattpadNovelService`, `NovelController` (remove the 3 endpoints), `NovelRepository` (notebook finders);
  - `ChapterPrompt`, `TextChapterPrompt`: remove `notebookText`; keep the old-arity constructors only if tests outside the notebook use them;
  - `GeminiChapterTranslator`, `GeminiTextChapterTranslator`: remove the section and the wording;
  - `web/NovelErrors.java` + `ApiErrorMappingTest`: remove only the cases for deleted exceptions (`NotebookUpdateInProgressException`, `NotebookPausedException`, `InvalidNotebookUpdateException` if mapped).
- Create: `src/main/resources/db/migration/V26__drop_novel_notebook.sql`.
- Test: `PersistenceOracleIT`. Remove `T_NOVEL_NOTEBOOK` from the expected table list, and add a check that `t_novel` has no `NOTEBOOK_%` columns after migration.

- [ ] **Step 1:** Update the golden prompt fixtures (`src/test/resources/novel/text-only-request-*.json` and any screenshot-prompt golden), removing only the notebook section. Run the golden tests. Expected: FAIL.
- [ ] **Step 2:** Make the code changes above and write V26.
- [ ] **Step 3:** Run `mvn test -Dskip.npm`, without `-q`. Expected: all pass. Then run `mvn verify -Poracle -Dskip.npm`. Expected: pass.
- [ ] **Step 4:** Run `grep -ri notebook src/main` and confirm it only matches comments or docs about history. Fix anything live.
- [ ] **Step 5:** Commit `feat: remove the novel notebook (backend and V26 migration)`.

### Task 2: Frontend removal
**Files:**
- Delete: `frontend/src/components/novel/NotebookView.tsx` (+ `.css`, + test).
- Modify:
  - `api/novels.ts`: types and calls;
  - `pages/NovelPage.tsx`: the tab and the pause toggle; unknown `?tab=` falls back to the default tab (Review Focus 5);
  - `components/novel/BusyLine.tsx`, `lib/novelBusy.ts`, `lib/useNovelPolling.ts`, `lib/useChapterEditor.ts`, `pages/ChapterPage.tsx`, `components/novel/WattpadParts.tsx`, `lib/errors.ts`.
- Tests:
  - remove the notebook-only tests and stubs;
  - add `NovelPage` test `unknown_tab_param_shows_default_tab` with `?tab=notebook`.

- [ ] **Step 1:** Write the new `NovelPage` test. Run it. Expected: FAIL, or it passes for the wrong reason (the notebook tab renders).
- [ ] **Step 2:** Make the removals.
- [ ] **Step 3:** Run `cd frontend && npx vitest run && npm run build && npm run build -- --mode public`. Expected: all pass. Then run `grep -ri notebook frontend/src`. Expected: no live code.
- [ ] **Step 4:** Commit `feat: remove the novel notebook from the UI`.

### Task 3: Clearer busy message in `GeminiCaller`
**Files:** `src/main/java/com/subtitlestudio/translate/GeminiCaller.java`, `src/test/java/com/subtitlestudio/translate/GeminiCallerTest.java` (additions only).

**Behaviour** (spec item 8). Track, per model in `modelOrder`, one of four outcomes: skipped-as-exhausted, daily 429, 503, or timeout.
- When `response == null` and (skipped-as-exhausted or daily 429) is not empty and (503 or timeout) is not empty, throw `TranslationFailedException` with:
  `"Gemini is busy: " + <busyPart> + "; " + <quotaPart> + ". Try again in a few minutes."`
  - `busyPart` lists `"<model> is overloaded"` / `"<model> did not respond in time"`, joined with `", "`, in model order.
  - `quotaPart` is `"<m1>, <m2> are out of free quota until HH:mm (Vietnam time)"`, or `"<m> is out of free quota until …"` for one model. The time is `RESET_FORMAT.format(quota.earliestDailyReset(those models))`. If the reset is unknown, write `"… are out of free quota for today"`.
- Every other path keeps its exact current message.

- [ ] **Step 1:** Write the failing tests:
  - `busy_message_names_overloaded_and_exhausted_models`: 3.6-flash gives daily 429, lite gives 503, flash gives daily 429. Expect the exact string with `15:00`, using a fixed clock so the reset is 08:00Z.
  - `busy_message_counts_models_skipped_as_exhausted`: 2 models are pre-recorded as exhausted, and lite gives 503.
  - `timeout_named_in_busy_message`.
  - `all_overloaded_keeps_old_message`: the existing text, unchanged.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `mvn test -Dskip.npm`. Expected: all pass.
- [ ] **Step 5:** Commit `feat: say which Gemini models are busy and which are out of quota`.

### Wrap-up
- [ ] **Docs.** Update `CLAUDE.md`, `README.md` and `PROGRESS.md` (one entry). Commit `docs: notebook removed`.
- [ ] **Test-file diff.** Run `git diff --numstat origin/main` on test files, and list in the PR every deleted test file and every file with removed lines, with the reason for each.
- [ ] **PR.** Push branch `feat/remove-novel-notebook`, then `gh pr create --base main`. Include the test totals, the links to the spec and this plan, and the note that the notebook data is in backup `ss-20261116-220349.dmp`. Do not merge.
