# Novel editor UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A distraction-free chapter editor (one page scroll, sticky action bar, counts, aligned original, phone-first text, find & replace) and one consistent, grouped novel form with chip tags.

**Architecture:** Pure helpers in `lib/chapterText.ts` (counts, paragraph index, find) are tested alone. New components: `components/novel/ChapterBar`, `components/novel/OriginalPanel`, `components/novel/FindReplace`, `components/ui/TagInput`, and the hook `lib/useAutoGrow`. `ChapterPage`, `NovelForm`, `NovelNewPage` and `NovelPage` (Details) are rewired. Frontend only.

**Tech Stack:** React + TypeScript, Vitest + RTL, Radix Popover (`PopoverPanel`), lucide-react, sonner.

**Spec:** `docs/superpowers/specs/2026-11-15-novel-editor-ux-design.md` (read fully; its Tests section is binding).

## Global Constraints

- Branch `feat/novel-editor-ux` (checked out). One commit per task, message English, ending with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. No push, no PR.
- TDD every task: test → fail for the right reason → implement → green. Query by role/label; tooltips via `expectTooltip`; CSS via `src/test/css.ts`; Select via `pickOption`.
- Follow `CLAUDE.md` Frontend rules and `docs/ui/screen-layout.md`:
  - at most 1 primary per screen;
  - orange for actions, purple for state, red only for delete/error;
  - controls 32/40/48 px;
  - mobile-first `min-width: 521px/761px/1024px` only;
  - no `height`/`padding` on button selectors in component CSS;
  - icon-only buttons have `aria-label` + `<Tip>`;
  - popovers through `PopoverPanel`;
  - forms in a portal call `e.stopPropagation()` on submit.
- Admin strings English. No API, DB or backend changes.
- Edit with the editor tools (no Python/sed rewrites). Long commands run under `timeout`. Leave nothing running in the background (no watchers, dev servers or JVMs).
- From `frontend/`: `npx vitest run <path>`, then full `npx vitest run`, then `npx tsc -b`. At the end, from the repo root: `timeout 600 mvn -q test -Dskip.npm`.

## Review Focus

1. A 25,000-char chapter: typing stays responsive. Auto-grow and counts are debounced or cheap, and there is no layout thrash per keystroke — Task 4 test that resize runs at most once per animation frame or input.
2. Unsaved changes, then Publish: never possible. The button is disabled with "Save first" — Task 4 test.
3. Find & replace with an empty query, or a query not found: the counter shows "0 of 0", and the buttons are disabled, without crashing — Task 7 test.
4. A screenshot (non-text) chapter: no original panel and no "of the original" ratio; its page section still works — Tasks 3 and 5 tests.
5. TagInput with pasted "a, b, , A": it adds `a` and `b` only (trimmed, deduped case-insensitively, empty ones dropped) — Task 1 test.

---

### Task 1: `TagInput`

**Files:** create `frontend/src/components/ui/TagInput.tsx`, `TagInput.css`, `TagInput.test.tsx`.

**Interfaces — Produces:** `TagInput({ id, value, onChange, suggestions, max = 10, maxLength = 40, 'aria-describedby', 'aria-invalid' }: { id: string; value: string[]; onChange: (tags: string[]) => void; suggestions: string[]; max?: number; maxLength?: number; ... })`.

- [ ] Tests per spec F2:
  - Enter and comma add a tag; pasting a comma list adds each;
  - × (`aria-label="Remove tag <name>"`) and Backspace on an empty input remove a tag;
  - tags are deduped case-insensitively and trimmed;
  - the input is disabled at max, with the hint "At most 10 tags.";
  - `maxLength` is enforced;
  - suggestions filter while typing and are picked with the keyboard (Arrow/Enter) and the mouse;
  - already-chosen tags are not suggested.
- [ ] FAIL → implement. Reuse `Combobox`'s list and keyboard pattern or its popover; chips use the badge look with `--brand-2-border` outlines. → green.
- [ ] Commit `feat: TagInput with chips and suggestions`.

### Task 2: Novel form — same in Create and Edit, sections, chip tags, labels

