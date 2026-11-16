# Novel Profile "Analyze corrections" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. One branch `feat/novel-profile-analyze` (spec already committed), one PR, no review between tasks (Opus reviews the whole branch at the end).

**Goal:** A Profile tab on the admin novel page that shows, edits and improves the novel's translation profile from the paragraphs the user corrected in published chapters.

**Architecture:**
- `t_chapter.ai_text` (V24) keeps Gemini's whole-chapter translation.
- `NovelCorrections` diffs AI and final text by paragraph.
- `NovelProfileAnalyzer` makes one Gemini call that returns the proposed profile plus rules and term suggestions.
- Three endpoints under `/api/novels/{id}/profile`.
- The frontend extracts Vietsub's analyze/diff/save UI into a shared `ProfileAnalyzePanel`, used by Vietsub `ProfilesPage` and by a new `NovelProfileTab`.

**Tech Stack:** Java 21, Spring Boot, JPA, Flyway (Oracle + H2), google-genai via `GeminiCaller`, JUnit 5/AssertJ; React + TS, Radix Tabs, `diff` (jsdiff), vitest + testing-library.

**Spec:** `docs/superpowers/specs/2026-11-16-novel-profile-analyze-design.md`

## Global Constraints
- One Gemini request per Analyze. Never log profile or chapter text; log counts, lengths and the model only.
- Limits per request: at most **300 edits** and **30,000 characters** (source + AI + final), newest published chapter first. A single side longer than **2,000** characters is cut to 2,000 plus "…".
- A rule needs at least **2** supporting edits. The proposed profile must be **< 20 KB** (`PromptProfileStore.MAX_BYTES`).
- Errors:
  - `400 NO_CORRECTIONS` reuses `NoCorrectionsException`;
  - `409 NOVEL_TRANSLATION_BUSY` reuses `NovelTranslationBusyException` and the existing `ChapterRepository.existsByNovelIdAndTranslationStatus(novelId, TRANSLATING)`;
  - `409 PROFILE_CHANGED` reuses the existing store conflict;
  - `404 NO_PROFILE` is new, for a novel without a profile.
- Admin UI copy is in English. Prompts are in Vietnamese with full diacritics.
- Brand colours: orange `--brand` for actions, purple `--brand-2` for selected and info, red only for errors and deletion. Follow `docs/ui/screen-layout.md`.
- Migration **V24** (V23 is the latest). Never edit an existing migration.
- Paragraph split: normalise `\r\n` to `\n`, split on one or more blank lines, strip each paragraph, and drop empty ones.

## Review Focus
1. **A chapter is edited by merging or splitting paragraphs.** The AI has 3 paragraphs and the final has 2, with the text moved between them. Expected: one edit whose AI side is the 3 paragraphs and whose FINAL side is the 2, not three unrelated edits. Test: `mergedParagraphsBecomeOneEdit` in Task 2.
2. **A Wattpad chapter whose final text equals the AI text except for trailing spaces or CRLF.** Expected: zero edits. Test: `whitespaceOnlyChangesAreNotEdits` in Task 2.
3. **A Gemini answer that drops or renames profile sections.** Expected: shown as a diff for the user to judge, and never saved automatically. The UI shows removed lines clearly. Test: `diffShowsRemovedSection` in Task 5.
4. **The profile file is edited on disk (or in another tab) between opening the tab and Save.** Expected: 409 PROFILE_CHANGED, an alert, and nothing overwritten. Test: `saveWithStaleShaIsRejected` in Task 4.
5. **A novel whose `prompt_profile` names a missing file.** Expected: GET returns 404 NO_PROFILE and the tab explains it, with no crash. Test: `missingProfileFileIs404` in Task 4.

---

### Task 1: Keep the AI translation (`ai_text`)

**Files:**
- Create: `src/main/resources/db/migration/V24__chapter_ai_text.sql`
- Modify:
  - `src/main/java/com/subtitlestudio/novel/Chapter.java`: field and getter/setter;
  - `src/main/java/com/subtitlestudio/novel/ChapterTranslationService.java`: `saveText` (~line 299) and the screenshot success block (~line 375–381).
- Test: `src/test/java/com/subtitlestudio/novel/ChapterTranslationServiceTest.java`

**Interfaces:**
- Produces: `String Chapter.getAiText()` and `void Chapter.setAiText(String)`, mapped as `@Lob @Column(name = "ai_text")`.

