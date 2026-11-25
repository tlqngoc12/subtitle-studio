# Chapter Title Merge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The chapter title becomes the chapter's only name: `label` is merged into `title` and dropped, `chapterNo` becomes a hidden id, and review files are named by a key taken from the title.

**Architecture:** One pure helper `ChapterTitles` holds every title rule (review key, default title, migration naming). A Flyway Java migration V30 rewrites titles in reading order and drops `label`. `ChapterReviewFiles` switches from reading position to title key and converts old-format files once at startup. Frontend and public pages show `title` only.

**Tech Stack:** Java 21, Spring Boot 3.5, Flyway (H2 `MODE=Oracle` in tests, Oracle Free in prod), React + Vite + TS, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-25-chapter-title-merge-design.md`

## Global Constraints

- Branch `feat/chapter-title-merge` from latest `main`; one PR to `main`; PR title, description and commit messages in English; commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; PR body ends with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- `chapterNo` stays in public links `/novels/<slug>/<chapterNo>`, published `<chapterNo>.json`, read counters (`reads:<slug>:<chapterNo>`), and is never shown in UI nor editable.
- `title` is required (not blank), max 200 chars (`ChapterService.MAX_TITLE` unchanged; longest migrated title today is 69).
- Default title for a new chapter: `Chương {N}`, N = highest `Chương N`/`Chapter N` number among the novel's titles + 1 (1 if none). Wattpad part name appended as `Chương N: <part name>` (cut to 200).
- Review key: title part before the first `:`, trimmed. `^(?iu)(chương|chapter)\s+0*(\d+)$` → `ch-<N>`; otherwise slug: strip accents, `đ/Đ`→`d`, lower case, runs of non `[a-z0-9]` → `-`, trim `-`. Empty slug → field error on `title`: `Use letters or digits in the chapter name.`
- Two chapters of one novel may not share a review key → field error on `title`: `Another chapter of this novel already uses the name "<key>".`
- Review file name: `review-<Profile>--<key>--<YYYY-MM-DD>[-vN].md` in `{dataDir}/reviews`.
- Brand colours rule (Subtitle Studio): any touched UI keeps orange `#F39A42` / purple `#D9A1D9`.
- Tests: `mvn test -Dskip.npm` (backend), `cd frontend && npm test` (frontend). Never call Wattpad/Gemini for real.

## Review Focus

1. Old review file whose position has no chapter (more files than chapters) → left untouched, name logged, app starts normally. Test in Task 4.
2. Title rename onto a key that an *archived* or stray file already uses in `reviews/` → rename never overwrites; existing target gets the new file as next `-vN`. Test in Task 4.
3. Title variants `chương 07: X`, `CHAPTER 7`, `Chương 7` all give `ch-7`; `Ngoại truyện I` gives `ngoai-truyen-i`; `💜` alone is rejected. Test in Task 1.
4. Published JSON files from before this change (with `label`, maybe no `title`) still render a name on the public site until the next Publish: fallback `title ?? label ?? "Chương {chapterNo}"`. Test in Task 5.
5. Migration on a novel with a label like `Nhân vật` first, then unlabelled chapters → those become `Chương 1…`, not `Chương 2…`. Test in Task 2.

---

### Task 1: `ChapterTitles` — the title rules

**Files:**
- Create: `src/main/java/com/subtitlestudio/novel/ChapterTitles.java`
- Test: `src/test/java/com/subtitlestudio/novel/ChapterTitlesTest.java`

**Interfaces:**
- Produces (all `public static`, pure):
  - `String name(String title)` — part before first `:`, stripped (whole title when no `:`).
  - `Optional<String> reviewKey(String title)` — empty when the slug is empty.
  - `OptionalInt number(String title)` — N when `name(title)` matches `Chương N`/`Chapter N`.
  - `String defaultTitle(Collection<String> existingTitles, String partName)` — `Chương N` or `Chương N: partName` (blank partName ignored), cut to 200.
  - `List<String> migrate(List<LegacyChapter> inReadingOrder)` with `public record LegacyChapter(String label, String title)` nested in `ChapterTitles`; returns new titles in the same order, each cut to 200.

