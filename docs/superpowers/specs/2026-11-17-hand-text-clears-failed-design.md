# Saving a hand-written text clears a failed translation — design

Date: 2026-11-17. Branch: `fix/hand-text-clears-failed`. Size: tiny (one service method, tests; no frontend code change).

## Why

On 2026-11-17, Gemini failed to translate chapters 8 to 12 of novel 4955, so the user pasted their own translations.
- Chapters 8 to 11 were **published**. `ChapterTranslationService` publish (around line 136) turns a `FAILED` chapter into `TRANSLATED` when its text was written by hand.
- Chapter 12 (id 20006) was only **saved**. Saving does not touch the status, so the chapter stayed `FAILED`.

"Fetch & translate next" (`WattpadNovelService.fetchAndTranslateNext`) picks the first part that is not `TRANSLATED`. It therefore picked chapter 12 instead of fetching chapter 13. If Gemini had answered, it would have **replaced the user's text** (`setTextVi(result.text())`).

## Change

In `ChapterService.update`, after the text and page edits, add one rule. When **all** of these hold:
- `textChanged` is true;
- `c.getTranslationStatus() == FAILED`;
- `ChapterText.complete(c, pages)` is true (a non-blank whole text, or every page has a translation; the same check Publish uses);

then:
- set `translationStatus = TRANSLATED` and `translationError = null`;
- leave `translatedAt` and `translationModel` as they are (null for a hand translation), so no model and no fallback badge is shown.

Add a comment that mirrors the Publish one: "the text was written by hand: the failed Gemini run no longer matters."

### Effects

- The chapter page shows the chapter as translated, and the menu item becomes **Translate again**, red because it overwrites.
- "Fetch & translate next" and the Wattpad tab's **Next** badge move on to the next part, since they use the same `TRANSLATED` rule.
- `TRANSLATING` chapters cannot be edited (`editable`), so a save never races a running translation.

### Not changed

- `NONE` chapters stay `NONE` when text is saved. That case did not come up, and a `NONE` chapter is often filled in step by step.
- Publish keeps its own FAILED → TRANSLATED rule.
- There is no data migration. A chapter that is already `FAILED` with hand text, like chapter 12 today, is fixed by Publish or by the next save that changes its text.

## Tests (`ChapterServiceTest` or the existing update tests)

1. A `FAILED` chapter with a translation error, saved with a non-blank text, becomes `TRANSLATED` with a null error. `translatedAt` and `translationModel` stay null.
2. A `FAILED` page-based chapter where the save fills **every** page becomes `TRANSLATED`. If one page is still empty, it stays `FAILED`.
3. A `FAILED` chapter saved with a blank text, or with only a title or label change (`textChanged` is false), stays `FAILED`.
4. A `NONE` chapter saved with text stays `NONE`.
5. A `TRANSLATED` chapter stays `TRANSLATED`, as today.
6. `WattpadNovelService.fetchAndTranslateNext`: after chapter 12 is saved by hand, the call fetches the next part instead of restarting chapter 12. Add this only if the existing test setup makes it cheap; otherwise tests 1 to 5 are enough.

## Docs

`PROGRESS.md`: one line.
