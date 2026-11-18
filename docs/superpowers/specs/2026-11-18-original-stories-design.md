# Original stories tab + clearer Gemini 504 — design

Date: 2026-11-18. Branch: `feat/original-stories`. Size: medium. It adds one migration (a check constraint), a new
novel source type, a profile template, and tab changes on the admin and public Novels pages. It also changes one
error message.

## Why

- The user writes their own EmiBonnie fanfics in Vietnamese, with an AI (ChatGPT/Claude) helping. They want these
  stories in the app next to the translated ones:
  - with chapters, publish, the public reader and read counts;
  - **with a profile, Check and Add to check rules**, because AI-written text has mistakes too.
- "Gemini returned error 504." does not tell the user anything. A 504 means Google's server timed out while
  producing the answer. It happened on a long chapter part.

## 1. Clearer 504 message

- When Gemini answers HTTP 504, the failure message becomes exactly:
  `Gemini took too long to answer (HTTP 504, a timeout on Google's side). Translate again; it usually works on the next try.`
- The log line keeps the model name.
- No behavior change: there is no fallback and no retry for 504. That is a possible later change.
- The message flows to the UI the same way as today.

## 2. Original stories

**Data:** a new `NovelSourceType.ORIGINAL`. Migration V29 replaces `t_novel_source_type_ck` with
`CHECK (source_type IN ('SCREENSHOTS','WATTPAD','ORIGINAL'))`. `source_language` stays NOT NULL with its default; for
ORIGINAL it is stored as `vi` and ignored. The validator accepts `vi` only for ORIGINAL.

**Tabs:**

| Site | Tabs (in order) | `?tab=` |
|---|---|---|
| Admin `/novels` | Translated · **Originals** · Fanfics | none, `originals`, `fanfics` |
| Public `/novels` | Truyện dịch · **Sáng tác** · Fanfic | same |

- Translated and Truyện dịch list SCREENSHOTS + WATTPAD novels.
- Originals and Sáng tác list ORIGINAL novels.
- Both tabs use the same card list, toolbar (search, status filter, sort) and banner menu as Translated. Banner
  picks may include originals.
- The public export carries each novel's kind so the public site can split the tabs. Use a field such as
  `original: true`, or the source type. This is the builder's call; old exported data without the field counts as
  translated.

**Create (admin, Originals tab):**
- The toolbar action is "New story" (the tab's own action, at the right end of the Toolbar, per
  `screen-layout.md`). It opens the existing new-novel page in **original mode**.
- The form fields are: title, author (free text, required, typed by the user), description, tags, status, cover,
  trailer and translation profile.
- There is no source language, no Wattpad link and no translator credit. The credit field is hidden. If the public
  page shows a translator line, it is not shown for originals.
- **Profile:** when the profile field is left empty, a profile is created from a new template
  `src/main/resources/prompts/_novel_template_original.md`, the same way Wattpad novels get one today.
  - It is named from the title, with the same naming rule.
  - Sections, in order:
    - `# Hồ sơ truyện: {{title}}`
    - `## Thông tin` (tác giả {{author}}, thể loại {{genre}}, viết bằng tiếng Việt)
    - `## Bối cảnh`
    - `## Nhân vật`
    - `## Xưng hô`
    - `## Tên riêng và thuật ngữ`
    - `## Văn phong`, including the paragraph-structure rule from the other templates
    - `## Không được làm`
    - `## Kiểm tra`, with the hint line of the other templates
    - `## Tóm tắt nội dung chính` ({{summary}})
  - It reuses the other templates' placeholder lines and wording where they fit. There is no "Ngôn ngữ gốc" and no
    translation-specific line (for example "không dịch từng chữ").
  - `NovelProfileTemplate` selects it for ORIGINAL.

**Novel page (ORIGINAL):**
- The tabs are Chapters · Details · Profile, as for screenshot novels. There is no Wattpad tab.
- **Add chapter** creates an empty text chapter, with the next number and an optional label, and opens its editor.
  - There is no page/screenshot upload and no fetch.
  - The builder reuses the text-chapter path that Wattpad chapters use, with `sourceText = null`.
- The Profile tab works as for any novel: view and edit, and Analyze.
  - Analyze needs AI text against final text, which originals do not have, so it shows the existing "no edits"
    state.
  - The Wattpad-specific hint (`NovelProfileTab` line ~114) is not shown for originals.

**Chapter page (ORIGINAL):**
- The Chapter text editor, Check, Add to check rules, Find, counts, Save / auto-save / Ctrl+S and Publish all work
  as they do today.
- There is no Original panel and no "show original" toggle.
- There is no Translate button and no translation status chip: a chapter is Draft or Published, by the existing
  publish state.
- Image markers can be added as today. The save guard allows only markers the chapter owns, so originals have none
  until chapter images exist for them. Images in originals are out of scope.

**Public site:** the reader and novel page are the same as for translated novels. The "Sáng tác" tab lists
originals. The author line shows the typed author. There is no translator credit.

## Non-goals

- No AI writing inside the app. Drafts are written in ChatGPT/Claude and pasted in.
- No conversion between translated and original novels.
- No chapter images for originals.
- No 504 fallback.
- No change to Fanfics.

## Tests

- **Backend:**
  - the validator accepts ORIGINAL with `vi`, and rejects `vi` for the others;
  - creating ORIGINAL with an empty profile creates a profile from the original template, with the title and author
    filled in;
  - creating an empty text chapter for ORIGINAL;
  - the 504 message;
  - the `PersistenceOracleIT` constraint;
  - the exporter marks originals.
- **Frontend:**
  - the tabs in admin and public, with the right lists and `?tab=originals`;
  - the New story form hides the source fields and requires the author;
  - the novel page for ORIGINAL has no Wattpad tab and its Add chapter creates a text chapter;
  - the chapter page for ORIGINAL has no Original panel and no Translate, and Check and Add rule are present.

## Left to the builder

- How the public data marks originals.
- How "original mode" reaches the new-novel page (for example `/novels/new?kind=original`).
- Reusing the existing components versus small variants.
