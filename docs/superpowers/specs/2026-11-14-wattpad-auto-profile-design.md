# Wattpad novel: create its translation profile automatically (design)

Date: 2026-11-14 · Status: approved 2026-11-14 · Builds on [2026-11-13-wattpad-per-chapter-fetch-design.md](2026-11-13-wattpad-per-chapter-fetch-design.md)

## Why

Fetch & translate refuses a novel without a translation profile (`ChapterTranslationService.requireReady` →
`UNKNOWN_PROFILE`). Novel profiles are Markdown files the user writes by hand in `data/prompts/novels/<Name>.md`; the app
has no screen to create one. So a new Wattpad novel cannot be translated until a file is written by hand. The user wants
the profile created when the novel is created from Wattpad.

## Approaches (user picked A)

| | Approach | Trade-off |
|---|---|---|
| **A (picked)** | Fill a template from the Wattpad details (title, author, language, tags, description) plus the general rules for the source language; no Gemini | Free, immediate; characters are left for the user and the story notebook |
| B | Gemini drafts a full profile (characters, pronoun pairs) from the description/tags/chapter 1 | Detailed, but costs 1 request of the 20/day quota and guesses characters from a short blurb |

## Goals

- **New novel › From Wattpad › Create** with the Translation profile left **empty** creates `data/prompts/novels/<Name>.md`
  and stores `<Name>` as the novel's `promptProfile`. Fetch & translate then works right away.
- Choosing an existing profile in the form keeps today's behaviour (nothing is created).
- The form shows, under the empty Translation profile select on From Wattpad: "Leave empty to create `<Name>.md` from
  the Wattpad details."

## Non-goals

- No profile editor screen for Novels; no Gemini; no change for screenshot novels or for novels that already exist
  (e.g. "My Grumpy Vampire" keeps no profile; the user can pick or write one).
- Fetch (preview) still saves nothing: the file is written only on Create.

## Anti-goals

- Never overwrite an existing profile file.
- A failed Create must not leave a new orphan profile file behind.

## Design

- **Name (user decision):** from the novel's title, keeping only the part before the first separator (`|`, ` - `,
  ` – `, ` — `, `(`, `[`), so Wattpad suffixes such as "| EmiBonnie" or "(GL)" are dropped. Then accents removed,
  PascalCase with only `[A-Za-z0-9]`, at most 40 characters (the store's name rule `[A-Za-z0-9_-]{1,40}`, not starting
  with `_`), e.g. "My Grumpy Vampire | EmiBonnie" → `MyGrumpyVampire`. If the part before the separator has no
  Latin letters or digits, use the whole title. A title with no Latin letters or digits (e.g. Thai only) falls back to `Wattpad<storyId>`.
  If that file exists, append `-2`, `-3`, … (still within 40 characters).
- **Templates:** two classpath resources next to `prompts/_novel_example.md`, `prompts/_novel_template_th.md` and
  `prompts/_novel_template_en.md`, with placeholders `{{title}}`, `{{author}}`, `{{genre}}` (tags joined, or
  "chưa rõ"), `{{summary}}` (the Wattpad description, trimmed to fit the 20 KB limit). Sections follow
  `BeMySugar.md` / `_novel_example.md`: Ngôn ngữ gốc, Bối cảnh, Ngôi kể, **Nhân vật** (left as a short "to fill in"
  line: the notebook learns characters after each chapter), Xưng hô, Tên riêng và thuật ngữ, Kính ngữ (Thai template
  only), Văn phong, Không được làm, Tóm tắt nội dung. The Thai template reuses BeMySugar's general Thai rules (เขา/เธอ,
  พี่/น้อง, ครับ/ค่ะ, thán từ…), minus anything specific to that story (character names, the Sugar nickname, GL-only
  wording). The English template has the equivalent rules for English sources (he/she/they by gender and
  relationship, you/I by relationship, honorifics such as Mr./Ms., keep English names). The language comes from the
  form's Source language (`th` | `en`).
- **Where:** `WattpadNovelService.create`. When `promptProfile` is blank: pick the name, render the template, write the
  file through `NovelProfileStore` (new method `create(name, text)`: writes only if the file does not exist, same UTF-8
  and 20 KB rules, atomic write), then create the novel with that profile. If the novel create then fails, delete the
  file just written. File I/O is not inside a DB transaction.
- `data/prompts/novels/` is tracked in git (CLAUDE.md), so the new file shows up in `git status`. The user commits it
  with other data changes.
- Tests use a temporary prompts directory and never write into the real `data/prompts`.

## Left to the builder

- The exact wording of the two templates (Vietnamese with full diacritics), within the sections above.
- How the frontend learns the proposed name for the hint: compute it in the form from the slug with the same rule, or
  have the preview return it. Prefer one rule in one place (backend), e.g. a `suggestedProfile` field in the
  Wattpad preview.
