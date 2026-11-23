# Chapter Review File Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A **Review** button on the chapter page of an original story loads the newest `data/reviews/review-<Profile>-ch-<x>-<date>[-vN].md`, underlines every "Đoạn cũ" of its tables and swaps it for "Đoạn mới" with the existing Check popover; review files are renamed when chapters move, are deleted, or the profile is renamed.

**Architecture:** Backend: one file helper `ChapterReviewFiles` (find newest, renumber, archive, rename profile) used by `ChapterService` (endpoint + reorder/delete hooks) and `NovelService.followTitle`. Frontend: `lib/reviewFile.ts` parses the tables and finds hits as ordinary `Issue`s; `useChapterCheck` gets a second mode `'review'` so marks, popover, F8 navigation and apply are reused unchanged.

**Tech Stack:** Spring Boot (Java, JUnit 5, `@DataJpaTest` + `@TempDir`), React + TypeScript (Vitest, Testing Library), lucide-react icons.

**Spec:** `docs/superpowers/specs/2026-11-23-chapter-review-file-design.md`

## Global Constraints

- Folder: `<dataDir>/reviews/` (`SubtitleStudioProperties.dataDir().resolve("reviews")`); archive: `<dataDir>/reviews/_archive/`.
- File name: `review-<Profile>-ch-<x>-<YYYY-MM-DD>.md` or `…-<YYYY-MM-DD>-v<N>.md`; `<Profile>` = `Novel.getPromptProfile()` exactly (case-sensitive); `<x>` = 1-based position in `ChapterRepository.findByNovelIdOrderBySortOrderAscChapterNoAsc`, no zero padding.
- Newest = greatest date, then greatest N (no suffix = 1).
- Only files matching `^review-<Profile>-ch-(\d+)-(\d{4}-\d{2}-\d{2})(?:-v(\d+))?\.md$` (profile quoted with `Pattern.quote`) are ever touched.
- File-move failures: `log.warn`, never throw out of the hook, never fail reorder/delete/rename. Never log review contents.
- Endpoint: `GET /api/chapters/{id}/review` → `200 {"fileName": "...", "markdown": "..."}`; missing file or no profile → `404` ProblemDetail code `REVIEW_NOT_FOUND`, detail `No review file found (review-<Profile>-ch-<x>-*.md)` (no profile: `No review file found (this novel has no profile)`). Matches the existing `/api/chapters/{id}/…` style (spec said `/api/novels/{id}/chapters/{chapterId}/review`; this is the same thing in the app's URL style).
- Admin UI strings in English. Review button only when `chapter.sourceType === 'ORIGINAL'`.
- Colours: existing `button button--s` + `aria-pressed` styling of `check-toggle` (purple "selected" when on); errors via `Alert`.
- Matching: NFC; any run of whitespace matches any run of whitespace; `"` `“` `”` match each other; **case-sensitive**.
- Cell decoding: `\|` → `|`, `<br>` / `<br/>` / `<br />` → `\n`, trim. "Đoạn mới" empty or exactly `(xoá)` / `(xóa)` = delete.

## Review Focus

1. Same "Đoạn cũ" text appears twice in the chapter → both underlined, each applies independently (test in Task 3).
2. Two review rows overlap in the chapter (e.g. one row's old text contains another's) → keep the earlier/longer one, never paint two marks on the same words (test in Task 3).
3. Old text contains regex characters (`?`, `(`, `.`, `*`) → literal match, no crash (test in Task 3).
4. Swap of positions 3↔5 when both chapters have reviews → no file overwritten (test in Task 1).
5. User keeps typing after Review loads → marks recompute on the new text without refetching the file (test in Task 4).

---

### Task 1: `ChapterReviewFiles` — find, renumber, archive, rename

**Files:**
- Create: `src/main/java/com/subtitlestudio/novel/ChapterReviewFiles.java`
- Test: `src/test/java/com/subtitlestudio/novel/ChapterReviewFilesTest.java`

**Interfaces:**
- Produces (Spring `@Component`, constructor `ChapterReviewFiles(SubtitleStudioProperties properties)`; also a package-private constructor `ChapterReviewFiles(Path reviewsDir)` for tests):
  - `Optional<Path> newest(String profile, int position)`
  - `static String pattern(String profile, int position)` → `"review-" + profile + "-ch-" + position + "-*.md"`
  - `void renumber(String profile, Map<Integer, Integer> oldToNew)` — only entries whose key ≠ value matter
  - `void archive(String profile, int position)` — moves all versions to `_archive/` (name clash → append `-1`, `-2`… before `.md`)
  - `void renameProfile(String from, String to)`
  - Missing `reviews/` folder = no files (no exception, `newest` empty, others no-op).

- [ ] **Step 1: Write the failing tests** (JUnit 5, `@TempDir Path dir`, `new ChapterReviewFiles(dir)`; helper `touch(name)`):
  - `newestPicksLatestDateThenVersion`: files `review-P-ch-5-2026-11-20.md`, `review-P-ch-5-2026-11-23.md`, `review-P-ch-5-2026-11-23-v2.md`, `review-P-ch-5-2026-11-23-v10.md`, `review-P-ch-50-2026-12-01.md`, `review-PX-ch-5-2026-12-01.md` → `newest("P",5)` file name is `review-P-ch-5-2026-11-23-v10.md`.
  - `newestEmptyWhenNoFileOrNoFolder`: no folder → `Optional.empty()`; folder with `review-P-ch-4-2026-11-23.md` only → empty for 5.
  - `patternText`: `pattern("TheDebtCalledYou", 5)` equals `"review-TheDebtCalledYou-ch-5-*.md"`.
  - `renumberSwapsWithoutOverwriting`: `ch-3-2026-11-01.md` (content "three"), `ch-5-2026-11-01.md` ("five"), `ch-5-2026-11-02-v2.md`; `renumber("P", Map.of(3,5, 5,3))` → `ch-5-2026-11-01.md` contains "three", `ch-3-2026-11-01.md` contains "five", `ch-3-2026-11-02-v2.md` exists; no other files left (no temp names).
  - `renumberIgnoresOtherProfilesAndUnmatchedNames`: `review-Q-ch-3-…md`, `notes.md`, `review-P-ch-3-draft.md` untouched after `renumber("P", Map.of(3,4))`.
  - `archiveMovesAllVersions`: two versions of ch-2 → both in `_archive/`, none left in `reviews/`; archiving again a same-named file yields `…-1.md` in `_archive/`.
  - `renameProfileRenamesOnlyThatProfile`: `review-Old-ch-1-…md`, `review-Old-ch-12-…-v2.md`, `review-Older-ch-1-…md` → `renameProfile("Old","New")` renames the first two to `review-New-…`, leaves `review-Older-…`.
- [ ] **Step 2: Run** `mvn test -Dtest=ChapterReviewFilesTest` → FAIL (class missing).
- [ ] **Step 3: Implement.** `renumber`: phase 1 move every affected file to `.<uuid>.renumber` in the same folder, phase 2 move each to its final name; any `IOException` → `log.warn("Could not renumber review files of {}", profile, e)` and stop. Same try/warn pattern for `archive` and `renameProfile`.
- [ ] **Step 4: Run** `mvn test -Dtest=ChapterReviewFilesTest` → PASS.
- [ ] **Step 5: Commit** `feat: add ChapterReviewFiles for per-chapter review files`

### Task 2: Endpoint, reorder/delete/rename hooks, export numbering

**Files:**
- Create: `src/main/java/com/subtitlestudio/novel/ChapterReview.java` (`public record ChapterReview(String fileName, String markdown)`)
- Create: `src/main/java/com/subtitlestudio/novel/ChapterReviewNotFoundException.java`
- Modify: `src/main/java/com/subtitlestudio/novel/ChapterService.java` (constructor; `reorderChapters` ~203; `delete` ~306; new `review`)
- Modify: `src/main/java/com/subtitlestudio/novel/ChapterController.java` (new GET)
- Modify: `src/main/java/com/subtitlestudio/web/NovelErrors.java` (handler)
- Modify: `src/main/java/com/subtitlestudio/novel/NovelService.java` (`followTitle` ~193)
- Modify: `src/main/java/com/subtitlestudio/novel/NovelExportService.java` (~57-75)
- Test: `ChapterServiceTest`, `ChapterControllerTest`, `NovelServiceTest`, `NovelExportServiceTest` (add `ChapterReviewFiles.class` to their `@Import` where the service under test needs it; review files go under the existing `@TempDir dataDir` + `/reviews`)

**Interfaces:**
- Consumes: Task 1 `ChapterReviewFiles`.
- Produces: `ChapterReview ChapterService.review(long chapterId)` (read-only tx); throws `ChapterReviewNotFoundException(String pattern)` (pattern `null` = no profile). JSON `{fileName, markdown}`.

- [ ] **Step 1: Write the failing tests**
  - `ChapterServiceTest.reviewReturnsNewestFileOfThePosition`: novel with profile `P`, chapters A,B,C in reading order; write `reviews/review-P-ch-2-2026-11-20.md` ("old") and `review-P-ch-2-2026-11-23.md` ("new") → `review(B.id)` = `("review-P-ch-2-2026-11-23.md", "new")`.
  - `reviewThrowsWithPatternWhenMissing`: `review(C.id)` throws `ChapterReviewNotFoundException` whose message contains `review-P-ch-3-*.md`.
  - `reorderRenumbersReviewFiles`: files for ch-1 ("a") and ch-3 ("c"); `reorderChapters(novel, [C,B,A])` → `ch-1-…` contains "c", `ch-3-…` contains "a".
  - `deleteArchivesAndShiftsLaterReviews`: files for ch-2 ("b") and ch-3 ("c"); `delete(B.id)` → `_archive/review-P-ch-2-…` contains "b"; `reviews/review-P-ch-2-…` contains "c"; no `ch-3` file left.
  - `reorderStillSucceedsWhenReviewsFolderIsAFile`: create a regular *file* named `reviews` → `reorderChapters` completes and order is saved.
  - `ChapterControllerTest.reviewReturns404WithCode`: GET `/api/chapters/{id}/review` with no file → 404, `$.code == "REVIEW_NOT_FOUND"`, `$.detail` contains `-ch-1-*.md`; with a file → 200, `$.fileName`, `$.markdown`.
  - `NovelServiceTest.titleChangeRenamesReviewFiles`: original novel whose profile is auto-derived (existing test setup for `followTitle`) + `reviews/review-<old>-ch-1-2026-11-23.md` → after title update, file is `review-<new>-ch-1-2026-11-23.md`.
  - `NovelExportServiceTest.positionsFollowFullReadingOrder`: chapters 1 (text), 2 (no text), 3 (text) → zip entries start `1 - ` and `3 - ` (width from total chapter count, so with 3 chapters `1 - …`, `3 - …`).
- [ ] **Step 2: Run** `mvn test -Dtest=ChapterServiceTest,ChapterControllerTest,NovelServiceTest,NovelExportServiceTest` → new tests FAIL.
- [ ] **Step 3: Implement.**
  - `ChapterService`: inject `ChapterReviewFiles`. Private `Map<Long,Integer> positions(long novelId)` from `findByNovelIdOrderBySortOrderAscChapterNoAsc` (1-based). `reorderChapters`: take `positions` before the loop, after `flush()` take them again, call `reviewFiles.renumber(profile, old→new for changed chapters)` when `novel.getPromptProfile()` is non-blank. `delete`: before deleting take position `p` of the chapter and positions of the novel; after `flush()` call `archive(profile, p)` then `renumber(profile, {q → q-1 for every q > p})`.
  - `review`: blank profile → `new ChapterReviewNotFoundException(null)`; else `newest(profile, position)` → read UTF-8 → `ChapterReview`; empty → exception with `ChapterReviewFiles.pattern(...)`.
  - `ChapterController`: `@GetMapping("/api/chapters/{id}/review") ChapterReview review(@PathVariable long id)`.
  - `NovelErrors`: `ProblemDetails.problem(HttpStatus.NOT_FOUND, "REVIEW_NOT_FOUND", pattern == null ? "No review file found (this novel has no profile)" : "No review file found (" + pattern + ")")` — expose the pattern via a getter on the exception.
  - `NovelService.followTitle`: right after `profiles.rename(...)`, `reviewFiles.renameProfile(oldProfile, newName)`.
  - `NovelExportService.export`: keep skipping chapters without text, but `fileBase(position, totalChapters, heading)` where `position` = index in the full reading order + 1 and `totalChapters` = number of chapters of the novel. Single-chapter export (`exportChapter`) uses the same position rule.
- [ ] **Step 4: Run** the same `mvn test -Dtest=…` → PASS, then `mvn test` → all PASS.
- [ ] **Step 5: Commit** `feat: serve chapter review files and keep their names in sync`

### Task 3: `lib/reviewFile.ts` — parse tables, find hits

**Files:**
- Create: `frontend/src/lib/reviewFile.ts`
- Test: `frontend/src/lib/reviewFile.test.ts`

**Interfaces:**
- Consumes: `Issue`, `CheckRule` from `lib/checkRules.ts`.
- Produces:
  - `interface ReviewRow { item: string; old: string; replacement: string }` (`replacement === ''` = delete)
  - `parseReview(markdown: string): ReviewRow[]` — every table whose header row has cells `Mục`, `Đoạn cũ`, `Đoạn mới` (any order, other columns ignored); separator row skipped; rows with empty old skipped.
  - `interface ReviewScan { issues: Issue[]; done: ReviewRow[]; notFound: ReviewRow[] }`
  - `findReviewIssues(text: string, rows: ReviewRow[]): ReviewScan` — each hit is an `Issue` with `rule = { wrong: row.old, suggestions: [row.replacement], reason: row.item }`; issues sorted by `start`; overlapping hits: keep the one that starts first, ties → longer.
- [ ] **Step 1: Write the failing tests** (Vitest):
  - `parses the review table`: markdown with a `| Mục | Dòng | Đoạn cũ | Đoạn mới |` table (two rows) plus a non-review table `| Chương | Số chữ |` → 2 rows, `{item:'🔴1', old:'Emi cúi xuống.', replacement:'Emi ghé lại gần.'}` first.
  - `decodes cells`: `a \| b` → `a | b`; `x<br>y` → `x\ny`; `(xoá)` and `(xóa)` and empty → `replacement === ''`.
  - `reads several tables`: two review tables → rows of both, in file order.
  - `matches across quote styles and whitespace`: text `Cô nói: “Đi  đi.”` and old `Cô nói: "Đi đi."` → one issue covering the whole quoted span.
  - `is case-sensitive`: old `emi cúi xuống.` in text `Emi cúi xuống.` → `notFound` has it, no issue.
  - `marks every occurrence`: old appears twice → 2 issues.
  - `escapes regex characters`: old `Sao vậy? (cười)` found literally.
  - `drops overlapping hits`: rows `Bonnie cúi xuống` and `cúi xuống nhìn` against `Bonnie cúi xuống nhìn` → 1 issue (the first row).
  - `counts done and not found`: row whose old is gone but replacement is present → `done`; delete-row whose old is gone → `done`; row with neither → `notFound`.
- [ ] **Step 2: Run** `cd frontend && npx vitest run src/lib/reviewFile.test.ts` → FAIL.
- [ ] **Step 3: Implement.** Build one regex per row: NFC, escape regex specials, replace each run of whitespace with `\s+` and each of `"“”` with `["“”]`, flag `gu`; run against `text.normalize('NFC')` (chapter text is already NFC in the editor; normalise once and assume same length — note in a comment).
- [ ] **Step 4: Run** the same command → PASS.
- [ ] **Step 5: Commit** `feat: parse chapter review tables and find their passages`

### Task 4: Review mode in the chapter editor

**Files:**
- Modify: `frontend/src/api/novels.ts` (add `getChapterReview`)
- Modify: `frontend/src/components/chapter/useChapterCheck.ts`
- Create: `frontend/src/components/chapter/ReviewToggle.tsx`
- Modify: `frontend/src/components/chapter/ChapterTextEditor.tsx`
- Modify: `frontend/src/components/chapter/CheckToggle.tsx` (`CheckNavigator` gets `label` prop: `'Check' | 'Review'`)
- Modify: `frontend/src/components/chapter/CheckPopover.tsx` (empty suggestion chip text `Delete passage`; reason line shows the item, e.g. `🔴1`)
- Modify: `frontend/src/components/chapter/Check.css` (summary line, not-found list)
- Test: `frontend/src/components/chapter/ChapterReview.test.tsx` (new), keep `ChapterCheck.test.tsx` green

**Interfaces:**
- Consumes: Task 2 endpoint; Task 3 `parseReview`, `findReviewIssues`, `ReviewRow`.
- Produces:
  - `getChapterReview(id: number): Promise<{ fileName: string; markdown: string }>` (throws `ApiError`, code `REVIEW_NOT_FOUND` on 404)
  - `useChapterCheck(...)` additionally takes `chapterId: number` and returns `mode: 'check' | 'review'`, `toggleReview(): Promise<void>`, `review: { fileName: string | null; done: number; notFound: ReviewRow[]; error: string | null; loading: boolean }`. Existing fields keep their meaning; in review mode `issues`/`marks`/`current`/`apply`/`goTo` come from the review hits. Turning Check on turns Review off and vice versa.
  - `ReviewToggle({ on, count, loading, disabled, onToggle })` — `button button--s check-toggle`, lucide `ClipboardCheck` icon, text `Review` / `Review · {count}`, `aria-pressed={on}`; disabled (aria-disabled + Tip "Review is off while the chapter is translating") when `locked`.

- [ ] **Step 1: Write the failing tests** (`ChapterReview.test.tsx`, mock `api/novels` like `ChapterCheck.test.tsx` does):
  - `shows the Review button only for original stories`: ORIGINAL chapter → button `Review` present; translated chapter → absent.
  - `loads the newest review and underlines its passages`: `getChapterReview` resolves `{fileName:'review-P-ch-2-2026-11-23.md', markdown: table with 2 rows (1 present, 1 absent)}` → after click: button text `Review · 1`, text `review-P-ch-2-2026-11-23.md` visible, summary `1 to fix · 0 done · 1 not found`.
  - `applies Đoạn mới`: put caret in the mark → popover shows `🔴1` and chip `Emi ghé lại gần.`; double-click → `onTextChange` called with the replaced text.
  - `shows the not-found list`: click `1 not found` → list item shows `🔴2` and the start of its old text.
  - `shows an error when no file exists`: rejects `new ApiError(404,'REVIEW_NOT_FOUND','No review file found (review-P-ch-2-*.md)')` → `Alert` with that detail; button not pressed.
  - `Review and Check exclude each other`: Review on, click Check → Review button `aria-pressed=false`, Check pressed.
  - `recomputes after typing without refetching`: after load, change text so the passage disappears and its replacement appears → summary becomes `0 to fix · 1 done · 1 not found`; `getChapterReview` called once.
- [ ] **Step 2: Run** `cd frontend && npx vitest run src/components/chapter` → new tests FAIL.
- [ ] **Step 3: Implement.** In `useChapterCheck`: `mode` state; `toggleReview` fetches every time it turns on (picks up a newer file), stores rows, sets `mode='review'` and `on=true`; on error stores `e.detail` (ApiError) or `'Could not load the review file'` and leaves it off. The debounced effect computes `findReviewIssues(text, rows)` in review mode (keep `done`/`notFound` from the same scan) instead of rules/repeats; review mode does not wait for rules to load. `ChapterTextEditor`: render `ReviewToggle` before `CheckToggle` only when `chapter.sourceType === 'ORIGINAL'`; below `.chapter-text__head`, when review is on, a muted line `{fileName} · {n} to fix · {done} done · ` + a link-style button `{k} not found` that toggles a small list (`<ul>` of `item — first 60 chars of old…`); error → `<Alert>`. `CheckNavigator` label follows `mode`.
- [ ] **Step 4: Run** `cd frontend && npx vitest run` → all PASS; `npm run build` → no TypeScript errors.
- [ ] **Step 5: Commit** `feat: Review button applies a chapter's review file`

### Task 5: story-reviewer agent + docs

**Files:**
- Modify: `C:\Users\Zen\.claude\agents\story-reviewer.md` (outside the repo — not committed)
- Modify: `CLAUDE.md` (Novels section: one bullet), `PROGRESS.md`

- [ ] **Step 1: Agent.** Replace the output rule (line ~53 and the `description`) with: one file per chapter at `D:\working\repositories\subtitle-studio\data\reviews\review-<Profile>-ch-<x>-<YYYY-MM-DD>.md` (`-v2`, `-v3` if taken; never overwrite); `<Profile>` = the app profile name of the story (ask if unknown); `<x>` = number prefix of the export file (`005 - …` → 5); table header exactly `| Mục | Dòng | Đoạn cũ | Đoạn mới |`; "Đoạn cũ" copied verbatim and contiguous from the chapter (no "…", no joining distant spots), long enough to be unique, one row per occurrence; use `\|` for a literal pipe and `<br>` for a line break; `(xoá)` in "Đoạn mới" to delete; cross-chapter summary only in the chat reply; messages for the AI writer go in the file of the chapter they concern.
- [ ] **Step 2: Docs.** CLAUDE.md bullet: Review button, file convention, endpoint, rename/archive behaviour, spec + plan links. PROGRESS.md entry.
- [ ] **Step 3: Verify** `mvn test` and `cd frontend && npx vitest run && npm run build` → all PASS.
- [ ] **Step 4: Commit** `docs: document chapter review files`
