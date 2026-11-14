# Novel editor UX: chapter editor and novel form — design

Date: 2026-11-15. Branch: `feat/novel-editor-ux`. Size: project (frontend only; no API or schema change).

## Why

A UI/UX audit of the admin create/edit novel and chapter-edit screens. It used screenshots of the deployed app in Edge (1280 px and 390 px) and the code. The screens are a **translation proofreading editor**: plain text in paragraphs, rendered to images on Publish. So no rich-text toolbar is needed; translator tools are.

The user asked for every proposal (E1–E6, F1–F4). The findings:
- **Nested scrolling.** The chapter textarea is fixed at 60vh, so a 20,000-char chapter scrolls inside the box *and* the page.
- **Long lines.** About 110 characters per line.
- **No feedback.** There is no save state, no word or paragraph count. A paragraph count against the original would have caught the chapter-19 gap.
- **Two primaries.** Publish (header) and Save (bottom bar) can both be primary.
- **Destructive button next to Publish.** "Translate again" (overwrites manual edits) is a plain button next to Publish.
- **Phone layout.** On a phone the first screen shows no chapter text.
- **The two novel forms differ.** Create and Edit differ in width, sticky bar and Delete placement.
- **Weak form fields.** Tags are a comma string, the 13 fields have no grouping, and two optional fields are unlabelled.

## Global rules (from `CLAUDE.md`, binding)

- `docs/ui/screen-layout.md`: `Page` + `PageHeader`, form `FormActions` (sticky, Delete via `start`), at most 1 primary per screen.
- Colours: orange = actions; purple = state; red only for errors and deletes.
- Controls are 32/40/48 px.
- Breakpoints are 520/760/1024 px, written mobile-first.
- Icons are `lucide-react`; icon-only buttons have `aria-label` + `<Tip>`.
- Menus are Radix Popover with `PopoverPanel` (like `NovelMenu`).
- Admin strings are English.
- TDD with Vitest + RTL; query by role and label.

---

## Part E — Chapter edit page (`pages/ChapterPage.tsx`)

### E1. One page scroll, one sticky action bar

- The chapter textarea **grows with its content** (height = `scrollHeight` on input, on load, and on width change; minimum 60vh). Only the page scrolls; the textarea never shows its own scrollbar. Draft screenshot chapters keep their page-image section above, unchanged.
- New sticky **chapter bar** (`components/novel/ChapterBar.tsx` + `.css`), `position: sticky; top: 0` below the page header. It replaces the bottom `FormActions` and the header's action buttons. Left to right:

  ```
  [‹] [›]  Chapter 19 · [Translated] [Published]      Saved 10:32     [Save] [Publish] [⋯]
  ```

  - `‹` / `›`: the existing prev/next links (same unsaved-changes guard). On the last chapter of a Wattpad novel, `›` is replaced by **Fetch & translate next**, as today.
  - **Save state text** (`aria-live="polite"`), one of:
    - "Unsaved changes";
    - "Saving…";
    - "Saved HH:mm" (last save in this session);
    - "Auto-saved HH:mm";
    - nothing before the first save.
  - **Save**: `button--primary` while there are unsaved changes; a plain disabled `button` otherwise. Ctrl/⌘+S unchanged.
  - **Publish**: shown for Draft chapters that are translated. It is `button--primary` only when there are **no** unsaved changes, and disabled with a `Tip` "Save first" when there are. So there is never more than one primary.
  - **⋯ menu** (`aria-label="Chapter actions"`, Popover + `PopoverPanel`) with the items that apply:
    - **Translate** / **Translate again**: red (`--danger`), with today's confirm dialog;
    - **Unpublish**;
    - **Reload original** (text Draft chapters);
    - existing delete, if the page has one.
- **Phone (≤ 520 px):** the bar keeps `‹ › Save ⋯`, and the save-state text moves under it. Publish moves into the `⋯` menu as its first item.
- `BackToTop`: the chapter route no longer needs `barOn` for a bottom bar. Adjust where it is mounted.

### E2. Status line: words, paragraphs, save state

Under the bar, in muted text: `3,412 words · 18,903 characters · 158 paragraphs`.

- For chapters with a text original (`sourceText`), add `· 158/158 paragraphs of the original`. When the translation has fewer than 90 % of the original's paragraphs, that part is `--danger` with the `Tip` "The translation may be missing a part".
- Counts use the same paragraph rule as the backend `TextSplitter` (blank-line separated, trimmed, empty ones dropped). Words = whitespace-separated tokens. Numbers are formatted with `toLocaleString('en')` (counts are not dates).
- Updates are debounced about 300 ms while typing.

### E3. Destructive actions out of the way

This is covered by E1's menu: Translate again sits in `⋯`, red, behind its confirm. No other change.

### E4. Comfortable reading width; original beside it

- The chapter text column is **max 72ch**, the font is **17 px** (`1.0625rem`), line-height stays 1.7, and it is centred within the page.
- **Text-source chapters with the original shown** (as today: Draft): two columns from 1024 px. The left one is the original as read-only paragraphs (`<p>` list, not a textarea), sticky with `max-height: calc(100vh - bar height)` and its own scroll. The right one is the editor.
  - When the caret is in translated paragraph *N* (counted from the text before `selectionStart`), original paragraph *N* gets the `--hover` tint and is scrolled into the original column with `block: 'nearest'`. The page itself does not scroll.
  - Below 1024 px, the original is a collapsible section "Original (English/Thai)" above the editor, closed by default.

### E5. Phone: text first

