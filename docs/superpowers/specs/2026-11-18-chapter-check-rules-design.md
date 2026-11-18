# Chapter Check from profile rules — design

Date: 2026-11-18. Branch: `feat/chapter-check-rules`. Size: small to medium. The work is almost all frontend: a
rule parser, a Check mode in the chapter editor, underlines, and a suggestion popover. It also adds one section to
the 3 profile templates. There is no backend logic and no migration.

## Why

While reviewing a translated chapter, the user fixes the same wrong phrases again and again, for example "mẹ cô"
for Bonnie, who must be "em". Those fixes are already written in the profile as prose. The user wants a **Check**
button that underlines known-wrong phrases and offers the right word, so the fix is one double-click away. It must
**not** call Gemini, because the free quota is for translating. Checking is plain rule matching in the browser.

What a rule cannot catch: context-dependent cases such as a bare "cô", which may be right for Emi and wrong for
Bonnie. Only fixed phrases that are always wrong in a given novel are checked. The user accepted this.

## Approaches (user picked B)

- A. Auto-read every `"x" → "y"` pair already in the profile prose. Rejected: many are context-dependent ("vì chị"
  → "vì tôi" is only right when Emi speaks) or English → Vietnamese examples, so there would be many false alarms.
- **B. A dedicated `## Kiểm tra` section in the profile, one rule per line.** The user decides exactly what is an
  error. Gemini also reads the section, since the whole profile goes into the translation prompt.

## Rule format (`## Kiểm tra` section)

```
## Kiểm tra
- "mẹ cô" → "mẹ em" (Bonnie dùng "em")
- "cảm xúc trẻ con" → "cảm xúc bồng bột" | "cảm xúc nông nổi"
- "chàng" → (tránh dùng)
```

- The section runs from the `## Kiểm tra` heading to the next `## ` heading or the end of the file.
- Rule line: `- "<wrong>" → <suggestions> [(<reason>)]`.
  - `→` or `->` both work.
  - Suggestions are quoted strings separated by `|`.
  - `(tránh dùng)` or no quoted suggestion means "flag only, no suggestion".
  - An optional trailing `(…)` is the reason, shown in the popover.
  - Straight and curly quotes (`"…"`, `“…”`) are both accepted.
- Lines that do not match the format are ignored: comments, prose, or the template's hint line. A small count of
  ignored lines is shown in the Check summary ("2 lines in ## Kiểm tra could not be read") so typos are noticed.
- The 3 templates (`_novel_template_{th,en,es}.md`) get the section, placed before `## Tóm tắt nội dung chính`, with
  one hint line that is not a rule:
  `- (Thêm dòng dạng "cụm sai" → "gợi ý" | "gợi ý khác" (lý do). Nút Check ở trang chương dùng các dòng này.)`
  The existing 10 profiles are not changed. The user adds the section when needed.

## Matching

- Comparison is case-insensitive, and both texts are NFC-normalized.
- **Whole words only:** the character before and after a match must not be a Unicode letter or digit (`\p{L}\p{N}`).
  So "cô" does not match inside "cố" or "côn".
- Image-marker lines (`[[image:N]]`) are never matched.
- Overlapping matches: the longer rule wins, then the earlier one.
- When a suggestion is applied, the first letter's case follows the matched text. "Mẹ cô" at the start of a sentence
  becomes "Mẹ em".

## UI (chapter page, Chapter text)

```
Chapter text                                   [✓ Check · 3]   ← to the right of the label
┌──────────────────────────────────────────────────────────┐
│ Cô mỉm cười nhìn mẹ cô đang đứng ở cửa...               │
│                  ﹏﹏﹏ (purple wavy underline)           │
│            ┌───────────────────────────────┐             │
│            │ Bonnie dùng "em"              │             │
│            │ [mẹ em]  ← double-click        │             │
│            └───────────────────────────────┘             │
└──────────────────────────────────────────────────────────┘
```

- **Check** is a toggle button (secondary, S size), on the right of the "Chapter text" label row.
  - On: it gets the purple selected style and shows the issue count.
  - While Check is on, matching re-runs on every edit (debounced about 150 ms).
  - Off: underlines and popover disappear.
  - It is disabled when the novel has no profile or the profile has no `## Kiểm tra` rules. The tooltip says why.
- **Underlines:** a purple (`--brand-2`) wavy underline painted behind the textarea with the same mirror technique
  as `FindHighlights` (generalize it or reuse its mirroring; builder's call). When Find is open too, both show; Find
  marks keep their current look.
- **Popover:** when the caret is inside an underlined span (click or keyboard), a small popover appears anchored
  under that span. It holds the reason (muted) and one chip per suggestion. **Double-clicking a chip** replaces the
  span with that suggestion. The user asked for double-click: it avoids applying by accident. Enter on a focused
  chip also applies, for keyboard use. Esc closes the popover.
- **Replacement** keeps the textarea's native undo (Ctrl+Z) where the browser allows it, for example
  `execCommand('insertText')` on a selected range, with a plain value update as fallback. It marks the editor dirty,
  so Save / auto-save / Ctrl+S work as usual.
- **Navigation:** when Check is on, the summary next to the button has ‹ › buttons that move the caret to the
  previous or next issue, which opens its popover.
- **Locked editor** (while translating): Check is disabled.

## Where the rules come from

The chapter page loads the novel's profile text through the same API the Profile tab uses (`getNovelProfile`). It
is fetched once per page visit and again when Check is switched on, so edits made in another tab are picked up. The
parser is a pure function in `lib/checkRules.ts`, and the matcher is `findIssues(text, rules)`. Both are unit tested.

## Non-goals

- No Gemini or other LLM call.
- No context-aware pronoun checking.
- No rule editor UI. Rules are edited in the profile, in the Profile tab or the file.
- No "Add to check rules" from a selection. It can come later.
- The profile analyzer (`NovelProfileAnalyzer`) is not taught to write `## Kiểm tra` rules in this change.
- The public reader is not changed.

## Colors and layout

Follow `docs/ui/screen-layout.md` and the color rule: purple `#D9A1D9` for the underline, the selected Check toggle
and the chips' hover/selected state, and orange `#F39A42` is not used here (no primary action). Red is not used:
these are suggestions, not errors. Text on purple is `#1B2430`. Labels are English, like the rest of the admin UI.

## Tests

- `checkRules` parser: arrows, multiple suggestions, flag-only, reason, curly quotes, ignored lines and their count,
  section bounds.
- `findIssues`: case-insensitive, whole words with Vietnamese letters ("cô" vs "cố"), NFC, overlap, markers skipped.
- Applying a suggestion with case preserved.
- Component: the toggle on/off, the count, the popover on caret, double-click applies, Enter applies, Esc closes,
  ‹ › navigation, and the disabled state without rules.

## Left to the builder

- Popover positioning: use the mirror element to find the span's box, and an existing Radix popover component.
- Whether to generalize `FindHighlights` or add a sibling overlay.
- The debounce value.
