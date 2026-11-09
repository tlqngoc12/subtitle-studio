# Shared UI components, breakpoints and CSS split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (or subagent-driven-development). TDD for new components. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Rounds 2–3 of the 2026-11-09 UI audit, approved in chat ("Làm tiếp"). **Pure refactor: no visible change**. The same DOM classes and roles render, so the existing behaviour tests keep passing.

**Architecture:** Frontend only (`frontend/src`). New shared components in `components/ui/`. Global CSS is split into token/base files plus CSS files co-located with components and pages, imported by them (Vite bundles them).

## Spec

### Round 2: shared components (`components/ui/`)

Each component gets a unit test. Replace **every** usage listed in the audit (counts are from the audit; find them with grep):

| Component | API (suggested) | Replaces |
|---|---|---|
| `Alert` | `<Alert title hint? tone?='error'>{children?}</Alert>`, renders `div.alert[role=alert]` with `p.alert__title` / `p.alert__hint` | 22 inline alert blocks in 17 files (keep any extra children such as links, e.g. "Back to Novels") |
| `LoadingText` | `<LoadingText>Loading…</LoadingText>`, renders `p.muted` with `role="status"` | 18 loading paragraphs in 16 files (English and Vietnamese copy unchanged) |
| `IconButton` | `<IconButton label icon={X} onClick? disabled? className? {...buttonProps} />` (wraps `Tip`; `label` is used for both the tooltip and `aria-label`, so they cannot differ). Also an `IconLink` variant for router links | The `Tip` + icon-button pairs (39 in 17 files) wherever the tooltip text equals the aria-label; where they differ on purpose, keep them as they are and list them |
| `PageHeader` | `<PageHeader title lede? actions?/>`, renders `header.masthead` with `h1.masthead__name` and `p.masthead__lede` | 7 mastheads |
| `Cover` | `<Cover src? alt? className? size?/>`, an image or the empty placeholder with the `BookOpen` icon | 6 cover/placeholder pairs |
| `SearchBar` | `<SearchBar value onChange placeholder label onClear?/>` | the 2 copies (Manage Vietsub and Vietsub list) |
| `PopoverPanel` | thin wrapper over Radix Popover `Content` with `Portal`, one `.popover` base class (`--shadow-overlay`, radius, border, `--space-*` padding), plus an optional extra class | the 3 popovers (`.saveto`, `.filter-menu`, `.reader-pop`): their shared rules move to `.popover`, and only their real differences stay in the specific class |

Also: `NovelCard` title becomes a heading (`h3`, same visual class) so screen-reader users can jump between cards. The reader's end-of-chapter navigation drops the empty `<span aria-hidden>` spacers and uses a two-column grid (prev in column 1, next in column 2, `justify-self: end`).

### Round 3: breakpoints and CSS split

1. **Breakpoint convention**: document 520 / 760 / 1024 px at the top of the tokens file (comment table: name, width, use). Normalise every existing `@media` to these values (they already use 520 and 760). Where a block can be expressed mobile-first (`min-width`) **with the same result**, convert it; otherwise keep `max-width`. No new layouts at 1024.
2. **Split `styles.css`** (3.2k lines):
   - `src/styles/tokens.css` (`:root`, dark tokens, scale comments)
   - `src/styles/base.css` (reset, body, typography, generic `.button`, `.field`, `.badge`, `.alert`, `.muted`, `.visually-hidden`, `.page`, `.tabs__*`, focus styles, print, reduced motion)
   - `src/styles/index.css` importing tokens and base, imported once in `main.tsx` (and in the public entry, if separate)
   - every remaining component/page block moves to a `.css` file next to the component that owns it (e.g. `components/NavBar.css`, `pages/public/ReaderPage.css`), imported at the top of that component.
   Cascade order must not change the result: when two files style the same selector, keep the later one later. Keep selectors and declarations byte-identical apart from the moves.
3. **Verification script** (`frontend/scripts/check-css-split.mjs`, committed): it parses the old `styles.css` from git (`git show <base>:frontend/src/styles.css`) and the new files, then checks that every (selector, declarations) rule — including those inside `@media` — exists exactly once after the split, and that nothing new appeared except the `.popover` consolidation and the breakpoint changes, which it lists. Run it and report the output.
4. **Tests that read `styles.css`** (contrast test, CSS regex tests): add `test/css.ts`, a helper that concatenates all project CSS files in import order (`import.meta.glob('/src/**/*.css', { query: '?raw', eager: true })`, tokens first), and switch those tests to it. The vitest `css.include` config must cover the new files.

## Global Constraints

- Branch `feature/novel-page-checks`: `git checkout feature/novel-page-checks`, then `git merge --ff-only main` (main is at 1df4ff1). One commit per task; messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push, merge or deploy.
- No new npm packages. Don't change copy, colours, spacing values or behaviour.
- Stage by path; never `git add -A`; never stage `frontend/tsconfig.tsbuildinfo` or `.claude/`.
- After each task: `cd frontend && npx vitest run`, `npx tsc -b --noEmit`, **and `npm run build`**, so the production CSS bundle builds. If the two known flaky pagination tests fail, rerun once.

## Review Focus

1. No usage left behind: grep for `className="alert" role="alert"`, `className="muted">Loading`, `className="masthead"` and `cover--empty` outside `components/ui` returns nothing (or only listed exceptions).
2. `IconButton` keeps tooltip text and `aria-label` identical; every intentional difference is listed.
3. `check-css-split.mjs` reports zero missing or duplicated rules.
4. Production build CSS: the size of the built CSS before and after should be within a few %. Report both numbers.
5. All existing tests pass without weakening; only tests that read CSS change, through the helper.

---

### Task 1: Shared components (round 2)
- [ ] Tests for each new component → implement → replace usages (Review Focus 1–2) → vitest + tsc + build → commit `refactor(ui): shared Alert, LoadingText, IconButton, PageHeader, Cover, SearchBar and PopoverPanel components`.

### Task 2: Breakpoints and CSS split (round 3)
- [ ] CSS helper for tests → tokens/base/index + co-located files → breakpoint normalisation → verification script → vitest + tsc + build (Review Focus 3–5) → commit `refactor(css): split styles.css into tokens, base and co-located component styles; 520/760/1024 breakpoints`.

### Task 3: Docs
- [ ] `PROGRESS.md`: rounds 2–3 done, the new `components/ui/` and CSS layout, and how to run `check-css-split.mjs`. Update `CLAUDE.md` if it describes the frontend structure or CSS conventions (tokens, spacing scale, shadows, `-ink` colours, breakpoints, where CSS goes). Commit `docs: shared UI components and CSS layout`.
