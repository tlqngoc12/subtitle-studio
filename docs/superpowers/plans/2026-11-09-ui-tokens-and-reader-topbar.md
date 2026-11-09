# UI tokens, contrast fixes and reader topbar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (or subagent-driven-development). TDD where testable. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Round 1 of the UI audit (2026-11-09): spacing scale, shadow tokens, WCAG contrast fixes, no decorative gradient; plus the reader's controls moved into the site topbar. Approved in chat on 2026-11-09.

**Architecture:** Frontend only: `frontend/src/styles.css`, `components/NavBar.tsx`, `pages/public/ReaderBar.tsx` / `ReaderPage.tsx`, and a small test. No backend change.

**Design rules (from the user, apply to every change):** a consistent spacing system; WCAG AA contrast (text ≥ 4.5:1, large text and meaningful icons / UI boundaries ≥ 3:1); minimal and clean — no flashy shadows or gradients.

## Spec (approved)

| # | Change |
|---|---|
| 1 | **Spacing tokens** on `:root`, 4 px based: `--space-0-5: 2px; --space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px; --space-5: 20px; --space-6: 24px; --space-8: 32px; --space-10: 40px; --space-12: 48px; --space-16: 64px`. Replace **every** px value in `margin*`, `padding*`, `gap`, `row-gap`, `column-gap` and `inset`-style spacing in `styles.css` with a token, rounding off-scale values: 6→`--space-2`, 7→`--space-2`, 9→`--space-2`, 10→`--space-3`, 14→`--space-4`, 18→`--space-5`, 22→`--space-6`, 28→`--space-8`, 36→`--space-10`, 44→`--space-12`. Exceptions kept as px: 0, 1px, borders, outlines, widths/heights, `min-height: 44px` touch targets, `top`/`left` offsets of sticky/absolute positioning, values inside `calc()` that mix variables, `clamp()` (`--gutter`). Add a comment block at the top of the tokens explaining the scale. |
| 2 | **Shadow tokens**: `--shadow-overlay` (one soft, small shadow, e.g. `0 4px 16px rgb(0 0 0 / 0.12)` light, `0 4px 16px rgb(0 0 0 / 0.45)` dark) used **only** by floating layers: tooltip `.tip`, confirm dialog, Save-to menu, Filter menu, reader popovers, toasts if styled. `--shadow-drag` (e.g. `0 2px 8px rgb(0 0 0 / 0.16)`) for the three dragging states. Replace all 9 ad-hoc `box-shadow` values with these. Cards, panels and the banner covers get **no shadow** — use the existing 1 px `--rule`/`--field-border` borders. Keep functional inset shadows (`inset … var(--brand)` focus/selection indicators, the 1 px divider shadows) as they are. |
| 3 | **No decorative gradient**: `.plcard` gets a flat `var(--surface)` background + 1 px border (remove the 135° orange gradient). The featured banner's blurred cover backdrop: opacity ≤ 0.12 and no extra colour overlay; covers without shadow. Keep the functional `mask-image` fade on the scrolling nav. |
| 4 | **Contrast tokens**: `--brand-ink` = an orange dark enough for text/icons on `--surface` **and** `--paper` in light mode (≥ 4.5:1); in dark mode `--brand-ink: var(--brand)`. `--brand-2-ink` = an orchid/purple for meaningful icons, ≥ 3:1 on both light backgrounds; dark mode `var(--brand-2)`. `--field-border` ≥ 3:1 against `--surface` and `--paper` in both themes, used for `input`, `select`, `textarea`, the search box, and the Filter button outline. Apply: breadcrumb link hover/focus colour → `--brand-ink`; `.info-button` icon and its focus → `--brand-2-ink`/`--brand-ink`; `.chapter-list__check` → `--brand-2-ink`; toast success/info icons → `--brand-ink`; `.pblock__title-icon` and `.empty__icon` → the `-ink` tokens. Do **not** change `--brand` as a background (primary buttons keep `--on-brand` text, 7.09:1). Define the missing `--hover` token (subtle surface tint used by the chapter list hover) in both themes. |
| 5 | **Contrast guard test**: a vitest that reads `styles.css` (the existing `?raw` import approach), extracts the light and dark token values, computes WCAG contrast and asserts: `--ink`/`--muted` on `--paper` and `--surface` ≥ 4.5; `--brand-ink` on both ≥ 4.5; `--brand-2-ink` on both ≥ 3; `--field-border` on both ≥ 3; `--on-brand` on `--brand` ≥ 4.5 — for both themes. |
| 6 | **Reader topbar**: on the chapter reader route only (`/novels/:slug/:chapterNo`, not `/novels/all` or the novel page), the site topbar shows the reader controls **instead of** the logo and the main menu (Vietsub list, Profile, Novels, Publish button if any): left `←` (to the novel page, `Tip` + aria-label `Về trang truyện`) + novel title (bold, ellipsis) with `Chương N` (or label) below in small muted text; right `‹ › Mục lục Cài đặt` exactly as today (same popovers, tooltips, disabled states, arrow keys, `data-own-keys`). The topbar keeps its normal width/inner container. The **whole topbar** hides on scroll down and shows on scroll up (reuse `useHideOnScroll` rules: near top, popover open, focus inside → shown; reduced motion → no slide). The separate sticky `.reader-bar` under the topbar is removed. Implementation suggestion: NavBar exposes a slot (context + portal target or a render prop from the route) so `ReaderPage` keeps owning the reader state; NavBar renders its normal content when the slot is empty. `--topbar-h` measuring stays. Breadcrumbs below stay. Every other page keeps the normal topbar. |

