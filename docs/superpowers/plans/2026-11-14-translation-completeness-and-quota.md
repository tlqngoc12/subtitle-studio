# Translation completeness checks and Gemini quota toasts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reject short or cut-off text-chapter translations, remember exhausted Gemini models and skip them until reset, and toast the user when a model runs out of quota. Check quota only around translate actions; never on a timer.

**Architecture:** Two checks in `GeminiTextChapterTranslator`; an in-memory `GeminiQuotaTracker` fed by `GeminiCaller`; `GET /api/gemini/quota`; frontend `checkGeminiQuota()` called by the translate-start API functions and by the three polling hooks when the model changes.

**Tech Stack:** Java 21 / Spring Boot 3.5 / JUnit 5 + the fake Gemini server; React + TypeScript / Vitest + RTL + sonner.

**Spec:** `docs/superpowers/specs/2026-11-14-translation-completeness-and-quota-design.md` (read it fully; its test lists are binding).

## Global Constraints

- Branch `fix/translation-completeness` (checked out). One commit per task, message English, ending `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. No push, no PR.
- TDD every task: test → fail for the right reason → implement → green.
- Tests never call real Gemini (`FakeGeminiServer` / fakes). Logs: model, ids and numbers only, never chapter text, prompts or the API key (`OutputCaptureExtension` where logging changes).
- `Locale.ROOT` for formatting; times shown to the user in `Asia/Ho_Chi_Minh`.
- **No `setInterval`/periodic polling for quota** anywhere in the frontend.
- Admin strings English; `PublicApp` untouched.
- Edit with the editor tools (no Python/sed rewrites). Leave nothing running in the background.
- Frontend from `frontend/`: `npx vitest run`, `npx tsc -b`. Backend from repo root: `mvn -q test -Dskip.npm`, counts from `target/surefire-reports/*.txt`.

## Review Focus

1. A source ending in a scene break (`***`) or no punctuation: the cut-ending check must not fire — Task 1 test.
2. Several split pieces, of which one is short: only that piece is retried or split, and the chapter is saved whole or not at all — Task 1 `TextChapterTranslation` test.
3. The tracker after its reset time: the model is asked again and the entry is gone from `/api/gemini/quota` — Task 2 test with a moved `Clock`.
4. The same daily entry seen by a start action and then by a polling hook: exactly one toast — Task 3 test.
5. A quota check that fails (500 or network): no error toast, and translation UI unaffected — Task 3 test.

---

### Task 1: Reject short or cut-off text translations

**Files:** `src/main/java/com/subtitlestudio/novel/GeminiTextChapterTranslator.java`, its test, and `TextChapterTranslation`'s test.

**Interfaces — Produces:** `static final double MIN_LENGTH_RATIO = 0.7`; package-private `static boolean endsMidSentence(String source, String translated)` (true only when the source's last paragraph ends with `.` `!` `?` `…` `"` `”` `’` `'` `)` `»` after stripping trailing whitespace, and the translation's last paragraph does not).

- [ ] Tests per spec Part 1:
  - ratio 0.69 is rejected and 0.70 accepted;
  - a cut ending is rejected after a `.` or `"` source and accepted after a `***` source;
  - the chapter-19 shape (≥ 40 % of the paragraphs, 48 % of the length) is rejected;
  - split-and-retry succeeds when only the first answer is short;
  - every piece short ends `FAILED` with nothing saved;
  - the log has no chapter text.
- [ ] FAIL → implement (both checks throw `TextIncompleteException` with the spec's messages; the log line names the check and the lengths) → green.
- [ ] Commit `fix: reject text translations that are much shorter or stop mid-sentence`.

### Task 2: `GeminiQuotaTracker`, skipping, `GET /api/gemini/quota`

**Files:**
- New: `src/main/java/com/subtitlestudio/translate/GeminiQuotaTracker.java`, `GeminiQuotaController.java` (or a method on an existing `translate` controller).
- Modify: `GeminiCaller.java`.
- Tests: `GeminiQuotaTrackerTest`, `GeminiCallerTest` additions, a controller slice test.

**Interfaces — Produces:**
- `enum QuotaKind { DAILY, MINUTE }`;
- `record QuotaEntry(String model, QuotaKind kind, Instant resetAt)`;
- `void record(String model, QuotaKind kind, Instant resetAt)`;
- `List<QuotaEntry> active()` (expired entries dropped, using the injected `Clock`);
- `boolean isDailyExhausted(String model)`;
- `static Instant nextDailyReset(Instant now)` (next midnight in `America/Los_Angeles`);
- `static Duration retryDelay(String message)` (parses `retry in 12.3s`, default 60 s);
- JSON of `GET /api/gemini/quota`: `{ "exhausted": [{ "model", "kind", "resetAt" }], "nowUsing": string|null }`, where `nowUsing` is the first configured model (main, then fallbacks) without an active entry.

- [ ] Tests:
  - a winter instant gives a reset at 15:00 `Asia/Ho_Chi_Minh` and a summer instant 14:00;
  - `retryDelay` parsing and its default;
  - a 429 records `DAILY` vs `MINUTE` as `logQuota` decides today;
  - a daily-exhausted model is not asked (the fake server gets no request for it);
  - after the clock passes `resetAt` it is asked again;
  - all exhausted gives the existing used-up error with " until HH:mm (Vietnam time)";
  - controller JSON;
  - no key or prompt in logs.
- [ ] FAIL → implement → `mvn -q test -Dskip.npm` green.
- [ ] Commit `feat: remember exhausted Gemini models, skip them until reset, expose /api/gemini/quota`.

### Task 3: Frontend quota toasts on translate actions

**Files:**
- New: `frontend/src/api/gemini.ts`, `frontend/src/lib/geminiQuota.ts` (+ tests).
- Modify: `api/novels.ts` (`translateChapter`, `fetchAndTranslateWattpadPart`, `fetchTranslateNext`, `retryNotebook`), `api/client.ts` (`translateVideo`), `api/promptProfiles.ts` (`analyzeProfile`), `lib/useChapterPolling.ts`, `lib/useNovelPolling.ts`, `lib/useTranslationPolling.ts`.

**Interfaces — Produces:**
- `getGeminiQuota(): Promise<GeminiQuota>`;
- `checkGeminiQuota(): Promise<void>` (never throws; toasts new `DAILY` entries once, key `model|resetAt` in `sessionStorage` with an in-memory fallback);
- `afterTranslateStart<T>(p: Promise<T>): Promise<T>`, which fires `void checkGeminiQuota()` once `p` settles, whether it resolved or rejected, and returns or rethrows `p`'s outcome unchanged.

- [ ] Tests:
  - a toast `toast.warning('<model> is out of quota', { description: 'Daily quota resets at <formatInstantWithTime> (Vietnam time). Now using <nowUsing>.', duration: 10000 })` shows once per entry, and not again on a second call;
  - `MINUTE` gives no toast;
  - `nowUsing: null` gives "No model left until then.";
  - a failed request gives no toast;
  - each of the six API functions triggers exactly one `GET /api/gemini/quota` after its own request, on success and on error;
  - each polling hook triggers it when the model field changes or the status becomes `FAILED`, and not on unchanged polls;
  - the admin `App` with fake timers advanced 5 minutes and nothing translating makes 0 quota requests;
  - `PublicApp` never requests it.
- [ ] FAIL → implement → `npx vitest run` and `npx tsc -b` green.
- [ ] Commit `feat: toast when a Gemini model runs out of quota (checked on translate actions only)`.

### Task 4: Docs and final checks

- [ ] `CLAUDE.md`:
  - "Dịch từ chữ": add the 0.7 length ratio and the cut-ending rule next to the 40 % rule.
  - `translate` package: `GeminiQuotaTracker` (in memory; `DAILY` reset at midnight `America/Los_Angeles`; skipped until reset), `GET /api/gemini/quota`, and `checkGeminiQuota` (only after translate actions and on a model change in polling; no timer).
- [ ] `PROGRESS.md`: a Vietnamese log entry at the end of section 7 (before `## 9.`). Include:
  - links to the spec and this plan;
  - chapter 19: 13,675 → 6,550 chars, last 26 % missing, translated by hand by the user;
  - chapter 1: its stored original repeats 75 of 170 paragraphs, and the translation is complete.
- [ ] Run all three suites; report the real counts.
- [ ] Commit `docs: translation completeness and quota toasts`.
