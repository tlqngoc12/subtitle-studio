# More orange: Complete badge, card stat icons, section heading accent — design

Date: 2026-11-14. Branch: `feat/orange-emphasis`. Size: small change.

## Why

The user sees the UI as "all purple" although orange is the main colour. Purple is the filled "selected" colour that is always on screen (active nav pill, selected filter pill, tab underline, pager); orange is mostly 1 px outlines and link text, and the read-only public site has few actions. The roles stay (orange = action, emphasis, done; purple = selected, info, hover). Swapping roles was considered and rejected (pastel purple CTA less salient; purple links read as "visited"; done/success meanings flip). Instead, add orange where an element is **emphasis** or **done** but is neutral or wrongly purple today.

## Approaches

- **Chosen: A + 1 + 2** (below). Stays inside the colour roles, touches shared components so every page follows.
- Not chosen: orange navbar brand text (little gain); changing the solid-purple selected style (agreed the same day; revisit only if still too purple); swapping roles; an orange "Đọc" button on every card (busier cards).

## Changes

**A. "Complete"/"Hoàn thành" badge on cards is orange (done).** `components/fanfics/FanficCard.css` `.fanfic-card__badge--complete`: `background: var(--brand)`, `border-color: var(--brand)`, `color: var(--on-brand)` (was `--brand-2`). Used by `FanficCard` and `NovelCard` (admin and public). It gains a leading `CircleCheck` icon (`className="icon icon--sm" aria-hidden="true"`), like every other "done" badge, so it does not depend on colour. "Ongoing"/"Đang ra" stays neutral; the purple "On banner" badge (a state) is unchanged.

**1. Card stat icons are orange.** `.fanfic-stat__label .icon { color: var(--brand-ink) }` (label text stays `--muted`). Covers Chapters/Reads/Votes/Time/Updated/Published on `FanficCard` and `NovelCard`, admin and public. `--brand-ink` is ≥ 4.5:1 on `--surface` in both themes.

**2. Section headings get a short orange accent bar.** `styles/vietsub-lists.css` `.history__heading::after`: `content: ''`, `display: block`, `width: 24px`, `height: 3px`, `margin-top: var(--space-1)`, `border-radius: 2px`, `background: var(--brand)`. Applies to every `.history__heading` (Tủ sách, Tất cả truyện, Danh sách chương, Fetched earlier, Playlists, Videos, Pages, Rules found, Changes; the visually hidden "Manage Vietsub" stays invisible). Decorative, so no contrast requirement; it is a fill, so the 3:1 border scan in `contrast.test.ts` does not apply.

## Tests (write first)

- CSS (`src/test/css.ts`): `.fanfic-card__badge--complete` has `background: var(--brand)` and no `--brand-2`; `.fanfic-stat__label .icon` has `color: var(--brand-ink)`; `.history__heading::after` has `background: var(--brand)`, `height: 3px`, `width: 24px`.
- `FanficCard.test.tsx` / `NovelCard.test.tsx`: the Complete / Hoàn thành badge contains an `svg`; the Ongoing badge does not.
- Existing suites stay green (`contrast.test.ts` border scan, `badgeIcons.test.ts`).

## Non-goals

No token or hex changes; no change to selected/hover styles, nav, tabs, pills, pager, links.

## Done when

`npx vitest run` and `npx tsc -b` green; `mvn -q test -Dskip.npm` green; `PROGRESS.md` log entry. `CLAUDE.md` colour table already updated with this spec.