- [ ] **Step 1: Write the failing tests** in `ChapterTranslationServiceTest`, using the existing fixtures:
  - `textChapterSuccessKeepsTheAiText`: after a Wattpad/text translation completes, `aiText` equals the Gemini text and equals `textVi`. A later `ChapterService.update` with `text = "edited"` leaves `aiText` unchanged.
  - `screenshotSuccessKeepsTheJoinedPageTexts`: after a 2-page translation, `aiText` = `page1 + "\n\n" + page2`, and `textVi` is null as today.
  - `failedOrPartialTranslationDoesNotSetAiText`: a FAILED or partial run leaves `aiText` as it was (null on a fresh chapter).
  - `translateAgainReplacesAiText`: a second successful run overwrites it.
- [ ] **Step 2:** Run `mvn -q test -Dskip.npm -Dtest=ChapterTranslationServiceTest`. Expected: compile failure or FAIL.
- [ ] **Step 3:** Migration: `ALTER TABLE t_chapter ADD (ai_text CLOB);` with a header comment pointing to the spec. Add the entity field. In `saveText`, call `c.setAiText(result.text())`. In the screenshot success block, set `ai_text` to the new page texts joined with `"\n\n"`, skipping null or blank pages. That is the same join the app uses for the default chapter text, so reuse that helper if one exists (search for where `Chapter` text falls back to pages).
- [ ] **Step 4:** Run the same command again. Expected: PASS. Also run `mvn -q test -Dskip.npm -Dtest='*Persistence*,*Flyway*'` if such H2 schema tests exist. Expected: PASS.
- [ ] **Step 5:** Commit `feat: keep the AI translation of each chapter (V24 ai_text)`.

### Task 2: Paragraph corrections (`NovelCorrections`)

**Files:**
- Create: `src/main/java/com/subtitlestudio/novel/NovelCorrections.java` (pure, no Spring).
- Test: `src/test/java/com/subtitlestudio/novel/NovelCorrectionsTest.java`

**Interfaces:**
- Produces:
  - `record Edit(String source, String ai, String fin)`. `source` may be null, and `ai` or `fin` may be `""` for an insertion or deletion. Paragraphs inside a side are joined with `"\n\n"`.
  - `static List<String> paragraphs(String text)`
  - `static List<Edit> edits(String ai, String fin, String source)`. `source` is null for screenshot chapters.

- [ ] **Step 1: Write failing tests:**
  - `unchangedTextHasNoEdits`
  - `whitespaceOnlyChangesAreNotEdits`: CRLF versus LF, and trailing spaces. The result is empty.
  - `oneChangedParagraphIsOneEdit`: `edits("A\n\nB\n\nC", "A\n\nB2\n\nC", null)` = `[Edit(null, "B", "B2")]`.
  - `insertedAndDeletedParagraphs`: an insertion gives `Edit(null, "", "X")`, and a deletion gives `Edit(null, "B", "")`.
  - `mergedParagraphsBecomeOneEdit`: AI `"A\n\nB\n\nC\n\nD"`, final `"A\n\nBC merged\n\nD"` gives one edit, `ai = "B\n\nC"`, `fin = "BC merged"`.
  - `sourceAttachedOnlyWhenParagraphCountsMatch`: a source with 4 paragraphs and an AI text with 4 paragraphs gives `source` = the source paragraphs at the AI index range. A 5-paragraph source gives `source == null` on every edit.
- [ ] **Step 2:** Run `mvn -q test -Dskip.npm -Dtest=NovelCorrectionsTest`. Expected: FAIL.
- [ ] **Step 3:** Implement an LCS over the two paragraph lists, comparing paragraphs after whitespace normalisation (collapse runs of whitespace). Consecutive non-matching AI and final paragraphs between two LCS anchors form one `Edit`. No new dependency.
- [ ] **Step 4:** Run the same command again. Expected: PASS.
- [ ] **Step 5:** Commit `feat: diff a chapter's AI and final text by paragraph`.

### Task 3: `NovelProfileAnalyzer` (selection + Gemini)

**Files:**
- Create: `src/main/java/com/subtitlestudio/novel/NovelProfileAnalyzer.java`
- Modify:
  - `src/main/java/com/subtitlestudio/novel/ChapterRepository.java`: a query for the analysis chapters;
  - `src/main/java/com/subtitlestudio/novel/NovelProfileStore.java`: `sha(name)` and `write(name, text, baseSha)`, delegating to its `PromptProfileStore` instance for `prompts/novels/`.
