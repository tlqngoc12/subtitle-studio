# Novels: "Analyze corrections" for a novel's translation profile — design

Date: 2026-11-16. Branch: `feat/novel-profile-analyze` (one PR: spec + plan + code). Size: project (migration, backend service, new tab).

## Why

The user translates novels with Gemini and then edits each chapter by hand. The same fixes come back chapter after chapter (addressing, names, word choice, style). Vietsub already has **Profiles › Analyze corrections**: it reads what the translator changed versus the AI and proposes a better profile `.md`. The user wants the same for novels, so later chapters need fewer hand edits. It applies to **both** novel types (Wattpad text and screenshots).

Success: on a novel with a few edited, published chapters, one click shows a proposed new profile as a diff, with the new rules and the term/addressing suggestions, and the user can edit it and save it. The next chapters are then translated with the saved profile.

## Goals

- A **Profile** tab on the admin novel page (`/novels/:id?tab=profile`). It shows the novel's profile `.md` and lets the user **Edit/Save** it. This is the first time novel profiles can be edited in the UI. **Analyze corrections** proposes a new version.
- The analysis learns from **published chapters whose final text differs from the AI translation**, by paragraph.
- One Gemini request returns:
  1. the full proposed profile,
  2. the rules it added or changed, each with a supporting count,
  3. **term and addressing suggestions**, written **into the profile** in its existing sections `## Xưng hô` and `## Tên riêng và thuật ngữ`. They do not go into the story notebook (user's choice B).
- The AI translation is kept per chapter from now on, so a later hand edit no longer destroys it.

## Non-goals

- Writing into the story notebook. The notebook stays automatic and read-only; suggestions go to the profile.
- Analyzing across several novels. A novel's profile is analyzed from that novel's chapters only. If another novel uses the same profile name, its chapters are included too (see Data selection).
- Recovering the AI text of Wattpad chapters that were already edited. That text is gone; those chapters are skipped.
- Auto-applying anything. Nothing is written without the user pressing Save.
- Changing Vietsub's Analyze behaviour (a shared UI component is fine, see Frontend).

## Anti-goals (a failure even if it "works")

- Losing the user's hand edits, or overwriting a profile that changed since it was loaded. Keep the SHA check plus the `.history/` backup, as in Vietsub.
- Spending more than **one** Gemini request per Analyze click. The free tier allows 20 requests per day per model.
- Sending text to logs. Log counts, lengths and the model only, as in `ProfileAnalyzer`.

## Approaches (chosen with the user)

- **Where suggestions go.** Chosen **B**: into the profile `.md`. Rejected **A**, writing into the notebook. Hand edits would be needed there, and the next automatic update could overwrite them.
- **Where the UI lives.** Chosen **1**: a **Profile** tab in the novel page, because each novel has its own profile and the user works novel by novel. Rejected **2**, a separate "Novels › Profiles" page like Vietsub's: an extra trip through the menu for a 1:1 relation.
- **Storage.** Keep the AI text in a new column. Measured 2026-11-16: 100 chapters at about 18,000 characters each is 3.6 MB extra, and the whole schema is 32 MB. The user accepted keeping the three versions (source, AI, final).

## Data model

**Migration V24** (next free number; check `db/migration` before naming it):

```sql
ALTER TABLE t_chapter ADD (ai_text CLOB);
```

- `ai_text` is the translation exactly as Gemini returned it for the **whole chapter**. A hand edit never changes it.
- Write points (`ChapterTranslationService`):
  - **Wattpad / text chapters** (`saveText`): `c.setAiText(result.text())` next to `c.setTextVi(result.text())`.
  - **Screenshot chapters**: the pages keep the AI text (`t_chapter_page.text_vi`), and the whole-chapter edit lives in `t_chapter.text_vi`. When a translation completes (status `TRANSLATED`), set `ai_text` = the page texts joined with a blank line, which is the same join the app already uses as the default chapter text. A partial or `FAILED` run does not set it. "Translate again" overwrites it with the new result.
- **Fallback for older screenshot chapters** (`ai_text` null, `source_type = SCREENSHOTS`): read the AI text from the pages joined the same way. No data migration is needed.
  - The UI has only edited the whole-chapter text since V6 (2026-11-05). Before that, it had per-page boxes.
  - A chapter whose pages were edited before V6 therefore has a "fallback AI" that already includes those early edits. It shows fewer corrections than it really had, but never false ones.
  - This is accepted. The `request.pages` API path stays, and it never touches `ai_text`.
- **Older Wattpad chapters** with `ai_text` null are skipped: the AI text cannot be known.
- Add `ai_text` to `PersistenceOracleIT` only if that test lists columns (it lists tables, and no table is added here).

## Data selection

- **Which chapters:** chapters with status **Published** and translation status `TRANSLATED`, with a known AI text (see above), whose novel's `prompt_profile` equals the analyzed profile name. Newest published first. Published is the counterpart of Vietsub's "Done": a draft may still be half edited.
- **Final text:** `t_chapter.text_vi`. When it is null (never edited), the AI text is the final text, so the chapter contributes nothing.
- **Paragraphs:** normalise line endings and split on blank lines, trimming each paragraph. Align AI and final paragraphs with a sequence diff such as LCS over the paragraph lists (builder's call: a small hand-written LCS or a Java diff library). An **edit** is a run of AI paragraphs replaced by a run of final paragraphs. Pure insertions and deletions count too, with an empty side. Unchanged paragraphs are dropped. Whitespace-only differences are not edits.
- **Source text for context** (Wattpad only): when the chapter's `source_text` splits into the **same number** of paragraphs as the AI text, attach the source paragraph(s) at the same index range to each edit. Otherwise omit the source. Screenshot chapters have no source text, so their items are AI → FINAL only.
- **Limits:** like `ProfileAnalyzer.select`, at most **300 edits** and **30,000 characters** (source + AI + final) per request, taken chapter by chapter, newest first. A single edit longer than 2,000 characters on one side is truncated with "…" (builder's call on the exact cut).
- **State at analysis time.**
  - A chapter counts only while it is Published. Published chapters are read-only, so the user edits them as Draft and republishes.
  - Edits on a chapter that is currently unpublished are ignored until it is published again.
  - "Translate again" replaces `ai_text`, so the earlier corrections of that chapter are no longer seen. This is intended.
- **Stats on GET** (`chapters`, `edits`) count **all** qualifying chapters and edits. They are computed on each request, which is cheap at the current scale (about 100 chapters of about 100 paragraphs).
  - `basedOn` in the analyze response counts only what fit into the request limits.
  - When `basedOn` is smaller, the UI shows "Used X of Y edits (newest first)".
- **Shared profile name:** the stats line names the other novels when chapters come from more than one, for example "incl. 3 chapters of Be my Sugar!".
- **Nothing to analyze** → `400 NO_CORRECTIONS` (reuse `NoCorrectionsException`, exactly as Vietsub does). Gemini is not called.

## Gemini request

- One call through `GeminiCaller` with the normal fallback models and a JSON schema.
- **System rules:** adapted from `ProfileAnalyzer.SYSTEM_RULES` for novels (Vietnamese):
  - items are paragraphs, not subtitle lines, and each has `GỐC` (optional), `AI` and `FINAL`;
  - add or change a rule only when **at least 2 edits** support it, and record that count;
  - keep the profile's structure and sections; don't delete old rules unless edits clearly contradict them;
  - put terms and names into `## Tên riêng và thuật ngữ`, and addressing pairs into `## Xưng hô`, creating the section if it is missing;
  - the profile stays under 20 KB.
- **User text:** `# Hồ sơ hiện tại`, then the profile, then `# Các đoạn người dịch đã sửa (n)`. Items are numbered `GỐC: … / AI: … / FINAL: …`, with paragraph breaks inside an item kept as ` / `, as in Vietsub.
- **Response schema:**
  - `proposed` (string, the full new profile),
  - `rules` (`[{text, count}]`, as in Vietsub),
  - `terms` (`[{kind: "term" | "addressing", text, count}]`, the term and addressing suggestions already written into `proposed`, listed so the UI can show them apart).
- **Validation:** as in `ProfileAnalyzer.parse`. Invalid JSON, an empty `proposed` or one over 20 KB gives `AnalysisInvalidException`, and nothing is saved.

## Backend

- New `NovelProfileAnalyzer` (package `novel`), modelled on `ProfileAnalyzer`. Share the reusable parts (selection by limits, JSON parsing, schema) only where that stays simple; duplication of a few lines is acceptable.
- `NovelProfileStore` gains `sha(name)` and `write(name, text, baseSha)`, delegating to the same logic as `PromptProfileStore.write`: SHA check (409 when changed), copy the old file to `data/prompts/novels/.history/<name>-<yyyyMMdd-HHmmss>.md`, then write. The 20 KB limit is the same.
- Endpoints, under the novel, so the UI needs only the novel id:
  - `GET /api/novels/{id}/profile` → `{ name, text, sha, stats: { chapters, edits }, geminiConfigured }`. When the novel has no profile → `404 NO_PROFILE` (the UI shows an explanation).
  - `POST /api/novels/{id}/profile/analyze` → `{ proposed, rules, terms, basedOn: { chapters, edits }, model, sha }`. It writes nothing and takes 10 to 60 seconds. It returns `409 NOVEL_TRANSLATION_BUSY` while a chapter of this novel is translating, to avoid racing on quota. This is a best-effort check before the call, using a new repository query on translation status. A translation that starts during the 10 to 60 seconds of an Analyze is acceptable. It is **not** blocked by a notebook update.
  - `PUT /api/novels/{id}/profile` with `{ text, baseSha }` → `{ sha }`, or `409` when the file changed since it was read.
- Tests:
  - paragraph diff (edit, insert, delete, whitespace-only, unchanged);
  - source attached only when the counts match;
  - selection limits and newest-first order;
  - chapters skipped (draft, not translated, Wattpad without `ai_text`);
  - screenshot fallback to the page texts;
  - `ai_text` written on Wattpad and screenshot success, and not on failure;
  - the user text contains no profile name in the log;
  - controller 404, 409 and SHA conflict;
  - store write creates the `.history` file.

## Frontend

- `NovelPage`: a new tab **Profile** after **Notebook**, `?tab=profile` (extend the existing `?tab=` parsing, which today only knows `wattpad`).
- A shared component **`ProfileAnalyzePanel`**, extracted from Vietsub `ProfilesPage`: profile view, Edit/Save, Analyze, diff with `diff` (jsdiff), and the rules list. Vietsub's page must behave the same after the extraction; its existing tests must still pass unchanged or with only selector updates.
- Tab content:
  ```
  Profile: MyGrumpyVampire.md        Based on 12 published chapters · 48 edits
  [Analyze corrections]  [Edit]
  ── after Analyze ──
  New rules (5)            Terms & addressing (3)
  • … (×3)                 • Term: "Ms. Ellis" → "cô Ellis" (×2)
  Diff of the profile (added = brand-2 tint, removed = muted strike)
  [Edit proposal] [Save] [Discard]
  ```
- States:
  - no profile → an Alert saying the novel has no profile, with a pointer to Details;
  - Gemini not configured → Analyze disabled with a reason;
  - no edits yet → Analyze disabled with the reason "No edited published chapters yet". Older Wattpad chapters don't count, and a hint explains why;
  - analyzing → `LoadingText`;
  - a 409 on save → an alert that the profile changed and must be reloaded.
- Follow `docs/ui/screen-layout.md` and the brand colours: orange for actions, purple for selected and info, red only for errors and deletion.

## Constraints

- One Gemini request per Analyze. Never log profile or chapter text.
- Oracle and H2 both: CLOB column, no Oracle-only SQL in the reading code.
- The profile file name comes from `t_novel.prompt_profile`. Validate it with the existing `NovelProfileNames` rules before any path use.
- The UI is in English (admin). Prompts are in Vietnamese.

## Left to the builder

- The paragraph diff algorithm and library (keep it dependency-light).
- How much of `ProfileAnalyzer` to share or copy.
- Exact truncation of very long paragraphs, as long as the 30,000-character budget holds.
- Component split and CSS for the panel, within the layout rules.

## Calls made by Opus (check while reading)

- Only **Published** chapters count, like Vietsub's "Done".
- Analyze is blocked while a chapter of the novel is translating, but not while the notebook is updating.
- Source paragraphs are attached only when the paragraph counts match. Otherwise the item is AI → FINAL only.
- Novels sharing a profile name are analyzed together.
- `ai_text` is set only on a complete translation.
- Old screenshot chapters fall back to the page texts. Pre-V6 page edits may hide a few corrections, but they never invent any.
- The busy check is best-effort, not atomic.
- Stats on GET count every qualifying edit. Analyze uses only what fits the limits, and the UI shows "Used X of Y" when the two differ.
- `ProfileAnalyzer.select` is Vietsub-specific, so copying its logic is expected rather than sharing it.
