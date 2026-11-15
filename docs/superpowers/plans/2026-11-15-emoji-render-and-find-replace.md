# Emoji in chapter images, no scene-break button, sticky find & replace — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. All tasks go on ONE branch `fix/emoji-and-find-replace` and ONE PR.

**Goal:** Emoji in a chapter render as black line glyphs instead of tofu boxes; the "Insert scene break" tool is gone; find & replace stays visible while scrolling and scrolls the page to each match.

**Architecture:** The renderer keeps Literata and falls back, per code point, to a bundled monochrome Noto Emoji font through `AttributedString` font runs. The find panel moves inside the sticky `ChapterBar` (new `below` slot) and, after selecting a match, scrolls the window so the match sits just under the panel, using the `textarea-caret` library to locate it.

**Tech Stack:** Java 21 / Java2D (`AttributedString`, `TextLayout`), JUnit 5 + AssertJ; React + TypeScript, Vitest + Testing Library, lucide-react.

**Spec:** Scope agreed in chat on 2026-11-15 (no separate spec file):
1. Emoji: option 1 — bundle Noto Emoji (monochrome, OFL), use it where Literata has no glyph, scale ×1.1, strip skin-tone modifiers U+1F3FB–1F3FF and U+FE0F, bump renderer `VERSION` 6 → 7.
2. Remove the "Insert scene break" button and `insertSceneBreak`; keep backend `SceneBreak`.
3. Find & replace: panel sticks with the chapter bar; Next/Previous/Replace scroll the page to the match; Previous/Next become icon buttons (↑ ↓) with tooltips; Enter in "Replace with" = Replace.

## Global Constraints

- UI copy and code identifiers in English; colours unchanged (existing `.button` / `IconButton` styles — orange `#F39A42` + purple `#D9A1D9` only).
- Font file: `src/main/resources/fonts/NotoEmoji.ttf`, from `https://github.com/google/fonts/raw/main/ofl/notoemoji/NotoEmoji%5Bwght%5D.ttf` (~1.9 MB). Its OFL notice is appended to `src/main/resources/fonts/OFL.txt` (copyright line: `Copyright 2013 Google LLC`).
- Emoji scale: `EMOJI_SCALE = 1.1f`. Stripped code points: U+1F3FB–U+1F3FF, U+FE0E, U+FE0F, U+200D.
- `NovelRenderer.VERSION = 7`.
- New npm dependency: `textarea-caret` (latest 3.x) — add a local `declare module 'textarea-caret'` type file since it ships no types.
- Commands: backend `mvn -q test -Dtest=<Class>`; frontend `cd frontend && npm test -- <file>`; full check before PR: `mvn -q test` and `cd frontend && npm test && npm run build`.

## Review Focus

1. Emoji inside the **chapter title / heading** (bold title font) must also fall back — test via the heading path, not only body paragraphs.
2. A **ZWJ sequence** (e.g. 👨‍👩‍👧) must not leave a tofu box for U+200D — it renders as separate glyphs.
3. A character **neither font has** (e.g. a rare CJK char) stays in Literata and must not throw.
4. Next on a match **already visible** must not jump the page; only an off-screen match scrolls.
5. **Replace** (text changes, textarea re-grows) must still scroll to the following match after the re-render.

---

### Task 1: Emoji fallback in `NovelRenderer`

**Files:**
- Create: `src/main/resources/fonts/NotoEmoji.ttf`
- Modify: `src/main/resources/fonts/OFL.txt`
- Modify: `src/main/java/com/subtitlestudio/novel/render/NovelRenderer.java`
- Test: `src/test/java/com/subtitlestudio/novel/render/NovelRendererTest.java`

**Interfaces:**
- Produces (package-private, for tests): `static String clean(String s)` — NFC + strip the code points listed in Global Constraints (replaces the current `nfc` everywhere it is used); `AttributedString styled(String text, Font base)` — whole string in `base`, each code point that `base.canDisplay` is false for **and** the emoji font can display gets the emoji font derived at `base.getSize2D() * EMOJI_SCALE` (same style as `base`).

- [ ] **Step 1: Write the failing tests**