- Test: `src/test/java/com/subtitlestudio/novel/NovelProfileAnalyzerTest.java`, plus `NovelProfileStoreTest.java` (add `writeKeepsHistoryAndChecksSha`). Use the existing `FakeGeminiServer` or a stubbed `GeminiCaller`, as `ProfileAnalyzerTest` does.

**Interfaces:**
- Consumes: `Chapter.getAiText()` (Task 1); `NovelCorrections.edits` and `Edit` (Task 2).
- Produces:
  - `record Stats(int chapters, int edits, List<String> otherNovels)`
  - `record Details(String name, String text, String sha, Stats stats, boolean geminiConfigured)`
  - `record Rule(String text, int count)`
  - `record Term(String kind, String text, int count)`, where `kind` is `"term"` or `"addressing"`
  - `record BasedOn(int chapters, int edits)`
  - `record Analysis(String proposed, List<Rule> rules, List<Term> terms, BasedOn basedOn, String model, String sha)`
  - `Details details(long novelId)`
  - `Analysis analyze(long novelId)`
  - `String save(long novelId, String text, String baseSha)`, which returns the new sha
  - `class NoNovelProfileException extends RuntimeException`
- `ChapterRepository`: `List<Chapter> findAnalysisChapters(String profile)`. It returns chapters with `publishStatus = PUBLISHED`, `translationStatus = TRANSLATED`, and novel `promptProfile = :profile`, ordered newest published first (`publishedAt desc`; use the existing column name).

- [ ] **Step 1: Write failing tests:**
  - `onlyPublishedTranslatedChaptersCount`: a draft, a FAILED chapter and a chapter of a novel with another profile contribute nothing.
  - `wattpadChapterWithoutAiTextIsSkipped`
  - `screenshotChapterFallsBackToPageTexts`: `aiText` is null, the pages are `"A"` and `"B"`, and `textVi = "A\n\nB2"` gives 1 edit.
  - `neverEditedChapterHasNoEdits`: `textVi` is null.
  - `statsCountEveryEditAndNameOtherNovels`: two novels share a profile, and `otherNovels` contains the other novel's title.
  - `selectionStopsAt300EditsOr30000Chars`: newest first, and `basedOn` is less than the stats.
  - `longSideIsCutTo2000Chars`
  - `noEditsThrowsNoCorrectionsWithoutCallingGemini`
  - `busyNovelThrowsTranslationBusy`: a chapter is TRANSLATING, and Gemini is not called.
  - `parsesProposedRulesAndTerms`: the fake answer `{"proposed":"# P","rules":[{"text":"r","count":2}],"terms":[{"kind":"term","text":"Ms. Ellis → cô Ellis","count":3}]}` maps to `Analysis`.
  - `invalidJsonOrEmptyOrOversizedProposalIsAnalysisInvalid`
  - `userTextHasSourceAiFinalAndNothingIsLogged`: the request body contains `GỐC:`, `AI:` and `FINAL:` for a Wattpad edit, and `CapturedOutput` contains no chapter text.
  - In `NovelProfileStoreTest`, `writeKeepsHistoryAndChecksSha`: the `.history/<name>-*.md` file is created, and a stale sha throws the existing conflict exception.
- [ ] **Step 2:** Run `mvn -q test -Dskip.npm -Dtest='NovelProfileAnalyzerTest,NovelProfileStoreTest'`. Expected: FAIL.
- [ ] **Step 3:** Implement, modelled on `translate/ProfileAnalyzer` (copying logic is expected).
  - **Profile name.** The profile name is `novel.getPromptProfile()`. If it is null, or `NovelProfileStore.exists(name)` is false, throw `NoNovelProfileException`. That covers a missing file and a name the store rejects. The store already validates names before it touches any path, so never build a path from the name yourself.
  - **Busy check.** Before any work, call `existsByNovelIdAndTranslationStatus(id, TRANSLATING)` and throw `NovelTranslationBusyException` if it is true.
  - **System rules** (Vietnamese) follow the spec's "Gemini request" bullets:
    - items are paragraphs with `GỐC` (optional), `AI` and `FINAL`;
    - a rule needs ≥ 2 supporting edits;
    - keep the structure;
    - terms and names go into `## Tên riêng và thuật ngữ`, and addressing into `## Xưng hô`, creating the section if it is missing;
    - `terms` lists those suggestions;
    - the profile stays < 20 KB;
    - JSON only.
  - **Schema:**
    - `proposed` (string, required);
    - `rules` (`[{text, count}]`, required);
    - `terms` (`[{kind enum term|addressing, text, count}]`, required).
  - **User text format:**
    - a `# Hồ sơ hiện tại` header, then the profile;
    - a `# Các đoạn người dịch đã sửa (n)` header;
    - items numbered `n.`, each with `GỐC: …` (only when the source is present), `AI: …` and `FINAL: …`;
    - an empty side is written as `(trống)`;
    - newlines inside a side become ` / `.
  - **Log line:** `log.info("analyze novel {} profile {}: {} edits from {} chapters, model {}", ...)`.
