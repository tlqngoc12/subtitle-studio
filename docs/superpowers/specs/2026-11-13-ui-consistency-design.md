# UI consistency: audit and Master Layout — design

Date: 2026-11-13 · Status: approved in chat, awaiting spec review

## Goal

Every screen (admin and public) follows one page structure: same navigation context, same header, same place for
actions, same toolbar, same form footer. Package the structure as shared components so new screens are correct by
default, and write the rules down (`docs/ui/screen-layout.md`) for future work.

Out of scope: colours (orange `--brand` / purple `--brand-2` stay), control sizes and field styles (already unified by
the 2026-11-11 UI polish), the top navbar design, the reader's own bars.

## Audit (measured on the running app, 2026-11-13)

Method: 20 admin routes on `localhost:8080` and 10 public routes on the last published site, each at 1440×900 and
390×844, with computed styles collected by script (h1, header, breadcrumbs, back links, buttons, inputs, cards, empty
states).

**Already consistent (no change):** every visible `h1` is 31.25 px / 700 / `--ink`; buttons are 32/40/48 px with 8 px
radius; fields are 40 px with a 1 px `--field-border`; page gutter 40 px and container 1120 px; colours follow the
brand roles. The inconsistencies are structural.

### 1. Button and action controls

| Component | Current (page A vs page B) | Unified standard |
|---|---|---|
| Create action | Works / Photos: header right. Fanfics: end of the filter row. Playlists: inline form card (Name + Description + Create). Chapters: full-width orange bar left under the tabs. | Page-level create → header right. Tab-level create → right end of that tab's toolbar. Playlists → "Create playlist" in the header opening a dialog. |
| Header button size | Works: "People" 32 px next to "Add work" 40 px. Profile: "Add member" / "Edit" 32 px. Photos: "Add post" 40 px. | Every header and toolbar action is M (40 px). One primary (orange) per page at most, rightmost. |
| Save | Vietsub editor: icon-only button top right. Work / Novel forms: `.form-actions` at the end of a ~1,500 px form (off screen). Chapter: Save under the textarea, left. | Form pages: sticky `FormActions` bar at the bottom: Delete (danger) far left, Cancel, Save (primary) far right. Tool pages (Vietsub editor): text button "Save" in the header, shortcut in the tooltip. |
| Chapter actions | Translate / Publish / Unpublish sit under the title (Unpublish is S 32 px). | Header actions, M. |

### 2. Filter and search

| Component | Current | Unified standard |
|---|---|---|
| Search width | Vietsub Videos 927 px, Vietsub list 560 px, Fanfics 285 px. | First item of the toolbar, max 360 px on desktop, full width on phones. |
| Filter style | Vietsub Videos: "Filter" button opening a popover (All / AI / Manual). Works / Fanfics: `FilterPills`. | Always `FilterPills` inline. Source filter becomes pills. |
| Order | Fanfics: search · pills · sort · Refresh · Add. Vietsub: search · Filter (far right). Works: people avatars · pills. | Row 1 (only where people filtering exists): people avatars. Row 2: search · pills · sort · spacer · tab actions. |

### 3. Typography and headings

| Component | Current | Unified standard |
|---|---|---|
| Page title | H1 = page name on most pages, but Get Engsub shows "Subtitle Studio"; public Novels hides its H1 ("Truyện", visually hidden); Watch puts H1 under the video; Work detail uses its own `work__title`, not `PageHeader`. | H1 always visible and equals the menu/page name. Exceptions only via the `hero` and `media` variants (below). |
| Section title (`h2`) | 20 px (sections), 12.8 px (year dividers on Works), 31.25 px (member names on Profile). | Three roles only: page title `h1` (`--step-3`), section title `h2` 20 px / 700, group label 12.8 px / 700 `--muted` (year dividers). Profile member names are the single allowed "hero name" exception. |

### 4. Container, card and table

| Component | Current | Unified standard |
|---|---|---|
| Card padding | `novel-card` 12 px; `plcard`, `fanfic-card` 16 px; `featured` 32 px. | One card: 1 px `--rule` border, `--radius-frame` (14 px), padding 16 px (12 px under 521 px), `--surface`. Featured banner keeps 32 px as a hero. |
| Management lists | Videos / Playlists: divider rows, no box. Chapters: each row a bordered box. | Divider rows everywhere (Chapters change). |
| Page width | 1120 px default; Vietsub editor 1440 px; reader 960 px; forms 760 px inputs inside 1120 px. | Named widths: `default` 1120, `wide` 1440, `narrow` (forms 760, reader 960 keeps its own). |

### 5. Other

