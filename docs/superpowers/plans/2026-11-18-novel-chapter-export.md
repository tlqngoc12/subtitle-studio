# Novel Chapter Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An Export button on the novel page downloads a zip with one `.md` and one paste-ready `.html` per chapter that has text.

**Architecture:** A pure formatter (`ChapterExportFormat`) builds file names, markdown and HTML. `NovelExportService` loads chapters + pages, picks those with text (`ChapterText.of`), and writes the zip in memory. `GET /api/novels/{id}/export` returns it. The frontend fetches the blob and saves it.

**Tech Stack:** Spring Boot (Java, `java.util.zip`), JUnit/MockMvc; React + TypeScript, Vitest, lucide-react.

**Spec:** `docs/superpowers/specs/2026-11-18-novel-chapter-export-design.md`

## Global Constraints

- Branch `feat/novel-chapter-export` from latest `main`; commits, PR title and body in English; PR flow per CLAUDE.md (no merge without user OK).
- Exported chapters: every chapter whose `ChapterText.of(chapter, pages)` is not blank, Draft and Published, reading order (`sort_order`, then `chapter_no`).
- Zip name `<slug>-YYYY-MM-DD.zip` (date from the injected `Clock`, `ZoneId.systemDefault()`); flat; entries UTF-8.
- Entry base name `NNN - <heading>`; `NNN` = 1-based position, zero-padded to 3 (4 when 1000+ chapters). Heading = `label` if not blank else `Chapter <chapterNo>`, then ` - <title>` when title not blank.
- File names: `\ / : * ? " < > |` and control chars → `_`, trimmed, base name cut to 120 chars.
- `.md` = `# <heading>\n\n` + text unchanged, `\n` line ends.
- `.html` = standalone UTF-8 page, `<title>` = heading, body has **only** the story text (no heading). `[[image:N]]` paragraphs dropped; every non-blank line → one `<p>`; `**x**` → `<strong>`, `*x*` → `<em>`; rest HTML-escaped; a `---` line stays `<p>---</p>`.
- Never log chapter text: log novel id and chapter count only.
- UI: Subtitle Studio palette (orange `#F39A42` / purple `#D9A1D9`), `docs/ui/screen-layout.md`; icons from lucide-react.

## Review Focus

- Text with Windows line ends (`\r\n`) → same output as `\n` (no stray `\r` in `.html`, `.md` normalised to `\n`).
- Stray asterisks (`5 * 3`, an unclosed `*word`) → left as literal `*`, never an unclosed `<em>`.
- Titles with `/`, `:`, `?`, emoji or 300 characters → a valid, unique-by-prefix file name.
- A chapter still TRANSLATING or FAILED but with some text → exported as is, no error.
- A novel where no chapter has text → 409 `NOTHING_TO_EXPORT`, shown as an error toast (not a broken download).

---

### Task 1: `ChapterExportFormat` (pure formatting)

**Files:**
- Create: `src/main/java/com/subtitlestudio/novel/ChapterExportFormat.java`
- Test: `src/test/java/com/subtitlestudio/novel/ChapterExportFormatTest.java`

**Interfaces:**
- Produces (all `static`, final class, private constructor):
  - `String heading(int chapterNo, String label, String title)`
  - `String fileBase(int position, int total, String heading)`
  - `String markdown(String heading, String text)`
  - `String html(String heading, String text)`

- [ ] **Step 1: Write the failing tests**

