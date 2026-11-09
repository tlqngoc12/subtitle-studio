# Warm palette (A light + C dark) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. TDD for the contrast test. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Apply the colour-review palettes approved in chat on 2026-11-09: **A** for light mode (warm neutral background, purple-tinted ink) and **C** for dark mode (purple-tinted dark). The brand roles stay: orange for actions, orchid for state and focus.

**Architecture:** Mostly `frontend/src/styles/tokens.css`, plus a few component CSS files that still hard-code colours. No markup change except `index.html` meta `theme-color`, if present.

## Tokens (approved values)

| Token | Light (A) | Dark (C) |
|---|---|---|
| `--paper` | `#F7F3EE` | `#16121B` |
| `--surface` | `#FFFFFF` | `#211B28` |
| `--ink` | `#221C26` | `#EEE8F3` |
| `--muted` | `#5E5666` | `#A9A1B4` |
| `--rule` | `#E3DCD3` | `#342C3E` |
| `--field-border` | `#8B8178` | `#776D84` |
| `--brand` | `#F39A42` | `#F5A25A` |
| `--brand-hover` (new) | `#E8862C` | `#F8B47A` |
| `--brand-ink` | `#A35509` | `var(--brand)` |
| `--on-brand` | `#221C26` | `#16121B` |
| `--brand-2` | `#D9A1D9` | `#D9A1D9` |
| `--brand-2-ink` | `#8E4F8E` | `var(--brand-2)` |
| `--focus` | `var(--brand-2-ink)` | `var(--brand-2)` |

- **Dark blocks.** Both dark blocks (`@media (prefers-color-scheme: dark) :root:not([data-theme='light'])` and `:root[data-theme='dark']`) get identical values. Keep `--danger`, `--danger-bg`, `--hover` and the shadow tokens. Check `--danger` in both themes against the new backgrounds: ≥ 4.5:1 as text, ≥ 3:1 as a border. Retune it only if it fails, and report it.
- **`--hover` tint.** Re-derive it so it stays a subtle tint on the new surfaces.
- **Primary buttons on hover.** `.button--primary:hover:not(:disabled)` uses `background: var(--brand-hover)`. There is no orchid on a filled orange button and no `filter: brightness`. Outline buttons keep the orange border at rest and the orchid border on hover.
- **Video "frame".** The bold dark element (`UrlForm.css` `#1b2430`, `VideoPlayer.css` `#e6ebf1`, any `#fff` text on it) gets tokens:
  - `--frame: #221C26` and `--on-frame: #EEE8F3`, the same in both themes.
  - Replace the hard-coded hex values.
  - Its focus ring stays `--brand-2`, which must be ≥ 3:1 on `--frame`.
- **Remaining hard-coded hex.** Grep for hex colours outside `tokens.css`. Allowed:
  - pure `#000` / `#fff` for text shadows or masks
  - the reader's paper and night filters
  - Anything else becomes a token, or is listed in the report with a reason.
- **`index.html`.** Update `theme-color` meta tags, if any, to the new `--paper` values (light and dark media).

## Contrast guard

Update `contrast.test.ts`, which reads `tokens.css` through the CSS helper, to assert in both themes:
- **≥ 7:1 (AAA):** `--ink` on `--paper` and `--surface`.
- **≥ 4.5:1:**
  - `--muted` on `--paper` and `--surface`.
  - `--brand-ink` and `--brand-2-ink` on both backgrounds.
  - `--on-brand` on `--brand` and on `--brand-hover`.
- **≥ 3:1:**
  - `--field-border`, `--focus` and `--danger` on both backgrounds.
  - `--brand-2` on `--frame`.
  - `--on-frame` on `--frame` must reach 7:1.

## Global Constraints

- Branch `feature/novel-page-checks`: run `git checkout feature/novel-page-checks`, then `git merge --ff-only main`. The plan is committed first, alone.
- One commit per task, messages ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Never merge into main, push or deploy.
- No new packages.
- Stage by path; never stage `frontend/tsconfig.tsbuildinfo` or `.claude/`.
- After each task run `cd frontend && npx vitest run`, `npx tsc -b --noEmit`, `npm run build` and `npm run build:public`. If only the known flaky pagination tests fail, rerun once.

## Review Focus

1. The token values match the table exactly in both dark blocks.
2. The contrast test covers the list above and passes. Report every ratio.
3. Grepping for hex outside `tokens.css` returns only the allowed exceptions, each listed.
4. The primary button hover uses `--brand-hover`, with no orchid fill and no brightness filter.

### Task 1: Palette tokens, hover, frame tokens, contrast test
- [ ] Contrast test first: it fails on the old values. Then apply the tokens, `--brand-hover`, the frame tokens and the hex clean-up, and run the checks.
- [ ] Commit `style: warm neutral palette with purple-tinted ink and a purple-tinted dark mode`.

### Task 2: Docs
- [ ] Update the `CLAUDE.md` token and colour-role table with the new values and `--brand-hover`/`--frame`.
- [ ] Add a `PROGRESS.md` 2026-11-09 entry.
- [ ] Commit `docs: warm palette`.
