# Novel notebook: limit name fields, clean leaked text — design

Date: 2026-11-14. Branch: `feat/novels-ui-review` (merged into that PR, per the user). Size: small (backend only).

## Why

The notebook's Characters tab showed "Bonnie Pattraphus (Bonnie PattraphusFormat constraints check: … standard standard standard …)": Gemini fell into a repetition loop and wrote its own self-check text into a JSON **string** field, so the JSON stayed valid and was accepted. `NotebookMerger.check` caps `storySoFar`, `chapterSummary`, `profile`, `currentState`, but **not** `name`, `sourceName`, nor glossary/addressing fields.

Measured on 2026-11-14:
- My Grumpy Vampire: one `sourceName` of 8,831 chars.
- Be My Sugar: two `sourceName`s of 41,627 and 45,467 chars, plus five of 400–770 chars (profile text in the name field).

Impact: `NotebookText` sends at most 12,000 chars of notebook to each translation and drops characters to fit, so polluted entries crowd out real characters in the translation context.

## Changes

1. **Reject oversized updates** (`NotebookMerger.check`), with the existing `InvalidNotebookUpdateException` → notebook `FAILED`, the user retries as today. New limits (constants next to the existing ones):

   | Field | Max chars |
   |---|---|
   | character `name` | 80 |
   | character `sourceName` | 120 |
   | glossary `source` | 120 |
   | glossary `target` | 120 |
   | glossary `note` | 300 |
   | addressing `from` | 80 |
   | addressing `to` | 80 |
   | addressing `rule` | 300 |

2. **Ask for it in the request.** In `GeminiNotebookUpdater`:
   - set `maxLength` on those string schemas if the GenAI `Schema` builder supports it (otherwise skip; the merger check is the guard);
   - add one line to `SYSTEM_RULES`: `sourceName` is only the character's name in the original language (≤ 60 characters), never a description; descriptions go in `profile`.

3. **Clean what is already stored, without touching the DB by hand.** A pure `NotebookContent sanitized()`, or a static helper in `NotebookMerger`:
   - drops `sourceName` values longer than 120 (sets them to `null`; the Vietnamese `name` stays);
   - drops glossary and addressing entries whose fields exceed the limits.

   It is applied when content is **read**: `NotebookService` view, `NotebookText` for prompts, and the "old" side of a merge. The UI and the next translation are clean immediately, and the next successful update stores the cleaned version. Versions stay as they are in the DB, and are shown cleaned.

4. **No log of content.** Messages and logs carry only the field name and length, as today (`"Gemini's notebook sourceName is too long (8831 > 120)."`).

## Tests (write first)

- `NotebookMergerTest`:
  - each new limit rejects one char over and accepts exactly the limit;
  - merging onto an old notebook whose character has an 8,831-char `sourceName` yields `sourceName == null` and keeps `name`, `profile`, `currentState`;
  - an over-long glossary entry from old content is dropped.
- `NotebookTextTest`: a notebook with a polluted `sourceName` renders the character as `name` only, and does not crowd out the other characters.
- `NotebookService` view test: the returned content is sanitized.
- `GeminiNotebookUpdaterTest` (fake Gemini server): `SYSTEM_RULES` contains the sourceName rule, and `maxLength` is present in the sent schema if it was added.

## Non-goals

Manual notebook editing (still backlog); rebuilding later notebook versions; changing any other limits.

## Done when

`mvn test` green (and `mvn verify -Poracle -Dskip.npm` not needed: no SQL). `CLAUDE.md` Novels notebook note: the field limits and "content is sanitized on read". `PROGRESS.md` entry. After deploy, the Characters tab of both novels shows no leaked text.