```java
@Test
void stripsSkinTonesAndJoiners() {
    assertThat(NovelRenderer.clean("✌🏻 👍🏿 ❤️ 👨‍👩‍👧")).isEqualTo("✌ 👍 ❤ 👨👩👧");
}

@Test
void everyCharacterOfAnEmojiLineHasAGlyph() {
    String line = NovelRenderer.clean("Ừ, nhưng chỉ trong mấy bộ truyện khác của tác giả thôi 😜, đùa đấy ✌🏻 ❤️ 👨‍👩‍👧");
    assertAllDrawable(renderer.styled(line, renderer.font()));
    // the heading uses the bold title font
    assertAllDrawable(renderer.styled(NovelRenderer.heading(new RenderInput("T", 8, null, "Đùa 😜", "x", "w")),
            renderer.font().deriveFont(java.awt.Font.BOLD)));
}

@Test
void aCharacterNoFontHasStaysInTheBodyFont() {
    AttributedString s = renderer.styled("ab", renderer.font()); // private-use char
    var it = s.getIterator();
    it.setIndex(1);
    assertThat(it.getAttribute(TextAttribute.FONT)).isEqualTo(renderer.font());
}

@Test
void rendersAnEmojiChapterWithoutError() {
    assertThat(renderer.render(input("Đùa đấy 😜 ✌🏻"), PageFormat.ALL.getFirst())).hasSize(1);
}
```

`assertAllDrawable` is a private helper in the test: walk the iterator by code point and assert `((Font) it.getAttribute(TextAttribute.FONT)).canDisplay(cp)` for every code point.

- [ ] **Step 2: Run** `mvn -q test -Dtest=NovelRendererTest` — expect compile failure (`clean`, `styled` missing).

- [ ] **Step 3: Implement**
  - Download the font (URL in Global Constraints) to `src/main/resources/fonts/NotoEmoji.ttf`; append its OFL header + licence to `OFL.txt`.
  - In `NovelRenderer`: load the emoji font next to Literata (generalise `load()` to `load(String resource)`); add `EMOJI_SCALE`; add `clean` and `styled`; `layouts(...)` builds its `AttributedString` with `styled(text, font)`; the watermark measures and draws through `styled(text, small)` (`new TextLayout(iterator, frc)` / `drawString(iterator, x, y)`); `heading`, `paragraphs` and the watermark text use `clean` instead of `nfc`; `VERSION = 7`.

- [ ] **Step 4: Run** `mvn -q test -Dtest='NovelRendererTest,RenderCacheTest'` — expect PASS. Also render the sample line to a PNG in a scratch test or `jshell` and look at it: emoji black, roughly cap-height, no boxes.

- [ ] **Step 5: Commit** `fix: draw emoji in chapter images with a Noto Emoji fallback`

---

### Task 2: Remove "Insert scene break"

**Files:**
- Modify: `frontend/src/pages/ChapterPage.tsx` (lines ~41, 122–137, 524; `Minus` import)
- Modify: `frontend/src/lib/chapterText.ts` (remove `insertSceneBreak`, lines ~55–70)
- Modify: `frontend/src/lib/chapterText.test.ts` (remove the `insertSceneBreak` describe + import)
- Modify: `frontend/src/pages/ChapterPage.test.tsx` (remove the "inserts a scene break" test; drop the scene-break lines from the tooltip and disabled tests ~1447, ~1453)
- Modify: `frontend/src/components/novel/ChapterBar.tsx:51` (doc comment: "find and replace")

- [ ] **Step 1: Update the test** — in `ChapterPage.test.tsx` add `expect(screen.queryByRole('button', { name: 'Insert scene break' })).not.toBeInTheDocument();` to the tooltip test; delete the insert test.
- [ ] **Step 2: Run** `cd frontend && npm test -- ChapterPage chapterText` — expect the new assertion to FAIL.
- [ ] **Step 3: Remove the button, `addSceneBreak`, `caretAfterBreak` + its layout effect, `insertSceneBreak`, and unused imports.** Backend `SceneBreak` stays untouched.
- [ ] **Step 4: Run** `cd frontend && npm test -- ChapterPage chapterText && npx tsc --noEmit` — expect PASS.
- [ ] **Step 5: Commit** `feat: remove the insert scene break tool`

---

### Task 3: Sticky find & replace that scrolls to the match