- [ ] **Step 1: Write failing tests** `ChapterTitlesTest`:
  - `reviewKeyOfNumberedChapter`: `reviewKey("Chương 7: Bữa cơm hai người")`, `"chương 07: X"`, `"CHAPTER 7"`, `"Chương 7"` → all `Optional.of("ch-7")`.
  - `reviewKeyOfNamedChapter`: `"Ngoại truyện I: Lần này"` → `"ngoai-truyen-i"`; `"Nhân vật"` → `"nhan-vat"`; `"Special II"` → `"special-ii"`; `"Đêm mưa"` → `"dem-mua"`.
  - `reviewKeyEmptyForSymbolsOnly`: `"💜"` → `Optional.empty()`.
  - `defaultTitleContinuesHighestNumber`: existing `["Nhân vật","Chương 1: A","Chương 4","Ngoại truyện I"]`, part `null` → `"Chương 5"`; part `"The rain"` → `"Chương 5: The rain"`; existing `[]` → `"Chương 1"`.
  - `migrateFollowsReadingOrder`: input `[("Nhân vật",null),(null,"Người đứng sau cô"),(null,"B"),(null,"C"),("Chương 4","14 năm trước"),("Ngoại truyện I",null)]` → `["Nhân vật","Chương 1: Người đứng sau cô","Chương 2: B","Chương 3: C","Chương 4: 14 năm trước","Ngoại truyện I"]`.
  - `migrateUntilISeeYouShape`: `[(null,"a"),(null,"b"),(null,"c"),("Chương 4","d"),("Chương 5","e"),("Chương 6","f"),("Chương 7","g"),(null,"h")]` → last is `"Chương 8: h"`.
  - `migrateDefaultLabelOnly`: `[(null,null)]` → `["Chương 1"]`.
- [ ] **Step 2:** `mvn test -Dskip.npm -Dtest=ChapterTitlesTest` → FAIL (class missing).
- [ ] **Step 3: Implement.** Accent stripping via `java.text.Normalizer` NFD + remove `\p{M}`, after mapping `đ/Đ`. Migration: `last` starts 0; labelled → name = label, `last = number(label)` if present; unlabelled → `last++`, name = `Chương {last}`; title = `name + ": " + title` when old title not blank.
- [ ] **Step 4:** rerun → PASS.
- [ ] **Step 5: Commit** `feat(novel): add ChapterTitles rules for chapter names and review keys`.

### Task 2: Flyway V30 — merge label into title

