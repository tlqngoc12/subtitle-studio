# Vietsub editor on phones: keyboard room Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** While the on-screen keyboard is open on a phone, the Vietsub editor shows a smaller video, the English line and the textarea being typed in, instead of a sticky player covering the textarea.

**Architecture:** A hook reads `window.visualViewport`, publishes the visible height as `--vv-height` and says whether the keyboard is open. The editor page tracks "a textarea of the table has focus"; when that, the keyboard and a narrow screen (< 1024 px) are all true, it adds `vedit--typing`, which shrinks the player and sizes the table from `--vv-height`. The table then scrolls the focused row to the top of its own box.

**Tech Stack:** React 19 + TypeScript, Vite, vitest + Testing Library, plain CSS (tokens in `src/styles/tokens.css`).

**Spec:** `docs/superpowers/specs/2026-11-25-vietsub-editor-mobile-keyboard-design.md`

## Global Constraints

- Only below 1024 px and only while the keyboard is open. Desktop (≥ 1024 px, two columns) and a phone with the keyboard closed look and behave exactly as now.
- Keyboard open = a textarea of the editor table has focus **and** `window.innerHeight − visualViewport.height > 150` (constant `KEYBOARD_MIN_PX = 150`).
- Compact player height 110 px (`--vedit-mini-h: 110px`), 16:9, centred, still sticky under the top bar.
- No `visualViewport` (old browsers, jsdom without a stub) → nothing changes, no error.
- Size change of the player is a short transition; none with `prefers-reduced-motion: reduce`.
- No change to save, seek/pause on focus, highlight, the 3 s scroll wait, or focus handling. Focus is never moved.
- Nothing new on screen: brand colours and `docs/ui/screen-layout.md` untouched; 44 px touch targets unchanged.
- English for code, comments, commits and the PR.

## Review Focus

1. Moving focus from one textarea to the next while typing (keyboard stays open) must not flash the full-size player: `typing` stays true across a textarea → textarea move.
2. Tapping the `#` seek button while typing closes the keyboard (blur): the layout returns to normal and the existing seek/scroll still works.
3. The table is read-only while Gemini translates: focusing a read-only textarea must not open compact mode (no keyboard appears, but the rule does not depend on that).
4. Rotating the phone or the Safari address bar collapsing changes `innerHeight`/`visualViewport.height` by less than 150 px: no compact mode without a keyboard.
5. Leaving the page while compact: `--vv-height` is removed from `<html>` so no other page keeps a stale value.

---

### Task 1: `useKeyboardOpen` hook

**Files:**
- Create: `frontend/src/lib/useKeyboardOpen.ts`
- Test: `frontend/src/lib/useKeyboardOpen.test.tsx`

**Interfaces:**
- Produces: `export const KEYBOARD_MIN_PX = 150;` and `export function useKeyboardOpen(): boolean` — true when `window.innerHeight - visualViewport.height > KEYBOARD_MIN_PX`. While mounted it sets `--vv-height` (`${visualViewport.height}px`) on `document.documentElement`, updates on `visualViewport` `resize` and `scroll`, and removes the property on unmount. Without `window.visualViewport` it returns false and sets nothing.

- [ ] **Step 1: Write the failing tests** (stub `window.visualViewport` with an `EventTarget` that has a writable `height`; set `window.innerHeight` with `Object.defineProperty`; follow `lib/useTopbarHeight.test.tsx` for reading the root variable)

```tsx
it('is false and publishes the height when the visible area is the whole window', () => {
  stubViewport({ inner: 844, visible: 844 });
  const { result } = renderHook(() => useKeyboardOpen());
  expect(result.current).toBe(false);
  expect(rootVar('--vv-height')).toBe('844px');
});

it('turns true when the visible area shrinks by more than 150 px, and back', () => {
  const vv = stubViewport({ inner: 844, visible: 844 });
  const { result } = renderHook(() => useKeyboardOpen());
  act(() => vv.resize(500));
  expect(result.current).toBe(true);
  expect(rootVar('--vv-height')).toBe('500px');
  act(() => vv.resize(844));
  expect(result.current).toBe(false);
});

it('stays false for a change of 150 px or less (address bar, rotation)', () => {
  const vv = stubViewport({ inner: 844, visible: 844 });
  const { result } = renderHook(() => useKeyboardOpen());
  act(() => vv.resize(694));
  expect(result.current).toBe(false);
});

it('removes --vv-height on unmount', () => {
  stubViewport({ inner: 844, visible: 600 });
  const { unmount } = renderHook(() => useKeyboardOpen());
  unmount();
  expect(rootVar('--vv-height')).toBe('');
});

it('does nothing without visualViewport', () => {
  vi.stubGlobal('visualViewport', undefined);
  const { result } = renderHook(() => useKeyboardOpen());
  expect(result.current).toBe(false);
  expect(rootVar('--vv-height')).toBe('');
});
```

