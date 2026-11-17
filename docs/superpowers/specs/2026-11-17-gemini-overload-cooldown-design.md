# Gemini overloaded: rest the model instead of spending quota on it — design

Date: 2026-11-17. Branch: `fix/gemini-overload-cooldown`. Size: small (backend `GeminiCaller` and `GeminiQuotaTracker`, one setting, a config change, tests).

## Why (from `data/logs`, 2026-11-16 and 2026-11-17)

**503s use up the free quota.** From 15:00 to 17:17 (Vietnam time) on 2026-11-17, every call to the main model failed:
- `gemini-3.6-flash` answered 503 17 times;
- `gemini-3.5-flash` answered 503 4 times.

Then both answered 429 "per day limit, limit: 20". That is 21 calls and 0 answers. The free tier counts a request that fails with 503.

**`gemini-3.5-flash` is not a separate fallback.** The evidence:
- its 429 names `model: gemini-3.6-flash`;
- the two models run out at the same moment, every day (2026-11-14, -16 and -17);
- they are overloaded at the same moments.

They share one quota of 20 requests a day, so on the free tier `gemini-3.5-flash` behaves like a second copy of the main model. Asking it after the main model answers 503 spends one more request from the same 20 and very likely fails too.

**The overload is long, not a blip.** On 2026-11-17, `gemini-3.6-flash` answered 503 on every call for 2 h 15 min, starting right at the quota reset (15:00 Vietnam time = midnight Pacific).
- On 2026-11-16, the main model failed after the same reset too (503s and one timeout).
- From 17:39 to 22:03 (Vietnam time) on 2026-11-16, it translated 7 chapters with only one 503 among them.
- Retrying a few seconds later does not help, and every try costs quota.

**The code is not the cause.**
- The model name comes straight from Google's HTTP status (`e.code() == 503`).
- The same build (thinking level `low`, deployed 10:35) got an answer from `gemini-3.6-flash` at 10:53.

## Changes

### 1. Remove `gemini-3.5-flash` from the fallbacks (`application.yml`)

```yaml
    fallback-models:
      - gemini-3.5-flash-lite
```

Add a comment: `gemini-3.5-flash` shares `gemini-3.6-flash`'s free quota (its 429 names gemini-3.6-flash), so it is not a real fallback.

### 2. Rest a model after a 503 (`overload-cooldown`)

- New setting `subtitle-studio.gemini.overload-cooldown`, default `10m`.
  - `0` turns the cooldown off, which is today's behaviour.
  - Startup validation: from 0 to 1 hour.
- When a model answers 503, `GeminiCaller` records it in `GeminiQuotaTracker` as **overloaded until now + cooldown**.
  - This is kept apart from the quota entries: a new `Map<String, Instant> overloadedUntil`, with `recordOverloaded(model, until)`, `isResting(model)` and `earliestRestEnd(models)`.
  - It is in memory only, like the quota entries, and a restart clears it.
- `generate` skips models that are daily-exhausted **or resting**, in the same place where it skips daily-exhausted models today.
- **Every model left is resting** (none exhausted): no call goes to Gemini. The message is:
  `"Gemini is overloaded right now. Try again after HH:mm (Vietnam time)."`
  HH:mm is the earliest rest end, in the same format as the quota message.
- **Some models are resting and the rest are out of quota:** the existing `busyMessage` names the resting models as "overloaded" and the others as "out of free quota until 15:00". No new wording is needed. The wait is "a few minutes" for the overload and 15:00 for the quota.
- **Every model is out of quota:** unchanged ("free quota is used up until …").
- A model that answers successfully has its rest cleared. This matters only for a rest that has already ended, since a resting model is never asked.
- Logging: one INFO line when a model is skipped, with no request text:
  `Gemini model {} is resting after a 503 until {}; skipped`
- `GET /api/gemini/quota` does not change: its `exhausted` list stays quota-only.
  - `firstAvailable` also skips resting models, so the UI names the model that will really be tried.
  - The frontend does not change.

### What this means in use

- The main model answers 503 → the chapter goes to `flash-lite` right away, as today.
- For the next 10 minutes, chapters go straight to `flash-lite` and spend no main-model quota. They show the purple "Fallback model" badge, so they can be translated again later.
- Both models answer 503 → for up to 10 minutes, Translate fails at once with "try again after HH:mm", and no request is spent.
- A day like 2026-11-17 would spend about 13 main-model requests instead of 21, and leave some for later in the day. That is one request every 10 minutes from 15:00 to 17:11, instead of one per chapter attempt plus one for `gemini-3.5-flash`.

## What we do not change

- Timeouts are not rested (they are rare: 5 on 2026-11-16).
- The daily and per-minute 429 handling, the quota UI and the badge stay as they are.
- There are no automatic retries.

## Tests

- `GeminiQuotaTracker`:
  - `recordOverloaded` and `isResting` before and after `until` (using the existing `MutableClock`);
  - `earliestRestEnd`;
  - `firstAvailable` skips resting models.
- `GeminiCallerTest`:
  1. `m1` answers 503 and `m2` answers OK. A second `generate` within the cooldown asks only `m2`, and `onTrying` sees only `m2`.
  2. After the clock moves past the cooldown, `m1` is asked again.
  3. `m1` and `m2` both answer 503. The next `generate` makes **no** HTTP call and throws `"Gemini is overloaded right now. Try again after HH:mm (Vietnam time)."`
  4. `m1` is resting and `m2` is daily-exhausted. The call makes no HTTP call and throws the busy message naming both.
  5. With `overload-cooldown: 0`, the behaviour matches today's (`m1` is asked on every call).
  6. The INFO line "is resting after a 503" is logged, and the prompt text is not.
- Properties: a negative cooldown and a cooldown over 1h fail startup validation, and the default is 10m.
- Existing tests stay green. The convenience `Gemini` constructors in tests pass a cooldown of `0`, so old tests are unaffected.

## Docs

- `PROGRESS.md`: one line.
- `CLAUDE.md`, if it lists the Gemini settings: the new key, plus the note about `gemini-3.5-flash`.
- Project memory: `3.5-flash` shares the quota of `3.6-flash`, and a 503 counts toward the quota.
