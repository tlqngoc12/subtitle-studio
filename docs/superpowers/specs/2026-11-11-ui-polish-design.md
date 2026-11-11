# UI polish, design system and Works/Photos fixes — design

Date: 2026-11-11 · Status: approved in chat, awaiting spec review

## Goal

Make every screen (admin and public) consistent: one button scale, one field style, one image picker, one date
picker, a shared motion language. Fix the Works and Photos issues the user reported.

## Evidence (measured on the running app, 2026-11-11)

- Buttons come in **7 heights**: 34, 37, 42, 45, 50, 51, 62 px. Save is 50 px / 16 px while Cancel next to it is 37 px /
  12.8 px. Radii mix 8 px, 999 px (Vietsub search + Filter) and 0. 14 CSS files define their own button styles.
- Base CSS only styles `.field input[type='text']` and `textarea`: **date, number, select, file inputs are raw browser
  controls** (21 px high, 13.3 px text, square, US `mm/dd/yyyy`). Text inputs are 42 px; Vietsub search 50 px; the
  Get Engsub link input 54 px with 20 px text.
- Labels mix 12.8 px captions ("Title", "Date") with 18 px bold headings ("Image", "Source", "People") in one form;
  Photos dialog inputs have a beige fill, Work editor inputs are white.
- Image choosing has three looks: raw "Choose File · No file chosen" (Work cover), drop zone (Photos),
  `ImagePicker` (Profile/Novel).
- 12 different transition durations (120–600 ms) and no shared easing.
- Bug: in the Work editor, **People → Person → Create** submits the outer work form (React submit events bubble
  through the Radix portal), so the work is saved and the page jumps to the work detail.

## Decisions (from the user)

| Topic | Decision |
|---|---|
| Scope | Whole app, admin **and** public. |
| Instagram date/title fetching | **Dropped.** Admin types them. |
| Works categories | **Multiple** per work. A work is a film when its categories include Film & TV: people heading "Cast" and Character inputs; only Music → "Artists"; else "People". Cards show all category chips; the category filter matches works that contain it. |
| Works sorting | Coming Soon (no date) first, then release date newest → oldest, then id desc (unchanged rule, now tested). |
| Photos | Remove **End date**. Sort newest → oldest (unchanged, tested). Date and Photo count get proper controls. Save and Cancel same size. |

## 1. Design tokens (`frontend/src/styles/tokens.css`)

```
--control-s: 32px;  --control-m: 40px;  --control-l: 48px;
--fs-caption: 13px; --fs-control: 15px; --fs-control-l: 16px;
--field-gap: 6px;   /* label → control */
--dur-instant: 80ms; --dur-fast: 120ms; --dur-base: 200ms; --dur-slow: 320ms;
--ease-out: cubic-bezier(0.2, 0, 0, 1);
--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
```
Spacing stays the existing 4 px scale (`--space-1` … `--space-16`); only `4 8 12 16 24 32 48 64` are used for new or
touched rules. `@media (prefers-reduced-motion: reduce)` sets every `--dur-*` to `0ms` and disables reveal/stagger.

## 2. Buttons

One class family, fixed heights, radius `var(--radius-control)` (8 px), weight 600, icon 16 px, gap 8 px.

| Size | Class | Height | Padding x | Font |
|---|---|---|---|---|
| S | `.button--s` | 32 px | 12 px | 13 px |
| M (default) | `.button` | 40 px | 16 px | 15 px |
| L | `.button--l` | 48 px | 20 px | 16 px |
| Icon | `.button--icon` (+ `--s`) | 40 × 40 (32 × 32) | 0 | icon 18 (16) px |

Variants (colour only): default = secondary (surface background, orange border), `--primary` (orange fill),
`--ghost` (no border), `--danger` (red border/text), `--danger-solid`. Buttons placed side by side always share a
size. Form action bars: right-aligned on desktop in the order `Delete` (left, separated) … `Cancel`, `Save`;
full-width stacked on phones (Save on top). `--small` is renamed to `--s`; every one-off button style in component
CSS is replaced by these classes (exceptions: navbar pills, tabs, the reader bar — they are not buttons
visually and keep their own components, but use the same heights and motion tokens).

Size usage: L only for the single main call to action of a page (Get Engsub submit); M for page header actions,
dialog/form actions, Filter, Publish; S inside rows, quick-add chips, toolbars, pagination.

## 3. Fields

- Every `input` (text, url, search, email, number, date-trigger), `select`, Radix Select trigger, combobox trigger:
  height `--control-m`, padding 0 12 px, radius 8 px, font `--fs-control`, background `var(--surface)`, border 1 px
  `var(--field-border)`; textarea same but min-height 96 px and padding 10 px 12 px. Large variant `--control-l` /
  `--fs-control-l` only for the Get Engsub link input.
