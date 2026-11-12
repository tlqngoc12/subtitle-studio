# Translated novels from Wattpad — design

Date: 2026-11-12 · Status: approved in chat (scope, language, rendering, images)

## Goal

Translate a Wattpad story (the author gave permission) and publish it exactly like the existing translated novels
(Novels › Translated): same admin novel/chapter pages, same Gemini translation with the story notebook, same
Publish that renders chapters as watermarked WebP images, same public novel/reader pages. The only difference is the
**source**: the chapter text is fetched from Wattpad as text, instead of page screenshots read by Gemini.

## Decisions (from the user)

- Source language is chosen **per novel**: Thai or English (more can be added later). The translation profile
  (`./data/prompts/novels/<Name>.md`) is chosen per novel as today.
- Public reader: **rendered images + watermark**, same as screenshot novels (copy protection).
- Images embedded inside Wattpad chapters are **ignored** (text only).
- Public novel page credits the author and links to the original on Wattpad, with a note that the author gave
  permission.
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
- `author_permission char(1) default 'N' not null` — Y when the admin confirmed the author's permission.
- Existing `original_author` and `source_url` are reused (author username / story URL).

`t_chapter`:
- `source_text clob` — the fetched original text (plain text, paragraphs separated by a blank line).
- `wattpad_part_id varchar2(20)` nullable; unique per novel (`unique (novel_id, wattpad_part_id)`).
- `source_fetched_at timestamp(6)` nullable.

Existing rows: `SCREENSHOTS`, `th`, no permission flag needed (`N`). `PersistenceOracleIT` lists tables only (no new
table) — check it anyway.

## Behaviour

### Creating a novel from Wattpad (admin)
- New novel page gets a source switch: **Screenshots** (today's form) | **From Wattpad**.
- From Wattpad: paste a story link (same link rules as Fanfics: story link, not a chapter link; `wattpad.com/story/{id}…`),
  **Fetch** → `POST /api/novels/wattpad/preview {url}` returns title, author, description, tags, completed, language
  name, part count, cover URL, and `existingNovelId` if a novel with this `wattpad_story_id` already exists (UI then
  links to it instead of creating a duplicate).
- The form is prefilled (title, original author, description, tags, status Completed/Ongoing, source URL, source
  language guessed from Wattpad `language.name`: Thai→th, else en) and stays editable; the admin picks the
  translation profile and must tick **"The author gave permission to translate"** (required for WATTPAD).
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
- New `TextChapterTranslator` (Gemini, same client/model list/fallback/429 handling/`onTrying` reporting as
  `GeminiChapterTranslator`). System rules: the same novel-translation rules as today but for text input, with the
  source language named (Thai or English) and the Thai-particle rule applied only for Thai.
- Input: profile, novel title, chapter name, notebook text, previous chapter tail (`previousText`, same 4,000 chars),
  and the source text. Long chapters are split on paragraph boundaries into chunks of at most ~12,000 characters;
  each later chunk carries the tail of the previous chunk's translation (`carryOver`, same constant). Output: plain
  Vietnamese text, paragraphs separated by blank lines (JSON answer `{ "text": "…" }`, validated non-empty; a chunk
  answer containing >30% Thai characters for a Thai source counts as untranslated and is asked again once, like the
  page rule).
- Each chunk = one Gemini request (free tier: 20 requests/day/model — a typical Wattpad chapter of 1–3k words is one
  request).
- Failure: chapter `FAILED` with the user message; a partial multi-chunk result is not saved (simple: retry the whole
  chapter).

### Public site
- Export adds `sourceType`, `originalAuthor`, `sourceUrl`, `authorPermission` to the novel JSON (check what is already
  exported).
- Public novel page (Vietnamese) shows under the title: "Tác giả: {author}" and a link "Bản gốc trên Wattpad ↗"
  (`rel="noopener"`, new tab), and when `authorPermission`: "Đã được tác giả cho phép dịch". Screenshot novels keep
  today's display (show author/source if present, without the permission line).
- Reader, chapter list, banner, "Mới cập nhật", read counts: unchanged.

### Fanfics
- Fanfic card menu (admin) gets **Translate this story** → `/novels/new?wattpad=<story url>`; if a novel with this
  Wattpad id exists, the item reads **Open translation** and links to that novel.

## Out of scope
- Images inside chapters, paid/locked parts, automatic periodic sync, editing `source_text` by hand, languages other
  than th/en, bulk "translate all".

## Risks
- `apiv2/storytext` is unofficial; when it changes, Import fails per part with a clear message and existing chapters
  are unaffected.
- Copyright: permission is recorded per novel (`author_permission`) and shown publicly.
