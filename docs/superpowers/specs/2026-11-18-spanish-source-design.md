# Spanish as a source language — design

Date: 2026-11-18. Branch: `feat/spanish-source`. Size: small (backend validation and prompt, Wattpad guess, a frontend select and labels; no migration).

## Why

The user wants to translate a Spanish Wattpad novel. Novels only accept `th` and `en` today:
- A Spanish story is guessed as `en` and stored as English.
- The translation prompt then tells Gemini that the original is "tiếng Anh".
- `TextChapterPrompt.languageName()` returns "tiếng Thái" for anything that is not `en`. Simply allowing `es` would therefore tell Gemini the text is Thai.

## Change

Add `es` (Spanish) next to `th` and `en`. Each place that knows the language codes:

| Place | Change |
|---|---|
| `NovelValidator.LANGUAGES` | `Set.of("th", "en", "es")`; the error becomes "Choose Thai, English or Spanish." |
| `TextChapterPrompt.languageName()` | a `switch`: `th` → "tiếng Thái", `en` → "tiếng Anh", `es` → "tiếng Tây Ban Nha"; any other value throws `IllegalStateException` (no silent Thai) |
| `WattpadNovelService.guessLanguage` | Wattpad language name starting with "thai" → `th`; starting with "español", "espanol" or "spanish" (case-insensitive, after strip) → `es`; anything else → `en` |
| `GeminiTextChapterTranslator` | unchanged: `THAI_RULE` stays for `th` only |
| `TextChapterTranslation` (Thai-share check) | unchanged: `th` only |
| `NovelProfileTemplate` | new `_novel_template_es.md` (the English template with the English-specific lines made Spanish); selection: `th` → th, `es` → es, anything else → en |
| Frontend `api/novels.ts` | `SourceLanguage = 'th' \| 'en' \| 'es'` |
| `NovelForm.tsx` select | options Thai, English, Spanish |
| `OriginalPanel.tsx` | `language: SourceLanguage`; the heading names come from one map: `{ th: 'Thai', en: 'English', es: 'Spanish' }`; `lang={language}` already works for `es` |
| `lib/errors.ts`, if it repeats "Choose Thai or English." | the same new wording |

- The DB column `source_language VARCHAR2(5)` has no check constraint, so no migration is needed.
- An existing Wattpad novel that was stored as English can be switched to Spanish in its edit form. The select is already shown for Wattpad novels.

## Not changed

- Screenshot (non-Wattpad) novels: still Thai only.
- The length check (`MIN_LENGTH_RATIO = 0.7`) still fits: Vietnamese is not much shorter than Spanish.
- Content filtering (`PROHIBITED_CONTENT`) depends on the content, not the language. This change does not touch it.

## Tests

- Backend:
  - the validator accepts `es` and rejects `fr` with the new message;
  - `languageName()` for `th`, `en` and `es`;
  - `guessLanguage` for "Español", "Spanish", "Thai", "English" and null;
  - creating and updating a Wattpad novel with `es` stores it;
  - the system prompt for an `es` chapter contains "tiếng Tây Ban Nha" and no Thai rule.
- Frontend:
  - `NovelForm` offers Spanish and submits `es`;
  - `OriginalPanel` shows "Original (Spanish)".

## Docs

- `PROGRESS.md`: one line.
- `CLAUDE.md`, if it lists the source languages: add Spanish.
