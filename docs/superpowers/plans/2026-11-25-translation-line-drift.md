# Vietsub translation: catch slid lines Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Gemini echoes the first words of each English line (`src`); a Vietnamese line whose echo does not match
the line sent with that id, or that sits after the start of a slide, is treated as missing and asked again.

**Spec:** `docs/superpowers/specs/2026-11-25-translation-line-drift-design.md`

**Tech:** Java 21, Spring Boot, Google GenAI SDK, JUnit 5 + AssertJ, the fake Gemini server in `GeminiTranslatorImplTest`.

## Global Constraints

- Branch `feat/vietsub-editor-mobile-keyboard` (same PR #74 as the phone keyboard work). English code, comments, commits.
- `TranslatedLine` stays `(int id, String text)`; it is what callers and the partial file use. `src` is never stored.
- An answer item **without** `src` (null or blank) is not echo-checked and counts as `noEcho` in the log. The schema
  marks `src` as required, so a real answer always has it; this keeps every existing test fixture valid unchanged.
- Echo match: normalise both sides (lower case; split on every char that is not a letter or digit, Unicode-aware;
  drop empty tokens). `k = min(2, echoWords, sourceWords)`. Match when `k == 0` (no word on one side) or the first
  `k` words are equal.
- Slide rule: in **sent order**, the first run of ≥ 3 consecutive lines that are present but fail the echo marks that
  line and every later sent line as missing. Constant `SLIDE_RUN = 3`.
- Follow-ups (`MAX_FOLLOW_UPS = 2`), parts, context lines: unchanged.
- Never delete or rewrite existing tests; only add. Check `git diff --numstat` on test files before each commit.

## Review Focus

1. The `k_7PWQPOGjA` shape: 20 lines sent, model drops the content of line 8 and numbers on, so ids 8–18 carry the
   text of 9–19 and id 19 is absent. Result after one follow-up: every id has its own line.
2. Right count, wrong lines (one merge at 5, one split at 12): caught, lines 5–11 re-asked.
3. A single mismatched echo (model paraphrased one `src`) re-asks only that line, not the rest.
4. `describe` stays free of subtitle text (no `src` value in the log).

---

### Task 1: Echo check in `TranslationOutput`

**Files:**
- Create: `src/main/java/com/subtitlestudio/translate/AnswerLine.java` — `record AnswerLine(int id, String src, String text)`, package-private.
- Modify: `src/main/java/com/subtitlestudio/translate/TranslationOutput.java`
- Test: `src/test/java/com/subtitlestudio/translate/TranslationOutputTest.java` (add)

**Interfaces:**
- `static Checked check(List<SourceLine> sent, List<AnswerLine> got)` and `static String describe(List<SourceLine> sent, List<AnswerLine> got)` (new overloads used by the translator).
- Keep the existing `List<TranslatedLine>` overloads (and `validate`) working: they map to `AnswerLine(id, null, text)`.
- `static boolean echoMatches(String echo, String source)` (package-private, for tests).
- `describe` appends ` echoMismatch=N noEcho=M firstMismatchId=K` (`K` = `-` when none).

- [ ] **Step 1: Failing tests** (add to `TranslationOutputTest`):
  - `echoMatches`: `("We probably", "We probably can't be…")` true; `("we, PROBABLY", "We probably…")` true;
    `("They're similar", "They're similar to me…")` true; `("Next is", "Kee is someone…")` false;
    `("...", "...")` true; `("hmm", "hmm...")` true; `("Love", "Love of Siam")` true.
  - `check` with one bad echo at id 3 of 10: missing = [3] only.
  - `check` slide: ids 0–9 sent; answer ids 0–8 where items 4..8 carry `src` of sources 5..9 → missing = 4..9.
  - `check` with null `src` everywhere = today's behaviour (all valid).
  - `describe` shows `echoMismatch=5 noEcho=0 firstMismatchId=4` and never contains a source or `src` text.
- [ ] **Step 2:** `mvn test -Dskip.npm -Dtest=TranslationOutputTest` → new tests FAIL to compile/fail.
- [ ] **Step 3: Implement** `AnswerLine`, `echoMatches`, the slide rule inside `check`, the `describe` counts.
- [ ] **Step 4:** same command → all pass.
- [ ] **Step 5: Commit** `feat(translate): check that each answer line echoes its own source line`

### Task 2: Ask for and read `src` in `GeminiTranslatorImpl`

**Files:**
- Modify: `src/main/java/com/subtitlestudio/translate/GeminiTranslatorImpl.java`
- Test: `src/test/java/com/subtitlestudio/translate/GeminiTranslatorImplTest.java` (add)

- [ ] **Step 1: Failing tests**:
  - `sendsRulesProfileSchemaAndLines`-style new test: the request schema has `src` in `properties` and in `required`,
    and `SYSTEM_RULES` contains the new `src` rule.
  - `asksAgainForSlidLinesAndPutsEachOnItsOwnId`: the Review Focus 1 shape (fixture builds `src` from the source of
    the line whose text it carries). Second request asks exactly lines 8–19; result ids 0–19 each with `"dòng N"` of
    its own N; 2 requests.
  - `catchesAMergeAndASplitWithTheRightCount`: Review Focus 2 shape → second request asks lines 5–11.
  - `logsEchoMismatches(CapturedOutput)`: log contains `echoMismatch=` and no `src` text.
- [ ] **Step 2:** `mvn test -Dskip.npm -Dtest=GeminiTranslatorImplTest` → new tests fail.
- [ ] **Step 3: Implement**:
  - Schema: add `"src"` (STRING) to `properties`, `.required("id", "src", "text")`.
  - `SYSTEM_RULES`: add after the block rule: `- Mỗi phần tử có thêm "src": chép y nguyên 3 từ đầu tiên trong text tiếng Anh của block đó (chỉ để đối chiếu, không dịch).`
  - `parse` reads `List<AnswerLine>`; `check`/`describe` use the `AnswerLine` overloads; the result list is built
    from `checked.valid()` as today.
- [ ] **Step 4:** same command → all pass (old tests unchanged: their fixtures have no `src`).
- [ ] **Step 5: Commit** `feat(translate): ask Gemini to echo each source line and re-ask slid lines`

### Task 3: Stale logo test, full suites, docs

**Files:**
- Modify: `frontend/src/components/logo.test.ts` (expect `<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />`, keep the favicon `/logo.webp` check)
- Modify: `PROGRESS.md` (one entry dated 2026-11-25 in the file's Vietnamese style: cause seen on `k_7PWQPOGjA`, the `src` echo, slide rule, log fields; "chưa thử với Gemini thật")

- [ ] **Step 1:** fix the logo test; `cd frontend && npx vitest run src/components/logo.test.ts` → pass.
- [ ] **Step 2:** `mvn test -Dskip.npm` (read Maven's `Tests run:` line) and `cd frontend && npx vitest run && npx tsc -b --noEmit`. Known flaky under load: VietsubPage, HomePage, WorkEditPage — rerun alone.
- [ ] **Step 3: Commit** `test: update the apple-touch-icon check after the home-screen icons` and `docs: progress for the translation slide check` (explicit `git add`, never `frontend/tsconfig.tsbuildinfo` or `data/`).
- [ ] **Step 4:** push the branch; edit PR #74 title to cover both changes (e.g. "Vietsub editor keyboard room on phones + catch slid translation lines") and add a section to its body: summary, tests with results, spec + plan links, "not tried with real Gemini". Do not merge or deploy.
