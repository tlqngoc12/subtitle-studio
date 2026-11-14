# Border contrast, badge icons and toast format Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Light-theme brand borders reach 3:1, orange/purple status badges carry icons, and every toast follows one format and the app's theme tokens.

**Architecture:** Two new CSS tokens replace `--brand`/`--brand-2` in 1 px component borders; badges get lucide icons in place; a `toastError` helper plus source-scan tests enforce toast wording; `AppToaster.css` maps sonner's variables to app tokens.

**Tech Stack:** React 19 + Vite + TypeScript, Vitest + RTL, sonner 2.0.8, lucide-react.

**Spec:** `docs/superpowers/specs/2026-11-14-border-contrast-and-toasts-design.md` (read it first; the tables there are the source of exact strings, hexes and icons).

## Global Constraints

- Branch `fix/public-novel-polish` (already checked out; do not create another). Commit after each task; message English, ending with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Do not push, do not open a PR.
- TDD: write the test, run it and see it fail for the right reason, then implement.
- Brand hexes unchanged: `--brand #f39a42`, `--brand-2 #d9a1d9`. New: `--brand-border #cf6f1a`, `--brand-2-border #a86ea8` (light); `var(--brand)` / `var(--brand-2)` in both dark blocks of `tokens.css` (the `@media (prefers-color-scheme: dark)` block, 4-space indent, and `:root[data-theme='dark']`).
- UI strings in English (admin); public strings Vietnamese and unchanged. Code comments English.
- Icons from `lucide-react` only, `className="icon icon--sm" aria-hidden="true"`.
- Edit files with the editor tools, **not** Python/sed string rewrites (an earlier attempt corrupted a regex backreference that way). Keep the file's existing line endings.
- Test CSS through `src/test/css.ts` (`css` string). Run tests from `frontend/`: `npx vitest run <path>`; full run `npx vitest run`; types `npx tsc -b`.
- Toast position/duration/close button: unchanged.

## Review Focus

1. A forced `data-theme="dark"` while the OS is light: toasts must use the dark tokens (follows from tokens; Task 4 test checks `var(--surface)` etc., not hexes).
2. An error with no hint: `toastError` must not pass an empty `description` (Task 3 test).
3. A very long name in a toast description (playlist, video title): must wrap inside the toast, not overflow (Task 4: `overflow-wrap: anywhere` on the description, CSS test).
4. The Publish "Open site" link inside the description stays a working link and uses `--brand-ink` (Task 4 CSS test; `PublishButton` tests keep passing).
5. Reader settings swatches/size boxes (`ReaderSettings.css`, 2 px orange "checked" borders) switch to `--brand-border` and still read as selected in all reader themes — covered by the Task 1 scan; eyeball in review.

---

### Task 1: Border tokens and the CSS sweep

**Files:**
- Modify: `frontend/src/styles/tokens.css`, every CSS file the scan reports (spec Part 1 §2 lists ≈ 23), `frontend/src/contrast.test.ts`, `frontend/src/brandRoles.test.ts`, `frontend/src/components/ui/Select.test.tsx`

**Interfaces:**
- Produces: tokens `--brand-border`, `--brand-2-border` (used by later CSS).

- [ ] **Step 1: Write the failing tests** in `src/contrast.test.ts`:
  - add to the `it.each` table: `['--brand-border', '--paper', 3]`, `['--brand-border', '--surface', 3]`, `['--brand-2-border', '--paper', 3]`, `['--brand-2-border', '--surface', 3]` (runs for light and dark).
  - new top-level `it('draws component borders with the 3:1 border tokens, never the light brand fills')`: iterate rules with `/([^{}]+)\{([^{}]*)\}/g`; inside each body find declarations `/(?:^|;|\n)\s*(border|border-color)\s*:\s*([^;]*var\((--brand(?:-2)?)\)[^;]*);/g`; skip when the body also matches `background(-color)?\s*:\s*var\(<same token>\)\s*;`; collect the rest as offenders; `expect(offenders).toEqual([])`.
  - `src/brandRoles.test.ts`: "orange border at rest" now expects `var(--brand-border)`; "hover borders are orchid" expects `var(--brand-2-border)`.
  - `components/ui/Select.test.tsx`: `.select__trigger:hover:not(:disabled)` expects `border-color: var(--brand-2-border)`.
