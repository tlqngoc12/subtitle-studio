# Plan: translation keeps good lines and asks again for missing ones

Spec: `docs/superpowers/specs/2026-11-24-translation-missing-lines-design.md`.
Branch: `fix/translation-missing-lines` from latest `main`. One PR. TDD for each task (failing test first).

Working tree note: `data/` has unrelated uncommitted changes — never stage anything under `data/`.
Stage files explicitly (`git add <path>`), not `git add -A`.

## Task 1 — `TranslationOutput`: split valid lines from the rest

File: `src/main/java/com/subtitlestudio/translate/TranslationOutput.java` (+ `TranslationOutputTest`).

- Add `record Checked(List<TranslatedLine> valid, List<SourceLine> missing, int extra)` and
  `static Checked check(List<SourceLine> sent, List<TranslatedLine> got)`:
  - valid = sent ids that appear exactly once with non-blank text (text normalised as today), in `sent` order;
  - missing = the other sent lines (absent, duplicated or blank), in `sent` order;
  - extra = number of distinct ids not in `sent`.
- `validate` keeps its contract except extra ids no longer fail: implement it as `check` + throw
  `invalid(valid.size(), sent.size())` when `missing` is not empty.
- `describe` unchanged.
- Tests: change `rejectsExtraId` to `dropsExtraId` (returns the 3 sent lines); add tests for `check`
  (missing tail, duplicate goes to missing, blank goes to missing, extra counted).

## Task 2 — `GeminiTranslatorImpl`: follow-up requests for missing lines

File: `src/main/java/com/subtitlestudio/translate/GeminiTranslatorImpl.java` (+ `GeminiTranslatorImplTest`,
`FakeGeminiServer` if it needs queued replies).

- `static final int MAX_FOLLOW_UPS = 2;`
- Flow in `translate(video, profile, lines, onTrying)`:
  1. `ask(video, profile, lines)` → parse JSON (parse failure → empty list, log as today) → `check`.
  2. Collect valid lines in a `Map<Integer, TranslatedLine>`.
  3. While `missing` not empty and follow-ups < 2: build context = up to `TranslationService.CONTEXT_LINES` (8)
     already-valid lines immediately before the first missing line (as `ExamplePair(english, vietnamese)`;
     fall back to `video.previousLines()` when none), send `missing` only, merge valid answers, log
     `Gemini {} follow-up {}/{}: asked {} lines, {} valid` (no text).
  4. Still missing → log `describe`-style summary (counts only) and throw `TranslationOutput.invalid(valid, total)`.
  5. Return lines in `lines` order. Log extra ids count when > 0.
- Exceptions thrown by `caller.generate` propagate unchanged (no retry).
- `onTrying` is passed to every request so the active model shown in the UI stays right.
- Tests (fake Gemini server): tail missing → 2nd request contains only the missing ids → merged result;
  still missing after 3 requests → `(valid/total valid)` message and exactly 3 requests made;
  invalid JSON then good → success; only an extra id → success after 1 request.
  Update existing tests that expected an immediate failure on missing lines (they now see follow-ups: give the
  fake server enough bad replies, or assert the new count).

## Task 3 — `TranslationParts`: at most 400 lines per part

File: `src/main/java/com/subtitlestudio/translate/TranslationParts.java` (+ `TranslationPartsTest`).

- `static final int MAX_LINES_PER_PART = 400;` In `split`, start a new part when
  `startsMs.get(i) - startsMs.get(from) >= partMs || i - from >= MAX_LINES_PER_PART`.
- Keep an overload `split(starts, partMs, maxLines)` for tests if it makes them simpler.
- Tests: 401 cues within 1 minute → parts of 400 + 1; duration rule still splits; fix any `TranslationServiceTest`
  case that assumed the old split.

## Task 4 — Docs

- Update the translation section of `CLAUDE.md` / `README.md` / `PROGRESS.md` (whatever describes parts and
  the "missing or mismatched lines" error) with: 400-line cap, up to 2 follow-ups for missing lines, extra ids
  ignored. Add a short PROGRESS.md entry dated 2026-11-24.
- Comment in `application.yml` next to `part-duration`: parts are also capped at 400 lines.

## Finish

- `./mvnw test` (or the project's usual test command per CLAUDE.md) — all green; paste the summary in the PR.
- Push, `gh pr create --base main`, English title/body: summary, how it was tested, links to the spec and plan.
  Do not merge.