## Global Constraints

- Branch `feature/novel-page-checks`: `git checkout feature/novel-page-checks`, then `git merge --ff-only main` (main at f02d631). One commit per task; messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Icons only `lucide-react`; tooltips `Tip`; Radix already present; no new packages.
- Stage by path; never `git add -A`; never stage `frontend/tsconfig.tsbuildinfo` or `.claude/`.
- Tests: `cd frontend && npx vitest run`, `npx tsc -b --noEmit` (the two known flaky pagination tests: rerun once if exactly those fail). Don't weaken tests; update ones broken by intended changes.

## Review Focus

1. After Task 2, `grep -nE "^\s*(margin|padding|gap|row-gap|column-gap)[a-z-]*\s*:[^;]*[0-9]+px" styles.css` returns only documented exceptions (list them in the report).
2. Contrast test passes for both themes with the chosen hex values (report the values and ratios).
3. Exactly two shadow tokens; no `box-shadow` with a literal blur value outside the token definitions (except the kept functional inset/1 px ones — list them); no `linear-gradient` except the nav `mask-image`.
4. Reader route: no logo/menu in the topbar, reader controls present, whole topbar hides on scroll down and shows on scroll up/near top/with a popover open; other routes unchanged — tests in Task 3.

---

### Task 1: Tokens, contrast, shadows, gradient (items 2–5)
- [ ] Write the contrast test (fails: tokens missing) → add tokens, apply them, replace shadows, remove gradient → vitest + tsc → commit `style: shadow and contrast tokens, WCAG fixes for orange/orchid text and field borders, no decorative gradient`.

### Task 2: Spacing scale (item 1)
- [ ] Add the spacing tokens and replace the values mechanically (Review Focus 1) → vitest + tsc → commit `style: 4 px spacing scale tokens used for every margin, padding and gap`.

### Task 3: Reader controls in the topbar (item 6)
- [ ] Failing tests (Review Focus 4) → implement → vitest + tsc → commit `feat(novel): reader controls replace the menu in the top bar while reading`.

### Task 4: Docs
- [ ] `PROGRESS.md` 2026-11-09 entry (UI audit round 1 + reader topbar; rounds 2–3 — shared components `Alert`, `LoadingText`, `IconButton`, `PageHeader`, `Cover`, `SearchBar`, `PopoverPanel`; breakpoint convention 520/760/1024 mobile-first; splitting `styles.css` — listed as next). Commit `docs: UI tokens and reader topbar in PROGRESS`.