**Files:**
- Create: `frontend/src/lib/scrollToMatch.ts`, `frontend/src/lib/scrollToMatch.test.ts`, `frontend/src/types/textarea-caret.d.ts`
- Modify: `frontend/package.json` (+ lock) — add `textarea-caret`
- Modify: `frontend/src/components/novel/ChapterBar.tsx`, `ChapterBar.css` — new prop `below?: ReactNode`
- Modify: `frontend/src/components/novel/FindReplace.tsx`, `FindReplace.css`, `FindReplace.test.tsx`
- Modify: `frontend/src/pages/ChapterPage.tsx` — pass `<FindReplace …/>` as `below` instead of rendering it after the bar

**Interfaces:**
- Produces: `scrollMatchIntoView(el: HTMLTextAreaElement, index: number, coveredTop: number): void` in `lib/scrollToMatch.ts`. `coveredTop` = viewport y below which the page is not covered by sticky UI. Logic: `const { top, height } = getCaretCoordinates(el, index)`; `const y = el.getBoundingClientRect().top + top - el.scrollTop` (viewport y of the match line); if `y >= coveredTop && y + height <= window.innerHeight` do nothing; else `window.scrollTo({ top: window.scrollY + y - coveredTop - 2 * height })`.
- Produces: `ChapterBar` prop `below?: ReactNode`, rendered last inside `.chapter-bar` as `<div className="chapter-bar__below">{below}</div>` only when set; CSS `flex-basis: 100%` so it takes its own row inside the sticky bar.

- [ ] **Step 1: Write failing tests**
  - `scrollToMatch.test.ts` (mock `textarea-caret` with `vi.mock` returning `{ top: 900, height: 20 }`, stub `el.getBoundingClientRect` → `{ top: 100 }`, `window.innerHeight = 800`, `window.scrollY = 0`, spy `window.scrollTo`):
    - `scrolls an off-screen match to just under the covered area` → with `coveredTop = 150`, `scrollTo` called with `{ top: 100 + 900 - 150 - 40 }` (= 810).
    - `leaves a visible match alone` → caret `{ top: 200, height: 20 }` → `scrollTo` not called.
    - `scrolls a match hidden under the sticky bar` → caret `{ top: 0, height: 20 }`, `coveredTop = 150` → `scrollTo` called with `{ top: 100 - 150 - 40 }`.
  - `FindReplace.test.tsx`:
    - `Previous and Next are icon buttons with tooltips` → `getByRole('button', { name: 'Previous match' })`, `'Next match'` exist (update existing tests that click `Previous` / `Next` to these names).
    - `Enter in Replace with replaces the selected match` → type query, press Enter in Find (selects 1st), type replacement, press Enter in "Replace with" → `onChange` text has the first occurrence replaced.
    - `selecting a match scrolls it into view` → `vi.mock('../../lib/scrollToMatch')`, click Next → `scrollMatchIntoView` called with the textarea and the match start.
  - `ChapterPage.test.tsx`: `the find panel sits inside the sticky chapter bar` → after opening it, `screen.getByRole('search', { name: 'Find and replace' }).closest('.chapter-bar')` is not null.
