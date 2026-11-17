# Gemini overload cooldown — implementation plan

Spec: `docs/superpowers/specs/2026-11-17-gemini-overload-cooldown-design.md`
Branch: `fix/gemini-overload-cooldown`, created from the latest `main`.

**Do not touch** `data/prompts/novels/BreathlessLesson.md` or `data/prompts/novels/TORQUE.md`. They hold the user's uncommitted edits. Never stage, commit, revert or overwrite them, and stage only the files this plan names.

Never log request or answer text, or the API key.

**Change from the spec:** `firstAvailable` stays **quota-only**. The quota toast (`frontend/src/lib/geminiQuota.ts:56`) turns a null `nowUsing` into "No model left until then", next to the 15:00 reset time. If `firstAvailable` skipped resting models, that toast would wrongly tell the user the wait lasts until 15:00. `GET /api/gemini/quota` and the frontend do not change.

## Task 1: setting and config

In `SubtitleStudioProperties.Gemini`:
- Add a last record component `Duration overloadCooldown`.
- In the compact constructor:
  - null becomes `Duration.ofMinutes(10)`;
  - throw `IllegalArgumentException` unless the value is from 0 to 1 hour, in the same message style as `thinking-level`.
- The existing convenience constructors pass `Duration.ZERO`. Existing tests then behave as today. Note this in their Javadoc.

In `application.yml`, under `gemini`:
- `fallback-models` keeps only `gemini-3.5-flash-lite`. Rewrite its comment:
  - The model is tried when the main model is overloaded (503), resting or out of free quota (429).
  - `gemini-3.5-flash` was removed on 2026-11-17: it shares `gemini-3.6-flash`'s free quota (its 429 names gemini-3.6-flash) and is overloaded at the same moments.
- After `thinking-level`, add:
  ```yaml
      # After a 503 ("overloaded") the model is not asked again for this long: on the free tier a 503 still uses one of
      # the 20 daily requests, and overloads after the 15:00 (Vietnam time) reset can last hours. 0 = off.
      overload-cooldown: 10m
  ```

Look in `src/test/resources/application-test.yml` and in the tests that assert on `fallback-models` or on `gemini-3.5-flash`:
- set `overload-cooldown: 0` in the test configuration if Spring tests share one tracker and could leak a rest between tests;
- adjust any test that assumes the production fallback list.

Properties tests:
- the default is 10m;
- `-1s` and `61m` throw.

## Task 2: `GeminiQuotaTracker` rests

- Add `private final Map<String, Instant> restingUntil = new ConcurrentHashMap<>();`.
- Add these methods:
  - `void recordOverloaded(String model, Instant until)`: stores the later of the existing value and `until`.
  - `boolean isResting(String model)`: `until` is after `clock.instant()`.
  - `void clearRest(String model)`.
  - `Instant earliestRestEnd(List<String> models)`: the earliest active rest end among `models`, or null.
- `clear()` also clears `restingUntil`.
- Do **not** change `record`, `active`, `isDailyExhausted`, `firstAvailable` or `earliestDailyReset`.
- Update the class Javadoc: it also remembers 503 rests, which are in memory only, cleared by a restart, and not shown in `/api/gemini/quota`.

Tests in `GeminiQuotaTrackerTest`, using the existing clock helper:
- resting before `until`, and not resting after it;
- a later `recordOverloaded` with an earlier `until` does not shorten the rest;
- `earliestRestEnd` returns the right value, and null when no model is resting;
- `clear()` removes rests;
- `firstAvailable` ignores rests.

## Task 3: `GeminiCaller`

In `generate(parts, config, onTrying, allowTruncated)`:
- Build these lists:
  - `exhaustedModels`: `all` filtered by `quota::isDailyExhausted`, as today. Today they are added to `outOfQuota`.
  - `restingModels`: `all` filtered by "not daily-exhausted and `quota.isResting(m)`".
  - `models`: the rest, in order.
- For each resting model:
  - `log.info("Gemini model {} is resting after a 503 until {}; skipped", model, until)`; add a small `restingUntil(model)` getter to the tracker if needed;
  - add the model to `overloaded`, and set `busy = true`.
- Before any call, if `models` is empty:
  - if `restingModels` is not empty and `outOfQuota` is empty, throw
    `"Gemini is overloaded right now. Try again after " + RESET_FORMAT.format(quota.earliestRestEnd(all)) + " (Vietnam time)."`;
  - if both `restingModels` and `outOfQuota` are not empty, throw `busyMessage(all, overloaded, noAnswer, outOfQuota)`;
  - otherwise, when every model is exhausted, keep today's quota message.
- On a 503: keep the existing WARN, `busy` and `overloaded`. Also, if `settings.overloadCooldown()` is positive, call `quota.recordOverloaded(model, quota.now().plus(cooldown))`.
- On a successful answer: `quota.clearRest(answeredBy)`.
- Leave the rest of the method as it is.
- Update the class Javadoc to describe the rest after a 503.

## Task 4: `GeminiCallerTest`

Build the settings with the canonical constructor, a 10m cooldown and a `MutableClock`-backed tracker (the test class already has one).

Cases:
1. `m1` answers 503 and `m2` answers OK. A second `generate` asks only `m2`: `onTrying` sees `[m2]`, and the server got no second request for `m1`.
2. Move the clock forward by 10m and 1s. `m1` is asked again.
3. `m1` and `m2` both answer 503, so the first call throws the busy message. A second call makes no HTTP request and throws `"Gemini is overloaded right now. Try again after HH:mm (Vietnam time)."`, with the expected time.
4. `m1` is resting and `m2` is daily-exhausted (record it in the tracker). The call makes no HTTP request and throws the busy message that names `m1` as overloaded and `m2` as out of free quota.
5. With cooldown 0, `m1` answers 503 on each call and is asked on every call.
6. After the rest has ended, `m1` answers OK. `isResting(m1)` is false.
7. The INFO line `is resting after a 503` appears in `CapturedOutput`, and the prompt text does not.

## Task 5: docs, verify, PR

- `PROGRESS.md`: one line.
- `CLAUDE.md`, if it lists the Gemini settings: `overload-cooldown`, and the note that `gemini-3.5-flash` is not a fallback.
- Run the full `mvn -q test` suite. The frontend is unchanged.
- Commit:
  - the message is in English and ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`;
  - stage only the files this plan names.
- Push and create the PR with `gh pr create --base main`:
  - the body has a summary, the test command, the result, and links to the spec and the plan;
  - it ends with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- Do **not** merge or deploy. Report the PR link and the test counts.
