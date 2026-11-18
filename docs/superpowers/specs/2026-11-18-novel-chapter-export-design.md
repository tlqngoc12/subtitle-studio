# Novel chapter export (zip) — design

Date: 2026-11-18 · Size: small change · Status: waiting for user approval

## Why

The user wants every translated or edited chapter of a novel out of the app at once, for two uses:
1. **Archive**: keep the text outside the app.
2. **Repost** on other platforms (Wattpad and similar). Pasting today loses paragraph breaks: Wattpad drops a single `\n`
   and shows `*italic*` / `**bold**` literally.

## Goals

- One **Export** button per novel downloads a `.zip` holding every chapter that has text.
- Each chapter ships twice: `.md` (the archive copy, as stored) and `.html` (ready to paste: open it in a browser,
  Ctrl+A, Ctrl+C, paste into Wattpad, and paragraphs and italics/bold survive).

## Non-goals

- No images (`[[image:N]]` pictures), no epub/docx, no single combined file.
- No picking chapters, no export of a single chapter.
- No change to the existing Copy button on the chapter page (separate fix, may reuse the same conversion later).
- No change to the public `novels/<slug>.json` export (it must still hold no chapter text).

## Approaches (user picked A)

- **A. Zip, one `.md` + one `.html` per chapter**: chosen. Covers both archive and repost chapter by chapter.
- B. One combined `.md`: easy to archive, but the user has to cut chapters by hand and the Wattpad line-break problem stays.
- C. One `.epub`/`.docx`: nice to read or share, poor for reposting chapter by chapter, needs a new library.

## Design

**Which chapters:** every chapter of the novel whose text (`ChapterText.of(chapter, pages)`: the edited whole text,
or the page texts joined by a blank line) is not blank. Draft and Published alike, in reading order (`sort_order`).

**Endpoint:** `GET /api/novels/{id}/export` → `application/zip`, `Content-Disposition: attachment;
filename="<slug>-YYYY-MM-DD.zip"` (local date). The zip is streamed. No chapter with text → error response handled by
`ApiExceptionHandler` (the frontend never calls it in that case). Logs: novel id and chapter count only, never text.

**Zip layout:** flat, two files per chapter:

```
<slug>-2026-11-18.zip
├─ 001 - Chapter 1 - <title>.md
├─ 001 - Chapter 1 - <title>.html
├─ 002 - Ngoại truyện 1.md
└─ …
```

- `NNN` = position in reading order, zero-padded to 3 digits (4 if the novel has 1000+ chapters).
- Heading = `label` if set, else `Chapter <chapterNo>`; then ` - <title>` when a title exists.
- File names: characters `\ / : * ? " < > |` and control chars replaced by `_`, trimmed, max ~120 chars before the extension.
  Vietnamese letters kept; zip entries written as UTF-8.

**`.md` content:** `# <heading>`, a blank line, then the chapter text exactly as stored (markers, markdown and line
breaks untouched). UTF-8, `\n` line ends.

**`.html` content:** a standalone UTF-8 page, `<title>` = heading, simple readable CSS (max width, line height).
The body holds **only the story text** (no heading), so Ctrl+A copies just the chapter for the platform's text box
(the title goes in the platform's own title field). Conversion:
- `[[image:N]]` paragraphs removed.
- Every non-blank line becomes one `<p>` (so a single `\n` and a blank line both end a paragraph — the Wattpad fix).
- `**x**` → `<strong>`, `*x*` → `<em>`; everything else HTML-escaped.
- A line that is only `---` stays a `<p>---</p>` (scene break kept as written).

**Frontend:** on the novel page, Chapters tab toolbar, a secondary button **Export** (lucide `Download`) next to the
primary action. It downloads through a plain link to the endpoint. Disabled with a tip "No translated chapters yet"
when no chapter has text (the chapter list already tells: translated status or edited). Follows
`docs/ui/screen-layout.md` and the orange/purple palette.

## Tests

- Backend: conversion unit tests (single `\n`, blank lines, `**`/`*`, escaping, markers, `---`); file name builder
  (label vs Chapter N, title, bad characters, padding); controller test reading the zip back (only chapters with text,
  reading order, both files each, headers); log has no chapter text.
- Frontend: Export button present, link target, disabled state with tip.

## Left to the builder

Where the conversion class lives inside `novel/`, the exact CSS of the `.html`, how "has text" reaches the frontend
(an existing field on `ChapterSummary` or a new boolean).
