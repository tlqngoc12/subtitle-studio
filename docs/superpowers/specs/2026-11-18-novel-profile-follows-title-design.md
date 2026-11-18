# Novel profile follows the novel title — design

Date: 2026-11-18 · Size: small change · Status: waiting for user approval

## Why

An auto-created novel profile (`data/prompts/novels/<Name>.md`) is named after the title the novel had when it was
created. When the user renames the novel (e.g. a story first saved as "Unknown"), the profile keeps the old name and the
old title inside (`Unknown.md`). The user wants the profile to follow the title, for every kind of novel.

## Goals

When `PUT /api/novels/{id}` changes the **title** and the profile qualifies (below):
1. The profile file is renamed to the name derived from the new title (same rule as creation: `NovelProfileNames`,
   `fromTitle(title, storyId, …)` for Wattpad novels, `forOriginal`'s rule for the others, `-2`, `-3`… when taken).
2. Its history files `.history/<Old>-<yyyyMMdd-HHmmss>.md` are renamed to `<New>-<same stamp>.md` (exact pattern
   match, so `Old-2-…` is never caught by `Old`).
3. Inside the file, only these lines change, and only when they hold the **old title exactly**:
   - heading `# Hồ sơ truyện: <old>` or `# Hồ sơ dịch: <old>` → new title;
   - `- Tên truyện: "<old>"` (any text after the closing quote kept) → new title.
   Everything else is left byte for byte. The rename itself is not a new history entry.
4. The novel's `promptProfile` points to the new name; the response carries it.
5. Frontend: after Save, when `promptProfile` changed from before and the user did not pick it, toast
   `Profile renamed to <New>.md` (info toast, brand colors).

## When the profile is left alone (silently)

- The title did not change, the novel has no profile, or the same request also changes `promptProfile`.
- The profile is **shared**: another novel has the same `promptProfile`.
- The profile name is **not auto-derived** from the old title: it differs from the old title's derived name with or
  without a `-N` suffix (a profile the user picked by hand, e.g. `BeMySugar` for another story).
- The derived new name equals the current name: no file rename, but the title lines (3) are still updated.

## Non-goals

- No rename of Vietsub profiles (`data/prompts/*.md`), no UI to rename a profile by hand.
- No change when only the slug or other fields change.
- No toast explaining why a profile was left alone (approved simplification: only the rename is announced).

## Approaches (user picked A)

- **A. Automatic on Save** — chosen: the profile follows the title with no extra step; the two exceptions protect
  other novels and hand-picked profiles.
- B. Ask on every Save: control, but one more click every rename. C. Separate "Rename profile" button: easy to forget,
  leaves files like `Unknown.md` behind.

## Constraints

- File work happens inside `NovelService.update` after the DB flush; if renaming fails, throw so the transaction rolls
  back (no novel pointing at a missing file). A rare commit failure after the move is accepted.
- `NovelProfileStore` owns all file access (add a `rename(from, to)` that moves the file and its history; refuses when
  `to` exists). Names stay within `NovelProfileNames.MAX_LENGTH`.
- Never log profile text; log old name, new name, novel id.

## Tests

Store: rename moves file + only matching history files; refuses an existing target. Service: renames when
auto-derived and unshared (Wattpad and original/screenshot); title lines replaced only when they match; skips shared,
hand-picked, unchanged title, changed `promptProfile`; `-2` when the new name is taken; same derived name → lines only.
Frontend: toast after a rename, none otherwise.

## Left to the builder

Where the "derived name without taken-check" helper lives in `NovelProfileNames`, the exact regexes for the two lines.