- Component `Field({ label, hint, error, required, children })` in `components/ui/Field.tsx`: label 13 px / 600,
  `--field-gap` to the control, hint/error 13 px 4 px below; wires `id`, `aria-describedby`, `aria-invalid`.
- Form rhythm: 16 px between fields, 24 px between field groups, 32 px before the action bar; two-column rows use
  CSS grid `1fr 1fr` with 16 px gap and **align-items: start**, collapsing to one column below 520 px.
- Group headings inside forms (Links, People, Source…) use the same label style as fields, not h2/h3 sizes; the
  form's section titles (if any) are 16 px / 600.

## 4. New shared controls

- `DatePicker({ value: string | null /* yyyy-mm-dd */, onChange, placeholder, clearable })` — trigger looks like a
  field and shows `dd/MM/yyyy` (or placeholder, e.g. "Coming Soon" for Release date); opens a Radix Popover with
  `react-day-picker` (add the dependency, exact version pinned like the others, a release at least 2 weeks old),
  week starts Monday, month/year dropdown navigation, `Today` and `Clear` buttons. Keyboard accessible (library).
  Strings in/out stay `yyyy-mm-dd` without `Date` time-zone shifts.
- `NumberField({ value, onChange, min, max })` — field with − / + icon buttons (S) inside, typing allowed, clamps on
  blur; empty allowed (null).
- `ImageDropzone({ value: { url, width?, height? } | null, onChange(file | null), maxSide, aspect, label })` — one
  look everywhere: dashed box with icon + "Drop an image, paste with Ctrl+V, or" + `Choose image` (S); with a
  value: preview in the given aspect (`1/1`, `3/4`, `4/5`, `16/9`, `auto`) and `Replace` / `Remove` (S). Upload via
  `uploadMedia(file, maxSide)`; shows progress state; Ctrl+V only when focus is inside the dropzone or its dialog.
  Replaces the image choosing in: Work cover (4/5, 1600), person avatar (1/1, 400), profile portrait (3/4, 1600),
  banner add (auto, 1600), novel cover (keep current size rule), image/gallery blocks, Photos (auto, 1600).
  Chapter page multi-upload (`PageUploader`) and `.srt` upload keep their own flows but get the dropzone styling.

## 5. Motion annotation

All durations/easings from the tokens. Everything respects reduced motion.

| Component | Trigger | Property | Duration · easing |
|---|---|---|---|
| Button | hover | background-color, border-color, color | fast · ease-out |
| Button | active | `transform: scale(0.97)` | instant · ease-out |
| Button / any control | focus-visible | 2 px outline `--focus`, offset 2 px (no animation) | 0 |
| Field | focus | border-color → `--focus`; box-shadow `0 0 0 3px` purple 25 % | fast · ease-out |
| Field | error appears | border red; error text opacity 0→1, translateY −2→0 | fast · ease-out |
| Select / Popover / DatePicker / Dropdown | open | opacity 0→1, translateY −4→0, scale 0.98→1, origin = trigger side | base(160 ms) · ease-out; close 120 ms |
| Modal (Dialog/AlertDialog) | open / close | overlay opacity; panel opacity + translateY 12→0 (phone: 24→0 from bottom) | base · ease-out; close fast · ease-in-out |
| Card (works, photos, playlists, novels) | hover (pointer: fine) | translateY −2 px, shadow one step up | base · ease-out |
| Toast | enter / leave | translateY 8→0 + opacity / reverse | base / fast |
| Navbar (admin + public, not the novel reader which keeps its own) | scroll down > 64 px from top, delta ≥ 8 px | translateY → −100 % | base · ease-in-out |
| Navbar | scroll up ≥ 8 px or at top | translateY → 0; background becomes `color-mix(surface 80 %) + backdrop-filter: blur(12px)` when scrollY > 0 | base · ease-out |
| Scroll reveal (sections, cards) | element 10 % in viewport, first time only | opacity 0→1, translateY 16→0 | slow · ease-out |
| Stagger (grids/lists after load or filter change) | data rendered | as reveal, delay 30 ms × index, capped at 8 items (later items delay 240 ms) | 240 ms · ease-out |
| Layout transition | list length / filter changes | `motion` `layout` on items (position/size), exiting items fade | 240 ms · ease-in-out |
| Skeleton | loading longer than 150 ms | grey blocks matching the final layout; opacity pulse 0.6 ↔ 1 | 1.2 s loop · ease-in-out |
| Tabs underline / nav pill | selection change | existing `motion` layoutId, retimed to base · ease-out | base |