- [ ] **Step 4:** Run the same command again. Expected: PASS.
- [ ] **Step 5:** Commit `feat: analyze a novel profile from corrected paragraphs`.

### Task 4: Endpoints

**Files:**
- Modify:
  - `src/main/java/com/subtitlestudio/novel/NovelController.java`: three endpoints;
  - `src/main/java/com/subtitlestudio/web/ApiExceptionHandler.java`: `NoNovelProfileException` → `404 NO_PROFILE`, with the message "This novel has no translation profile.".
- Test: `src/test/java/com/subtitlestudio/novel/NovelControllerTest.java`

**Interfaces:**
- Consumes: `NovelProfileAnalyzer.details`, `analyze` and `save` (Task 3).
- Produces (JSON = the records above):
  - `GET /api/novels/{id}/profile` → `Details`
  - `POST /api/novels/{id}/profile/analyze` → `Analysis`
  - `PUT /api/novels/{id}/profile` with body `{ "text", "baseSha" }` → `{ "sha" }`

- [ ] **Step 1: Write failing tests** (MockMvc slice, as existing):
  - `getProfileReturnsTextShaStats`
  - `missingProfileFileIs404`: the code is `NO_PROFILE`.
  - `analyzeWithoutEditsIs400NoCorrections`
  - `analyzeWhileTranslatingIs409Busy`
  - `saveWithStaleShaIsRejected`: 409 `PROFILE_CHANGED`.
  - `unknownNovelIs404`
- [ ] **Step 2:** Run `mvn -q test -Dskip.npm -Dtest=NovelControllerTest`. Expected: FAIL.
- [ ] **Step 3:** Implement the endpoints. The save body record is `ProfileSaveRequest(String text, String baseSha)`; reuse the Vietsub `SaveRequest` if it is public.
- [ ] **Step 4:** Run the same command again. Expected: PASS.
- [ ] **Step 5:** Commit `feat: novel profile endpoints (details, analyze, save)`.

### Task 5: Shared `ProfileAnalyzePanel` (refactor Vietsub)

**Files:**
- Create:
  - `frontend/src/components/profiles/ProfileAnalyzePanel.tsx` and `.css`: moved from `ProfilesPage`, covering the stats line, the reason, Analyze, the rules list, `DiffView`, Edit proposal, Save and Discard, and the confirm dialogs;
  - `frontend/src/components/profiles/ProfileAnalyzePanel.test.tsx`.
- Modify: `frontend/src/pages/ProfilesPage.tsx` and `.css`, which keep only the profile picker plus the panel.
- Test: `frontend/src/pages/ProfilesPage.test.tsx` must pass with **no assertion changes**. Selector-only updates are allowed and must be listed in the commit message.

**Interfaces:**
- Produces:
  ```ts
  export interface PanelAnalysis { proposed: string; rules: { text: string; count: number }[]; sha: string; model: string }
  export interface ProfileAnalyzePanelProps<A extends PanelAnalysis> {
    name: string; text: string; sha: string;           // the saved profile
    stats: ReactNode;                                  // e.g. "Based on 12 chapters · 48 edits"
    disabledReason: string | null;                     // Analyze disabled with this reason
    analyze: () => Promise<A>;
    save: (text: string, baseSha: string) => Promise<{ sha: string }>;
    onSaved: () => void;                               // parent reloads details
    extra?: (analysis: A) => ReactNode;                // e.g. the Terms list
    basedOnNote?: (analysis: A) => ReactNode;          // e.g. "Used 300 of 412 edits"
    allowDirectEdit?: boolean;                         // Edit the saved profile without Analyze (novels: true)
  }
  ```
- With `allowDirectEdit`, the **Edit** button opens the editor on the saved text. Save sends it with the saved `sha`. The diff shows saved → draft.

- [ ] **Step 1: Write failing tests** in `ProfileAnalyzePanel.test.tsx`:
  - `analyzeShowsRulesAndDiff`
  - `diffShowsRemovedSection`: a proposal without `## Xưng hô` shows those lines as removed.
  - `saveSendsProposalWithBaseSha`
  - `directEditSavesSavedTextChanges`
  - `conflictOnSaveShowsAlert`: a 409 `PROFILE_CHANGED` shows an alert, and `onSaved` is not called.
  - `disabledReasonDisablesAnalyze`
