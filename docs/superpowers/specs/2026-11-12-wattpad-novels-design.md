# Translated novels from Wattpad — design

Date: 2026-11-12 · Status: revised 2026-11-13 after user review (whole-chapter translation; reuse Novels as-is; no permission flag)

## Goal

Translate a Wattpad story (the author gave permission) and publish it exactly like the existing translated novels
(Novels › Translated): same admin novel/chapter pages, same Gemini translation with the story notebook, same
Publish that renders chapters as watermarked WebP images, same public novel/reader pages. Wattpad novels live in Novels › Translated and reuse the Novels code and screens; only two things differ:
1. **How the story is obtained** — the novel details are prefilled from Wattpad and the chapter text is fetched as
   text, instead of page screenshots.
2. **How it is translated** — Gemini translates text (a whole chapter per request), instead of reading screenshots.

## Decisions (from the user)

- Source language is chosen **per novel**: Thai or English (more can be added later). The translation profile
  (`./data/prompts/novels/<Name>.md`) is chosen per novel as today.
- Public reader: **rendered images + watermark**, same as screenshot novels (copy protection).
- Images embedded inside Wattpad chapters are **ignored** (text only).
- No new public UI: the Wattpad story URL goes into the existing **Original book link** field and the author into
  **Original author**, so the public novel page shows today's "Truyện gốc" button and details unchanged. No
  "permission" line, flag or checkbox.
- Entry points: Novels › Translated › New novel › "From Wattpad", and Fanfic card menu › "Translate this story".

## Feasibility (spike 2026-11-12, plain GET, no login, UA `SubtitleStudio`)

- `GET https://www.wattpad.com/api/v3/stories/{id}?fields=id,title,numParts,language(name),parts(id,title,wordCount,createDate,modifyDate,deleted)`
  → 200 JSON; `parts` in story order with numeric `id`, `title`, `wordCount`, ISO dates. (Story 396487502: 28 parts,
  English.)
- `GET https://www.wattpad.com/apiv2/storytext?id={partId}` → 200 `text/html` fragment: one
  `<p data-p-id="…">…<br>…</p>` per paragraph, HTML entities, curly quotes. 190-word part = 1.4 KB.
- To verify during implementation: long parts may be paged (`&page=2…`). Fetch the longest part of a real story
  and, if the response is shorter than expected (`wordCount`), loop `page=2,3…` until an empty answer; record the
  finding in this spec. Paid/locked parts and deleted parts return no usable text → reported per part, never fatal.
- The app already calls the v3 story API (`fanfic/WattpadClient`, cover download, UA, timeouts); reuse it.

## Data (Flyway V20)

`t_novel`:
- `source_type varchar2(20) default 'SCREENSHOTS' not null` — `SCREENSHOTS | WATTPAD`.
- `source_language varchar2(5) default 'th' not null` — `th | en`.
- `wattpad_story_id varchar2(20)` nullable, unique.
- Existing `original_author` and `source_url` are reused (author username / story URL = "Original book link").

`t_chapter`:
- `source_text clob` — the fetched original text (plain text, paragraphs separated by a blank line).
- `wattpad_part_id varchar2(20)` nullable; unique per novel (`unique (novel_id, wattpad_part_id)`).
- `source_fetched_at timestamp(6)` nullable.

Existing rows: `SCREENSHOTS`, `th`. `PersistenceOracleIT` lists tables only (no new
table) — check it anyway.

## Behaviour