Implementation: `lib/useScrollDirection.ts` (extend `useHideOnScroll`), `components/ui/Reveal.tsx` (`motion`
`whileInView`, `viewport={{ once: true, amount: 0.1 }}`), `components/ui/Skeleton.tsx` (+ `SkeletonGrid`,
`SkeletonList`) replacing `LoadingText` on list/grid pages (keep `LoadingText` for inline states).

## 6. Works changes

- **V16 migration** (next free number): `t_work_category (work_id FK ON DELETE CASCADE, category VARCHAR2(20 CHAR)
  check same 8 values, position ${int}, PK (work_id, category))`; copy each work's `category` as position 1; drop
  `t_work.category` and its check constraint. `PersistenceOracleIT` table list + `T_WORK_CATEGORY`.
- API: `category` → `categories: WorkCategory[]` (1–8, unique, order kept) in request, summary and detail;
  export JSON likewise. Validation errors on `categories`.
- `characterName` kept when categories contain `FILM_TV`; heading rule as in Decisions.
- Editor: category = chip toggle group (S buttons, `aria-pressed`), at least one required; subcategory suggestions
  from works sharing any selected category.
- Filter `?cat=` keeps works whose categories contain it. Card shows all category chips then subcategory.
- **Create person bug:** the create form inside `PersonPicker` must not submit the work form — stop propagation of
  its submit event (and render it as a `div` with a button `type="button"` handler or keep the form with
  `e.stopPropagation()`); test: creating a person keeps the editor open, adds the credit, does not call
  `createWork/updateWork`, does not navigate. Check `PeopleDialog` and any other form inside a portal for the same
  bug (`MemberHeaderEditor` popovers, `Add member` popover).
- Link rows: one line on ≥ 760 px — drag handle · icon select (S width 120 px) · label (180 px) · URL (1fr) · remove;
  phones: two lines (icon+label / URL). Visible labels replaced by `aria-label`s; one header row above the list.
- Release date: `DatePicker` with placeholder "Coming Soon" and Clear.
- Sorting test: Coming Soon first, then newest → oldest, then id desc (backend and the client-side re-sort after
  save).

## 7. Photos changes

- **V16 (same migration):** drop `t_photo_post.taken_until`. API/DTO/export lose `takenUntil`; date shown as one day.
- Dialog: Date = `DatePicker` (default today, not clearable); Photo count = `NumberField` 1–99 (empty allowed);
  Image = `ImageDropzone`; Source and People toggles are S buttons; action bar per §2.
- Sorting unchanged (newest → oldest, id desc), covered by a test on the client re-sort.

## 8. Page-by-page pass

Apply §2–§5 to: Get Engsub (link form: L input + L button, translation select M), Vietsub (Videos/Playlists/
Profiles tabs, search M with radius 8 px, Filter M), Vietsub list (+ public), watch page, Vietsub editor, Playlist
edit, Profile (+ edit mode), Works grid/detail/editor, People dialog, Photos (+ dialog), Novels list/home, novel page
(admin tabs and chapter rows: icon buttons S), chapter editor, public novel pages and reader (motion tokens only),
Publish button, toasts, confirm dialogs, pagination (S). Lists/grids get Skeleton + stagger + layout transition;
headers/sections get Reveal where it adds value (not on every row of long tables).

## Testing

- Unit: DatePicker (formats, clear, keyboard open, no TZ shift), NumberField (clamp, empty), ImageDropzone (pick,
  drop, paste, replace, remove), Field (aria wiring), useScrollDirection, Reveal disabled under reduced motion,
  PersonPicker regression, multi-category filter/heading/character rules, Photos without end date.
- Backend: V16 migration on H2 + Oracle IT, multi-category validation and sorting, export shape.
- **Consistency test** `frontend/src/styles/controls.test.ts` (reads CSS via `src/test/css.ts`): `.button` height
  40 px, `--s` 32 px, `--l` 48 px, field selector covers `input:not([type=checkbox]):not([type=radio]):not([type=file])`,
  `select`, `textarea`; and a lint-style test that component CSS files contain no `padding`/`height` on selectors
  matching `button` except the allowed components (navbar, tabs, reader bar).
- Manual: before/after Edge headless screenshots of every page in §8 at 1440 and 390 px; measure control heights with
  the CDP script (all buttons ∈ {32, 40, 48}, all fields ∈ {40, 48} except textarea).

## Out of scope

Fetching data from Instagram; dark-mode redesign (tokens must still work in dark mode); new pages.