- [ ] **Step 2: Run to verify they fail**
Run: `cd frontend && npx vitest run src/lib/useKeyboardOpen.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `useKeyboardOpen()` in `frontend/src/lib/useKeyboardOpen.ts`**
`useState` + `useEffect`, same shape as `useTopbarHeight` (apply once, listen, clean up).

- [ ] **Step 4: Run to verify they pass**
Run: `cd frontend && npx vitest run src/lib/useKeyboardOpen.test.tsx`
Expected: 5 passed.

- [ ] **Step 5: Commit**
```bash
git add frontend/src/lib/useKeyboardOpen.ts frontend/src/lib/useKeyboardOpen.test.tsx
git commit -m "feat(vietsub-editor): detect the on-screen keyboard with visualViewport"
```

---

### Task 2: Compact editor layout while typing on a phone

**Files:**
- Modify: `frontend/src/pages/VietsubEditPage.tsx` (the `Editor` render: `<Page className="vedit">` and `.vedit__body`)
- Modify: `frontend/src/pages/VietsubEditPage.css`
- Modify: `frontend/src/components/vietsub/CueEditorTable.tsx`
- Test: `frontend/src/pages/VietsubEditPage.test.tsx`, `frontend/src/pages/VietsubEditPage.css.test.ts`, `frontend/src/components/vietsub/CueEditorTable.test.tsx` (create the last one if it does not exist; otherwise add to it)

**Interfaces:**
- Consumes: `useKeyboardOpen()` from Task 1; `useMediaQuery(query)` from `lib/useMediaQuery.ts`.
- Produces: `CueEditorTable` prop `compact?: boolean` (default false). Page class `vedit--typing` on the `Page` root.

- [ ] **Step 1: Write the failing page tests** (in `VietsubEditPage.test.tsx`, reuse its existing setup that renders the editor with lines; stub `visualViewport` as in Task 1 and `matchMedia` so `(min-width: 1024px)` matches or not)

```tsx
it('adds vedit--typing while a line is focused, the keyboard is open and the screen is narrow', async () => {
  const vv = stubViewport({ inner: 844, visible: 844 });
  stubWide(false);
  renderEditor();
  const box = await screen.findByLabelText('Line 1 text');
  act(() => box.focus());
  act(() => vv.resize(500));
  expect(document.querySelector('.vedit')).toHaveClass('vedit--typing');
});

it('keeps vedit--typing when focus moves to the next line', async () => {
  /* as above, then */ act(() => screen.getByLabelText('Line 2 text').focus());
  expect(document.querySelector('.vedit')).toHaveClass('vedit--typing');
});

it('drops vedit--typing when the line loses focus to something outside the table', async () => {
  /* as above, then */ act(() => (document.activeElement as HTMLElement).blur());
  expect(document.querySelector('.vedit')).not.toHaveClass('vedit--typing');
});

it('never adds vedit--typing on a wide screen', async () => {
  /* stubWide(true), focus + resize(500) */
  expect(document.querySelector('.vedit')).not.toHaveClass('vedit--typing');
});

it('never adds vedit--typing while the lines are read-only (translating)', async () => {
  /* video in translation (existing translating fixture), focus a line + resize(500) */
  expect(document.querySelector('.vedit')).not.toHaveClass('vedit--typing');
});
```

- [ ] **Step 2: Write the failing CSS tests** (in `VietsubEditPage.css.test.ts`, with its `rule()` helper)

```ts
it('shrinks the player to 110 px tall, centred, while typing', () => {
  expect(css).toMatch(/--vedit-mini-h:\s*110px/);
  const r = rule('.vedit--typing .vedit__player');
  expect(r).toMatch(/width:\s*calc\(var\(--vedit-mini-h\)\s*\*\s*16\s*\/\s*9\)/);
  expect(r).toMatch(/margin-inline:\s*auto/);
});