| Component | Current | Unified standard |
|---|---|---|
| Navigation context | Breadcrumbs: Vietsub editor, public All novels / novel / reader. "← Back to X": Watch, Playlist edit, Work detail, Work edit, Vietsub list (playlist view). "← Parent name": Novel, Chapter, New novel. None: everything else. | Breadcrumbs on every page at level ≥ 2; no back links. Phones show only "← Parent". |
| Empty states | `EmptyState` (icon + text) on most lists; plain text on Playlists, Vietsub list (no playlists / no videos), Fanfics (none yet), Chapters, Save to playlist. | Always `EmptyState` (icon + one sentence with the next step + optional action). |
| Loading | `SkeletonList` / `SkeletonGrid` on lists, `LoadingText` on detail pages. | Page or list loading → skeleton shaped like the content; `LoadingText` only inline (buttons, small regions). |
| 404 (bug) | Admin unknown URL (e.g. `/nope`) returns Spring's JSON `{"status":404,...}`: no `*` route and no SPA fallback. | Admin `*` route renders `NotFoundPage`; Spring forwards unknown non-API paths to `index.html`. |
| Mobile navbar (bug) | At 390 px the admin navbar shows a clipped fragment ("e") of the previous item beside the active pill. | Scrolling menu shows whole items only (fade edge or scroll snap); no clipped glyphs. |

## Decisions (from the user)

| Topic | Decision |
|---|---|
| Navigation context | **Breadcrumbs** on every page at level ≥ 2; remove all "← Back to…" links. Phones collapse to "← Parent". |
| Create / main action | Page-level → header right; tab-level → right of the tab toolbar. Max one primary per page. Header actions 40 px. |
| Playlists create | Header button "Create playlist" → dialog (Name, Description). Inline form removed. |
| Filters | Everything inline as pills ("make it all consistent"): Vietsub source filter popover → `FilterPills`. |
| Form footer | **Sticky** action bar on every form page. |
| Scope | All admin and public screens, one PR. |

## Master Layout

```
Topbar (unchanged)
┌──────────────────────────────────────────────────────────────┐
│ Breadcrumbs   Novels › Be My Sugar! › Chapter 3   (level ≥ 2) │  phone: "← Be My Sugar!"
│ H1 Title                               [Secondary] [Primary]  │  required
│ Lede (optional)                                               │
│ Tabs (optional)                                               │
│ Toolbar: [Search][Pills][Sort ▾] ············ [Tab actions]   │  list pages
│ Content                                                       │
│ ▁▁ sticky FormActions (form pages) ▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁ │
└──────────────────────────────────────────────────────────────┘
```

| Zone | Required? | Rule |
|---|---|---|
| Breadcrumbs | Level ≥ 2 | First crumb = top menu item (English label on both sites, like the menu). Last crumb = current page, not a link. Under 521 px only "← {parent}" is shown. |
| Header (H1) | Always | Visible H1 = page name. Lede optional, max 60ch. |
| Header actions | Optional | Right of H1 (aligned to the H1 baseline row); wrap under the H1 on phones. M size. Order: secondary… then primary last. |
| Tabs | Optional | Directly under the header, `tabs__list` style (unchanged). |
| Toolbar | List pages | Order above. Search max 360 px. |
| Content | Always | Sections separated by 48 px; section title `h2`. |
| FormActions | Form pages | Sticky bottom; Delete left, Cancel, Save right. |

**Vertical spacing:** breadcrumbs → header 16 px (`--space-4`); header → tabs / toolbar / content 24 px (`--space-6`);
tabs → toolbar 16 px; toolbar → content 16 px; between content sections 48 px (`--space-12`). Gutter stays `--gutter`
(16–40 px), bottom padding 64 px (+ height of the sticky bar on form pages).

**Header variants**

- `default`: as above.
- `hero`: detail pages with a cover (admin Novel, public Novel, Work detail). Cover left, H1 + chips + actions right;
  breadcrumbs above. Same H1 style.
- `media`: Watch and Reader. Breadcrumbs on top, then the player / text; Watch keeps H1 under the video (YouTube
  convention), Reader keeps its visually hidden H1. No other page may hide its H1.

**Widths:** `default` 1120 px; `wide` 1440 px (Vietsub editor only); `narrow` 760 px for single-column forms
(Work add/edit, New novel, Chapter edit). The reader keeps its own measure.

## Components (`src/components/ui/`)

```tsx
<Page width="default" | "wide" | "narrow">               // <main className="page page--{width}">
  <PageHeader
    breadcrumbs={[{ label: 'Novels', to: '/novels' }, { label: novel.title, to: novelPath }, { label: chapterName }]}
    title={chapterName}
    lede="…"                                             // optional
    actions={<><button className="button">Translate</button><button className="button button--primary">Publish</button></>}
    variant="default" | "hero" | "media"
    media={<Cover … />}                                  // hero only
  />
  <Tabs …/>                                              // optional, unchanged
  <Toolbar
    search={<SearchBar … />}
    filters={<><FilterPills … /><Select … /></>}
    actions={<button className="button button--primary">Add fanfic</button>}
  />
  {content}
  <FormActions sticky start={<DeleteButton />}>          // form pages
    <button className="button" type="button">Cancel</button>
    <button className="button button--primary" type="submit">Save</button>
  </FormActions>
</Page>
```

- `Breadcrumbs` (existing) gains the phone collapse ("← parent", a normal link with `aria-label="Back to {parent}"`)
  and is rendered only by `PageHeader`.
