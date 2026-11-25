# Chapter title replaces label and number — design

Date: 2026-11-25 · Status: waiting for user approval

## Why

A chapter has three name-ish fields: `chapterNo`, `label` and `title`. `chapterNo` never changes when chapters are
inserted or dragged, so it drifts away from the label and the reading order. Places that still show it look wrong:
the admin tab says "Ch. 8" for "Chương 7" (Behind Her), the export zip is `…-chapter-5-…` for "Chương 7" (Until I See
You). One field the writer controls, the title, should be the chapter's name everywhere.

## Goals

1. `chapterNo` is an internal id only: it stays in public links (`/novels/<slug>/<chapterNo>`), published files
   (`<chapterNo>.json`) and read counters, and is never shown or edited.
2. `label` is removed. `title` carries the full name: `Chương 7: Bữa cơm hai người`, `Ngoại truyện I`, `Special II`.
3. Every place shows the title: admin list, ChapterJump, breadcrumb, H1, browser tab, public TOC/reader/"Đọc tiếp",
   export (heading, inner files, zip name), translation prompts, "is translating" messages.
4. Review files are named by a key from the title: `review-<Profile>--<key>--<YYYY-MM-DD>[-vN].md`.

## Non-goals

- Changing public URLs, published file names or read counters (all stay on `chapterNo`).
- Previous-chapter context for translation (`findIdsBefore`, still by `chapterNo`) — separate fix if wanted.
- Renaming the novel slug `util-i-see-you`.

## Approach (agreed)

Flyway migration merges `label` into `title` and drops the column; `ChapterReviewFiles` switches from reading position
to title key, and renames old files once at startup; UI drops the Number and Label fields; agents updated. Rejected:
a manual rename script (more ops steps), keeping `label` hidden (data drifts again).

## Rules

**Migration (V30, Java migration — needs reading order).** Per novel, walk chapters in reading order
(`sort_order, chapter_no`), keeping `last` = the last chapter number seen:
- label set: name = label; if the label is `Chương N` / `Chapter N`, `last = N`.
- no label: `last = last + 1`, name = `Chương {last}`.
- new title = `name: title` when the old title is set, else `name`. Then drop `label`.

Dry run on today's data: only Until I See You changes number (its 16 unlabelled chapters become Chương 8–23, matching
the reading order); every other novel keeps exactly what readers see today; no duplicate keys.

**Title.** Required (not blank). Max length grows to fit `label: title` (builder checks the longest migrated value).
New chapters (manual, Wattpad, screenshots) default to `Chương {N}`, N = highest `Chương N` in the novel + 1; a Wattpad
part name, when present, is appended as `Chương N: <part name>`.

**Review key.** Take the title before the first `:`. If it is `Chương N` / `Chapter N` (any case, leading zeros
ignored) → `ch-N`; otherwise a slug (accents removed, `đ`→`d`, lower case, non-alphanumerics → `-`), e.g.
`ngoai-truyen-i`, `nhan-vat`, `special-ii`.
- Two chapters of one novel may not share a key: saving such a title fails with a field error on `title`.
- Title change → that chapter's review files are renamed to the new key. Reorder → no rename. Delete → files move to
  `_archive/` as today. Profile rename → as today.
- Startup, once: old-format files `review-<Profile>-ch-<position>-<date>[-vN].md` are mapped to the chapter at that
  reading position and renamed to the new format. Unmatched files are left alone and logged (names only).

**Display.** Admin and public show `title` alone. The public chapter JSON drops `label`; a Publish after deploy
regenerates it. Export zip name: `<slug>-<key>-<date>.zip`; inner files keep `NNN - <title>` (NNN = reading position).

**Agents (outside repo, `~/.claude/agents`).** `story-reviewer` and `chapter-prompt-writer` use the new file name and
key rule.

## Left to the builder

Exact UI copy for the title field/hint, test layout, how the one-time review rename is guarded (e.g. it simply only
matches old-format names).
