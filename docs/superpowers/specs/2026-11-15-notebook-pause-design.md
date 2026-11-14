# Pause notebook updates per novel — design

Date: 2026-11-15. Branch: `feat/novel-editor-ux` (same PR). Size: small, with **one migration (V23)**.

## Why

Each Publish starts a notebook update, and while it runs the novel cannot translate (one Gemini job per novel). On 2026-11-14 Gemini was overloaded. The update after chapter 24 took about 3.5 minutes over three models, and the one after chapter 25 failed after the 5-minute timeout ("Gemini did not respond in time"). The user asked to stop notebook updates for now, per novel (option A), so they can keep translating and publishing.

## Behaviour

- **New per-novel switch "Pause notebook updates".** Stored in `t_novel.notebook_paused` (`CHAR(1 CHAR) DEFAULT 'N' NOT NULL`, Y/N like `featured`), added by Flyway `V23__novel_notebook_paused.sql`. Existing novels start not paused.
- **While paused:**
  - Publishing a chapter does **not** schedule an update. `NotebookService.scheduleUpdate` returns without queuing, and `notebookPendingChapterNo` is unchanged.
  - Translations use the latest stored notebook as they do today (it may be some chapters old).
  - **Retry** in the Notebook tab is disabled, with the tooltip "Notebook updates are paused".
  - An update that is already running when the switch is turned on finishes normally. It is not cancelled.
- **Resuming** (switch off) starts nothing by itself. The Notebook tab shows:
  - the line "The notebook was last updated after chapter N; chapters N+1–M were published since." when M > N;
  - a button **Update now** that runs the existing retry flow for the latest published chapter.
- **Busy rule:** a paused novel's notebook is never `UPDATING` unless an update was already running. `FAILED` still does not block, as today.
- **API:**
  - `PUT /api/novels/{id}/notebook/paused` with body `{ "paused": boolean }` returns the updated `NotebookView`.
  - `notebookPaused` is added to `NovelDetail` and `NotebookView`.
  - Turning pause on while an update runs returns 200 and leaves the run alone.
  - `updatedAt` of the novel does not change (like the banner switch).
- **UI:**
  - The **Notebook tab** gets a switch (a checkbox styled as a toggle, `role="switch"`, label "Pause notebook updates", hint "Publishing will not update the notebook. Translations use the notebook as it is now."), plus the resume line and the Update now button above.
  - The **novel page header** shows a purple info badge "Notebook paused" while paused (state colour).
  - Admin strings are English.

## Tests (write first)

- **Migration:** H2 and `*OracleIT` (`mvn verify -Poracle -Dskip.npm`). The column exists with default 'N', and existing rows read as not paused.
- **Service:**
  - paused, then publish → no update scheduled and the pending chapter is unchanged;
  - not paused → as today;
  - pause during a running update → it completes;
  - retry while paused → rejected with 409 `NOTEBOOK_PAUSED`, message "Notebook updates are paused.";
  - resume schedules nothing.
- **Controller:** the PUT returns the view, and the JSON carries `notebookPaused`.
- **Frontend:**
  - the switch toggles and calls the PUT, rolling back with an error toast on failure;
  - Retry is disabled with its tooltip while paused;
  - the resume line and Update now appear only when chapters were published since;
  - the header badge shows while paused.

## Non-goals

A global switch; cancelling a running update; changing the Gemini timeout or fallback (handled separately if the user asks).

## Done when

- `mvn test`, `mvn verify -Poracle -Dskip.npm`, `npx vitest run` and `npx tsc -b` are green.
- The migration number does not clash with other branches.
- `CLAUDE.md` (Novels notebook) and `PROGRESS.md` are updated.
- **Deploy note:** V23 runs on Oracle, so run `scripts/backup-db.ps1` before `docker compose up -d --build`.