- `PageHeader` renders breadcrumbs + header; replaces the raw `<h1 className="masthead__name">` in ChapterPage,
  NovelPage, PlaylistEditPage, PublicNovelPage and `work__title` in WorkDetailPage.
- `Toolbar`: flex row, wraps; search slot `flex: 0 1 360px` (100 % on phones); actions pushed right
  (`margin-inline-start: auto`).
- `FormActions`: wraps the current `.form-actions` styles; `sticky` adds `position: sticky; bottom: 0`, `--paper`
  background, top `--rule` border, `--z-sticky`, safe-area padding. Pages using it register with `BackToTop liftOn`.
- `EmptyState` (existing) everywhere a list can be empty.
- Remove the `.back-link` class and `SourceFilter` (+ its CSS) after migration.

## Page-by-page changes

| Route | Change |
|---|---|
| `/` Get Engsub | H1 "Get Engsub" (was "Subtitle Studio"). |
| `/vietsub` Videos | Toolbar: search (360) + source pills (All / AI / Manual). |
| `/vietsub/playlists` | Header action "Create playlist" → dialog; inline form removed; `EmptyState`. |
| `/vietsub/playlists/:id` | Breadcrumbs Vietsub › Playlists › {name}; header actions (Edit details, …) M; back link removed. |
| `/vietsub/profiles` | Toolbar: profile select · spacer · "Analyze corrections". |
| `/vietsub/:id/edit` | `wide`; header action Save as text button ("Save", tooltip "Ctrl+S"); existing breadcrumbs move into `PageHeader`. |
| `/vietsub/:id` Watch | `media`; breadcrumbs Vietsub list › {title} (or › {playlist} › {title} with `?playlist=`); back link removed. |
| `/vietsub/list` | Playlist view: breadcrumbs Vietsub list › {playlist} instead of "Back to Playlists"; plain-text empties → `EmptyState`. |
| `/profiles` | Header actions Add member / Edit become M. |
| `/photos` | Unchanged (already standard). |
| `/works` | Header "People" becomes M. |
| `/works/new`, `/works/:id/edit` | `narrow`; breadcrumbs Works › ({title} ›) Add work / Edit; sticky `FormActions`. |
| `/works/:id` | `hero`; breadcrumbs Works › {title}; admin Edit in header actions. |
| `/novels` | Fanfics toolbar per standard (search · pills · sort · Refresh all · Add fanfic); Fanfics empty → `EmptyState`. "New novel" belongs to the Translated tab, so it moves from the header (where it disappears on the Fanfics tab) to the right of a Translated toolbar. |
| `/novels/new` | `narrow`; breadcrumbs Novels › New novel; sticky `FormActions`. |
| `/novels/:id` | `hero`; breadcrumbs Novels › {title}; Chapters toolbar with "Add chapter" (M primary) right; chapter rows become divider rows; empty → `EmptyState`. |
| `/novels/:id/chapters/:cid` | Breadcrumbs Novels › {novel} › {chapter}; Translate / Publish / Unpublish in header actions (M); sticky Save. |
| any unknown admin URL | `NotFoundPage`: route `*` in `App`, and `SpaForwardController` forwards any path that is not `/api/**` and has no file extension in its last segment to `index.html` (so new routes no longer need listing there; update the CLAUDE.md bullet). |
| Public `/novels` | H1 "Truyện" visible. |
| Public `/works/:id` | Same as admin detail (`hero`, breadcrumbs "Works › {title}"). |
| Public `/novels/all`, `/novels/:slug`, reader | Breadcrumbs through `PageHeader`; reader keeps `media`. |
| All dialogs with forms | `FormActions` (not sticky). |

Navbar at 390 px: no clipped item fragments.

## Enforcement

A source-scanning test (`src/styles/layout-rules.test.ts`, using the existing `src/test/css.ts` helpers style) fails
when, outside `components/ui/`:

- a file under `pages/` renders a raw `<h1` (except `ReaderPage` media H1),
- the class `back-link` appears anywhere,
- a `.tsx` under `pages/` has a `<main` element (pages render `<Page>`),
- `className="form-actions"` is written by hand (use `FormActions`).

Plus component tests for `Page`, `PageHeader` (breadcrumbs, variants, actions), `Toolbar`, `FormActions` (sticky, start
slot), `Breadcrumbs` phone collapse (rendered markup; CSS hides the full trail under 521 px), and updated page tests
(queries by role: `navigation` "Breadcrumb", heading level 1).

## Documentation

- `docs/ui/screen-layout.md`: the rules (this spec's standard, without the audit), written for future screens.
- `CLAUDE.md` › Frontend: one bullet pointing to it ("every new screen follows docs/ui/screen-layout.md").

## Risks

- Large diff across ~25 pages; estimated 3–4 h of implementation. Keep commits per area (components → Vietsub →
  Works/Photos/Profile → Novels → public → 404/navbar → cleanup).
- Sticky footer and `BackToTop` overlap → use `liftOn`.
- Public site must be republished (Publish) to show the change.