- [ ] **Step 2:** Run `cd frontend && npx vitest run src/components/profiles src/pages/ProfilesPage.test.tsx`. Expected: the new tests FAIL.
- [ ] **Step 3:** Move the logic into the panel, and have `ProfilesPage` pass `analyzeProfile` and `saveProfile` bound to the selected name.
- [ ] **Step 4:** Run the same command again. Expected: all PASS, with `ProfilesPage.test.tsx` unchanged in its assertions.
- [ ] **Step 5:** Commit `refactor: share the profile analyze panel`.

### Task 6: Novel **Profile** tab

**Files:**
- Create:
  - `frontend/src/api/novelProfile.ts`: `getNovelProfile(id)`, `analyzeNovelProfile(id)` (wrapped in `afterTranslateStart` like Vietsub) and `saveNovelProfile(id, text, baseSha)`, with types mirroring Task 3's records;
  - `frontend/src/components/novel/NovelProfileTab.tsx`, `.css` and `.test.tsx`.
- Modify: `frontend/src/pages/NovelPage.tsx`, adding a trigger **Profile** after **Notebook**, `value="profile"`, and reading `?tab=profile` the way `?tab=wattpad` is read today; `NovelPage.test.tsx`.

**Interfaces:**
- Consumes: `ProfileAnalyzePanel` (Task 5) and the endpoints (Task 4).

- [ ] **Step 1: Write failing tests:**
  - `NovelPage`: `profileTabOpensFromQuery`, where `?tab=profile` selects the Profile tab.
  - `NovelProfileTab`:
    - `showsNameAndStats`: "MyGrumpyVampire.md" and "Based on 12 published chapters · 48 edits";
    - `namesOtherNovelsSharingTheProfile`: "incl. chapters of Be my Sugar!";
    - `noProfileShowsAlert`: a 404 NO_PROFILE shows "This novel has no translation profile." plus a hint pointing to the Details tab;
    - `noEditsDisablesAnalyzeWithReason`: "No edited published chapters yet", plus the hint "Chapters translated before this update keep no AI copy and are skipped." for Wattpad novels;
    - `geminiNotConfiguredDisablesAnalyze`: "GEMINI_API_KEY is not set";
    - `showsTermsAfterAnalyze`: a "Terms & addressing (1)" list with "Term: … (×3)";
    - `showsUsedOfTotalWhenLimited`: "Used 300 of 412 edits (newest first)".
- [ ] **Step 2:** Run `cd frontend && npx vitest run src/components/novel/NovelProfileTab.test.tsx src/pages/NovelPage.test.tsx`. Expected: FAIL.
- [ ] **Step 3:** Implement. Use `allowDirectEdit`. Purple marks the term kind badges (info), and orange marks the Analyze action.
- [ ] **Step 4:** Run the same command again. Expected: PASS.
- [ ] **Step 5:** Commit `feat: Profile tab with Analyze corrections on the novel page`.

### Task 7: Docs, full verification, PR
- [ ] Add an entry to `PROGRESS.md` (Vietnamese, full diacritics), section 8 after the last entry: `### 2026-11-16: Analyze hồ sơ dịch cho Novels ✅`, with 4 bullets. Cover `ai_text` V24, chapters that are skipped, the Profile tab, and term suggestions going into the profile rather than the notebook. Update `CLAUDE.md` only if it lists migrations or endpoints.
- [ ] Run `mvn test -Dskip.npm` **without `-q`**. Expected: the Maven line `Tests run: N, Failures: 0, Errors: 0`, then `BUILD SUCCESS`. Quote it.
- [ ] Run `mvn verify -Poracle -Dskip.npm`, which runs the Oracle IT for V24. Expected: BUILD SUCCESS. If the Oracle container is too slow, say so; don't skip silently.
- [ ] Run `cd frontend && npx vitest run && npm run build`. Expected: all pass. VietsubPage, HomePage and WorkEditPage are known to be flaky under load: rerun them alone and report.
- [ ] Before committing, check `git diff --numstat origin/main` for test files with large deletions. No existing test may be removed.
- [ ] Commit, push, then `gh pr create --base main` with an English title and body: summary, the commands and results, a link to the spec and this plan, and "not verified in a real browser" if that's true. End the body with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Do not merge or deploy.
