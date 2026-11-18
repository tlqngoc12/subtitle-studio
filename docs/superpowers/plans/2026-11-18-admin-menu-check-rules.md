# Admin Menu Groups + Check Rules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Group the admin topbar into 4 scopes with tab rows, and make `## Kiểm tra` rules easy to get: seed 2
profiles, add an "Add to check rules" dialog, and have the analyzer propose rules.

**Architecture:**
- Nav and tab changes are frontend only, and the routes do not change.
- Rule writing reuses the existing profile GET/save API, plus pure helpers in `lib/checkRules.ts`.
- The analyzer gets one more prompt line.

**Tech Stack:** React + TS + Vitest, Spring Boot (one Java constant).

**Spec:** `docs/superpowers/specs/2026-11-18-admin-menu-check-rules-design.md`

**Branch:** `feat/admin-menu-check-rules`

## Global Constraints

- The public site (`PublicApp`, `PUBLIC_SECTIONS`) stays unchanged.
- No route changes.
- The group label is `'Showcase'`, defined once as a constant.
- Colors: purple selected underline as today, orange only for the dialog's primary "Add rule"; red only for errors.
- **Never** stage or commit `data/prompts/novels/ROOM520ILoveYou.md` (it holds the user's uncommitted edit). Stage
  files by explicit path, never `git add -A` or `git add .`.
- Commits are in English and end with a blank line, then
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Before each commit, run `cd frontend && npm test` (and `mvn test -Dskip.npm` for Task 4).

## Review Focus

1. **Deep links light the right group.** `/vietsub/123` (watch) and `/vietsub/playlists/7` must light Vietsub;
   `/works/5/edit` must light Showcase. Test: Task 1, `navCurrentForDeepLinks`.
2. **Tab rows leaking into public.** The shared pages render without tabs in read-only mode. Test: Task 1,
   `showcaseTabsHiddenInPublic`.
3. **A profile without the "Tóm tắt" heading, or with `## Kiểm tra` as the last section.** The insert must land
   inside the section and keep the following sections intact. Test: Task 2, `addCheckRule keeps later sections`.
4. **A stale sha** (profile edited in another tab). Retry once, then show the error without losing the dialog
   input. Test: Task 3, `conflictRetriesOnceThenShowsError`.
5. **Unicode selection** (combining marks). The prefill is NFC, so the added rule matches what Check finds. Test:
   Task 2, `formatted rule round-trips NFC`.

---

### Task 1: Admin topbar groups and tab rows

**Files:**
- Modify: `frontend/src/components/NavBar.tsx`. `ADMIN_SECTIONS` becomes
  `[VIETSUB_GROUP, SHOWCASE_GROUP, NOVELS, SETTINGS]`; `PUBLIC_SECTIONS` is untouched.
- Modify: `frontend/src/components/VietsubTabs.tsx`. Tabs: `Get Engsub` (`/`, current when `p === '/'`), Videos,
  Playlists, Profiles, `List` (`/vietsub/list`).
- Create: `frontend/src/components/ShowcaseTabs.tsx` (Profile `/profiles`, Works `/works`, Photos `/photos`). A shared
  `RouteTabs` is optional.
- Modify: the level-1 pages so they render their group's tab row in admin only: the home/Get Engsub page,
  `VietsubListPage`, `ProfilePage`, `WorksPage` and `PhotosPage`. Use the app's existing read-only signal, the same
  one NavBar uses.
- Test: `NavBar.test.tsx`, `VietsubTabs.test.tsx` (new or existing), `ShowcaseTabs.test.tsx`.

**Interfaces:**
- `VIETSUB_GROUP.isCurrent(p)`: true when `p === '/'` or `p.startsWith('/vietsub')`.
- `SHOWCASE_GROUP.isCurrent(p)`: true for `/profiles…`, `/works…` or `/photos…`.

- [ ] **Step 1:** Write the tests:
  - `adminTopbarHasFourGroups` checks the labels in order: Vietsub, Showcase, Novels, Settings.
  - `publicTopbarUnchanged` checks: Vietsub, Profile, Works, Photos, Novels.
  - `navCurrentForDeepLinks` covers `/`, `/vietsub/list`, `/vietsub/123`, `/vietsub/playlists/7`, `/works/5/edit`,
    `/photos`.
  - `vietsubTabsCurrent` covers each of the 5 paths.
  - `showcaseTabsShownInAdmin`
  - `showcaseTabsHiddenInPublic`
- [ ] **Step 2:** Run `cd frontend && npm test`. Expected: the new tests FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `cd frontend && npm test`. Expected: PASS. Fix existing tests that asserted the old 8 items;
  update them, don't delete them.
- [ ] **Step 5:** Commit `feat: group the admin menu into Vietsub, Showcase, Novels, Settings`.

### Task 2: `formatCheckRule` and `addCheckRule` helpers

**Files:**
- Modify: `frontend/src/lib/checkRules.ts`
- Test: `frontend/src/lib/checkRules.test.ts`

**Interfaces:**
- `formatCheckRule(rule: CheckRule): string`
  - `- "<wrong>" → "<s1>" | "<s2>"`, with ` (<reason>)` appended when there is a reason.
  - `- "<wrong>" → (tránh dùng)` when there are no suggestions.
  - All parts are NFC.
- `addCheckRule(profile: string, rule: CheckRule): string`
  - It replaces the line whose parsed `wrong` equals `rule.wrong` (NFC, case-insensitive).
  - Otherwise it inserts after the last non-blank line of the `## Kiểm tra` section.
  - If the section is missing, it creates `## Kiểm tra\n<line>\n\n` before `## Tóm tắt nội dung chính`, or appends
    it at the end.
  - Every other line stays byte-identical.

- [ ] **Step 1:** Write the tests:
  - `formats suggestions and reason`
  - `formats flag-only`
  - `formatted rule round-trips through parseCheckRules`
  - `formatted rule round-trips NFC`
  - `addCheckRule appends inside section`
  - `addCheckRule creates section before Tóm tắt`
  - `addCheckRule creates section at end`
  - `addCheckRule replaces same wrong phrase case-insensitively`
  - `addCheckRule keeps later sections`
- [ ] **Step 2:** Run `npx vitest run src/lib/checkRules`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit `feat: format and insert check rules into a profile`.

### Task 3: "Add to check rules" dialog

**Files:**
- Create: `frontend/src/components/chapter/AddCheckRuleDialog.tsx`
- Modify: `frontend/src/components/chapter/ChapterTextEditor.tsx` (button next to the Check toggle) and
  `frontend/src/components/chapter/useChapterCheck.ts`. The hook exposes `reloadRules(): Promise<void>` if it does
  not have it already.
- Test: `frontend/src/components/chapter/AddCheckRuleDialog.test.tsx`

**Interfaces:**
- Consumes `getNovelProfile` and `saveNovelProfile` (`api/novelProfile.ts`), and `addCheckRule` (Task 2).
- **Selection rules:** the selection is trimmed and NFC. The button is enabled for 1–60 characters with no `\n` and
  no `"`, when the novel has a profile and the editor is not locked.
- **Suggestions input:** split on `|`, trim each part, drop empty ones.

- [ ] **Step 1:** Write the tests:
  - `disabledWithoutSelection`
  - `disabledOver60Chars`
  - `disabledWithNewlineOrQuote`
  - `disabledWithoutProfile`
  - `prefillsSelection`
  - `savesWithShaAndNewText`
  - `conflictRetriesOnceThenShowsError`: the dialog stays open and keeps its inputs.
  - `checkRulesReloadAfterSave`
- [ ] **Step 2:** Run `cd frontend && npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `cd frontend && npm test`. Expected: PASS.
- [ ] **Step 5:** Commit `feat: add a check rule from the selected text`.

### Task 4: The analyzer proposes `## Kiểm tra` lines; seed two profiles

**Files:**
- Modify: `src/main/java/com/subtitlestudio/novel/NovelProfileAnalyzer.java` (`SYSTEM_RULES`). Insert the exact
  line from the spec, section 4, right after the "Tên riêng và thuật ngữ … Nếu mục chưa có thì tạo mới." bullet.
- Modify: `src/test/java/com/subtitlestudio/novel/NovelProfileAnalyzerTest.java`
- Modify (data): `data/prompts/novels/BreathlessLesson.md` and `data/prompts/novels/MyGrumpyVampire.md`. Add the
  exact sections from the spec, section 2, before `## Tóm tắt nội dung chính`.

- [ ] **Step 1:** Write the test `systemRulesAskForCheckRules`. It asserts that `SYSTEM_RULES` contains
  `"## Kiểm tra"` and `"ít nhất 2 đoạn"`.
- [ ] **Step 2:** Run `mvn test -Dskip.npm -Dtest=NovelProfileAnalyzerTest`. Expected: FAIL.
- [ ] **Step 3:** Add the line, then edit the 2 data files.
- [ ] **Step 4:** Run `mvn test -Dskip.npm`. Expected: PASS. Then run a one-off check (a vitest scratch test or a
  node script, not committed) that `parseCheckRules` reads 3 rules with 0 ignored from each file.
- [ ] **Step 5:** Commit, staging by explicit paths only, with the message
  `feat: analyzer proposes check rules; seed two profiles`. Before committing, `git status` must still show
  `ROOM520ILoveYou.md` modified and unstaged.

### Task 5: Docs and PR

- [ ] **Step 1:** Update the docs:
  - `CLAUDE.md`: the admin menu groups, and that `## Kiểm tra` can be added from the chapter page.
  - `docs/ui/screen-layout.md`: mention Showcase as a group with tab-routes, if that doc lists the groups.
  - `PROGRESS.md`: one entry.
- [ ] **Step 2:** Run `mvn test -Dskip.npm`, `cd frontend && npm test` and `npm run build`. Expected: green. Record
  the counts.
- [ ] **Step 3:** Commit `docs: admin menu groups and check rules`. Push, then
  `gh pr create --base main`:
  - English title and body, with the test counts.
  - Say that screenshots are pending if Playwright cannot run.
  - Note that "Showcase" is a placeholder name the user may change.
  - End the body with the Claude Code line.
  - **Do not merge.**
