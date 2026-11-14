# Novel busy: say why, and show it before the click — design

Date: 2026-11-15. Branch: `feat/novel-editor-ux` (same PR; it touches the same pages). Size: small (backend error detail plus one DTO field; frontend message, disabled state and a status line).

## Why

On 2026-11-14 the user's Fetch & translate failed with "Another chapter is still translating", but no chapter was translating. The notebook was updating after chapter 24: `gemini-3.6-flash` and `gemini-3.5-flash-lite` both returned 503, and `gemini-3.5-flash` answered about 3.5 minutes later.

The rule (one Gemini job per novel at a time) is right. The problems:
- The message names the wrong cause.
- The user only learns it after clicking.

## Backend

- `NovelTranslationBusyException` gets a `reason`, either `CHAPTER_TRANSLATING` or `NOTEBOOK_UPDATING`, and a `chapterNo`:
  - for `CHAPTER_TRANSLATING`, the translating chapter's number;
  - for `NOTEBOOK_UPDATING`, `Novel.notebookPendingChapterNo`, or the latest published chapter if that is null.
- Its message is:
  - "Chapter N is still translating.", or
  - "The notebook is still updating after chapter N."
- `ApiExceptionHandler` keeps code `NOVEL_TRANSLATION_BUSY` (409) and adds ProblemDetail properties `reason` and `chapterNo`.
- `ChapterDetail` gains `notebookStatus` (`IDLE` | `UPDATING` | `FAILED`) and `notebookChapterNo` (the pending chapter while updating, else null), so the chapter page knows without another call.
- Tests:
  - service: both reasons with their chapter numbers;
  - controller: the ProblemDetail has `reason` and `chapterNo`;
  - `ChapterDetail` JSON has the two fields.

## Frontend

- `lib/errors.ts`, `NOVEL_TRANSLATION_BUSY`, read from the problem's `reason`:
  - `CHAPTER_TRANSLATING`: title "Chapter N is still translating", hint "Wait for it to finish, then try again."
  - `NOTEBOOK_UPDATING`: title "The notebook is still updating after chapter N", hint "Gemini can take a few minutes when it is busy. Try again when it finishes."
  - Missing reason (older backend): the current text.
- **Disable before the click.** While the novel's notebook is `UPDATING` or one of its chapters is `TRANSLATING`, these buttons are disabled, wrapped in a `<Tip>` with the same title text as above:
  - Fetch & translate (Wattpad tab);
  - Fetch & translate next (chapter bar and Chapters tab);
  - Translate / Translate again (chapter `⋯` menu).
- **Status line.**
  - On the novel page (above the tabs) and on the chapter page (in the status line under the bar), show a muted line with a `LoaderCircle` icon: "Notebook updating after chapter 24…" or "Chapter 25 is translating…".
  - It goes away when the job ends.
  - A notebook `FAILED` is shown as today (Notebook tab with Retry) and does not disable anything, which matches the backend.
- **Polling.**
  - The chapter page also polls `GET /api/chapters/{id}` (the existing `useChapterPolling` interval) while `notebookStatus === 'UPDATING'`, and stops when it is not.
  - The novel page's `useNovelPolling` must poll while the notebook is `UPDATING`; check it and add the case if missing.
  - No polling calls Wattpad or Gemini; this is a DB read.
- When a running job ends during polling and the user had been blocked, show nothing extra. The buttons simply re-enable.
- Tests:
  - the error texts for both reasons, and the missing-reason fallback;
  - each listed button is disabled with its tooltip when the notebook is updating and when another chapter is translating;
  - the status line appears and disappears with polling (fake timers);
  - the chapter page polls while the notebook is updating and stops after;
  - a notebook `FAILED` does not disable.

## Non-goals

Allowing a translation while the notebook updates; changing Gemini timeouts or fallbacks.

## Done when

- `mvn test`, `npx vitest run` and `npx tsc -b` are green.
- `CLAUDE.md` (Wattpad section, busy rule) mentions `reason` and `chapterNo`, and the disabled-before-click behaviour.
- `PROGRESS.md` has an entry.