- [ ] **Step 2: Run** `cd frontend && npm test -- scrollToMatch FindReplace ChapterPage` — expect FAIL.
- [ ] **Step 3: Implement**
  - `npm i textarea-caret`; `types/textarea-caret.d.ts`: default export `(el: HTMLTextAreaElement | HTMLInputElement, position: number) => { top: number; left: number; height: number }`.
  - `scrollToMatch.ts` per Interfaces.
  - `FindReplace`: hold a ref on the root `div`; in `select(index)` use `el.focus({ preventScroll: true })`, then `setSelectionRange`, then `scrollMatchIntoView(el, m.start, root.getBoundingClientRect().bottom)` (the panel's bottom = bottom of the sticky bar). The post-Replace effect goes through `select`, so it scrolls too. Previous/Next → `IconButton` (`ChevronUp` "Previous match", `ChevronDown` "Next match", `size="s"`). "Replace with" Enter → `preventDefault()` then `replaceCurrent()`.
  - `FindReplace.css`: inside the bar it no longer needs its own `margin-bottom`; keep it compact on phones (fields stay stacked, the button row does not wrap Previous/Next apart from each other).
  - `ChapterBar` + CSS: `below` slot per Interfaces.
  - `ChapterPage`: `below={finding ? <FindReplace … /> : undefined}`; delete the old render after the bar.
- [ ] **Step 4: Run** `cd frontend && npm test && npm run build` — expect PASS. Then run the app (port 8080), open a long chapter, Ctrl+H, search a word that appears far down, press Enter repeatedly: the panel stays visible and each match shows just below it; check at 375 px width too. Take a screenshot for the PR.
- [ ] **Step 5: Commit** `feat: keep find and replace in the sticky bar and scroll to each match`

---

### Task 4: Chapter page head — meta lines into Chapter details

Agreed in chat (UI review of the chapter page): the count line and the published note move into **Chapter details**; the note's copy is corrected; the find tool button is a ghost button; the model line matches the other meta lines. Not in scope: hiding the bar title at the top, the Published badge colour.

**Files:**
- Modify: `frontend/src/pages/ChapterPage.tsx` (count `<p>` ~533–536, note ~538–543, `<details>` ~568–619, Find `IconButton` ~522)
- Modify: `frontend/src/pages/ChapterPage.css` (`.chapter-count`, `.chapter-note`, `.chapter-details__model`)
- Test: `frontend/src/pages/ChapterPage.test.tsx` (copy at ~426, 876, 884, 889; position test ~1341)

**Layout inside `<details className="chapter-details">`, top to bottom:**
1. `DisclosureSummary` "Chapter details" — when `ParagraphShare` is short (< 90 %), the summary also shows the red share (`chapter-count__warn`, same Tip "The translation may be missing a part") so the warning is visible while the details are closed (they start closed on phones).
2. Published note (only when published), `chapter-note muted`.
3. The existing `chapter-meta` fields (unchanged).
4. A meta block `div.chapter-details__meta` (`display: grid; gap: var(--space-1)`; every line `font-size: var(--step--1)`, `margin: 0`): the count line (`chapter-count`, unchanged content incl. `ParagraphShare`), then "Translated by …" when shown.

**Copy (exact):**
- Text chapter: `This chapter is published: only the text, label and title can be edited. Unpublish to translate again.`
- Screenshot chapter: `This chapter is published: only the text, label and title can be edited. Unpublish to change pages or translate again.`

**Find button:** the `IconButton` "Find and replace" gets `className="button--ghost"`; with `aria-pressed="true"` it shows the selected style (purple fill `--brand-2` + `--brand-2-ink` border, as the project's "selected" rule). Add the `[aria-pressed='true']` rule in `ChapterBar.css` scoped to `.chapter-bar__actions .button--ghost`.

- [ ] **Step 1: Update/add tests** in `ChapterPage.test.tsx`:
  - the four copy assertions use the new strings;
  - `the count line and the published note sit inside Chapter details` → `screen.getByText(/paragraphs? ·|words ·/)` and `screen.getByText(/This chapter is published/)` both have `.closest('details.chapter-details')` not null (replace the old position test at ~1341 if it asserts the old place);
  - `a short translation shows its warning on the closed details summary` → closed details + short share → the summary contains an element with class `chapter-count__warn`;
  - `the find tool is a ghost button` → `getByRole('button', { name: 'Find and replace' })` has class `button--ghost`.
- [ ] **Step 2: Run** `cd frontend && npm test -- ChapterPage` — expect the new/changed tests to FAIL.
- [ ] **Step 3: Implement** the layout, copy, CSS and ghost button above. Remove now-unused margins on `.chapter-count` / `.chapter-note` outside the meta block.
- [ ] **Step 4: Run** `cd frontend && npm test -- ChapterPage && npm run build` — PASS. Screenshot the page head (published chapter, desktop and 375 px, details open and closed) for the PR.
- [ ] **Step 5: Commit** `feat: move chapter counts and the published note into Chapter details`

---

### Task 5: Docs and PR

- [ ] Add a `### 2026-11-15: Emoji trong ảnh chương, bỏ scene break, find & replace dính thanh ✅` entry to `PROGRESS.md` (section 8, after the last 2026-11-15 entry): 3 bullets, mention `VERSION 7` re-renders cached images and the new `NotoEmoji.ttf`.
- [ ] Full check: `mvn -q test` and `cd frontend && npm test && npm run build` — all pass.
- [ ] Commit `docs: progress for emoji fallback and find and replace`, push, `gh pr create --base main` (English title/body: summary, test commands + results, screenshots of the rendered emoji line and the sticky find panel, link to this plan). Send the PR link; do not merge.