**Files:**
- Create: `src/main/java/db/migration/V30__chapter_title_merge.java` (Flyway `BaseJavaMigration`; Flyway's default `classpath:db/migration` location picks up Java classes in package `db.migration`)
- Test: `src/test/java/com/subtitlestudio/novel/ChapterTitleMergeMigrationTest.java`

**Interfaces:**
- Consumes: `ChapterTitles.migrate`, `ChapterTitles.LegacyChapter`.

- [ ] **Step 1: Write failing test** `migratesTitlesAndDropsLabel`: fresh H2 (`jdbc:h2:mem:v30;MODE=Oracle`), `Flyway.configure().dataSource(...).placeholders(bigint=BIGINT,int=INTEGER).target("29").load().migrate()`, insert one novel and chapters shaped like Behind Her (`Nhân vật` label first with `sort_order` 1, three unlabelled, one `Chương 4` label) plus a second novel with one unlabelled untitled chapter; then migrate to latest. Assert titles per Task 1 rules (reading order by `sort_order, chapter_no`), second novel → `Chương 1`, and `select count(*) from information_schema.columns where table_name='T_CHAPTER' and column_name='LABEL'` = 0.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement** with plain JDBC: per `novel_id`, `select id, label, title from t_chapter where novel_id=? order by sort_order, chapter_no`, `update t_chapter set title=? where id=?` (batch), then `ALTER TABLE t_chapter DROP COLUMN label`. Works unchanged on H2 Oracle mode and Oracle. No logging of titles.
- [ ] **Step 4:** rerun → PASS; `mvn test -Dskip.npm` still compiles (Task 3 removes `label` from the entity — do Task 3 before running the full suite; the H2 schema test of other classes will fail until then, which is expected).
- [ ] **Step 5: Commit** `feat(db): V30 merges chapter label into title and drops label`.

### Task 3: Backend uses title only

**Files (modify):** `novel/Chapter.java`, `ChapterSummary.java`, `ChapterDetail.java`, `ChapterRow.java`, `ChapterUpdateRequest.java`, `ChapterRequest.java`, `ChapterService.java`, `NovelService.java`, `ChapterPrompt.java`, `TextChapterPrompt.java`, `ChapterTranslationService.java`, `ChapterExportFormat.java`, `NovelExportService.java`, `render/RenderCache.java` (+ `RenderInput`), `publish/NovelExporter.java`, `publish/PublicChapterFile.java`, `publish/PublicNovelDetail.java`, `publish/PublicPageRenderer.java`, `publish/SiteExporter.java`, the `NOVEL_TRANSLATION_BUSY` error builder (find with `grep -rn CHAPTER_TRANSLATING src/main/java`), `ChapterRepository.java` (remove label-only queries if any). Matching tests under `src/test/java/...` and goldens under `src/test/resources/novel/`.

**Interfaces:**
- Produces: JSON of `ChapterSummary`/`ChapterDetail` without `label`; `title` always non-null. `ChapterUpdateRequest` without `chapterNo` and `label` (unknown JSON props ignored as today). `ChapterRequest(String title)`. Busy error gains `chapterTitle` (String|null) next to `chapterNo`. Public `PublicChapterFile`/`PublicChapterRef` without `label`. `ChapterExportFormat.heading(String title)`.

- [ ] **Step 1: Write/adjust failing tests** (in existing test classes):
  - `ChapterServiceTest.createUsesDefaultTitle` — novel with titles `Nhân vật`, `Chương 3: X` → `POST` with no title gives `Chương 4`.
  - `ChapterServiceTest.blankTitleRejected` — update title `"  "` → `InvalidChapterException` on `title`.
  - `ChapterServiceTest.duplicateReviewKeyRejected` — two chapters, set second title `chương 07` while first is `Chương 7: A` → field error message `Another chapter of this novel already uses the name "ch-7".`
  - `ChapterServiceTest.chapterNoNotEditable` — update request JSON with `chapterNo: 99` leaves `chapterNo` unchanged.
  - `ChapterServiceTest.addFromSourcePrefixesPartName` — Wattpad add with part `"Rain"` on empty novel → `Chương 1: Rain`.
  - `NovelExportServiceTest.zipNamedByReviewKey` — chapter `Chương 7: Bữa cơm` at reading position 7 of slug `util-i-see-you` on 2026-11-25 → `util-i-see-you-ch-7-2026-11-25.zip`, inner `007 - Chương 7 - Bữa cơm.md`.
  - `ChapterExportFormatTest` — `heading("Chương 7: Bữa cơm")` → `Chương 7 - Bữa cơm` (colon → ` - ` as today's `label - title`); `heading("Nhân vật")` → `Nhân vật`.
  - `PublicPageRendererTest.chapterNameFallsBack` — chapter JSON with `title` → title; legacy `{label:"Chương 4", chapterNo:5}` → `Chương 4`; neither → `Chương 5`.
  - Prompt tests: chapter name in prompts = `ChapterTitles.name(title)`; golden `text-only-request-*.json` must stay byte-identical (fixtures use `Chương N` titles — adjust fixture titles, not goldens).
- [ ] **Step 2:** run those classes → FAIL.
- [ ] **Step 3: Implement.** Remove `label` field/column mapping and `ChapterService.label(...)`, `DEFAULT_NAME`, `MAX_LABEL`. `validate` requires non-blank title, checks `reviewKey` present and unique among other chapters of the novel. `create` ignores client `chapterNo` (always max+1) and uses `ChapterTitles.defaultTitle` when title blank; `addFromSource` passes part name as `partName`. Prompts take `chapterTitle` and expose `chapterName()` = `ChapterTitles.name(title)`. Export zip: `slug + "-" + reviewKey + "-" + date + ".zip"`. Render cache key uses title in place of label.
- [ ] **Step 4:** `mvn test -Dskip.npm` → all PASS.
- [ ] **Step 5: Commit** `feat(novel): chapter title is the only name; chapter number is internal`.

### Task 4: Review files by title key

**Files:**
- Modify: `src/main/java/com/subtitlestudio/novel/ChapterReviewFiles.java`, `ChapterService.java` (review/update/delete/reorder hooks), `NovelService.java` (profile rename, unchanged call)
- Create: `src/main/java/com/subtitlestudio/novel/LegacyReviewFileMigrator.java` (`ApplicationRunner`)
- Test: `ChapterReviewFilesTest.java`, `LegacyReviewFileMigratorTest.java`, `ChapterServiceTest.java`

**Interfaces:**
- Consumes: `ChapterTitles.reviewKey`.
- Produces on `ChapterReviewFiles`: `Optional<Path> newest(String profile, String key)`, `static String pattern(String profile, String key)` → `review-<p>--<key>--*.md`, `void rename(String profile, String fromKey, String toKey)`, `void archive(String profile, String key)`, `void renameProfile(String from, String to)`, `void migrateLegacy(String profile, Map<Integer, String> positionToKey)`. `renumber` is removed.

- [ ] **Step 1: Write failing tests:**
  - `ChapterReviewFilesTest.newestByKey` — files `review-BH--ch-7--2026-11-24.md`, `review-BH--ch-7--2026-11-25.md`, `review-BH--ch-7--2026-11-25-v2.md`, `review-BH--ch-70--2026-11-26.md` → newest for `ch-7` is the `-v2`.
  - `renameMovesEveryVersion` — rename `ch-7`→`ch-8` moves all three, untouched `ch-70`.
  - `renameNeverOverwrites` — existing `review-BH--ch-8--2026-11-25.md` and moving `review-BH--ch-7--2026-11-25.md` → moved file becomes `review-BH--ch-8--2026-11-25-v2.md`, original kept.
  - `archiveByKey` — moves to `_archive/` with `-1` on clash (as today).
  - `migrateLegacyRenamesByPosition` — `review-BH-ch-8-2026-11-25.md`, `review-BH-ch-8-2026-11-25-v2.md`, `review-BH-ch-40-2026-11-20.md` with map `{8:"ch-7"}` → first two become `review-BH--ch-7--2026-11-25[-v2].md`, `ch-40` file untouched.
  - `LegacyReviewFileMigratorTest.mapsReadingPositionsOfEachProfiledNovel` — novel with profile `BH`, chapters in reading order titled `Nhân vật`, `Chương 1: A` → map `{1:"nhan-vat", 2:"ch-1"}` passed to `migrateLegacy`; novels without profile skipped.
  - `ChapterServiceTest.titleChangeRenamesReviewFiles` / `reorderDoesNotRenameReviewFiles` / `deleteArchivesReviewFiles` / `reviewLooksUpByKey` (404 message contains `review-BH--ch-7--*.md`).
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement.** New pattern `^review-<quoted profile>--([a-z0-9-]+?)--(\d{4}-\d{2}-\d{2})(?:-v(\d+))?\.md$`; legacy pattern kept only inside `migrateLegacy`. Rename uses temp-file two-phase move as `renumber` did; on clash pick next free `-vN`. `ChapterService.update` calls `rename` after save when the key changed; `reorderChapters` and `delete` no longer renumber. Migrator runs once per startup, is idempotent because it only matches old-format names; logs file names only, never contents.
- [ ] **Step 4:** `mvn test -Dskip.npm` → PASS.
- [ ] **Step 5: Commit** `feat(novel): name review files by chapter title key`.

### Task 5: Frontend shows title only

**Files (modify):** `frontend/src/api/novels.ts`, `frontend/src/data/novelTypes.ts`, `components/novel/ChapterList.tsx` (drop `chapterName`/`chapterLabel` helpers), `components/chapter/ChapterJump.tsx`, `components/chapter/ChapterDetails.tsx` (remove Number and Label fields; title field required, label `Chapter title`, hint `The chapter's name everywhere, e.g. Chương 7: Bữa cơm hai người, Ngoại truyện I.`), `lib/useChapterEditor.ts`, `lib/useChapterActions.ts`, `lib/novelBusy.ts` + `lib/errors.ts` (use `chapterTitle`, fallback `A chapter`), `pages/ChapterPage.tsx` (tab title `${chapter.title} · ${chapter.novelTitle}`, breadcrumb/H1 = title), `pages/public/publicNames.ts` (single `publicChapterTitle(c)` = `title ?? label ?? "Chương " + chapterNo`), `FeaturedNovels.tsx`, `PublicNovelPage.tsx`, `ReaderPage.tsx`, `ReaderTocDrawer.tsx`, `test/novelFixtures.ts`, plus the matching `*.test.ts(x)`.

**Interfaces:**
- Consumes: API without `label`, update without `chapterNo`/`label`, busy error `chapterTitle`.
- Produces: `publicChapterTitle(c: { chapterNo: number; title?: string | null; label?: string | null }): string`; `NovelBusy = { reason: 'CHAPTER_TRANSLATING'; chapterTitle: string | null }`.

- [ ] **Step 1: Write/adjust failing tests:**
  - `publicNames.test.ts` — `{chapterNo:5,title:"Chương 7: A"}` → `Chương 7: A`; legacy `{chapterNo:5,label:"Chương 4",title:null}` → `Chương 4`; `{chapterNo:5}` → `Chương 5`.
  - `ChapterPage.test.tsx` — document title is `Chương 7: Bữa cơm · Until I See You`; no `Number` and no `Chapter label` field; saving with blank title shows the field error.
  - `novelBusy` test — `Chương 7: A is translating…`; null title → `A chapter is translating…`.
  - Update existing tests/fixtures that assert `Chapter N` / label output.
- [ ] **Step 2:** `cd frontend && npm test` → FAIL.
- [ ] **Step 3: Implement** the edits listed above; keep public links on `chapterNo`.
- [ ] **Step 4:** `cd frontend && npm test` and `npx tsc --noEmit` → PASS.
- [ ] **Step 5: Commit** `feat(frontend): show chapter title only; drop number and label fields`.

### Task 6: Docs, agents, PR

**Files:**
- Modify: `CLAUDE.md` (Novels section: title rules, V30, review file name), `PROGRESS.md`
- Modify (outside repo, not committed): `C:\Users\Zen\.claude\agents\story-reviewer.md` (description + line ~74: `review-<Hồ sơ>--<mã>--<YYYY-MM-DD>.md`, mã = `ch-N` for `Chương N…`, else slug of the name before `:`), `C:\Users\Zen\.claude\agents\chapter-prompt-writer.md` (line ~31 same rule, previous chapter's key)

- [ ] **Step 1:** Update the files above.
- [ ] **Step 2:** Full run `mvn test` (backend + frontend) → PASS.
- [ ] **Step 3: Commit** `docs: chapter title merge` and push; `gh pr create --base main` with summary, test commands + results, link to spec and plan, and a note: "After deploy: Publish once so public chapter JSON drops `label`."
