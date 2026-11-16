# Gemini timeout falls back to the next model — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. One branch `fix/gemini-timeout-fallback` from `main`, one PR.

**Goal:** A Gemini model that times out no longer ends the whole call; the next fallback model is tried, like HTTP 503. Timeouts and failed notebook updates are logged.

**Architecture:** In `GeminiCaller.generate`, the `GenAiIOException` catch moves inside the per-model loop. A timeout marks the call `timedOut = true` and continues; other IO errors still end the call. After the loop, with no response: timed out (and nothing else answered) → "Gemini did not respond in time."; else the existing busy/quota messages. `NotebookService.fail` logs the novel id and the user message.

**Tech Stack:** Java 21, Spring Boot, google-genai SDK, JUnit 5 + AssertJ (existing fake HTTP server in `GeminiTranslatorImplTest`).

**Spec:** agreed in chat 2026-11-15 (root cause: `GeminiCaller.java:135` catches `GenAiIOException` outside the model loop, so a timeout skips the fallback models; on 2026-11-14 the notebook update after chapter 25 failed this way and nothing was logged).

## Global Constraints
- User-facing messages unchanged: "Gemini did not respond in time." / "Could not translate: connection to Gemini failed." / busy and quota messages as today.
- Log lines never contain request or answer text. Timeout log: `log.warn("Gemini model {} did not respond within {}s", model, settings.timeout().toSeconds())`. Notebook failure log: `log.warn("Notebook update of novel {} failed: {}", novelId, message)`.
- No change to `timeout: 3m` or the model list.

## Review Focus
1. Mixed outcomes: model 1 times out, model 2 is 503, model 3 times out → "did not respond in time" (a timeout happened and nobody answered). Model 1 503, model 2 429 daily, model 3 times out → also "did not respond in time".
2. Model 1 times out, model 2 answers → success, `answer.model()` is model 2, `onTrying` saw both.
3. A non-timeout IO error (connection refused) on model 1 still ends the call at once with "connection to Gemini failed" (no fallback — unchanged behaviour).
4. Quota-exhausted models are still skipped before the loop.

---

### Task 1: Timeout falls through to the next model

**Files:** Modify `src/main/java/com/subtitlestudio/translate/GeminiCaller.java`; Test `src/test/java/com/subtitlestudio/translate/GeminiTranslatorImplTest.java` (or a new `GeminiCallerTest` using the same fake-server helpers).

- [ ] Step 1: Failing tests (fake server: a model path that sleeps longer than a short test timeout, e.g. `Duration.ofMillis(300)`):
  - `aTimeoutFallsBackToTheNextModel` → main model sleeps, fallback answers → returns fallback's text, `answer.model()` = fallback.
  - `allModelsTimingOutFails` → both sleep → `TranslationFailedException` with user message "Gemini did not respond in time."
  - `aTimeoutThenBusyStillReportsTheTimeout` → main sleeps, fallback 503 → "Gemini did not respond in time."
  - `aConnectionErrorDoesNotFallBack` → keep/adjust any existing test proving connection failure message; assert fallback was not called.
- [ ] Step 2: Run `mvn -q test -Dtest=GeminiTranslatorImplTest` (and the new class) — FAIL.
- [ ] Step 3: Implement as in Architecture (catch `GenAiIOException` per model; `causedByTimeout` → log + `timedOut = true; continue`; else throw the connection message). Precedence after the loop: `timedOut` → timeout message; then `busy`; then quota.
- [ ] Step 4: Run the same tests — PASS.
- [ ] Step 5: Commit `fix: try the fallback models when a Gemini model times out`.

### Task 2: Log failed notebook updates

**Files:** Modify `src/main/java/com/subtitlestudio/novel/NotebookService.java` (`fail(long, String)`).
- [ ] Add the log line from Global Constraints in `fail`. Remove the now-duplicate generic warn in `runOne`'s last catch only if `fail` already covers it (keep the one in `drain`).
- [ ] Run `mvn -q test -Dtest='NotebookService*'` — PASS.
- [ ] Commit `fix: log why a notebook update failed`.

### Task 2b: Drop over-long notebook items instead of refusing the update

**Files:** Modify `NotebookMerger.java` (`check` now returns a repaired `NotebookUpdate`) and `NotebookMergerTest.java`.
- A character, glossary entry or addressing entry with an over-long field is dropped; an over-long character `sourceName` becomes null. Each drop logs the field and length only (never the text).
- `storySoFar` and `chapterSummary` over their limits still refuse the whole update.
- Tests: dropped character, nulled sourceName, dropped glossary and addressing entries, storySoFar/chapterSummary still throw.
- Commit `fix: drop over-long notebook items instead of refusing the update`.

### Task 3: Docs and PR
- [ ] PROGRESS.md: add `### 2026-11-15: Gemini quá thời gian chờ thì thử model dự phòng ✅` (section 8, after the last entry) with 2 bullets.
- [ ] `mvn -q test` — all pass.
- [ ] Commit, push, `gh pr create --base main` (English title/body, tests run + results, link to this plan). Do not merge.