**Files:** `components/novel/NovelForm.tsx` (+ css, tests), `pages/NovelNewPage.tsx` (+ tests), `pages/NovelPage.tsx` Details tab (+ tests).

**Interfaces — Consumes:** `TagInput` (Task 1). Tags state becomes `string[]`; the request payload keeps the shape the API takes today. Check `api/novels.ts`: if the API takes an array, send the array; do not change the API.

- [ ] Tests per spec F1–F4:
  - section headings Basics, About, Links, Translation, in order;
  - CSS two columns at `min-width: 1024px` with the cover column;
  - the Description shows a character count;
  - "(optional)" on Trailer and Translation profile;
  - the disabled Create shows the tooltip "Title is required";
  - Create and Edit both render a sticky `FormActions`;
  - Edit has "Delete novel" inside `FormActions` `start`, and there is no separate delete block;
  - the same form width in both places;
  - the payload sends tags as an array.

  Update the existing tests that type comma tags or look for the old Delete block.
- [ ] FAIL → implement → green.
- [ ] Commit `feat: one grouped novel form for create and edit, chip tags`.

### Task 3: Chapter text helpers + status line

**Files:** create `frontend/src/lib/chapterText.ts` (+ test); modify `pages/ChapterPage.tsx`, `ChapterPage.css`.

**Interfaces — Produces:**
- `paragraphs(text: string): string[]` (blank-line separated, trimmed, empty ones dropped — same rule as the backend `TextSplitter`);
- `countText(text: string): { words: number; characters: number; paragraphs: number }`;
- `paragraphIndexAt(text: string, caret: number): number` (0-based index of the paragraph containing the caret);
- `findMatches(text: string, query: string, matchCase: boolean): { start: number; end: number }[]` (literal, non-overlapping; empty query gives `[]`).

- [ ] Tests:
  - helpers on known texts: CRLF, triple blank lines, a caret at a paragraph boundary, case-insensitive matching;
  - the status line text `3,412 words · … · N paragraphs` (formatted with `toLocaleString('en')`);
  - for text-source chapters `· a/b paragraphs of the original`, `--danger` with the tooltip "The translation may be missing a part" when `a < 0.9 b`;
  - screenshot chapters show no ratio;
  - updates are debounced about 300 ms (fake timers).
- [ ] FAIL → implement → green.
- [ ] Commit `feat: chapter word, character and paragraph counts`.

### Task 4: Chapter bar, auto-grow, save state, actions menu

**Files:** create `components/novel/ChapterBar.tsx` + css + test and `lib/useAutoGrow.ts` + test; modify `pages/ChapterPage.tsx`, `ChapterPage.css`, its tests, and the `BackToTop` mount config in `App.tsx` if the chapter route used `barOn`.

**Interfaces — Produces:**
- `useAutoGrow(ref: RefObject<HTMLTextAreaElement>, value: string): void` (height = max(60vh, scrollHeight); runs on value change, mount and `ResizeObserver` width change, at most once per animation frame);
- `ChapterBar` props: `{ nav: ReactNode; title: string; badges: ReactNode; saveState: SaveState; canSave: boolean; onSave(); publish?: { onPublish(); disabledReason: string | null }; menuItems: { label: string; onSelect(); danger?: boolean; disabled?: boolean }[]; tools?: ReactNode }`;
- `type SaveState = { kind: 'idle' } | { kind: 'dirty' } | { kind: 'saving' } | { kind: 'saved' | 'autosaved'; at: Date }`.

- [ ] Tests per spec E1 and E3:
  - the textarea grows and has no inner scroll (stub `scrollHeight`);
  - at most one `.button--primary` in each state (clean Draft, dirty Draft, clean Published, dirty Published);
  - Publish is disabled with the tooltip "Save first" while dirty;
  - the ⋯ menu (`aria-label="Chapter actions"`) has the right items per state: Translate/Translate again (red, confirm), Unpublish, Reload original;
  - the save-state text goes Unsaved changes → Saving… → Saved HH:mm, and Auto-saved HH:mm after `AUTO_SAVE_MS` (fake timers), inside `aria-live="polite"`;
  - Ctrl/⌘+S still saves;
  - `‹ ›`, the unsaved-changes guard and Fetch & translate next are unchanged;
  - at ≤ 520 px (CSS) Publish is the first menu item and the save-state text sits under the bar;
  - the bottom `FormActions` is gone from the chapter page.
