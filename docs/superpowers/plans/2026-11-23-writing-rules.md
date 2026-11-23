# Writing rules + repetition Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task (user rule: Sonnet implements every task, one Opus review of the whole branch at the end — no per-task review). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A hand-editable global writing-rule file with "Copy for AI" export, per-story additions/opt-outs, and a chapter Check that also flags global banned phrases and auto-detected repetitions — for original stories only.

**Architecture:** Backend stores one Markdown file `<promptsDir>/writing-rules.md` behind `GET/PUT /api/settings/writing-rules`. Everything else is frontend: pure functions in `lib/writingRules.ts` (parse, merge, export) and `lib/repetition.ts` (finders), wired into the existing `useChapterCheck` hook, a new Settings tab, and a button in `NovelProfileTab`.

**Tech Stack:** Spring Boot (Java 21), React + TypeScript + Vitest, `sonner` toasts, `lucide-react` icons.

**Spec:** `docs/superpowers/specs/2026-11-23-writing-rules-design.md` (read it first; this plan does not repeat it).

## Global Constraints

- Scope: **original stories only** (`sourceType === 'ORIGINAL'`). Translated novels' Check, Profile tab and the Gemini translation prompt must behave exactly as today.
- Work in a worktree from latest `main`: `git -C D:/working/repositories/subtitle-studio worktree add ../subtitle-studio-writing-rules -b feat/writing-rules main`. The main checkout is on another branch with uncommitted work — do not touch it. First commit on the branch: copy the spec and this plan into the worktree and commit them (`docs: writing rules spec and plan`).
- Commit messages, PR title/body in English; end commits with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- UI labels in English; rule/export text in Vietnamese. Colors: orange `--brand` `#F39A42`, purple `--brand-2` `#D9A1D9`, text on them `#1B2430`, red only for errors/delete. Icons from `lucide-react`. Layout per `docs/ui/screen-layout.md`.
- Thresholds (one constants block in `lib/repetition.ts`): `MIN_WORDS = 3`, `MAX_WORDS = 6`, `MIN_REPEATS = 3`, `MIN_OPENING_RUN = 3`, `OPENING_WORDS = 2`.
- Max rules text length: 20,000 characters.
- Frontend tests: `cd frontend && npx vitest run <path>`; typecheck `npx tsc --noEmit`. Backend: `mvn -q test -Dtest=<Class>`.

## Review Focus

1. A translated novel's chapter: Check must still be disabled with "No rules in ## Kiểm tra" when its profile has no rules, and show no repeat marks. → test in Task 5.
2. An original story with **no profile** (404 `NO_NOVEL_PROFILE`): Check still works from global rules + repeats; Copy for AI still exports global rules. → tests in Tasks 5 and 6.
3. Dialogue-heavy chapter where a character name repeats ("Khun Emi nói") — `bỏ qua lặp: "Khun Emi"` must remove every repeat containing it. → test in Task 3.
4. Text with decomposed (NFD) Vietnamese and CRLF line endings: repeat ranges must point at the right characters in the original string. → test in Task 3.
5. Writing-rules file edited outside the app while the Settings tab is open: Save overwrites (last write wins, no merge) — acceptable; but a GET after an outside edit must return the new text. → test in Task 1.

---

### Task 1: Backend — writing-rules file and endpoint

**Files:**
- Create: `src/main/java/com/subtitlestudio/writing/WritingRulesStore.java`
- Create: `src/main/java/com/subtitlestudio/writing/WritingRulesController.java`
- Test: `src/test/java/com/subtitlestudio/writing/WritingRulesStoreTest.java`, `src/test/java/com/subtitlestudio/writing/WritingRulesControllerTest.java`

**Interfaces:**
- Produces: `GET /api/settings/writing-rules` → `200 {"text": string|null}`; `PUT /api/settings/writing-rules` body `{"text": string}` → `204`; text > 20,000 chars → `400` ProblemDetail with `code: "WRITING_RULES_TOO_LONG"`; missing/null `text` → `400` with whatever code `ApiExceptionHandler` already gives a bad request body.
- `WritingRulesStore(Path promptsDir)`: `Optional<String> read()`, `synchronized void write(String text)`. Spring constructor takes `SubtitleStudioProperties` and uses `promptsDir()`.

