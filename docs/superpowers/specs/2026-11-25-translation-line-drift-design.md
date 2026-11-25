# Vietsub translation: catch lines that slide onto the wrong id

Date: 2026-11-25 · Size: small change · Status: approved by the user (2026-11-25)

## Why

Video `k_7PWQPOGjA` was translated in 3 parts after PR #69. In parts 1 and 2, `gemini-3.5-flash-lite` left out the
content of a few English lines in the middle of the part but kept numbering its answer one after another. Every
Vietnamese line after that point sits on an id one to five lines too early. At the end of the part the model ran
out of lines, so the last 5 ids were missing (log: `missingIds=[395, …, 399]` and `[795, …, 799]`).

The app read this as "the model stopped early". It asked again for only those 5 lines and joined the answers.
The result was accepted as complete, but:

- Lines ~284–395 and ~625–795 show the Vietnamese of a later English line (up to 5 lines later).
- Lines 391–395 and 796–800 repeat the same text twice.

`TranslationOutput.check` only compares ids. It cannot tell "this id carries the text of another line". The same
blind spot exists without missing ids: a model that merges two lines in one place and splits one in another
returns the right count, and the slide goes unnoticed.

## Goal

A Vietnamese line is accepted only when the answer shows which English line it translates. Lines that slid onto
the wrong id are treated as missing and asked again, as missing lines already are.

## Non-goals

- No change to how parts are cut (≤ 45 min, ≤ 400 lines), the number of follow-ups (2), or quotas.
- No change to novel (chapter) translation.
- No automatic repair of Vietsubs already saved. `k_7PWQPOGjA` is fixed by hand through the editor API, outside
  this change.

## Approaches

- **A. Echo the start of the source line (chosen).** Each answer item gets a field `src`: the first 3 words of the
  English line, copied as they are. The app checks it against the line it sent with that id. A slide is seen at
  the exact line where it starts, also when the count is right. Cost: a few output tokens per line.
- B. Treat a missing tail as suspect and translate the part again in two halves. Cheap to build, but it guesses,
  costs more requests from the 20/day quota, and misses the "right count, wrong lines" case.
- C. Smaller parts (e.g. 200 lines). Less drift, but more requests and no detection.

## Design

1. **Answer schema.** Each item is `{ id, src, text }`, all required. `SYSTEM_RULES` gains one line: `src` is the
   first 3 words of that block's English text, copied exactly, used only for checking.
2. **Echo check** in `TranslationOutput.check`, on top of the existing rules (sent id, exactly once, non-blank):
   - Normalise both sides: lower case, keep letters and digits, split on everything else.
   - The echo matches when its first `min(2, words in echo, words in source)` words equal the source's first words.
   - A source line with no word at all (`...`, `♪`, `hmm...` → one word is fine) skips the check.
   - A line whose echo does not match is **missing**.
3. **Slide rule.** When 3 or more lines in a row (in sent order) fail the echo check, every line from the first of
   that run to the end of the answer is missing, including lines whose echo happens to match. A slide moves all
   later lines, so a chance match after it cannot be trusted.
4. **Follow-ups unchanged.** Missing lines go to the existing follow-up request (with the 8 translated lines before
   them as context), at most 2 follow-ups. If lines are still missing after that, the part fails as today
   ("try again").
5. **Log.** `TranslationOutput.describe` adds `echoMismatch=N firstMismatchId=K` (no subtitle text).
6. An item without `src` (null or blank) is not echo-checked and is counted as `noEcho` in the log; the schema
   requires `src`, so a real answer always has it.
7. `TranslatedLine` stays `{ id, text }`: `src` is read for the check only and never stored.

## Also in this PR

- The stale test `src/components/logo.test.ts` (2 tests) still expects `apple-touch-icon` = `/logo.webp`, but PR #73
  changed it to `/apple-touch-icon.png`. Update the test to the new markup so the suite is green.

## Constraints

- Backend tests with a fake Gemini answer: a slid answer (the `k_7PWQPOGjA` shape: 5 lines dropped mid-part, tail
  missing) ends with every line on its right id after the follow-up; a right-count merge/split answer is caught;
  echoes with different case, punctuation or a missing first comma still match; lines with no words are not
  checked; `describe` shows the new counts.
- `mvn test -Dskip.npm` and the frontend suite green.

## Left to the builder

- Whether 2 or 3 words is the right echo length after trying it on a real answer (keep the check on the first 2).
