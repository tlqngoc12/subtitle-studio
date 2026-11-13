# Wattpad: fetch and translate one chapter at a time (design)

Date: 2026-11-13 · Status: draft, waiting for user review · Builds on [2026-11-12-wattpad-novels-design.md](2026-11-12-wattpad-novels-design.md)

## Why

Today a Wattpad novel takes three steps: tick parts, **Import** (original text only), then open each chapter and press
**Translate**. The user wants one button per chapter that fetches the original **and** translates it, with the
**safest and cheapest token use** as the deciding criterion.

Fetching from Wattpad costs no Gemini tokens; only translation does. Tokens are saved by translating only the chapters
the user wants and **never having to translate again**. Translating chapter N uses the story notebook as of before
chapter N plus the end of chapter N-1 (`ChapterTranslationService`, `NotebookPromptSource.textBefore`), so out-of-order
or parallel translations produce weaker translations (and re-translations), and parallel Gemini calls hit 429 quota
errors more often.

## Goals

- **New novel › From Wattpad › Fetch** shows the story details (as today) **and the list of chapters** (title, words,
  date), read-only. No Gemini call, no chapter saved.
- On the novel page, **Wattpad tab**, every chapter row gets its own button **Fetch & translate**: it fetches the part's
  original text, creates the Draft chapter and starts its translation in one click.
- **One at a time per novel:** while a chapter of this novel is translating, or the notebook is updating, every
  Fetch & translate button of that novel is disabled (and the server refuses).
- **Order hint:** the row of the first chapter (in story order) that is not translated yet is marked "Next". Pressing a
  later chapter while an earlier one is still untranslated asks for confirmation ("Chapter 3 is not translated yet. The
  notebook will not know about it. Translate chapter 5 anyway?").

## Non-goals

- No queue, no "translate all", no automatic translation of new Wattpad parts (approach B and C were rejected).
- No change to the chapter page, Translate again, Reload original, Publish, render or the public site.
- No change to screenshot novels.

## Anti-goals

- A click must never start two Gemini translations of the same novel at once.
- A failed translation must never lose the fetched original (the chapter stays, status FAILED, retry translates only;
  no second Wattpad fetch).
- Never call Wattpad or Gemini inside a DB transaction (existing rule).

## Approaches (user picked A)

| | Approach | Trade-off |
|---|---|---|
| **A (picked)** | A Fetch & translate button per chapter, one chapter at a time, story order suggested | Cheapest and fully under control; one click per chapter |
| B | Tick several chapters into a queue, the server translates them one by one in order | Fewer clicks, but easy to spend a lot of quota at once; needs a queue |
| C | Keep bulk Import and translate everything automatically | Fastest, most tokens, hard to stop |

## Design

### Backend

- `WattpadNovelPreview` gains `parts: List<WattpadPreviewPart>` (`partId`, `title`, `wordCount`, `modifiedAt`,
  `deleted`). `preview()` already calls `storyWithParts`, so no extra Wattpad request.
- `WattpadPartRow` is unchanged. The tab takes each row's state from the novel detail (`chapters[].translationStatus`
  via `importedChapterId`, plus `notebookStatus`). Polling therefore uses `GET /api/novels/{id}` and **never calls
  Wattpad** (the parts endpoint calls Wattpad on every request).
- New endpoint `POST /api/novels/{id}/wattpad/parts/{partId}/fetch-translate`:
  1. Refuse with 409 `NOVEL_TRANSLATION_BUSY` if any chapter of the novel is `TRANSLATING` or the notebook is `UPDATING`.
     Also check up front what `ChapterTranslationService.start` would refuse (Gemini not configured, no translation
     profile), so no chapter is created for a request that cannot translate.
  2. If the part is already a chapter: do not fetch again; just start translating it (when `NONE` or `FAILED`; 409 if
     `TRANSLATED`, use Translate again on the chapter page for that).
  3. Otherwise fetch the part text (outside a transaction, same errors as Import: deleted, empty, Wattpad not answering),
     save it as a Draft chapter (`chapterService.addFromSource`), then call `ChapterTranslationService.start`.
  4. Returns the chapter (`ChapterDetail`, translation status `TRANSLATING`), 202.
  If the fetch succeeds and starting the translation fails, the chapter is kept (status `NONE`) and the error returned;
  the row then shows "Translate" for a retry.
- The busy check and the start are not atomic across two browser tabs; this is a single-admin local app, so the
  existing per-chapter `TRANSLATING` guard is enough as a backstop (builder's call whether to add a per-novel lock).
- The bulk `POST /api/novels/{id}/wattpad/import` endpoint stays (other callers / tests), but the UI no longer uses it.

### Frontend

- **New novel › From Wattpad:** under the prefilled form, a read-only "Chapters on Wattpad (N)" list (title, words,
  date; deleted parts greyed). Text: "Create the novel, then fetch and translate chapters one by one in the Wattpad
  tab."
- **Wattpad tab (`WattpadParts`)**: checkboxes, Select all new and Import are removed. Each row:
  - not imported → **Fetch & translate** (primary on the "Next" row, secondary on others);
  - imported, `NONE` or `FAILED` → **Translate** (same endpoint);
  - `TRANSLATING` → "Translating…" spinner text, buttons disabled;
  - `TRANSLATED` → "Translated" badge linking to the chapter.
  - "Check for new chapters" stays.
  - While busy (a chapter translating or the notebook updating), the tab polls the parts list (reuse the polling the
    novel page already does for translating chapters) and re-enables buttons when done.
- Toasts: success "Translating <chapter title>…", 409 busy "Another chapter is still translating. Wait for it to
  finish.".
- Follows `docs/ui/screen-layout.md` and the brand colours (orange primary, purple for "Next" / info badges).

## Left to the builder

- Exact polling interval and where it lives (reuse what `NovelPage` does for translating chapters).
- Error codes/messages wording beyond the ones above, matching `lib/errors.ts`.
- Tests: service tests with the Wattpad stub (never real Wattpad), busy-guard tests, component tests for row states
  and the out-of-order confirmation.