- [ ] **Step 1: Write failing store tests** (`@TempDir`): `readIsEmptyWhenFileMissing` → `read()` is `Optional.empty()`; `writeThenRead` → writes `"## Cụm cấm\n- \"cúi đầu\"\n"`, `read()` returns it exactly and the file `writing-rules.md` is UTF-8 with that content; `readSeesOutsideEdit` → `Files.writeString(dir.resolve("writing-rules.md"), "x")` after a write, `read()` returns `"x"`; `writeLeavesNoTempFile` → after write, the dir contains only `writing-rules.md`.
- [ ] **Step 2: Run** `mvn -q test -Dtest=WritingRulesStoreTest` → FAIL (class missing).
- [ ] **Step 3: Implement the store.** Atomic write like `PromptProfileStore.write`: temp file in the same dir (`.writing-rules-*.tmp`), `ATOMIC_MOVE` + `REPLACE_EXISTING`, fallback to plain `REPLACE_EXISTING`; create the dir if missing. No history copy.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Write failing controller tests** (`@WebMvcTest(WritingRulesController.class)` + `@Import(ApiExceptionHandler.class)`, store mocked, same style as `VideoControllerTest`): GET with empty store → `{"text":null}`; GET with text → that text; PUT `{"text":"abc"}` → 204 and `store.write("abc")`; PUT 20,001 chars → 400, `$.code == "WRITING_RULES_TOO_LONG"`, store not called; PUT exactly 20,000 → 204.
- [ ] **Step 6: Run** → FAIL. **Step 7: Implement** controller (records `RulesDto(String text)`, `RulesRequest(String text)`; length check in the controller; the 400 via a small exception + handler following the existing `*Errors` pattern, imported in `ApiExceptionHandler`). **Step 8: Run** both test classes → PASS.
- [ ] **Step 9: Commit** `feat: store global writing rules in data/prompts/writing-rules.md`.

### Task 2: Rule parsing, merge and export (`lib/writingRules.ts`)

**Files:**
- Modify: `frontend/src/lib/checkRules.ts` (bare quote rule, two new line kinds)
- Create: `frontend/src/lib/writingRules.ts`, `frontend/src/lib/writingRulesSeed.ts`
- Test: `frontend/src/lib/checkRules.test.ts` (extend), `frontend/src/lib/writingRules.test.ts`

