# Chapter list: date and "Mới" on the newest chapter only; readable "Chương trước" — design

Date: 2026-11-14. Branch: `fix/translation-completeness` (added to that PR). Size: small (frontend only).

## 1. Chapter list on the public novel page (`pages/public/PublicNovelPage.tsx`)

The user's rules (2026-11-14):

| Novel status | Publish date in the list | "Mới" badge |
|---|---|---|
| Ongoing (`ONGOING`) | **only on the newest chapter** (the greatest `publishedAt`; ties go to the highest `chapterNo`) | only on that same chapter, and only when it was published in the last 7 days (my call: keeps today's 7-day rule, so a chapter from months ago is not "Mới") |
| Completed (`COMPLETED`) | none | none |

- The hero's **Cập nhật** row is unchanged for both statuses (newest `publishedAt`; hidden when no chapter has a date).
- Chapters without `publishedAt` (files published before that field existed) still show nothing.
- Tests (fixed clock):
  - ongoing, 3 dated chapters → exactly one `<time>`, on the newest, plus "Mới" on it when ≤ 7 days old;
  - ongoing, newest older than 7 days → its date, no "Mới";
  - completed → no `<time>` in the list, no "Mới", "Cập nhật" still in the hero;
  - tie on `publishedAt` → the higher `chapterNo` wins.

## 2. "Chương trước" invisible at the end of a chapter (regression from PR #33)

PR #33 turned "Chương trước" into a plain outlined `button`. Its text uses the app's `--ink`, which is near-white when the phone is in dark mode. The reader's "Giấy" (sepia) and "Sáng" themes paint a light paper, so the label disappeared (user screenshot, 2026-11-14).

`readerThemes.css` already re-points `--ink`/`--muted` to `--reader-ink`/`--reader-muted` for elements that sit on the paper (breadcrumbs, loading title, skeleton, footer), but not for `.reader__end`.

- Add `html[data-reader-theme] .reader__end` to that selector list, so the end-of-chapter buttons, and the "done" block under them, use the reader's ink in all four reader themes whatever the OS theme. The orange outline (`--brand-border`) and the primary "Chương sau" are unchanged.
- Tests (`src/test/css.ts`): the rule includes `.reader__end`. A contrast test computes `--reader-ink` on `--reader-paper` for each reader theme and expects ≥ 4.5:1.

## Done when

`npx vitest run` and `npx tsc -b` green. `CLAUDE.md`: the chapter-list date/"Mới" rule and "elements on the reader paper (incl. `.reader__end`) use `--reader-ink`". `PROGRESS.md`: add both to this branch's entry. A Publish is needed for the public site.
