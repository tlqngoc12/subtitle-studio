# Translation: keep good lines, ask again for missing ones

Date: 2026-11-24. Status: approved by the user (no separate review requested).

## Problem

Video `k_7PWQPOGjA` (part 1/2 = 891 lines) failed three times in a row:

| Model | Answer |
|---|---|
| gemini-3.1-flash-lite | all 891 lines valid + 1 extra id → rejected |
| gemini-3.5-flash-lite | stopped after 866 lines (25 missing at the end) → rejected |
| gemini-3.5-flash-lite | stopped after 755 lines (136 missing at the end) → rejected |

`TranslationOutput.validate` throws away the whole answer when any line is missing, duplicated, blank or extra,
so hundreds of good lines are lost and the next try starts over. Lite models tend to stop early on long lists.

## Changes

1. **Extra ids are dropped, not an error.** An id Gemini returns that was not sent is ignored (logged as a count).
   Missing, duplicated or blank lines still count as not valid.
2. **Ask again only for what is missing.** In `GeminiTranslatorImpl.translate`, after an answer, keep the valid
   lines and send a follow-up request with only the not-valid source lines. At most **2 follow-up requests** per
   call (so at most 3 requests in total). If lines are still missing after that, fail with the usual
   `Gemini returned missing or mismatched lines (valid/total valid), try again.`
   - A follow-up's "Đoạn ngay trước" context = up to 8 already-translated lines right before the first missing
     line (English + Vietnamese), falling back to the call's own previous lines when nothing precedes it.
   - An answer that is not valid JSON counts as "nothing valid" and uses one attempt (no immediate failure).
   - Errors from the caller itself (quota, overload, refusal, timeout) are not retried here; they propagate as now.
   - Each follow-up is logged (model, how many lines asked, how many came back valid); never subtitle text.
3. **At most 400 lines per part.** `TranslationParts.split` starts a new part when the current one reaches the
   45-minute duration **or** 400 cues, whichever comes first. A constant (`MAX_LINES_PER_PART = 400`), not a
   setting. Videos with ≤ 400 cues and ≤ 45 minutes still go in one request. Saved partial files from an older
   split are already discarded by `usableParts` when the ranges differ, so no migration is needed.

## Out of scope

UI changes, new settings, retrying quota/overload errors, changing models or prompts.

## Tests

- `TranslationOutputTest`: extra id is dropped; missing/duplicate/blank still not valid.
- `GeminiTranslatorImplTest` (fake server): answer missing the tail → follow-up asks only for those ids and the
  merged result is in order; still missing after 2 follow-ups → error with the right count; invalid JSON then a
  good answer → success; extra id only → success with one request.
- `TranslationPartsTest`: split at 400 cues within 45 minutes; duration rule still applies.
- `TranslationServiceTest`: existing tests still pass (adjust any that relied on the old split).
