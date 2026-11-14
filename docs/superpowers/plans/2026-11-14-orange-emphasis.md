# More orange (Complete badge, stat icons, heading accent) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make orange more visible without changing colour roles: orange Complete badge with an icon, orange card stat icons, an orange accent bar under section headings.

**Architecture:** CSS changes in three shared stylesheets plus one icon in `FanficCard.tsx`; every page using these components follows.

**Tech Stack:** React + TypeScript, Vitest + RTL, lucide-react.

**Spec:** `docs/superpowers/specs/2026-11-14-orange-emphasis-design.md`

## Global Constraints

- Branch `feat/orange-emphasis` (checked out). One commit for the work, message English, ending with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Do not push or open a PR.
- TDD: test first, see it fail for the right reason, then implement.
- No token/hex changes. Edit with the editor tools (not Python/sed rewrites). CSS tests read `src/test/css.ts`.
- `CLAUDE.md` is already updated; do not edit it.

## Review Focus

1. Dark theme: `--brand` fill with `--on-brand` text on the Complete badge (8.97:1) — covered by existing contrast tokens; no new test needed.
2. A heading inside `.section-head` (flex row with "Xem tất cả" link, baseline-aligned): the `::after` bar must sit under the heading text, not beside it — `display: block` inside the `h2` handles it; eyeball in review.
3. The visually hidden "Manage Vietsub" heading must stay invisible (the bar is inside the clipped `h2`).

---

### Task 1: Orange emphasis

**Files:**
- Modify: `frontend/src/components/fanfics/FanficCard.css`, `frontend/src/components/fanfics/FanficCard.tsx`, `frontend/src/styles/vietsub-lists.css`, `PROGRESS.md`
- Create: `frontend/src/components/fanfics/FanficCard.css.test.ts`, `frontend/src/styles/historyHeading.css.test.ts`
- Test: `frontend/src/components/fanfics/FanficCard.test.tsx`, `frontend/src/components/novel/NovelCard.test.tsx`

- [ ] **Step 1: Write the failing tests.**
  - `FanficCard.css.test.ts`: rule `.fanfic-card__badge--complete` matches `background:\s*var\(--brand\)\s*;` and does not contain `--brand-2`; rule `.fanfic-stat__label .icon` matches `color:\s*var\(--brand-ink\)`.
  - `historyHeading.css.test.ts`: rule `.history__heading::after` has `background:\s*var\(--brand\)`, `height:\s*3px`, `width:\s*24px`, `display:\s*block`.
  - `FanficCard.test.tsx`: with `completed: true` the `Complete` badge (`getByText('Complete')`) contains an `svg`; with `completed: false` the `Ongoing` badge has none.
  - `NovelCard.test.tsx`: a `COMPLETED` public novel's `Hoàn thành` badge contains an `svg`; an `ONGOING` one's `Đang ra` badge has none.
- [ ] **Step 2: Run** `npx vitest run src/components/fanfics src/components/novel/NovelCard.test.tsx src/styles/historyHeading.css.test.ts` (from `frontend/`) — expect FAIL on each new assertion.
- [ ] **Step 3: Implement** per spec: Complete badge colours; `CircleCheck` (`className="icon icon--sm" aria-hidden="true"`) before the label only when completed — in `FanficCard.tsx` and in `components/novel/NovelCard.tsx` (it renders its own badge span with the same classes); `.fanfic-stat__label .icon` rule in `FanficCard.css`; `.history__heading::after` in `styles/vietsub-lists.css` with a one-line comment.
- [ ] **Step 4: Run** `npx vitest run` and `npx tsc -b` (from `frontend/`), then `mvn -q test -Dskip.npm` from the repo root and count results from `target/surefire-reports/*.txt`. All green.
- [ ] **Step 5: `PROGRESS.md`:** one Vietnamese log entry at the end of section 7 (before `## 9.`) linking the spec and plan.
- [ ] **Step 6: Commit** `style: more orange: Complete badge, card stat icons, section heading accent`.
