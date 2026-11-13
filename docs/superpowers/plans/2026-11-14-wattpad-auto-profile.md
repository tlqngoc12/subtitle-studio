# Wattpad auto translation profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Creating a novel from Wattpad with no Translation profile chosen writes `data/prompts/novels/<Name>.md` from a template and sets it as the novel's profile.

**Architecture:** A pure name rule (`NovelProfileNames`) and a pure template renderer (`NovelProfileTemplate`, two classpath templates th/en) feed a new create-only write in the profile store. `WattpadNovelService.create` uses them when `promptProfile` is blank and deletes the file again if the novel create fails. The Wattpad preview returns `suggestedProfile` for the form hint.

**Tech Stack:** Java 21, Spring Boot 3.5, JUnit 5 + Mockito; React + TS, Vitest.

**Spec:** [docs/superpowers/specs/2026-11-14-wattpad-auto-profile-design.md](../specs/2026-11-14-wattpad-auto-profile-design.md)

## Global Constraints

- No Gemini call anywhere in this feature.
- Never overwrite an existing profile file. A failed Create leaves no new file behind.
- Profile name rule of the store: `[A-Za-z0-9_-]{1,40}`, not starting with `_`; text UTF-8, ≤ 20 KB.
- Tests use temporary directories and never write into the real `data/prompts`.
- Templates are Vietnamese with full diacritics; no story-specific content from `BeMySugar.md` (no character names, no "Sugar", no GL-only wording).
- Admin UI copy in English. Commits/PR in English, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01XPHWqyurVDfuumuV9psv9g`. Never stage `data/`.

## Review Focus

- Title that is only Thai, or whose part before `|` is only symbols/Thai → whole-title fallback, then `Wattpad<storyId>` (Task 1 test).
- Very long title → name cut to 40 characters, and still ≤ 40 after a `-2` suffix (Task 1 test).
- Two Wattpad novels with the same short title → second gets `<Name>-2`, first file untouched (Task 1 + Task 4 tests).
- Description with Markdown-like text or > 20 KB → summary trimmed so the file stays ≤ 20 KB, placeholders never left as `{{…}}` (Task 2 test).
- Novel create throws (e.g. duplicate slug) after the file was written → file deleted, original exception rethrown (Task 4 test).

---

### Task 1: Profile name rule

**Files:**
- Create: `src/main/java/com/subtitlestudio/novel/NovelProfileNames.java`
- Test: `src/test/java/com/subtitlestudio/novel/NovelProfileNamesTest.java`

**Interfaces:**
- Produces: `static String NovelProfileNames.fromTitle(String title, String storyId, java.util.function.Predicate<String> taken)`
  1. Base = the title's part before the first separator `|`, ` - `, ` – `, ` — `, `(`, `[`. If that part has no `[A-Za-z0-9]` after step 2, use the whole title; if still none, `Wattpad` + storyId.
  2. Remove accents (`Normalizer` NFD, drop combining marks; `đ/Đ` → `d/D`), split on anything not `[A-Za-z0-9]`, capitalise the first letter of each word and keep the rest as written, join, cut to 40.
  3. If `taken.test(name)`, try `name-2`, `name-3`, … cutting the base so the result stays ≤ 40.

- [ ] **Step 1: Failing tests:** `"My Grumpy Vampire | EmiBonnie"` → `MyGrumpyVampire`; `"Be My Sugar! (GL)"` → `BeMySugar`; `"Tình đầu - EmiBonnie"` → `TinhDau`; `"เงาใต้พระจันทร์ | Moonshadow"` → `Moonshadow` (the part before `|` has no Latin, so the whole title is used); `"เงาใต้พระจันทร์"` with storyId `123` → `Wattpad123`; 60-char title → length 40; taken `MyGrumpyVampire` → `MyGrumpyVampire-2`; taken also `-2` → `-3`; 40-char base taken → `<first 38>-2`.
- [ ] **Step 2:** `mvn test -Dskip.npm -Dtest=NovelProfileNamesTest` → FAIL.
- [ ] **Step 3:** implement.
- [ ] **Step 4:** same command → PASS.
- [ ] **Step 5: Commit** `feat: name rule for auto-created novel profiles`.

### Task 2: Templates and renderer

**Files:**
- Create: `src/main/resources/prompts/_novel_template_th.md`, `src/main/resources/prompts/_novel_template_en.md`, `src/main/java/com/subtitlestudio/novel/NovelProfileTemplate.java`
- Test: `src/test/java/com/subtitlestudio/novel/NovelProfileTemplateTest.java`

**Interfaces:**
- Produces: `static String NovelProfileTemplate.render(String sourceLanguage, String title, String author, List<String> tags, String description)` returns Markdown ≤ 20 KB UTF-8. `sourceLanguage` `th` → th template, anything else → en. Placeholders `{{title}}`, `{{author}}` (blank → "chưa rõ"), `{{genre}}` (tags joined with ", ", none → "chưa rõ"), `{{summary}}` (description stripped; blank → "Chưa có tóm tắt."; trimmed at a paragraph or sentence boundary so the whole file ≤ 20 KB).
- Template sections (both): `# Hồ sơ dịch: {{title}}`, Ngôn ngữ gốc (th: tiếng Thái / en: tiếng Anh → tiếng Việt; tên truyện; tác giả; thể loại), Bối cảnh, Ngôi kể, Nhân vật (one line: "Bổ sung nhân vật chính, giới tính và quan hệ khi đã rõ; sổ tay truyện tự cập nhật sau mỗi chương."), Xưng hô, Tên riêng và thuật ngữ, Văn phong, Không được làm, Tóm tắt nội dung chính (`{{summary}}`). Thai only: Kính ngữ và từ đặc trưng tiếng Thái. Thai rules come from the general parts of `data/prompts/novels/BeMySugar.md` (read it); the English template has the English equivalents (he/she/they by gender and relationship; I/you by age and relationship; Mr./Ms./Miss → "anh/chị/cô/ông/bà" by context; keep English names; idioms translated by meaning).

- [ ] **Step 1: Failing tests:** th output contains the title, author, "tiếng Thái", "Kính ngữ", the description; en output contains "tiếng Anh" and no "Kính ngữ và từ đặc trưng tiếng Thái"; blank author/tags → "chưa rõ"; no `{{` left in output; 30 KB description → output ≤ 20 KB (UTF-8 bytes) and ends cleanly; output contains none of "Perth", "Pipim", "Sugar".
- [ ] **Step 2:** `mvn test -Dskip.npm -Dtest=NovelProfileTemplateTest` → FAIL.
- [ ] **Step 3:** write both templates and the renderer (load from classpath once).
- [ ] **Step 4:** PASS.
- [ ] **Step 5: Commit** `feat: Thai and English templates for auto-created novel profiles`.

### Task 3: Create-only write in the profile store

**Files:**
- Modify: `src/main/java/com/subtitlestudio/translate/PromptProfileStore.java`, `src/main/java/com/subtitlestudio/novel/NovelProfileStore.java`
- Test: `src/test/java/com/subtitlestudio/translate/PromptProfileStoreWriteTest.java`, `src/test/java/com/subtitlestudio/novel/NovelProfileStoreTest.java`

**Interfaces:**
- Produces: `PromptProfileStore.create(String name, String text): void` (synchronized; same name, UTF-8 and 20 KB checks as `write`; throws `ProfileExistsException` (new, in `translate`) when the file exists; writes a temp file then moves it without `REPLACE_EXISTING`); `PromptProfileStore.exists(String name): boolean` (file present, valid name); `PromptProfileStore.delete(String name): void` (deleteIfExists, valid names only). `NovelProfileStore` delegates `create`, `exists`, `delete`.
- No HTTP mapping for `ProfileExistsException` is needed (it never reaches a controller: Task 4 checks `exists` first; a race simply fails the create with 500, acceptable for a single-admin local app).

- [ ] **Step 1: Failing tests** (temp dir): create writes the exact text and `read` returns it; create on an existing name throws `ProfileExistsException` and leaves the old text; invalid name / empty / > 20 KB rejected like `write`; `exists` true/false; `delete` removes the file and ignores a missing one; `list()` includes a created profile.
- [ ] **Step 2:** `mvn test -Dskip.npm -Dtest='PromptProfileStoreWriteTest,NovelProfileStoreTest'` → FAIL.
- [ ] **Step 3:** implement.
- [ ] **Step 4:** PASS.
- [ ] **Step 5: Commit** `feat: create-only write for translation profiles`.

### Task 4: Wire into Wattpad create and preview

**Files:**
- Modify: `src/main/java/com/subtitlestudio/novel/wattpad/WattpadNovelService.java` (`create`, `preview`), `WattpadNovelPreview.java`
- Test: `src/test/java/com/subtitlestudio/novel/wattpad/WattpadNovelServiceTest.java`, `NovelControllerTest.java`

**Interfaces:**
- Consumes: Task 1–3.
- Produces: `WattpadNovelPreview` gains `String suggestedProfile` (from `NovelProfileNames.fromTitle(title, storyId, store::exists)`).
- `create(NovelRequest request)`: when `request.promptProfile()` is blank and the request is a Wattpad create (`wattpadStoryId` set), compute the name from `request.title()`, render with `request.sourceLanguage()`, `title`, `originalAuthor`, `tags`, `description`, `store.create(name, text)`, then create the novel with `promptProfile = name` (a `withProfile` copy like the existing `withCover`). If `novelService.create` throws, `store.delete(name)` (and the existing cover cleanup), then rethrow. When a profile is chosen, nothing is written. Order relative to the cover download: keep the cover first as today.

- [ ] **Step 1: Failing tests:** blank profile → `create(name, text)` called once with `MyGrumpyVampire` for title "My Grumpy Vampire | EmiBonnie" and the saved request has `promptProfile` = that name; chosen profile → `create` never called; `novelService.create` throws → `delete(name)` called and the same exception propagates; existing `MyGrumpyVampire` → `MyGrumpyVampire-2`; preview returns `suggestedProfile`; `NovelControllerTest` asserts `$.suggestedProfile`.
- [ ] **Step 2:** `mvn test -Dskip.npm -Dtest='WattpadNovelServiceTest,NovelControllerTest'` → FAIL.
- [ ] **Step 3:** implement (inject `NovelProfileStore`).
- [ ] **Step 4:** `mvn test -Dskip.npm` (whole backend) → PASS; report counts.
- [ ] **Step 5: Commit** `feat: create the translation profile when a novel is created from Wattpad`.

### Task 5: Form hint

**Files:**
- Modify: `frontend/src/api/novels.ts` (`WattpadNovelPreview.suggestedProfile: string`), `frontend/src/components/novel/NovelForm.tsx`
- Test: `frontend/src/components/novel/NovelForm.test.tsx` (or the existing form/New page test)

**Interfaces:**
- Consumes: `suggestedProfile` from the preview.
- Behaviour: on a Wattpad create (`wattpad` prop set) with the Translation profile select empty, show under it the hint `Leave empty to create ${suggestedProfile}.md from the Wattpad details.` (field hint style used elsewhere in the form, `aria-describedby` wired). Hidden once a profile is chosen and on edit.

- [ ] **Step 1: Failing tests:** hint shown with the suggested name when empty; hidden after choosing a profile; not shown on the screenshots form or on edit.
- [ ] **Step 2:** `cd frontend && npx vitest run src/components/novel` → FAIL.
- [ ] **Step 3:** implement.
- [ ] **Step 4:** PASS; then `npm test` and `npm run build` → PASS; report counts (known load flakes: `VietsubPage`, `HomePage`, `titleClamp`, "Failed to start forks worker"; re-run alone and name them).
- [ ] **Step 5: Commit** `feat: hint the auto-created profile on New novel from Wattpad`.

### Task 6: Docs and PR

- [ ] **Step 1:** `CLAUDE.md` Wattpad bullet: blank profile on Wattpad create writes `data/prompts/novels/<Name>.md` from `_novel_template_{th,en}.md` (`NovelProfileNames`, never overwrites, deleted if create fails). `PROGRESS.md` entry (Vietnamese, full diacritics). Spec status → "approved 2026-11-14". Commit the spec and plan files too.
- [ ] **Step 2:** `mvn test -Dskip.npm`, `cd frontend && npm test && npm run build` → PASS.
- [ ] **Step 3: Commit** `docs: auto-created translation profile for Wattpad novels`, push `feat/wattpad-auto-profile`, `gh pr create --base main` (summary, how to test with results, links to spec and plan, body ends with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`). Do not merge.
