# Border contrast, badge icons and toast format — design

Date: 2026-11-14. Branch: `fix/public-novel-polish`. Status: direction approved by the user in chat (colour audit option **A**, badge icons **yes**, toast points **1–5**; toast position unchanged).

## Why

A colour audit (WCAG) of the app found:

- All text passes AA, but in the **light theme** the 1 px orange/orchid borders of secondary buttons, pills, badges and hover states are only about **2:1** on `--paper`/`--surface` (WCAG 1.4.11 asks 3:1 for UI component boundaries). The dark theme passes (≈ 8–9:1).
- Orange `--brand` and orchid `--brand-2` have almost the same lightness (1.06:1), so orange "done" badges and purple "in progress" badges differ by hue only, which colour-blind readers cannot see.
- Toasts are written and styled inconsistently (see Part 2).

Orange stays the primary colour (actions), orchid the secondary (state/selection) — unchanged (`CLAUDE.md`). No brand hex changes.

## Part 1 — Border contrast (option A) and badge icons

### Goals

1. Two new tokens in `frontend/src/styles/tokens.css`:

   | Token | Light (`:root`) | Dark (both dark blocks) | Use |
   |---|---|---|---|
   | `--brand-border` | `#cf6f1a` | `var(--brand)` | orange 1 px borders of secondary buttons, pills, pager links, outlined controls |
   | `--brand-2-border` | `#a86ea8` | `var(--brand-2)` | orchid borders: hover, chosen outline, `badge--info`/`--draft`, decorative chips |

   Light values reach ≥ 3:1 on both `--paper` (#f7f3ee: 3.20 / 3.48) and `--surface` (#fff: 3.53 / 3.85). Text on them is never needed (they are borders only).

2. Every `border:` / `border-color:` declaration in project CSS that uses `var(--brand)` or `var(--brand-2)` switches to the matching `-border` token, **except** when the same rule fills the element with that same colour (`background: var(--brand)` — e.g. `.button--primary`, `.fanfic-card__badge--complete`): there the border is invisible and stays as is.
   - Not in scope: `border-left`/`border-top` accent bars (decoration: toaster, notebook, chapter warnings), `outline` (focus rings use `--focus`), the dark video frame.
   - Known sites (≈ 23 files): `styles/base.css` (`.button`, `.button:hover`, `.badge--info/.badge--draft`, `.reader-settings .button[aria-pressed]`), `BackToTop.css`, `Pagination.css`, `PlaylistHeader.css`, `ShortcutsHelp.css`, `FanficCard.css` (hover), `PageRow.css`, `PhotoPostDialog.css`, `BannerEditor.css`, `BlockEditor.css`, `MemberSection.css`, `ImageDropzone.css`, `Select.css`, `CueEditorTable.css`, `CategoryToggleGroup.css`, `PeopleCards.css`, `WorkCard.css`, `ChapterPage.css`, `WorkDetailPage.css`, `PublicNovelPage.css` (`.novel-cta__shelf[aria-pressed]`), `ReaderPage.css`, `ReaderSettings.css`, `ShelfRow.css`. The guard test (below) is the source of truth, not this list.

3. Every orange `badge--done` and purple `badge--progress` badge starts with a lucide icon (`className="icon icon--sm" aria-hidden="true"`), so the state does not depend on colour:

   | Badge | Where | Icon |
   |---|---|---|
   | Published (`badge--done`) | `components/novel/StatusBadges.tsx` | `CircleCheck` |
   | Translating… (`badge--progress`) | `StatusBadges.tsx` | `LoaderCircle` |
   | Landscape (`badge--done`) | `components/novel/PageRow.tsx` | `RectangleHorizontal` |
   | May be incomplete (`badge--progress`) | `PageRow.tsx` | `TriangleAlert` |
   | `⚠ N` suspect pages (`badge--progress`) | `components/novel/ChapterList.tsx` | `TriangleAlert` replaces the typed `⚠` |
   | Updating notebook… (`badge--progress`, a `<p>`) | `components/novel/NotebookView.tsx` | `LoaderCircle` |
   | Deleted (`badge--progress`) | `WattpadParts.tsx`, `WattpadPreviewParts.tsx` | `Trash2` |
   | Manual (`badge--done`) | `pages/VietsubEditPage.tsx` | already has `FileUp` — no change |

   `StatusBadges` gets an optional `icon` per status entry; statuses without one (Not translated, Translated, Failed, Draft) render as today.

### Tests (write first)

- `src/contrast.test.ts`: add `--brand-border` and `--brand-2-border` on `--paper` and `--surface` ≥ 3:1 for both themes; add a rule scan: no `border`/`border-color` declaration uses `var(--brand)`/`var(--brand-2)` unless the same rule has `background(-color): var(<same token>)`.
- New `src/styles/badgeIcons.test.ts`: scans `src/**/*.tsx` (not tests) for literal `<span|p className="badge badge--done|progress"…>` and requires the content to start with `<SomeIcon className="icon…`; plus a guard that the scan finds at least one badge (so a broken regex cannot pass silently). **Write the regex in the `.ts` file directly** (an earlier attempt generated it through a Python string and the `\1` backreference became a control character, making the test pass vacuously).
- New `components/novel/StatusBadges.test.tsx`: Published and Translating… contain an `svg`.
- Update the tests that pin the old tokens: `src/brandRoles.test.ts` (orange border at rest → `--brand-border`; hover borders → `--brand-2-border`), `components/ui/Select.test.tsx` (trigger hover → `--brand-2-border`), `pages/NovelPage.test.tsx` (`⚠ 2` → badge with accessible name "2 page(s) may be incomplete", text `2`, contains an `svg`).

### Non-goals

- No change to brand hexes, fills, text colours, focus rings, accent bars, dark theme values.
- No neutral borders (option B was rejected).

## Part 2 — Toast format (points 1–5)

Toasts use `sonner` 2.0.8, mounted once by `components/AppToaster.tsx` in `App` and `PublicApp`. Position (centre of the screen) stays.

### Rules

1. **Punctuation.** The toast **title** is a short phrase with **no trailing period** (no `…` either, except nothing — see rule 4). A **description**, when present, is plain text without a trailing period when it is a fragment (a name, `Updated 2 · Failed 1`) and with one when it is a full sentence (an error hint).
2. **Wording.** Title = `<Thing> <past participle>` (or a fixed phrase for a state change). Names, counts and other specifics go in the **description**, never glued into the title. Table (admin English; public Vietnamese unchanged):

   | Where | Now | New title | New description |
   |---|---|---|---|
   | `FanficsTab` refresh one | Story refreshed | Fanfic refreshed | – |
   | `FanficsTab` refresh all, none failed | `Updated 3 · Failed 0` (success) | Fanfics refreshed | `Updated 3` |
   | `FanficsTab` refresh all, some failed | `Updated 2 · Failed 1` (message) | Some fanfics failed to refresh (**warning**) | `Updated 2 · Failed 1` |
   | `FanficsTab` add | Fanfic added | Fanfic added | – |
   | `NovelMenu` banner | Added to banner / Removed from banner | Novel added to banner / Novel removed from banner | – |
   | `WattpadParts` start | `Translating ${title}…` (success) | Translation started (**info**) | part title |
   | `PhotoPostDialog` fetch | `Fetched from X` / `Fetched from X. Kept your caption and date` | Post fetched from X | `Kept your caption and date` when something was kept |
   | `PublishButton` start | `Publishing…` (plain) | Publishing started (**info**) | – |
   | `PublishButton` done | Published + Open site link | Site published | Open site link (unchanged) |
   | `SaveToPlaylist` | `Saved to ${name}` / `Removed from ${name}` | Added to playlist / Removed from playlist | playlist name |
   | `ChapterPage` | Original reloaded / Auto-saved / Chapter saved | Original text reloaded / Chapter auto-saved / Chapter saved | – |
   | `HomePage` | `Already fetched: ${title}` (warning) | Already fetched (**warning**, kept) | video title |
   | `NovelPage` / `PhotosPage` / `WorkEditPage` | Novel saved / Post saved / Work saved / Work deleted | unchanged | – |
   | `PlaylistEditPage` | `Playlist deleted: ${name}` | Playlist deleted | name |
   | `ProfilePage` | `${member} deleted` | Member deleted | member display name |
   | `ProfilesPage` | `Saved ${name}.md (backup kept)` | Profile saved | `${name}.md · previous version kept in history` |
   | `VietsubEditPage` | Vietsub saved / Marked as done / Reopened | Vietsub saved / Vietsub marked as done / Vietsub reopened | – |
   | `VietsubPage` | `Vietsub replaced: ${title} (${n} lines)` | Vietsub replaced | `${title} · ${n} lines` |
   | `WorkEditPage` people | `Added ${names} to People` | Added to People | names joined by `, ` |
   | `PublicNovelPage` (public, vi) | Đã thêm vào tủ sách / Đã bỏ khỏi tủ sách | unchanged | – |

3. **Errors go through one helper.** New `lib/toast.ts` with `toastError(message: ErrorMessage)` (title = `message.title` with one trailing `.` removed; description = `message.hint`, if any). All error toasts use it:
   - `NovelMenu` (today glues hint onto the title), `WattpadParts`, `PublishButton` (start error; failed publish → title `Publishing failed`, description = server error text), `PeopleDialog` (`PERSON_IN_USE` → title `Person is in use`, description = server `detail`; others via `errorMessage`), `WorkEditPage` badge people (title `Could not add the Badge's people`, description = `errorMessage(e).title`).
   - Inline `Alert`s keep using `errorMessage` as today; only toasts change.
4. **Toast type = meaning.** `success` = finished, `info` = started / in progress, `warning` = partial or nothing done, `error` = failed. Nothing that only *starts* work is a success toast. No `toast()`/`toast.message()` plain calls remain.
5. **Theme and tokens.** Toasts follow the app theme tokens, not the OS and not sonner's defaults: in `AppToaster.css` set sonner's variables on the toaster (`--normal-bg: var(--surface)`, `--normal-text: var(--ink)`, `--normal-border: var(--rule)`; verify names in `node_modules/sonner/dist/styles.css`), description colour `var(--muted)`, links in the description `var(--brand-ink)` (hover `--brand-2-ink`), shadow `var(--shadow-overlay)`, close button colours from tokens. Keep the existing left accent (orchid default/info/warning, orange success, red error) and icon colours. Because colours come from tokens, a forced `data-theme` is honoured too. `theme` prop: keep `"system"` (it only affects sonner's own fallbacks, now overridden) — builder may switch to `"light"` if the overrides need it; either way the test checks the tokens.

### Tests (write first)

- New `src/lib/toast.test.ts`: `toastError` strips one trailing period, passes the hint as `description`, omits description without a hint.
- New `src/styles/toastFormat.test.ts` (source scan of non-test `.ts/.tsx`): no `toast(` / `toast.message(` calls; no string-literal toast title ending in `.` or `…`; no `toast.success(` whose first argument is a template literal containing `${` (specifics belong in the description). Include a guard that the scan finds at least one `toast.success(` call.
- `components/AppToaster` CSS test: the toaster sets `--normal-bg: var(--surface)`, `--normal-text: var(--ink)`, `--normal-border: var(--rule)`; description uses `var(--muted)`; no hex colours in `AppToaster.css`.
- Update the existing tests that assert old toast strings/types (e.g. `FanficsTab.test.tsx` expects `toast.message('Updated 2 · Failed 1')` / `toast.success('Updated 3 · Failed 0')`; grep all `*.test.tsx` for `toast.` and old strings).

### Non-goals

- Toast position, duration, close button placement: unchanged.
- No i18n library; public toast text unchanged.

## Done when

- `cd frontend && npx vitest run` all green, `npx tsc -b` clean, `mvn test -Dskip.npm` green (no backend change expected).
- `PROGRESS.md` log entry and `CLAUDE.md` updated (Frontend → Màu: the two border tokens and the rule "1 px brand borders use `-border` tokens"; a short "Toast" bullet with rules 1–5 and `toastError`).
