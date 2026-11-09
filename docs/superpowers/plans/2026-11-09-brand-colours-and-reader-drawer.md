# Brand colour roles, reader TOC drawer and end-of-chapter buttons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (or subagent-driven-development). TDD where testable. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Five user requests, approved in chat on 2026-11-09. The brand orange becomes the visible main colour, the reader's table of contents becomes a right-side drawer, and the end-of-chapter buttons sit in the corners.

**Architecture:** Frontend only. CSS lives in `src/styles/{tokens,base}.css` and the co-located component CSS (see `CLAUDE.md`). New dependency `@radix-ui/react-dialog@1.3.1`, which is already in `node_modules` as a dependency of alert-dialog.

**Design rules (from the user):** consistent `--space-*` spacing, WCAG AA contrast, minimal and clean UI with no flashy shadows or gradients.

## Colour roles (item 5, applies everywhere)

| Role | Colour |
|---|---|
| Action and emphasis: primary button background, **secondary button borders**, links, accents | **Orange**: `--brand` for backgrounds and borders; `--brand-ink` for text and links on light backgrounds (dark theme: `--brand`) |
| State, "you are here / selected", and hover feedback: nav pill, active tab underline, current chapter, hovered button border | **Orchid**: `--brand-2`; `--brand-2-ink` for text or icons that need ≥ 3:1 |
| Keyboard focus ring | `--focus` becomes `var(--brand-2-ink)` in light and `var(--brand-2)` in dark (≥ 3:1 on both backgrounds). This drops the off-brand blue. Also replace the hard-coded `#7aa7f0` focus outlines in `UrlForm.css` with the token. The dark video frame needs a ring with ≥ 3:1 on `#1b2430`; use `--brand-2` there. |
| One element | One brand colour at a time: orange at rest, orchid on hover or when selected. Never both. |

## Spec

| # | Change |
|---|---|
| 1 | **End of chapter** (`ReaderPage`): `‹ Chương trước` sits in the **left corner** and `Chương sau ›` in the **right corner** of the reader column (full `--reader-width`). Both are **orange primary buttons** (`button button--primary`, `--on-brand` text). A missing neighbour leaves its corner empty. The last-chapter "Bạn đã đọc hết…" box is unchanged. |
| 2 | **TOC drawer** (`ReaderBar` → `Mục lục`): replace the TOC popover with a Radix **Dialog** styled as a right-side drawer.<br>• Full viewport height, width `min(360px, 85vw)`, `--surface` background, 1 px left border, `--shadow-overlay`, and a dimmed overlay (`rgb(0 0 0 / 0.4)`).<br>• Header: title `Mục lục` (Dialog.Title) and a close `IconButton` ✕ (`Đóng`).<br>• Body: the chapter list (same items, `Đang đọc`, `Check` = Đã đọc) in a **scrollable area with its own visible scrollbar** (`overflow-y: auto`, thin themed scrollbar). It scrolls the current chapter into view when the drawer opens.<br>• Picking a chapter navigates and closes the drawer. Esc, the ✕ and an overlay click also close it, and focus returns to the `Mục lục` button.<br>• Slides in from the right (transform), with no animation under `prefers-reduced-motion`.<br>• While it is open, the top bar stays shown and arrow keys inside it do not change chapter (`data-own-keys`).<br>• The settings popover is unchanged. |
| 3 | **Tabs spacing**: the gap between a tab bar and its panel goes from about 36 px (`.tabs` gap `--space-5` + `.tabs__panel` padding-top `--space-4`) to **12 px** everywhere: `.tabs` gap `--space-3`, panel padding-top 0. Check the public novel page, Vietsub list, Profile and Vietsub tabs still look right (list any page that needs its own spacing). |
| 4 | **Secondary buttons**: every button that has a grey (`--rule` / `--field-border`) border gets an **orange border** (`--brand`) and an **orchid border on hover** (`--brand-2`). This covers `.button--small`, `.button--icon`, `.filter-button` and any other bordered secondary button/link styled as a button. Disabled buttons keep a neutral `--rule` border at their current opacity. Focus-visible uses the focus ring, not the border. Inputs and selects keep `--field-border` (they are fields, not buttons). |
| 5 | **Colour roles** (table above):<br>• Default links (`a` without a component class) use `--brand-ink`, underlined, and turn `--brand-2-ink` on hover. The same in dark mode, with the dark tokens.<br>• `--focus` changes as described in the colour roles table.<br>• Audit every use of `--brand`/`--brand-2` against the roles and fix mismatches. Report each change: selector, old value, new value.<br>• Extend `contrast.test.ts`: `--focus` ≥ 3:1 on `--paper` and `--surface`, and the video-frame ring colour ≥ 3:1 on `#1b2430`, in both themes. |

## Global Constraints

- Branch `feature/novel-page-checks`: `git checkout feature/novel-page-checks`, then `git merge --ff-only main` (main is at 68ee948). One commit per task. Messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never merge into main, push or deploy (the reviewer does that next).
- Add the dependency with `cd frontend && npm install --save-exact @radix-ui/react-dialog@1.3.1`, and commit `package.json` and `package-lock.json`. Never run `npm ci`. If npm fails with EPERM (a dev server lock), stop and report.
- Icons only from `lucide-react`. Tooltips via `Tip` / `IconButton`. Reuse `components/ui/`. No other new packages.
- Stage by path. Never `git add -A`. Never stage `frontend/tsconfig.tsbuildinfo` or `.claude/`.
- After each task, all must pass: `cd frontend && npx vitest run`, `npx tsc -b --noEmit`, `npm run build`, `npm run build:public`. The two known flaky pagination tests may be rerun once.

## Review Focus

1. The drawer is a real dialog: `role="dialog"`, labelled by `Mục lục`, focus is trapped, Esc and overlay click close it, and focus returns to the trigger. It scrolls on its own with the current chapter in view. Picking a chapter navigates and closes it. Tests in Task 2.
2. End buttons: both have the primary class; prev is placed left and next right via CSS (test the rules); an empty corner when one is missing.
3. No secondary button keeps a grey border except disabled ones (grep and list); the hover border is orchid.
4. The contrast test passes with the new `--focus`; no hard-coded focus colours are left.
5. A list of every colour-role change (selector, old → new).

---

### Task 1: Colour roles, button borders, tabs spacing (items 3, 4, 5)
- [ ] Extend the contrast test (it fails with the old blue focus) → apply the tokens and fixes → checks → commit `style: orange secondary-button borders with orchid hover, brand focus ring and links, tighter tab spacing`.

### Task 2: TOC drawer and end-of-chapter corners (items 1, 2)
- [ ] Install the dependency → failing tests (Review Focus 1–2) → implement → checks → commit `feat(novel): table of contents slides in from the right; previous and next chapter buttons in the corners`.

### Task 3: Docs
- [ ] Add a 2026-11-09 entry to `PROGRESS.md`. Add the colour-role table to `CLAUDE.md`'s UI conventions. Commit `docs: brand colour roles and the reader drawer`.