### Creating a novel from Wattpad (admin)
- New novel page gets a source switch: **Screenshots** (today's form) | **From Wattpad**.
- From Wattpad: paste a story link (same link rules as Fanfics: story link, not a chapter link; `wattpad.com/story/{id}…`),
  **Fetch** → `POST /api/novels/wattpad/preview {url}` returns title, author, description, tags, completed, language
  name, part count, cover URL, and `existingNovelId` if a novel with this `wattpad_story_id` already exists (UI then
  links to it instead of creating a duplicate).
- The existing novel form (`NovelForm`) is prefilled — title, Original author, description, tags, status
  Completed/Ongoing, Original book link (the story URL), source language guessed from Wattpad `language.name`
  (Thai→th, else en) — and stays editable; the admin picks the translation profile as today. The only extra
  field is **Source language** (Thai/English).
- Save creates the novel (`source_type=WATTPAD`, `wattpad_story_id`), downloads the cover like Fanfic does (stored
  through `MediaService`, filed into `novels/covers` by MediaFiler), then opens the novel page on the import step.
- `/novels/new?wattpad=<url>` preselects From Wattpad and runs Fetch (used by the Fanfic menu item).

### Importing chapters (admin novel page, WATTPAD novels only)
- Section "Wattpad chapters": `GET /api/novels/{id}/wattpad/parts` lists parts in story order with title,
  word count, modify date and `imported` (chapter id if a chapter has this part id).
- Tick parts → **Import** → `POST /api/novels/{id}/wattpad/import {partIds}`: for each part, in story order, fetch
  the text, create a DRAFT chapter with the next chapter number/sort order, title = part title, `source_text`,
  `wattpad_part_id`, `source_fetched_at`. Parts already imported are skipped. One failing part is reported in the
  result (`imported[]`, `failed[{partId,title,reason}]`) and does not stop the others. A short pause between part
  requests (reuse the Fanfic `Sleeper` pattern, ~500 ms).
- **Check for new chapters** = reload the parts list; new parts show as not imported.

### Chapter (admin chapter page, WATTPAD chapter = has `source_text`)
- No page grid/upload/rotate (the page endpoints answer 409 `CHAPTER_TEXT_SOURCE` for such chapters).
- Two columns on desktop (stacked on phones): **Original** (read-only, scrollable, language label) and the
  existing **Chapter text** editor (Vietnamese).
- **Reload original** (Draft only): refetches the part text from Wattpad (confirm dialog; does not touch the
  translation).
- **Translate** / **Translate again**: Gemini translates `source_text` into Vietnamese and writes it to the
  chapter's `text_vi` (with `edited_after_translation=false`); Translate again asks for confirmation when the text
  was edited (same wording as today's "Translate again removes your edits"). Status/model/polling exactly as today.
- Publish/Unpublish, notebook update on publish, renderer, export: unchanged — they already read
  `ChapterText.of(chapter, pages)`, which returns `text_vi` when set.

### Translation of text chapters
- **One request per chapter.** The whole `source_text` is sent in one Gemini request and the whole Vietnamese
  chapter comes back. Wattpad chapters are short for the model (sample story: longest part 951 words ≈ 6k chars;
  Gemini input is far larger and its output limit covers tens of thousands of words), so splitting is the rare
  exception, never the rule.
- New `TextChapterTranslator` (Gemini, same client/model list/fallback/429 handling/`onTrying` reporting as
  `GeminiChapterTranslator`). System rules: the same novel-translation rules as today but for text input, with the
  source language named (Thai or English) and the Thai-particle rule applied only for Thai.
- Input: profile, novel title, chapter name, notebook text, previous chapter tail (`previousText`, same 4,000 chars)
  and the chapter's source text. Output: JSON `{ "text": "…" }`, plain Vietnamese, paragraphs separated by a blank
  line; validated non-empty.
- **Cut-off detection.** The answer counts as incomplete when Gemini reports `finishReason = MAX_TOKENS` (or the JSON
  does not parse because it was truncated), or when the translation is implausibly short (fewer than ~40% of the
  source's paragraphs). Only then is the chapter split, and only for that chapter:
  - split in two at a **scene break** (a line made only of `*`, `-`, `~`, `#`, `•` or similar, e.g. `***`, `* * *`)
    closest to the middle; if none, at the **paragraph boundary** closest to the middle — never inside a paragraph
    or sentence;
  - the second half's request also carries the tail of the first half's **source and translation** (≈1,500 chars
    each) as context, with an instruction to continue seamlessly without repeating it;
  - if a half is still cut off, it is split again the same way (max depth 3 → at most 8 parts; beyond that the
    chapter fails with a clear message).
  - Pre-split also happens without asking Gemini first when the source exceeds a safety limit (default 60,000
    characters, configurable), using the same scene-break/paragraph rule.
- Thai source: an answer with >30% Thai characters counts as untranslated and is asked again once (same rule as
  pages).
- Each request = one Gemini request (free tier: 20 requests/day/model) — normally one per chapter.
- Failure: chapter `FAILED` with the user message; nothing partial is saved (Translate again redoes the chapter).

### Public site
- Nothing new. The exported novel already carries `originalAuthor` and `sourceUrl`; the public novel page already
  shows the "Truyện gốc" button; reader, chapter list, banner, "Mới cập nhật" and read counts are unchanged.

### Fanfics
- Fanfic card menu (admin) gets **Translate this story** → `/novels/new?wattpad=<story url>`; if a novel with this
  Wattpad id exists, the item reads **Open translation** and links to that novel.

## Out of scope
- Images inside chapters, paid/locked parts, automatic periodic sync, editing `source_text` by hand, languages other
  than th/en, bulk "translate all".

## Risks
- `apiv2/storytext` is unofficial; when it changes, Import fails per part with a clear message and existing chapters
  are unaffected.
- Copyright: the user has the authors' permission; it is not recorded in the app.