- [ ] FAIL → implement → green.
- [ ] Commit `feat: sticky chapter bar with save state and an actions menu; editor grows with its text`.

### Task 5: Reading width and the aligned original

**Files:** create `components/novel/OriginalPanel.tsx` + css + test; modify `pages/ChapterPage.tsx`, `ChapterPage.css`.

**Interfaces — Consumes:** `paragraphs`, `paragraphIndexAt` (Task 3). **Produces:** `OriginalPanel({ language: 'en' | 'th'; text: string; activeIndex: number | null })`.

- [ ] Tests per spec E4:
  - CSS: the editor has `max-width: 72ch` and `font-size: 1.0625rem`;
  - the original renders as `<p>` items;
  - the caret in translated paragraph 3 (fire select/keyup/click with `selectionStart`) marks original paragraph 3 (`aria-current="true"` plus the tint class) and calls `scrollIntoView({ block: 'nearest' })` on it only, never on the page;
  - below 1024 px it is a closed disclosure "Original (English)" (matchMedia stub);
  - it is only shown where it is today (text-source chapters).
- [ ] FAIL → implement → green.
- [ ] Commit `feat: reading-width editor with the original aligned by paragraph`.

### Task 6: Phone — text first

**Files:** `pages/ChapterPage.tsx`, `ChapterPage.css`, tests.

- [ ] Tests per spec E5:
  - label, title and "Translated by …" sit in `<details>` "Chapter details";
  - it is closed below 761 px and open from 761 px (matchMedia stub);
  - the state is remembered in `localStorage` `chapter-details-open` (with try/catch; a throwing storage still renders);
  - the published note is one muted line, not an `Alert`.
- [ ] FAIL → implement → green.
- [ ] Commit `feat: chapter details collapse on phones so the text comes first`.

### Task 7: Find & replace, scene break

**Files:** create `components/novel/FindReplace.tsx` + css + test; modify `pages/ChapterPage.tsx` (bar `tools`).

**Interfaces — Consumes:** `findMatches` (Task 3). **Produces:** `FindReplace({ text: string; onChange(text: string): void; textareaRef: RefObject<HTMLTextAreaElement>; onClose(): void })`.

- [ ] Tests per spec E6:
  - the `Search` button (`aria-label="Find and replace"`) and Ctrl/⌘+H open the panel;
  - the counter reads "k of n", and an empty or missing query reads "0 of 0" with the buttons disabled;
  - Next/Previous set the selection range on the textarea and focus it;
  - Match case works;
  - Replace replaces the current match and moves on;
  - Replace all shows a toast "Replaced n" with an Undo action that restores the text, and leaves the chapter dirty;
  - Esc closes and refocuses the textarea;
  - "Insert scene break" (`Minus` icon, `aria-label`) inserts `\n\n***\n\n` at the caret without duplicating blank lines;
  - a form inside the panel (if any) does not submit an outer form.
- [ ] FAIL → implement → green.
- [ ] Commit `feat: find and replace and scene break in the chapter editor`.

### Task 8: Docs and final checks

- [ ] `CLAUDE.md` Frontend: the chapter bar (one primary; Publish disabled while dirty; Translate again red in ⋯), the status line rule (90 % paragraphs), find & replace, `TagInput`, and the novel form sections with Create and Edit identical.
- [ ] `docs/ui/screen-layout.md`: note that the chapter editor uses a sticky **top** action bar instead of the bottom `FormActions`.
- [ ] `PROGRESS.md`: a Vietnamese entry at the end of section 7 (before `## 9.`) linking the spec and this plan.
- [ ] Run full vitest, tsc, and `timeout 600 mvn -q test -Dskip.npm`; report the real counts.
- [ ] Commit `docs: novel editor UX`.