it('sizes the table from the visible height while typing', () => {
  expect(rule('.vedit--typing .vedit__body')).toMatch(/--cue-table-max:\s*calc\(var\(--vv-height/);
});
```

- [ ] **Step 3: Write the failing table test** (in `CueEditorTable.test.tsx`)

```tsx
it('scrolls the focused row to the top of the box when compact', () => {
  // render with compact={false}, focus line 5, rerender with compact={true}
  // stub getBoundingClientRect: box top 100, thead height 30, row 5 top 400
  expect(box.scrollTop).toBe(initialScrollTop + 400 - 100 - 30);
});

it('does not move focus when it scrolls', () => {
  expect(document.activeElement).toBe(screen.getByLabelText('Line 5 text'));
});
```

- [ ] **Step 4: Run to verify they fail**
Run: `cd frontend && npx vitest run src/pages/VietsubEditPage src/components/vietsub`
Expected: the new tests FAIL, the existing ones pass.

- [ ] **Step 5: Implement the page**
In `Editor`: `const [typing, setTyping] = useState(false)`; `onFocus`/`onBlur` on the `.vedit__body` div. Focus on a `HTMLTextAreaElement` that is not `readOnly` → true. Blur whose `relatedTarget` is not a textarea inside `.vedit__body` → false. `const keyboard = useKeyboardOpen()`, `const wide = useMediaQuery('(min-width: 1024px)')`, `const compact = typing && keyboard && !wide`. Add `vedit--typing` to the `Page` className when `compact`. Pass `compact` to `CueEditorTable`.

- [ ] **Step 6: Implement the CSS** in `VietsubEditPage.css`
`.vedit { --vedit-mini-h: 110px; }`. `.vedit--typing .vedit__player { width: calc(var(--vedit-mini-h) * 16 / 9); margin-inline: auto; }` with a short width transition using the existing motion tokens, disabled under `@media (prefers-reduced-motion: reduce)`. `.vedit--typing .vedit__body { --cue-table-max: calc(var(--vv-height, 100dvh) - var(--topbar-h, 56px) - var(--vedit-mini-h) - var(--space-8)); }`. Place both rules after the `@media (min-width: 1024px)` block so they win while compact (compact is never true at ≥ 1024 px). Check that `VideoPlayer` keeps 16:9 from its width; if it needs the height, set it from `--vedit-mini-h` as well.

- [ ] **Step 7: Implement the table scroll** in `CueEditorTable.tsx`
New prop `compact?: boolean`. A `useEffect` on `[compact, focused row]`: when `compact` and a row of this table has focus, set `box.scrollTop += rowTop - boxTop - theadHeight` (from `getBoundingClientRect`). Use the box's own `scrollTop`, not `scrollIntoView`, so Safari does not pan the page. Track the focused row in state (or a counter bumped by `focusRow`) so the effect runs again when focus moves to another line while compact. Keep `holding` as it is: compact scrolling does not end or start the 3 s wait.

- [ ] **Step 8: Run to verify they pass**
Run: `cd frontend && npx vitest run src/pages/VietsubEditPage src/components/vietsub src/lib/useKeyboardOpen.test.tsx`
Expected: all pass.

- [ ] **Step 9: Run the whole frontend suite and the type check**
Run: `cd frontend && npx vitest run && npx tsc -b --noEmit`
Expected: all test files pass (known flaky when the machine is busy: `VietsubPage`, `HomePage`, `WorkEditPage` — rerun those alone), no type errors. Do not `git add` `frontend/tsconfig.tsbuildinfo`.

- [ ] **Step 10: Commit**
```bash
git add frontend/src/pages/VietsubEditPage.tsx frontend/src/pages/VietsubEditPage.css frontend/src/pages/VietsubEditPage.test.tsx frontend/src/pages/VietsubEditPage.css.test.ts frontend/src/components/vietsub/CueEditorTable.tsx frontend/src/components/vietsub/CueEditorTable.test.tsx
git commit -m "feat(vietsub-editor): smaller video and a fitted table while typing on a phone"
```

---

### Task 3: Docs and PR

**Files:**
- Modify: `PROGRESS.md` (done list: one entry for this change, with "needs a try on a real iPhone")

- [ ] **Step 1: Add the PROGRESS.md entry and commit**
```bash
git add PROGRESS.md
git commit -m "docs: progress for the Vietsub editor keyboard layout"
```

- [ ] **Step 2: Push and open the PR**
`git push -u origin feat/vietsub-editor-mobile-keyboard`, then `gh pr create --base main` with an English title and body: summary, tests run and results, link to the spec and this plan, and a note that it was not tried on a real iPhone. Do not merge. Do not deploy.
