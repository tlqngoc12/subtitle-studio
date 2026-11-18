# Novel Profile Follows Title Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Renaming a novel renames its auto-created profile file (+ history) and the title lines inside it.

**Architecture:** `PromptProfileStore.rename` does the file work (shared store, novel folder only uses it via `NovelProfileStore`). `NovelProfileNames` gains a "derived name" check. `NovelService.update` decides and calls it after the flush. Frontend toasts when `promptProfile` changed by itself.

**Tech Stack:** Spring Boot (Java), JUnit; React + TS, Vitest, sonner.

**Spec:** `docs/superpowers/specs/2026-11-18-novel-profile-follows-title-design.md`

## Global Constraints

- Work on the existing branch `feat/new-chapter-from-chapter-page` (PR #63, user asked to put this in the same PR). Pull it first; update the PR title/body to cover both features. English commits/PR; no merge without user OK.
- Rename only when: title changed, novel has a profile, request `promptProfile` equals the current one, no other novel uses it, and the current name is the old title's derived name or that name + `-N`.
- Derived name: Wattpad novels → `NovelProfileNames.fromTitle(title, storyId, …)`; others → `forOriginal(title, …)` rule. New name uses the real `taken` check (the current file does not count as taken).
- History files to move: `.history/<Old>-<yyyyMMdd-HHmmss>(-<n>)?.md` exactly.
- Title lines changed only when they hold the old title exactly: `^# Hồ sơ (truyện|dịch): <old>$` and `^- Tên truyện: "<old>"(.*)$` (suffix kept). Nothing else changes; the rename is not a history entry.
- Toast copy: `Profile renamed to <New>.md`. Never log profile text.

## Review Focus

- Title with regex characters (`(`, `|`, `*`, `$`) → lines matched literally (`Pattern.quote` / `Matcher.quoteReplacement`).
- New name equals current name (only text after `|` changed) → file not moved, lines updated.
- Two novels sharing the profile → nothing changes for either.
- File system failure during rename (target exists) → error, novel title not saved.
- Windows: rename with only a case change (`Unknown` → `UNKNOWN`) → still works (move via a temp name).

---

### Task 1: Store + names

**Files:**
- Modify: `src/main/java/com/subtitlestudio/translate/PromptProfileStore.java`, `src/main/java/com/subtitlestudio/novel/NovelProfileStore.java`, `src/main/java/com/subtitlestudio/novel/NovelProfileNames.java`
- Test: the existing `PromptProfileStore` test class, `NovelProfileStoreTest`, `NovelProfileNamesTest`

**Interfaces:**
- Produces:
  - `PromptProfileStore.synchronized void rename(String from, String to, UnaryOperator<String> edit)` — writes `edit(text)` to `to.md`, moves matching history files, removes `from.md`; `from == to` rewrites in place; throws `ProfileExistsException` when `to` exists (case-insensitively different file); `UnknownProfileException` when `from` missing. Same in `NovelProfileStore` (delegate).
  - `NovelProfileNames.static boolean isDerived(String name, String derived)` — `name.equals(derived)` or `name` matches `Pattern.quote(derived-cut-to-fit) + "-\\d+"` (respect the suffix truncation rule of `name(...)`).
- [ ] **Step 1: Failing tests:** `renameMovesFileAndOnlyItsHistory` (history `A-20261118-101010.md`, `A-20261118-101010-2.md`, `A-2-20261118-101010.md`, `AB-20261118-101010.md` → only the first two become `B-…`); `renameAppliesEditWithoutHistoryEntry`; `renameToSameNameRewritesInPlace`; `renameRefusesExistingTarget`; `renameCaseOnly` (`a` → `A`); `isDerived` true for `Unknown`, `Unknown-2`, false for `BeMySugar` vs derived `Unknown`.
- [ ] **Step 2: Run** `mvn -q test -Dskip.npm -Dtest="PromptProfileStore*Test,NovelProfileStoreTest,NovelProfileNamesTest"` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** same → PASS. **Step 5: Commit** `feat(novel): rename a profile with its history`.

### Task 2: NovelService + toast

**Files:**
- Modify: `src/main/java/com/subtitlestudio/novel/NovelService.java` (`update`), `src/main/java/com/subtitlestudio/novel/NovelRepository.java` (`long countByPromptProfile(String name)`), `frontend/src/pages/NovelPage.tsx` (save at ~line 242)
- Create: `src/main/java/com/subtitlestudio/novel/ProfileTitleLines.java` (`static String retitle(String text, String oldTitle, String newTitle)`)
- Test: `ProfileTitleLinesTest`, the existing `NovelService` test class, `frontend/src/pages/NovelPage.test.tsx`; `PROGRESS.md`

**Interfaces:**
- Consumes: Task 1 `rename`, `isDerived`; `NovelProfileNames.fromTitle/forOriginal`.
- [ ] **Step 1: Failing tests:**
  - `ProfileTitleLinesTest`: original heading + `- Tên truyện: "Unknown"` → new title; translated `# Hồ sơ dịch: X` + `- Tên truyện: "X" (giữ nguyên tên, không dịch).` → suffix kept; a line with another title untouched; title `A (B) | $1` handled literally; `\r\n` text keeps its line ends.
  - Service: `renamesAutoProfileWithTitle` (original novel `Unknown` → `Mua He` gives `MuaHe.md`, `promptProfile == "MuaHe"`, lines updated); `renamesWattpadProfile`; `skipsSharedProfile`; `skipsHandPickedProfile`; `skipsWhenProfileChangedInSameRequest`; `skipsWhenTitleUnchanged`; `addsSuffixWhenTaken` (`MuaHe` exists → `MuaHe-2`); `sameDerivedNameOnlyRetitles`; `renameFailureKeepsOldTitle` (store throws → exception, novel title unchanged after rollback or not saved).
  - `NovelPage.test.tsx`: `toasts when the profile was renamed` (PUT returns `promptProfile: 'MuaHe'`, was `'Unknown'`) → info toast `Profile renamed to MuaHe.md`; `no toast when the user picked another profile`.
- [ ] **Step 2: Run** `mvn -q test -Dskip.npm -Dtest="ProfileTitleLinesTest,NovelService*Test"` and `cd frontend && npm test -- NovelPage` → FAIL.
- [ ] **Step 3: Implement** in `update`: remember old title/profile before applying; after `novels.flush()`, if the rules pass, `profiles.rename(old, newName, t -> ProfileTitleLines.retitle(t, oldTitle, newTitle))` and `n.setPromptProfile(newName)`; log `Renamed profile {} to {} for novel {}`.
- [ ] **Step 4: Run** same → PASS.
- [ ] **Step 5: Docs + full check:** `PROGRESS.md` dated entry (Vietnamese); `mvn test -Dskip.npm` (read the `Tests run:` line) and `cd frontend && npm test && npm run build` → PASS.
- [ ] **Step 6: Commit** `feat(novel): profile follows the novel title`, push, edit PR #63 title/body (`gh pr edit 63`) to describe both features with test results.
