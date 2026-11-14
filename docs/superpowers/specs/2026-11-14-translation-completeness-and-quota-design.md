# Text chapters: catch short translations; Gemini quota toasts — design

Date: 2026-11-14. Branch: `fix/translation-completeness`. Size: small-to-medium (backend checks, one in-memory tracker, one endpoint, one frontend hook).

## Why

Chapter 19 of *My Grumpy Vampire* was saved with its last **26 %** (43 paragraphs, 7,083 chars) missing. The cut is mid-sentence: "…cũng không phải mùi của".

The log shows the cause:
- The whole chapter (158 paragraphs) came back as 4 paragraphs, so it was split.
- The first half came back as 22 of 80 paragraphs, so it was split again. Its two quarters were translated in full by `gemini-3.6-flash` (6,711 → 6,958 and 6,890 → 7,256 chars).
- The second half went to `gemini-3.5-flash-lite`: **13,675 source chars came back as 6,550**. Gemini stopped early but closed the JSON. `GeminiTextChapterTranslator` only rejects an answer with fewer than 40 % of the source paragraphs, so this answer was accepted.

A normal en→vi answer is 1.04–1.23× the source length (chapters 2–18 of the same novel).

The same chapter also mixed two models (the main one had run out of quota). From the switch onwards, dialogue changed from quotes to dashes and addressing changed. The user found out only by reading. They want a **toast** that says which model ran out, when it resets, and which model is used now.

Chapters 1–18 were checked: chapter 1 looks short, but its stored original repeats 75 of its 170 paragraphs (an old Wattpad paging bug), and its translation covers the unique text in full.

## Part 1 — Reject short or cut-off text translations

These checks go in `GeminiTextChapterTranslator.translate`, next to the paragraph check. They apply to every call, including each split piece. They do not apply to screenshot chapters.

1. **Length ratio:** if `translated.length() / source.length() < MIN_LENGTH_RATIO` (**0.7**), throw `TextIncompleteException("Gemini's answer is much shorter than the original.")`. The 0.7 holds for both `en` and `th` sources, because Vietnamese is longer than both.
2. **Cut-off ending:** if the source's last paragraph ends with sentence-final punctuation (`.` `!` `?` `…` `"` `”` `’` `'` `)` `»`, trailing spaces ignored) and the translation's last paragraph does not, throw `TextIncompleteException("Gemini's answer stops mid-sentence.")`. When the source ends otherwise (`***`, `~`, a bare word), this check is skipped.
3. A thrown `TextIncompleteException` follows the existing path: split and retry (at most 3 levels, 8 pieces). If it still fails, the chapter is `FAILED` and nothing is saved. Nothing new in that flow.
4. **Logs carry numbers only:** model, chapter number, source and answer lengths, and which check failed. Never any text.

Tests (`GeminiTextChapterTranslatorTest`, fake Gemini server), written first:
- Ratio: 0.69 is rejected, 0.70 is accepted.
- Ending: a cut ending is rejected when the source ends with `.` or `"`. It is accepted when the source ends with `***`.
- The chapter-19 shape is rejected: the answer has ≥ 40 % of the paragraphs but only 48 % of the length.
- A `TextChapterTranslation` test: a short first answer leads to a split, and both pieces succeed. Every-piece-short ends `FAILED` with nothing saved.
- The log assertion (`OutputCaptureExtension`) contains no chapter text.

## Part 2 — Gemini quota: remember, skip, toast

### Backend

- New `translate.GeminiQuotaTracker` (singleton, in memory, takes a `Clock`). `GeminiCaller` calls `record(model, kind, resetAt)` on every HTTP 429.
  - `kind` is `DAILY`, or `MINUTE` when `logQuota` already decides it is a per-minute limit.
  - `resetAt` for `DAILY` is the next midnight in `America/Los_Angeles` (Gemini's free-tier daily reset). It is computed with `ZonedDateTime`, so DST is right: 15:00 Vietnam time in winter, 14:00 in summer.
  - `resetAt` for `MINUTE` is now plus the retry delay that Gemini's message states (`retry in 12.3s`), or 60 s if there is none.
  - Entries expire at `resetAt`.
- **Skip exhausted models** (my call, so that one run stops mixing models): `GeminiCaller` builds its model list (main, then fallbacks) and leaves out every model with an active `DAILY` entry. `MINUTE` entries are not skipped.
  - If every model is skipped, it throws the existing "free quota is used up" error with the earliest reset time added: "Gemini free quota is used up until 15:00 (Vietnam time)."
  - Callers format that time with `Asia/Ho_Chi_Minh`, using a `Locale.ROOT` formatter.
- `GET /api/gemini/quota` (in `translate`, admin only) returns `{ exhausted: [{ model, kind, resetAt }], nowUsing }`.
  - `nowUsing` is the first model in the configured order without an active entry, or `null`.
  - It is in memory and cheap, and it never calls Gemini.
- Tests:
  - Reset times around DST (a winter date gives 15:00 VN, a summer date gives 14:00 VN).
  - The retry delay is parsed, with a 60 s fallback.
  - A skipped model is never asked. An expired entry is asked again.
  - All exhausted gives the error with the time.
  - Controller JSON.
  - No API key or prompt text appears in logs or messages.

### Frontend (admin only; the public app has no Gemini)

- `api/gemini.ts`: `getGeminiQuota(): Promise<{ exhausted: { model: string; kind: 'DAILY' | 'MINUTE'; resetAt: string }[]; nowUsing: string | null }>`.
- `lib/useGeminiQuotaToasts.ts`, mounted once in `App` (not in `PublicApp`):
  - It polls `getGeminiQuota()` every **30 s**, only while `document.visibilityState === 'visible'`, and once when the page becomes visible again.
  - For each `DAILY` entry not toasted yet, it shows one toast. The key is `model|resetAt`, remembered in `sessionStorage` behind try/catch, with an in-memory fallback.
    - Title: `toast.warning('<model> is out of quota')`.
    - Description: `Daily quota resets at <formatInstantWithTime(resetAt)> (Vietnam time). Now using <nowUsing>.` When `nowUsing` is null, the description ends with `No model left until then.` instead.
    - Duration 10 s, closable.
  - `MINUTE` entries do not toast (they clear in seconds).
  - Errors are ignored silently, so a failed poll never shows an error toast.
  - This follows the toast rules in `CLAUDE.md`: short title with no period, specifics in the description, `warning` for a partial problem.
- Tests (Vitest, fake timers, `fakeFetch`):
  - One toast per new daily entry, none again on the next poll.
  - No toast for `MINUTE`.
  - No polling while hidden.
  - The description has the formatted time and `nowUsing`.
  - The "no model left" wording.
  - Not mounted in `PublicApp`.

## Non-goals

- Retranslating chapter 19 (the user translates the missing part by hand).
- Cleaning chapter 1's duplicated stored original.
- Screenshot-chapter checks.
- A permanent banner (the user chose a toast).
- Persisting the tracker across restarts (after a restart a model may be tried once more, then recorded again).

## Done when

- `mvn test`, `npx vitest run` and `npx tsc -b` are green (no SQL change).
- `CLAUDE.md` is updated:
  - Text translation: the 0.7 ratio and the cut-ending rule next to the 40 % rule.
  - `translate`: `GeminiQuotaTracker`, skipping, `GET /api/gemini/quota`, and the quota toast.
- `PROGRESS.md` has an entry.