- [ ] **Step 2: Run** `npx vitest run src/contrast.test.ts src/brandRoles.test.ts src/components/ui/Select.test.tsx` — expect FAIL: missing token `--brand-border`, an offenders list, old-token asserts.
- [ ] **Step 3: Implement** — add the two tokens (light in `:root` after `--brand-2-ink`, with a one-line comment on why; dark in both dark blocks), then change each offender reported by the scan from `var(--brand)` → `var(--brand-border)` and `var(--brand-2)` → `var(--brand-2-border)`. Leave `border-left`, `outline`, and same-colour-filled rules alone.
- [ ] **Step 4: Run** the three files, then `npx vitest run` — expect all PASS.
- [ ] **Step 5: Commit** `style: 3:1 border tokens for brand-coloured component borders`.

### Task 2: Icons on done / in-progress badges

**Files:**
- Create: `frontend/src/styles/badgeIcons.test.ts`, `frontend/src/components/novel/StatusBadges.test.tsx`
- Modify: `components/novel/StatusBadges.tsx`, `PageRow.tsx`, `ChapterList.tsx`, `NotebookView.tsx`, `WattpadParts.tsx`, `WattpadPreviewParts.tsx`, `pages/NovelPage.test.tsx`

**Interfaces:**
- Produces: in `StatusBadges.tsx`, `type Badge = { label: string; tone: string; icon?: LucideIcon }` (module-private).

- [ ] **Step 1: Write the failing tests.**
  - `src/styles/badgeIcons.test.ts`: `import.meta.glob('/src/**/*.tsx', { query: '?raw', import: 'default', eager: true })`; skip `*.test.tsx`; for every match of `/<(span|p) className="badge badge--(?:done|progress)"[^>]*>([\s\S]*?)<\/\1>/g` require `/^\s*<[A-Z]\w*\s+className="icon/` on group 2; `expect(missing).toEqual([])`. Plus `it('finds the badges it checks')`: joined sources match `/<span className="badge badge--done"/`.
  - `StatusBadges.test.tsx`: render `<StatusBadges translation="TRANSLATING" publish="PUBLISHED" />`; `screen.getByText('Published').querySelector('svg')` and same for `'Translating…'` are not null.
  - `pages/NovelPage.test.tsx` test "chapter list shows ⚠ 2…": rename to "…warning icon and 2…"; `getByLabelText('2 page(s) may be incomplete')` has text `2` and an `svg`; second row has no `queryByLabelText(/may be incomplete/)`.
- [ ] **Step 2: Run** the three files — expect FAIL listing ChapterList, NotebookView, PageRow ×2, WattpadParts, WattpadPreviewParts; StatusBadges without svg.
- [ ] **Step 3: Implement** icons per the spec table (CircleCheck, LoaderCircle, RectangleHorizontal, TriangleAlert, Trash2). `StatusBadges` renders `{icon && <Icon …/>}{label}` for both badges (including the one inside `Tip`). ChapterList: `<TriangleAlert …/>{c.suspectPages}` replaces `⚠ {c.suspectPages}`.
- [ ] **Step 4: Run** `npx vitest run` and `npx tsc -b` — PASS / clean.
- [ ] **Step 5: Commit** `feat: icons on done and in-progress badges`.

### Task 3: Toast wording, types and `toastError`

**Files:**
- Create: `frontend/src/lib/toast.ts`, `frontend/src/lib/toast.test.ts`, `frontend/src/styles/toastFormat.test.ts`
- Modify: every caller in the spec Part 2 table (`FanficsTab`, `NovelMenu`, `WattpadParts`, `PhotoPostDialog`, `PublishButton`, `SaveToPlaylist`, `PeopleDialog`, `ChapterPage`, `HomePage`, `PlaylistEditPage`, `ProfilePage`, `ProfilesPage`, `VietsubEditPage`, `VietsubPage`, `WorkEditPage`) and their tests that assert toast strings (`grep -rn "toast\." frontend/src --include=*.test.tsx`).

**Interfaces:**
- Consumes: `ErrorMessage` from `lib/errors.ts` (`{ title: string; hint?: string }`).
- Produces: `export function toastError(message: ErrorMessage): void` in `lib/toast.ts` — calls `toast.error(title without one trailing '.', hint ? { description: hint } : undefined)`.

