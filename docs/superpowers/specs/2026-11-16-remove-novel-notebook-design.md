# Remove the novel notebook: design (short)

Date: 2026-11-16. User decision: remove the notebook feature completely and delete its data.

## Why
The 2026-11-16 review showed that the notebook costs more than it gives:
- **Quota:** every published chapter spends one Gemini request (on a free tier of 20/day/model) that would otherwise go to translation.
- **Speed:** updates take minutes, because the prompt is hard-coded for Thai and causes runaway `sourceName` output of up to 35k chars, and because of 180 s timeouts.
- **Content:** the useful part (addressing pairs, story summary) is small. The glossary is mostly names kept as is, which the profile already covers. The character list is noisy and mixes in names from another story.
- **Overlap:** addressing rules already live in the translation profiles that the user maintains, and Analyze now proposes profile changes learned from the user's edits.

## What changes
1. **Backend.**
   - Delete the notebook code: `NotebookService`, `NotebookScheduler`, `NotebookUpdater`/`GeminiNotebookUpdater`, `NotebookMerger`, `NotebookContent`, `NotebookText`, `NotebookView`, `NotebookUpdate`, `NotebookStatus`, `NotebookPromptSource`, `NovelNotebook`, `NovelNotebookRepository`, the notebook exceptions and request DTOs.
   - Delete the endpoints `GET /api/novels/{id}/notebook`, `POST /{id}/notebook/retry`, and the pause endpoint.
   - Publishing a chapter no longer schedules anything.
2. **Translation prompts.**
   - The screenshot and Wattpad chapter prompts lose the "Sổ tay truyện" section.
   - `ChapterPrompt`/`TextChapterPrompt` drop the `notebookText` field.
   - The previous-chapter text and the profile stay exactly as they are.
3. **Busy rules.**
   - `NovelTranslationBusyException.Reason.NOTEBOOK_UPDATING` and every "notebook is updating" check go away.
   - Translating is blocked only by another chapter translating, as before.
4. **DTOs.**
   - `NovelDetail` drops `notebookStatus`, `notebookError`, `notebookPaused` and `notebookPendingChapterNo`.
   - `ChapterDetail` drops `notebookStatus` and `notebookChapterNo`.

   This is the only intended JSON change.
5. **Frontend.**
   - Remove the Notebook tab/view (`NotebookView.tsx`), the pause toggle, notebook lines in `BusyLine`/`novelBusy`, notebook polling, the related error messages, and the API types.
   - The novel page keeps all its other tabs.
6. **DB.**
   - Migration `V26__drop_novel_notebook.sql` drops table `t_novel_notebook` and its sequence.
   - It also drops the columns `t_novel.notebook_status`, `notebook_error`, `notebook_pending_chapter_no` and `notebook_paused`.
   - This works on both Oracle and H2; check the Oracle syntax in the Oracle IT.
   - The data is deleted. The 2026-11-16 22:03 backup (`ss-20261116-220349.dmp`) still has it.
8. **Clearer "busy" message** (added by the user to this PR). Today `GeminiCaller` reports "Gemini is busy right now (high demand), try again in a few minutes." whenever at least one model answered 503. It says this even when the other models are out of daily quota, as happened on 2026-11-16 at 22:20: 3.6-flash and 3.5-flash were out of quota, and only 3.5-flash-lite was left, and it was overloaded. When no model answers, and at least one model is out of daily quota while another was overloaded or timed out, the message names both groups and the reset time. Models skipped because they are already known to be exhausted count as out of quota. Format:
   `Gemini is busy: gemini-3.5-flash-lite is overloaded; gemini-3.6-flash, gemini-3.5-flash are out of free quota until 15:00 (Vietnam time). Try again in a few minutes.`
   - Use "did not respond in time" in place of "is overloaded" for a model that timed out.
   - Format the reset time like the existing quota message (`RESET_FORMAT`, `quota.earliestDailyReset`).
   - Every other case keeps its current message word for word.
9. **Docs.** Update `CLAUDE.md`, `README.md` and `PROGRESS.md` wherever they describe the notebook. Older specs and plans stay as history.

## Non-goals
- No replacement feature: no automatic story summary and no addressing extraction.
- No change to profiles, Analyze, the image-chapter feature or Vietsub.

## Anti-goals
- **A translation prompt changes apart from losing the notebook section.** Pin this with the golden prompt tests: update the golden files only by removing that section.
- **Losing tests unrelated to the notebook.** Tests that exist only for notebook code are deleted together with that code, and the PR lists them by file.

## Approaches
- **Drop everything (chosen):** clean code and schema, at the cost of the data.
- **Keep the data and remove only the code:** leaves dead columns and a dead table. The user picked dropping.

## Left to the builder
Exact file-by-file removal order, and how to split commits (backend, frontend, migration).