```java
@Test void headingUsesLabelOrChapterNumberAndTitle() {
    assertEquals("Chapter 3", heading(3, null, null));
    assertEquals("Chapter 3 - Mưa", heading(3, " ", "Mưa"));
    assertEquals("Ngoại truyện 1 - Mưa", heading(3, "Ngoại truyện 1", "Mưa"));
}
@Test void fileBasePadsAndCleans() {
    assertEquals("007 - Chapter 7 - A_B_ C_", fileBase(7, 20, "Chapter 7 - A/B: C?"));
    assertEquals("0007 - Chapter 7", fileBase(7, 1200, "Chapter 7"));
    assertTrue(fileBase(1, 5, "x".repeat(300)).length() <= 120);
}
@Test void markdownKeepsTextAndNormalisesLineEnds() {
    assertEquals("# Chapter 1\n\nA\n\n[[image:2]]\n*B*", markdown("Chapter 1", "A\r\n\r\n[[image:2]]\r\n*B*"));
}
@Test void htmlMakesOneParagraphPerLine() {
    String h = html("Chapter 1", "Một.\nHai.\n\n\nBa.");
    assertTrue(h.contains("<p>Một.</p><p>Hai.</p><p>Ba.</p>"));
    assertTrue(h.contains("<title>Chapter 1</title>"));
    assertFalse(h.contains("<h1"));
}
@Test void htmlConvertsEmphasisAndEscapes() {
    String h = html("T", "**EMI** & *Đã nhận.* <b>\n5 * 3 *mở");
    assertTrue(h.contains("<p><strong>EMI</strong> &amp; <em>Đã nhận.</em> &lt;b&gt;</p>"));
    assertTrue(h.contains("<p>5 * 3 *mở</p>"));
}
@Test void htmlDropsImageMarkersKeepsSceneBreaks() {
    String h = html("T", "A\n\n  [[image:4]]  \n\n---\n\nB\r\nC");
    assertTrue(h.contains("<p>A</p><p>---</p><p>B</p><p>C</p>"));
    assertFalse(h.contains("image") || h.contains("\r"));
}
```

- [ ] **Step 2: Run** `./mvnw -q test -Dtest=ChapterExportFormatTest` → FAIL (class missing).
- [ ] **Step 3: Implement.** Emphasis per line, after escaping: first `\*\*(.+?)\*\*` → `<strong>$1</strong>`, then `(?<!\*)\*(?!\s)(.+?)(?<!\s)\*(?!\*)` → `<em>$1</em>`. Image marker line = whole trimmed line matches `\[\[image:\d+]]` (same rule as `ImageMarkers`; reuse its pattern if it exposes one). HTML shell: `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>…</title><style>` (max-width ~42rem, centered, line-height 1.7, system font) `</style></head><body>` paragraphs `</body></html>`, with no newline between `<p>` elements.
- [ ] **Step 4: Run** the same command → PASS.
- [ ] **Step 5: Commit** `feat(novel): add chapter export formatting`.

### Task 2: Export service + endpoint

**Files:**
- Create: `src/main/java/com/subtitlestudio/novel/NovelExportService.java`, `src/main/java/com/subtitlestudio/novel/NothingToExportException.java`
- Modify: `src/main/java/com/subtitlestudio/novel/NovelController.java` (inject service, new endpoint), `src/main/java/com/subtitlestudio/web/NovelErrors.java` (409 mapping)
- Test: `src/test/java/com/subtitlestudio/novel/NovelExportServiceTest.java`, `src/test/java/com/subtitlestudio/novel/NovelControllerTest.java`

**Interfaces:**
- Consumes: Task 1 statics; `ChapterRepository.findByNovelIdOrderBySortOrderAscChapterNoAsc(long)`, `ChapterPageRepository.findByChapterNovelId(long)` (group by chapter id, sort by `position`), `NovelRepository` (throw `NovelNotFoundException` when missing), `ChapterText.of`, `Clock`.
- Produces: `public record NovelExport(String fileName, byte[] zip)`, nested in `NovelExportService`; `@Transactional(readOnly = true) NovelExport export(long novelId)`; `NothingToExportException(long novelId)` → `ProblemDetails.problem(HttpStatus.CONFLICT, "NOTHING_TO_EXPORT", "No chapter has text to export yet.")`; `GET /api/novels/{id}/export` → 200, `Content-Type: application/zip`, `Content-Disposition: attachment; filename="<fileName>"` (built with `ContentDisposition.attachment()` like `VideoController`).
- Positions/`total` passed to `fileBase` count **exported** chapters only.

- [ ] **Step 1: Write the failing service tests** (follow the setup of `ChapterServiceTest`/`NovelRepositoryTest`; fixed `Clock` at `2026-11-18T03:00:00Z`). Read the zip back with `ZipInputStream`:
  - `exportsChaptersWithTextInReadingOrder`: novel `summer-love` with chapters sort 1 (textVi "A"), sort 2 (no text, no pages), sort 3 (screenshot pages "P1", "P2", textVi null, status TRANSLATING). → `fileName == "summer-love-2026-11-18.zip"`; entries exactly `["001 - Chapter 1.md", "001 - Chapter 1.html", "002 - Chapter 3.md", "002 - Chapter 3.html"]`; second `.md` body ends with `"P1\n\nP2"`.
  - `throwsWhenNothingHasText`: only blank chapters → `NothingToExportException`.
  - `unknownNovel`: → `NovelNotFoundException`.
  - `logsNoChapterText` (`OutputCaptureExtension`): output does not contain the chapter text.