- [ ] **Step 1: Write the failing tests.**
  - `lib/toast.test.ts` (mock `sonner` with `vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))`): `toastError({ title: 'Could not save.', hint: 'Try again.' })` → `toast.error('Could not save', { description: 'Try again.' })`; `toastError({ title: 'Failed' })` → `toast.error('Failed', undefined)`.
  - `styles/toastFormat.test.ts` (scan non-test `src/**/*.{ts,tsx}` raw): (a) no `/\btoast\(/` and no `toast.message(`; (b) no `toast.(success|info|warning|error)\(\s*['"`][^'"`]*[.…]['"`]` (title literal ending in `.` or `…`); (c) no `toast.success(\s*`[^`]*\$\{` (template-literal title with a value); (d) guard: at least one `toast.success(` found.
  - Update caller tests to the new title/description/type per the spec table (e.g. FanficsTab: `toast.success('Fanfics refreshed', { description: 'Updated 3' })`, `toast.warning('Some fanfics failed to refresh', { description: 'Updated 2 · Failed 1' })`).
- [ ] **Step 2: Run** `npx vitest run src/lib/toast.test.ts src/styles/toastFormat.test.ts` plus the updated caller tests — expect FAIL (no module; scan offenders; old strings).
- [ ] **Step 3: Implement** `toastError`, then each caller exactly per the spec table: specifics in `{ description }`, types per rule 4 (start → `toast.info`, partial/no-op → `toast.warning`), all error toasts via `toastError` (PeopleDialog `PERSON_IN_USE` → `toastError({ title: 'Person is in use', hint: e.detail })`; failed publish → `toastError({ title: 'Publishing failed', hint: next.error ?? undefined })`; WorkEditPage → `toastError({ title: "Could not add the Badge's people", hint: errorMessage(e).title })`). Public `PublicNovelPage` toasts unchanged.
- [ ] **Step 4: Run** `npx vitest run` and `npx tsc -b` — PASS / clean.
- [ ] **Step 5: Commit** `fix: one toast format: short titles, details in the description, types by meaning`.

### Task 4: Toast theme tokens, docs

**Files:**
- Modify: `frontend/src/components/AppToaster.css`, `AppToaster.tsx` (doc comment only, unless `theme` must change), `CLAUDE.md`, `PROGRESS.md`
- Create: `frontend/src/components/AppToaster.css.test.ts`

- [ ] **Step 1: Write the failing test** `AppToaster.css.test.ts` (read `css`): a rule for `[data-sonner-toaster]` (or the toast selector) sets `--normal-bg: var(--surface)`, `--normal-text: var(--ink)`, `--normal-border: var(--rule)`; a description rule (`[data-sonner-toast].toast [data-description]`) has `color: var(--muted)` and `overflow-wrap: anywhere`; description links use `var(--brand-ink)`; the toast uses `box-shadow: var(--shadow-overlay)`; the slice of `css` coming from `AppToaster.css` has no `#hex` (import the file raw with `?raw` for this one check).
- [ ] **Step 2: Run** `npx vitest run src/components/AppToaster.css.test.ts` — FAIL.
- [ ] **Step 3: Implement** the CSS (keep the existing accent bars, icon colours and close-button rules; close button colours from `--surface`/`--ink`/`--rule`). Verify variable names in `node_modules/sonner/dist/styles.css` (`--normal-bg`, `--normal-border`, `--normal-text`). Update the `AppToaster.tsx` doc comment ("colours follow the app tokens").
- [ ] **Step 4: Run** `npx vitest run`, `npx tsc -b`, then from repo root `mvn -q test -Dskip.npm` (backend unchanged; must be green). Report real counts.
- [ ] **Step 5: Docs.** `CLAUDE.md` Frontend → Màu: add the two `-border` tokens and "1 px brand-coloured borders use `--brand-border`/`--brand-2-border` (3:1); `--brand`/`--brand-2` only for fills" and "done/progress badges always have an icon"; add a **Toast** bullet with spec Part 2 rules 1–5 and `lib/toast.ts` `toastError`. `PROGRESS.md`: one log entry at the end of section 7 (before `## 9.`) in Vietnamese, linking spec and plan.
- [ ] **Step 6: Commit** `style: toasts follow the app theme tokens; docs`.