The chapter **label**, **title** and the "Translated by …" line move into a disclosure **Chapter details** (`<details>`). It is closed by default below 761 px and open from 761 px up; it is remembered in `localStorage` `chapter-details-open` behind try/catch. The published note ("This chapter is published…") becomes one short muted line under the status line, not a boxed alert. Result: on a 390×844 screen the first lines of chapter text are visible without scrolling.

### E6. Translator tools

- **Find & replace** panel, toggled by a `Search` icon button in the bar (`aria-label="Find and replace"`) and by Ctrl/⌘+H.
  - Fields: Find, Replace, and a checkbox "Match case". Buttons: **Previous**, **Next**, **Replace**, **Replace all**, plus a counter "3 of 12".
  - Next/Previous select the match in the textarea (`setSelectionRange`, focus) and scroll it into view.
  - Replace all changes the text state (unsaved) and shows `toast.success('Replaced 12', { action: { label: 'Undo', onClick } })`, which restores the previous text.
  - Esc closes the panel and returns focus to the textarea.
  - Literal matching only, no regex.
- **Insert scene break**: a `Minus`-icon button "Insert scene break" puts a `***` paragraph at the caret (a blank line before and after).

---

## Part F — Novel form (`components/novel/NovelForm.tsx`, `pages/NovelNewPage.tsx`, Details tab of `pages/NovelPage.tsx`)

### F1. Create and Edit look and behave the same

- Same `Page` width and the same form width in both places.
- Both use `FormActions sticky`:
  - Create: **Cancel** (back to Novels) and **Create novel**.
  - Edit: **Delete novel** in `start`, then **Save**.
  - The separate Delete block under the form is removed.
- The Create mode switch (Screenshots / From Wattpad) stays at the top of the create page only. Fields that exist only in one mode (Source language for Wattpad) keep their current rules.

### F2. Tags as chips

New `components/ui/TagInput.tsx` (+ css and tests), reusable:

```
{ id, value: string[], onChange, suggestions: string[], max?: number, maxLength?: number, 'aria-describedby'?, 'aria-invalid'? }
```

- Tags render as chips; each chip has a remove button (`aria-label="Remove tag <name>"`).
- Typing filters `suggestions` (reuse `Combobox`'s list behaviour or its popover pattern).
- **Enter** or **comma** adds a tag. **Backspace** in an empty input removes the last chip.
- Duplicates are ignored (case-insensitive) and the value is trimmed.
- At `max` (10) the input is disabled, with the hint "At most 10 tags.". `maxLength` is 40.
- Suggestions come from the tags of all novels (`listNovels`, already loaded on the Novels pages; fetch once in the form if needed).
- The form state becomes `string[]`. It is sent as the same array the API takes today (the comma string was only the input format).

### F3. Grouped fields, two columns on wide screens

Four sections, each with a small heading (`<h2 className="form-section__title">`):

1. **Basics**: Cover, Title, Slug, Original author, Status. From 1024 px, the cover sits in a 200 px left column next to the other four fields.
2. **About**: Description (min 8 rows, with a character count under it) and Tags.
3. **Links**: Original book link, Trailer.
4. **Translation**: Source language (Wattpad), Translator credit, Translation profile.

Below 1024 px, one column in that order.

### F4. Labels and hints

- "(optional)" is added to **Trailer** and **Translation profile**.
- When **Create novel** is disabled because the title is empty, the button sits in a `Tip` "Title is required", and the Title field shows the error after a submit attempt. This uses the existing `Field` error pattern.

---

## Tests (write first; the main ones)

- **E1:**
  - The textarea height follows content (stub `scrollHeight`), with no inner scroll.
  - The bar has at most one `button--primary` in every state (clean Draft, dirty Draft, Published clean/dirty).
  - Publish is disabled with a "Save first" tooltip while dirty.
  - The ⋯ menu lists the right items per state, and Translate again is red and confirms.
  - The save-state text changes through Unsaved → Saving… → Saved HH:mm, and Auto-saved after the 15-minute timer.
- **E2:** the counts for a known text; the original paragraph ratio is red below 90 %; screenshot chapters show no "of the original".
- **E4:**
  - The caret in paragraph 3 highlights original paragraph 3.
  - Below 1024 px the original is a closed disclosure.
  - CSS: `max-width: 72ch` and `font-size: 1.0625rem` on the editor.
- **E5:** the disclosure is closed at 390 px and open at 1280 px (matchMedia stub), and the open/closed state is remembered.
- **E6:**
  - Find counts and Next/Previous selection ranges.
  - Match case.
  - Replace and Replace all, and Undo restores.
  - Ctrl+H opens; Esc closes and refocuses.
  - The scene break is inserted at the caret.
- **F1:** Create and Edit both render a sticky `FormActions`; Edit has Delete in `start`; there is no separate delete block.
- **F2:** TagInput add (Enter, comma), remove (×, Backspace), dedupe, max 10, suggestions filter, and the submit payload is an array.
- **F3:** the section headings exist in order; CSS has two columns at 1024 px.
- **F4:** the optional labels, and the disabled Create tooltip.
- **Existing tests:** update ChapterPage/NovelPage/NovelForm tests that assert the old header buttons, the bottom bar or the comma tag input.

## Non-goals

- Rich text formatting.
- A public-render preview.
- Changing API, DB or Publish behaviour.
- Paragraph-aligned editing of the original.
- Regex find.

## Done when

- `npx vitest run` and `npx tsc -b` are green, and `mvn -q test -Dskip.npm` is green (unchanged backend).
- Screenshots in Edge are checked by the reviewer at 1280 and 390 px.
- `CLAUDE.md` (Frontend) has the chapter bar, status line, find & replace, `TagInput` and form sections.
- `PROGRESS.md` has an entry.
- `docs/ui/screen-layout.md` notes the editor exception if the sticky top bar replaces the bottom `FormActions` on the chapter page.