**Interfaces:**
- `CheckRules` gains `optOuts: string[]` and `repeatIgnores: string[]` (quoted phrase, trimmed, NFC). `parseCheckRules` reads `- bỏ luật chung: "x"` and `- bỏ qua lặp: "x"` (prefix case-insensitive, straight or curly quotes) into those arrays instead of counting them as ignored. A bare `- "x"` line is a flag-only rule (`suggestions: []`, `reason: null`); `- "x" (lý do)` is flag-only with a reason.
- `export function readSection(md: string, heading: string): string[] | null` — bullet texts (without `- `) of `## <heading>` up to the next `## `; null when absent. Lines starting with `(` are skipped.
- `export interface GlobalRules { principles: string[]; phrases: CheckRule[]; details: CheckRule[]; extra: string }` — `extra` = any other sections, verbatim (exported as is).
- `export function parseGlobalRules(md: string): GlobalRules` — sections `Nguyên tắc viết`, `Cụm cấm`, `Chi tiết cấm`; rule lines parsed with the same rule parser as `checkRules` (export `parseRule` from `checkRules.ts`).
- `export interface EffectiveRules { principles: string[]; storyPrinciples: string[]; phrases: CheckRule[]; details: CheckRule[]; corrections: CheckRule[]; checkRules: CheckRule[]; repeatIgnores: string[]; ignored: number; extra: string }`
- `export function effectiveRules(global: GlobalRules, profile: string | null): EffectiveRules` — opt-outs remove matching global rules (case-insensitive NFC compare of `wrong`); an opt-out matching nothing adds 1 to `ignored` (plus the profile's own `ignored`). `corrections` = profile `Kiểm tra` rules that have ≥1 suggestion. `checkRules` = remaining global phrases + details + all profile `Kiểm tra` rules. `storyPrinciples` from `## Nguyên tắc riêng`.
- `export function exportForAi(rules: EffectiveRules, perStory: boolean): string`
- `export const WRITING_RULES_SEED: string` (in `writingRulesSeed.ts`) — the 3 sections filled with the user's rules, exactly the phrases listed in the spec's "Seed" paragraph; rule 2 (Emi/Bonnie) is NOT in it.

Export text (exact):

```
QUY TẮC VĂN PHONG (bắt buộc)

Nguyên tắc viết:
- <principle>
Nguyên tắc riêng của truyện này:      ← only if perStory && storyPrinciples.length
- <principle>
Tuyệt đối không dùng các cụm sau:     ← only if phrases.length
- "a", "b", "c"
Không dùng các chi tiết sau:          ← only if details.length
- "a", "b"
Sửa đúng:                             ← only if perStory && corrections.length
- Viết "<first suggestion>", không viết "<wrong>".
<extra, trimmed, if non-empty>
Không lặp một cụm từ quá 2 lần trong một chương; không mở đầu 3 câu liền nhau bằng cùng một cách.
```

- [ ] **Step 1: Failing tests in `checkRules.test.ts`:** bare `- "cúi đầu"` → rule `{wrong:'cúi đầu', suggestions:[], reason:null}`; `- "x" (sáo)` → reason `'sáo'`; `- bỏ luật chung: "tháo đồng hồ"` → `optOuts ['tháo đồng hồ']`, `ignored 0`; `- Bỏ qua lặp: “Màn trập.”` → `repeatIgnores ['Màn trập.']`; existing tests still pass.
- [ ] **Step 2: Failing tests in `writingRules.test.ts`:**
  - `parseGlobalRules(WRITING_RULES_SEED)` → `principles.length === 5` (user rules 1, 3, 4, 5 and rule 6's "Đa dạng hóa từ vựng…" sentence); `phrases.map(r => r.wrong)` equals the 8 rule-6 phrases in spec order; `details.map(r => r.wrong)` equals the 4 rule-7 phrases.
  - opt-out: profile `## Kiểm tra\n- bỏ luật chung: "tháo đồng hồ"` → `checkRules` has no `tháo đồng hồ`, `details` has 3; opt-out `"không có"` → `ignored === 1`.
  - `corrections`: profile rule `- "mẹ cô" → "mẹ em"` appears in `corrections` and `checkRules`; flag-only profile rule appears only in `checkRules`.
  - `exportForAi` with seed + profile having `## Nguyên tắc riêng\n- Emi dùng "cô"` and the `mẹ cô` rule, perStory=true → contains `Nguyên tắc riêng của truyện này:\n- Emi dùng "cô"`, `- "cúi đầu", "ngẩng đầu",` (comma-joined on one line), `Sửa đúng:\n- Viết "mẹ em", không viết "mẹ cô".`, ends with the repetition sentence; perStory=false → no `Nguyên tắc riêng` and no `Sửa đúng`.
  - `effectiveRules(global, null)` works (no profile).
- [ ] **Step 3: Run** `npx vitest run src/lib/checkRules.test.ts src/lib/writingRules.test.ts` → FAIL.
- [ ] **Step 4: Implement** per the interfaces above.
- [ ] **Step 5: Run** → PASS; `npx tsc --noEmit` clean.
- [ ] **Step 6: Commit** `feat: parse, merge and export writing rules`.

### Task 3: Repetition finders (`lib/repetition.ts`)

**Files:**
- Create: `frontend/src/lib/repetition.ts`
- Test: `frontend/src/lib/repetition.test.ts`

**Interfaces:**
- `export interface Range { start: number; end: number }` (offsets in the original text)
- `export interface RepeatGroup { type: 'phrase' | 'opening'; label: string; ranges: Range[] }` — `label`: the phrase as written at its first occurrence (phrase), or the two opening words as written in the first sentence (opening).
- `export function findRepeatedPhrases(text: string, ignore: string[]): RepeatGroup[]`
- `export function findRepeatedOpenings(text: string): RepeatGroup[]`
- `export const STOP_WORDS: ReadonlySet<string>`

Algorithm decisions (not determined by the tests alone):
- Tokenize with `/[\p{L}\p{N}]+/gu` on the NFC-folded text (reuse the fold + index-map approach of `checkRules.ts`; export `foldWithMap` from there rather than copying it). A "segment" ends at `.`, `?`, `!`, `…`, `\n` (and `\r`); n-grams never cross a segment end. Lines that are only `[[image:N]]` are skipped.
- Count every n-gram of 3–6 consecutive tokens by its folded word sequence; keep those with count ≥ 3. Drop a stop-word-only n-gram. Drop an n-gram whose folded text contains any folded `ignore` phrase (compare on word sequences: tokenize the ignore phrase the same way). Maximality: drop an n-gram if another kept n-gram with the **same count** contains it as a contiguous sub-sequence. Overlapping occurrences of the same n-gram count once each but ranges must not overlap (skip an occurrence that starts before the previous one ended).
- Openings: sentences = segments split as above, excluding empty ones and image lines; a run = ≥3 consecutive sentences whose first 2 folded tokens are equal; one group per run, one range per sentence covering its first two words.

- [ ] **Step 1: Failing tests:**
  - `"Cô nhìn ra cửa sổ. Cô nhìn ra cửa sổ. Rồi cô nhìn ra cửa sổ."` → one group, `label === 'Cô nhìn ra cửa sổ'` (maximal; not also "nhìn ra cửa"), 3 ranges whose `text.slice` equals the words.
  - same phrase only twice → `[]`.
  - `"a b c. d"` style: a phrase split by `.` is not counted (`"nhìn ra. cửa sổ"` ×3 → no `"nhìn ra cửa"` group).
  - stop-word-only: `"và là của"` ×3 → `[]`.
  - ignore: `"Khun Emi nói với em."` ×3 with `ignore ['Khun Emi']` → `[]`; without ignore → one group.
  - NFD + CRLF: text built with `.normalize('NFD')` and `\r\n` between sentences → ranges slice back to the original NFD words (Review Focus 4).
  - image line `[[image:3]]` repeated 3× → `[]`.
  - openings: `"Em đã đi. Em đã khóc.\n\nEm đã ngủ."` → one group, label `'Em đã'`, 3 ranges each slicing to `Em đã`; only two such sentences → `[]`; four in a row → one group with 4 ranges.
- [ ] **Step 2: Run** `npx vitest run src/lib/repetition.test.ts` → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: find repeated phrases and sentence openings`.

### Task 4: Settings › Writing rules tab

**Files:**
- Create: `frontend/src/api/writingRules.ts`, `frontend/src/components/settings/WritingRulesForm.tsx` (+ `.css` if needed), `frontend/src/components/writing/CopyForAiButton.tsx`
- Modify: `frontend/src/components/settings/SettingsTabs.tsx` (add `'writing-rules'`, label `Writing rules`, after Gemini), `frontend/src/App.tsx` (route `/settings/writing-rules` → `<SettingsPage tab="writing-rules" />`), `frontend/src/pages/SettingsPage.tsx` (render the form; lede becomes "Change how the app translates, keeps backups and checks writing.")
- Test: `frontend/src/components/settings/WritingRulesForm.test.tsx`, `frontend/src/pages/SettingsPage.test.tsx` (tab present)

**Interfaces:**
- Consumes: Task 1 endpoint; Task 2 `parseGlobalRules`, `effectiveRules`, `exportForAi`, `WRITING_RULES_SEED`.
- Produces: `getWritingRules(): Promise<string | null>`, `saveWritingRules(text: string): Promise<void>` (use `send` from `api/client.ts` like `api/settings.ts`); `CopyForAiButton({ getText }: { getText: () => Promise<string> })` — secondary button with `Copy` icon, label `Copy for AI`; on click awaits `getText()`, `navigator.clipboard.writeText`, then `toast.success('Copied ' + n + ' characters')`; on failure `toast.error('Could not copy')`.

- [ ] **Step 1: Failing tests** (mock `fetch` like `GeminiSettingsForm.test.tsx`, mock `sonner` like `FindReplace.test.tsx`): GET returns `{text:null}` → textarea value equals `WRITING_RULES_SEED`; GET returns text → textarea shows it; edit + Save → PUT body `{text: <edited>}`, success toast `Writing rules saved`; Ctrl+S saves; PUT 400 → error shown with `role="alert"`; Copy for AI → `clipboard.writeText` called with `exportForAi(effectiveRules(parseGlobalRules(<current textarea text>), null), false)` and toast `Copied N characters` (copies the unsaved text in the box); the help line mentions `## Nguyên tắc viết`, `## Cụm cấm`, `## Chi tiết cấm`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (Save as orange primary in FormActions; Copy for AI secondary). **Step 4: Run** the two test files → PASS; `npx tsc --noEmit`.
- [ ] **Step 5: Commit** `feat: Settings tab to edit and copy writing rules`.

### Task 5: Check upgrade for original stories

**Files:**
- Modify: `frontend/src/components/chapter/useChapterCheck.ts`, `frontend/src/components/chapter/ChapterTextEditor.tsx`, `frontend/src/components/chapter/CheckPopover.tsx`, `frontend/src/components/novel/FindHighlights.tsx` (per-hit class), `frontend/src/components/novel/CheckHighlights.tsx`, `frontend/src/components/chapter/Check.css`
- Test: `frontend/src/components/chapter/ChapterCheck.test.tsx` (extend), `frontend/src/components/novel/FindHighlights.test.tsx` (per-hit class)

**Interfaces:**
- Consumes: Task 2 `parseGlobalRules`, `effectiveRules`, `WRITING_RULES_SEED`; Task 3 `findRepeatedPhrases`, `findRepeatedOpenings`, `RepeatGroup`; Task 4 `getWritingRules`.
- `Hit` (FindHighlights) gains optional `className?: string`; a mark uses `hit.className ?? markClassName`.
- `useChapterCheck` gains param `original: boolean` (from `chapter.sourceType === 'ORIGINAL'`). Its `issues` become `CheckIssue[]`:
  `type CheckIssue = (Issue & { kind: 'rule' }) | { kind: 'repeat'; start: number; end: number; group: RepeatGroup }` (export it).
- Returned `marks` carry `className: 'check-repeat'` for repeat issues.
- New returned `goToInGroup(step: 1 | -1)`: moves the caret to the next/previous range of the current repeat issue's group (wraps).

Behavior:
- `original === false`: identical to today (only profile rules, same disabled reasons, no repeats, no writing-rules request).
- `original === true`: on load and on each switch-on, fetch the profile (404 → no profile, fine) and `getWritingRules()` (null → `WRITING_RULES_SEED`). Rules = `effectiveRules(global, profileText).checkRules`; repeats = `findRepeatedPhrases(text, repeatIgnores)` + `findRepeatedOpenings(text)`, each range → one repeat issue. Drop a repeat issue overlapping a rule issue. Sort by `start`. Disabled only when locked (`'Check is off while the chapter is translating'`) or the writing-rules request failed (`'Could not load the writing rules'`). `ignored` = `effectiveRules(...).ignored`.
- Popover for a repeat issue: phrase → `Repeated N× — "<label>"`; opening → `N sentences in a row start with "<label>"`; no chips; `‹` `›` buttons (aria-labels `Previous occurrence`, `Next occurrence`) call `goToInGroup`.
- CSS: `.check-hit.check-repeat` (or a standalone `.check-repeat`) = dotted underline in `var(--brand)`; purple wavy `.check-hit` unchanged.

- [ ] **Step 1: Failing tests in `ChapterCheck.test.tsx`** (follow its existing fetch mocking):
  - Original story, profile without rules, writing rules `null`, text contains `"cúi đầu"` → Check enabled, one purple mark on `cúi đầu` (class `check-hit`, no `check-repeat`).
  - Original story, profile 404 → Check enabled and still marks `cúi đầu` (Review Focus 2).
  - Original story, profile `- bỏ luật chung: "cúi đầu"` → no mark on it.
  - Original story, text with a phrase ×3 → 3 marks with class `check-repeat`; caret into one → popover `Repeated 3× — "…"`; `Next occurrence` moves the caret to the next range.
  - Original story, three sentences starting `Em đã` → popover `3 sentences in a row start with "Em đã"`.
  - Translated novel (`sourceType: 'WATTPAD'`), profile with no rules, text with `cúi đầu` and a phrase ×3 → Check disabled with `No rules in ## Kiểm tra`, and no request to `/api/settings/writing-rules` (Review Focus 1).
  - Count on the toggle = rule issues + repeat issues.
- [ ] **Step 2: Failing test in `FindHighlights.test.tsx`:** a hit with `className: 'check-repeat'` renders its mark with that class; others keep `markClassName`.
- [ ] **Step 3: Run** both files → FAIL. **Step 4: Implement.** **Step 5: Run** both + `AddCheckRuleDialog.test.tsx` + `ChapterPage.test.tsx` → PASS; `npx tsc --noEmit`.
- [ ] **Step 6: Commit** `feat: Check flags global banned phrases and repetitions in original stories`.

### Task 6: Copy for AI on an original story's Profile tab + template + docs

**Files:**
- Modify: `frontend/src/components/novel/NovelProfileTab.tsx`, `src/main/resources/prompts/_novel_template_original.md`, `src/test/java/com/subtitlestudio/novel/NovelProfileTemplateTest.java`, `PROGRESS.md`, `CLAUDE.md` (feature line, file `data/prompts/writing-rules.md`)
- Test: `frontend/src/components/novel/NovelProfileTab.test.tsx`

**Interfaces:**
- Consumes: Task 4 `CopyForAiButton`, `getWritingRules`; Task 2 `parseGlobalRules`, `effectiveRules`, `exportForAi`, `WRITING_RULES_SEED`.

- [ ] **Step 1: Failing tests (`NovelProfileTab.test.tsx`):** `sourceType 'ORIGINAL'` → a `Copy for AI` button in the Profile toolbar; clicking copies `exportForAi(effectiveRules(parseGlobalRules(global ?? WRITING_RULES_SEED), profileText), true)` where `profileText` is the **saved** profile text loaded by the tab (or `null` if the novel has no profile — Review Focus 2); `sourceType 'WATTPAD'` → no such button.
- [ ] **Step 2: Failing test (`NovelProfileTemplateTest`):** the original template contains `## Nguyên tắc riêng` placed before `## Kiểm tra`, and its `## Kiểm tra` has a second hint line starting `- (` that mentions `bỏ luật chung:` and `bỏ qua lặp:`. The translation templates do not contain `## Nguyên tắc riêng`.
- [ ] **Step 3: Run** `npx vitest run src/components/novel/NovelProfileTab.test.tsx` and `mvn -q test -Dtest=NovelProfileTemplateTest` → FAIL.
- [ ] **Step 4: Implement.** Template additions (exact):
  ```
  ## Nguyên tắc riêng
  - (Nguyên tắc văn phong riêng của truyện này, ví dụ đại từ cho từng nhân vật. Chỉ dùng khi Copy for AI.)
  ```
  and in `## Kiểm tra`, after the existing hint line:
  ```
  - (Bỏ một luật chung: - bỏ luật chung: "tháo đồng hồ". Không báo lặp một cụm: - bỏ qua lặp: "Khun Emi".)
  ```
- [ ] **Step 5: Run** → PASS. Then the full suites: `cd frontend && npx vitest run && npx tsc --noEmit`, and `mvn -q test` → all green (report counts).
- [ ] **Step 6: Update `PROGRESS.md` and `CLAUDE.md`** (one entry: what was added, where the rules file lives, test counts).
- [ ] **Step 7: Commit** `feat: Copy for AI on original story profiles; template hints; docs`.
- [ ] **Step 8:** push `feat/writing-rules`, `gh pr create --base main` (English title/body: summary, test commands + counts, screenshot of the Writing rules tab and a chapter with both mark styles, link to spec/plan; body ends with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`). Do **not** merge — Opus reviews the branch, then the user approves.
