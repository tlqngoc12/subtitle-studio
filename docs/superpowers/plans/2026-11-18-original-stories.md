# Original Stories + 504 Message Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Originals / Sáng tác tab for the user's own stories (novels with source type ORIGINAL, with a profile,
Check and Add rule, and no translation), and make the Gemini 504 failure message clear.

**Architecture:** Reuse `Novel` with a new enum value. A migration widens the check constraint. A new profile
template is used for ORIGINAL. The frontend branches on `sourceType === 'ORIGINAL'` in the Novels tabs, the form,
the novel page and the chapter page. The public export carries the kind.

**Tech Stack:** Spring Boot / JPA / Flyway (Oracle + H2), React + TS + Vitest.

**Spec:** `docs/superpowers/specs/2026-11-18-original-stories-design.md`

**Branch:** `feat/original-stories`

## Global Constraints

- Tab labels: admin `Translated · Originals · Fanfics`, public `Truyện dịch · Sáng tác · Fanfic`, and `?tab=originals`.
- The author is free text, required for ORIGINAL. Stored `source_language` is `vi` for ORIGINAL only.
- The exact 504 message, copied from the spec:
  `Gemini took too long to answer (HTTP 504, a timeout on Google's side). Translate again; it usually works on the next try.`
- Never stage or commit `data/prompts/novels/ROOM520ILoveYou.md` (it holds the user's uncommitted edit). Stage by
  explicit paths only.
- Commits are in English and end with a blank line, then
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Colors and layout follow `CLAUDE.md` and `docs/ui/screen-layout.md` (orange primary, purple selected, red errors
  only).
- Before each commit, run `mvn test -Dskip.npm` and `cd frontend && npm test`. The DB task also runs
  `mvn verify -Poracle -Dskip.npm`.

## Review Focus

1. **Originals leaking into Translated, admin or public**, or the reverse. Test: Task 4, `tabsSplitByKind` (admin and
   public).
2. **Old public export data without the kind field.** It must count as translated, not vanish. Test: Task 4,
   `publicLegacyDataCountsAsTranslated`.
3. **Translate reachable for an ORIGINAL chapter.** This includes the API: `POST …/translate` on an ORIGINAL chapter
   must be refused with a clear 400/409, not call Gemini. Test: Task 2, `translateRefusedForOriginal`.
4. **Profile name collision** when a story title matches an existing profile file. Follow the existing Wattpad
   naming rule (suffix). Test: Task 2, `originalProfileNameAvoidsCollision`.
5. **Editing an ORIGINAL novel's form** must not ask for or reset the source fields. Test: Task 5,
   `editOriginalKeepsKind`.

---

### Task 1: The 504 message

**Files:** `src/main/java/com/subtitlestudio/translate/GeminiCaller.java`, and its test `GeminiCallerTest`.

- [ ] **Step 1:** Write the test `http504GivesClearMessage`. A fake server answers 504, and the thrown exception
  message equals the exact string.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement. Keep the "Gemini request failed with HTTP 504" WARN with the model name.
- [ ] **Step 4:** Run the full `mvn test -Dskip.npm`. Expected: PASS.
- [ ] **Step 5:** Commit `fix: clear message when Gemini times out (504)`.

### Task 2: Backend for ORIGINAL

**Files:**
- `NovelSourceType`: add `ORIGINAL`.
- `src/main/resources/db/migration/V29__novel_source_original.sql`: drop and recreate `t_novel_source_type_ck`.
- `NovelValidator`, `NovelService` and `NovelController` (the create path for ORIGINAL).
- `NovelProfileTemplate`: select the template for ORIGINAL.
- New `src/main/resources/prompts/_novel_template_original.md`, with the content from the spec's sections list.
- The chapter create path for an empty text chapter.
- The translate endpoint/service: refuse ORIGINAL with the code `NOVEL_NOT_TRANSLATABLE` (400) in `NovelErrors`.
- The publish exporter: mark originals.
- `PersistenceOracleIT`, if it asserts constraints.

**Interfaces:**
- `POST /api/novels` with `sourceType: "ORIGINAL"`. `sourceLanguage` is ignored and stored as `vi`. The author is
  required. An empty `promptProfile` creates a profile from the original template.
- An existing or new endpoint creates an empty text chapter (builder's call, reusing the Wattpad text-chapter
  storage with `sourceText = null`). The frontend uses it in Task 5.
- `NovelDetail.sourceType` can be `ORIGINAL`.

- [ ] **Step 1:** Write the tests:
  - `validatorAcceptsOriginalWithVi`
  - `validatorRejectsViForOthers`
  - `originalRequiresAuthor`
  - `createOriginalMakesProfileFromOriginalTemplate`: the profile contains `## Kiểm tra`, the title and the author,
    and no `## Ngôn ngữ gốc`.
  - `originalProfileNameAvoidsCollision`
  - `addEmptyTextChapterToOriginal`
  - `translateRefusedForOriginal`
  - `exporterMarksOriginals`
  - `NovelProfileTemplateTest.originalTemplate`
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `mvn test -Dskip.npm` and `mvn verify -Poracle -Dskip.npm`. Expected: PASS.
- [ ] **Step 5:** Commit `feat: ORIGINAL novels with their own profile template`.

### Task 3: Frontend types and API

**Files:** `frontend/src/api/novels.ts`. `NovelSourceType` gets `'ORIGINAL'`, plus the create-chapter call if a
new endpoint was added. Add the matching mapping in `lib/errors.ts` for `NOVEL_NOT_TRANSLATABLE`.

- [ ] **Step 1:** Write the API/type tests (`novels.test.ts`): the create-original payload and the add-chapter call.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run them again. Expected: PASS.
- [ ] **Step 5:** Commit `feat: frontend types for original stories`.

### Task 4: Novels tabs (admin and public)

**Files:** `frontend/src/components/fanfics/NovelsTabs.tsx`. `NovelsTab` becomes
`'translated' | 'originals' | 'fanfics'`, and the labels come in via props. Also change `pages/NovelsPage.tsx`, where
Originals reuses the Translated card list filtered to ORIGINAL and the toolbar action is "New story", and
`pages/public/PublicNovelsPage.tsx`, where the labels are Truyện dịch / Sáng tác / Fanfic and the list is filtered
by kind.

- [ ] **Step 1:** Write the tests:
  - `tabsSplitByKind`, for admin and public
  - `originalsTabFromQuery`
  - `newStoryOpensOriginalForm`
  - `publicLegacyDataCountsAsTranslated`
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `cd frontend && npm test`. Expected: PASS.
- [ ] **Step 5:** Commit `feat: Originals / Sáng tác tab`.

### Task 5: The form, novel page and chapter page in original mode

**Files:** `components/novel/NovelForm.tsx` (original mode hides the source language, Wattpad and translator
credit; the author is required), `pages/NovelNewPage.tsx` (reads `?kind=original` or similar), `pages/NovelPage.tsx`
(no Wattpad tab; Add chapter creates a text chapter and opens it), `components/novel/NovelProfileTab.tsx` (no
Wattpad hint), and `pages/ChapterPage.tsx` with `components/chapter/*` (no Original panel or toggle, no Translate or
status chip, Check and Add rule kept).

- [ ] **Step 1:** Write the tests:
  - `originalFormHidesSourceFields`
  - `originalFormRequiresAuthor`
  - `editOriginalKeepsKind`
  - `originalNovelHasNoWattpadTab`
  - `addChapterCreatesTextChapter`
  - `originalChapterHasNoOriginalPanelOrTranslate`
  - `originalChapterHasCheckAndAddRule`
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `cd frontend && npm test`. Expected: PASS.
- [ ] **Step 5:** Commit `feat: write original stories chapter by chapter`.

### Task 6: Docs and PR

- [ ] **Step 1:** Update `CLAUDE.md` (the ORIGINAL type and the template), `README.md` if it lists the source types,
  and `PROGRESS.md` (one entry).
- [ ] **Step 2:** Run the full `mvn test -Dskip.npm`, `mvn verify -Poracle -Dskip.npm`, `npm test` and
  `npm run build`. Expected: green. Record the counts.
- [ ] **Step 3:** Commit `docs: original stories`. Push, then `gh pr create --base main` with an English body that
  covers:
  - the tests run, with their counts;
  - screenshots pending if Playwright is unavailable;
  - the migration V29;
  - the Claude Code footer.

  **Do not merge.**