- [ ] **Step 2: Write the failing controller tests** in `NovelControllerTest` (add `@MockitoBean NovelExportService exports`):
  - `exportsZip`: service returns `new NovelExport("s-2026-11-18.zip", new byte[]{1,2})` → 200, content type `application/zip`, header `Content-Disposition` contains `filename="s-2026-11-18.zip"`, body bytes `{1,2}`.
  - `exportNothingIs409`: service throws `NothingToExportException(3)` → 409, `$.code == "NOTHING_TO_EXPORT"` (match the field name other tests use for the code).
- [ ] **Step 3: Run** `./mvnw -q test -Dtest="NovelExportServiceTest,NovelControllerTest"` → FAIL.
- [ ] **Step 4: Implement** the exception, the service (log `"Exported novel {} ({} chapters)"`), the endpoint (`ResponseEntity<byte[]>`) and the 409 mapping.
- [ ] **Step 5: Run** the same command, then `./mvnw -q test` → all PASS.
- [ ] **Step 6: Commit** `feat(novel): export translated chapters as a zip`.

### Task 3: Export button + docs

**Files:**
- Modify: `frontend/src/api/novels.ts`, `frontend/src/pages/NovelPage.tsx` (Chapters tab `Toolbar` `actions`)
- Test: `frontend/src/api/novels.test.ts`, `frontend/src/pages/NovelPage.test.tsx`
- Modify: `PROGRESS.md` (new dated entry), `CLAUDE.md` (API list / Novels section, if it lists endpoints)

**Interfaces:**
- Consumes: `GET /api/novels/{id}/export` from Task 2; `send` from `api/client.ts` (throws the app's API error on non-2xx).
- Produces: `export async function exportNovel(id: number): Promise<{ blob: Blob; fileName: string }>` — `fileName` from the `Content-Disposition` header, fallback `novel-<id>.zip`.

- [ ] **Step 1: Write the failing tests**
  - `novels.test.ts` › `exportNovel reads the blob and the file name`: fake fetch 200 with header `Content-Disposition: attachment; filename="summer-love-2026-11-18.zip"` → `fileName === 'summer-love-2026-11-18.zip'`, `blob.size > 0`, request URL `/api/novels/3/export`.
  - `NovelPage.test.tsx` › `exports the chapters`: button named `Export` (svg `lucide-download`) in the Chapters tab; click → `exportNovel(3)` called, an `<a download="summer-love-2026-11-18.zip">` is clicked (stub `URL.createObjectURL`), button shows `Exporting…` and is disabled while pending.
  - `NovelPage.test.tsx` › `export errors show a toast`: `exportNovel` rejects with the 409 problem → `toastError` shows "No chapter has text to export yet."
  - `NovelPage.test.tsx` › `export is disabled without chapters`: novel with `chapters: []` → button disabled.
- [ ] **Step 2: Run** `cd frontend && npm test -- novels NovelPage` → FAIL.
- [ ] **Step 3: Implement.** `exportNovel` as above. In `NovelPage`, a secondary button (`button button--secondary` or the class the toolbar already uses for secondary actions) labelled `Export` with lucide `Download`, placed before the primary action for every source type; on click: `exportNovel` → object URL → temporary `<a download>` click → `URL.revokeObjectURL`; errors via `toastError(errorMessage(e))`. Disabled while running or when `novel.chapters.length === 0`.
- [ ] **Step 4: Run** `cd frontend && npm test -- novels NovelPage && npx tsc --noEmit` → PASS.
- [ ] **Step 5: Docs.** `PROGRESS.md`: `### 2026-11-18: Export chương của novel (zip .md + .html) ✅ (không có migration)` with 3–4 bullets in the file's style (Vietnamese). `CLAUDE.md`: add the endpoint where the novel API is listed.
- [ ] **Step 6: Full check** `./mvnw -q test` and `cd frontend && npm test && npm run build` → PASS.
- [ ] **Step 7: Commit** `feat(novel): add Export button on the novel page`, push, `gh pr create --base main` (summary, test commands and results, screenshot of the toolbar, links to spec and plan).
