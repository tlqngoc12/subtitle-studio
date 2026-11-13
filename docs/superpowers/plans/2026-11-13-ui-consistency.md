# UI Consistency (Master Layout) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every admin and public screen follows one Master Layout (breadcrumbs, visible H1, header actions, toolbar, sticky form footer, `EmptyState`), packaged as shared components and guarded by a source-scanning test.

**Architecture:** New layout primitives in `frontend/src/components/ui/` (`Page`, `Toolbar`, `FormActions`; `PageHeader` and `Breadcrumbs` extended). Pages migrate area by area onto them; hand-written `<main>`, `<h1>`, `.back-link` and `form-actions` markup disappear. A Vitest test scans `src/` so new screens cannot drift. Two small fixes ride along: admin 404 (SPA forward patterns + `*` route) and the clipped mobile navbar.

**Tech Stack:** React 19 + TypeScript + Vite, Vitest + React Testing Library, plain CSS with tokens (`styles/tokens.css`), Spring Boot (one controller change).

**Spec:** `docs/superpowers/specs/2026-11-13-ui-consistency-design.md` (audit + decisions). Standing rules: `docs/ui/screen-layout.md`. Read both before Task 1.

## Global Constraints

- Branch: `feat/ui-consistency` created **from `docs/ui-consistency-spec`** (it carries the spec, rules and plan commits); one PR to `main` containing docs + code. Do not open a PR for `docs/ui-consistency-spec`.
- Colours unchanged: `--brand` orange (primary/action), `--brand-2` purple (selected/current); red only for delete/errors.
- Control heights only 32/40/48 (`.button--s` / default / `.button--l`); header and toolbar actions are default (40 px). Max one `button--primary` per header.
- Spacing tokens only: breadcrumbs → header `--space-4` (16); header → tabs/toolbar/content `--space-6` (24); tabs → toolbar and toolbar → content 16; between content sections 48 (`--space-12`).
- Widths: `default` 1120 px, `wide` 1440 px, `narrow` 760 px.
- Breakpoints mobile-first: `min-width: 521px / 761px / 1024px` only.
- Admin strings English; public strings via `useT()` Vietnamese, except menu-level labels (Vietsub, Profile, Works, Photos, Novels) which stay English, including as first breadcrumb.
- Follow CLAUDE.md: TDD, query by role/label, no `height`/`padding` on button selectors in component CSS, forms inside portals `stopPropagation()` on submit.
- No deploy, no Publish, no benchmarks. Do not touch `data/`.

## Review Focus

1. **Long titles in breadcrumbs and hero headers** (Thai video titles ~80 chars): must ellipsize on one line, never push actions off screen at 390 px → `Breadcrumbs` test asserts the CSS keeps `text-overflow: ellipsis` on `.breadcrumbs__label` (Task 1) and Task 9 screenshot check at 390 px.
2. **Sticky `FormActions` covering the last field or `BackToTop`** → `FormActions` test checks the page gets bottom padding class; `App` registers `liftOn` for the form routes (Task 3/5).
3. **Unknown admin URL vs real files** (`/assets/*.js`, `/logo.webp`, `/api/nope`): only extension-less, non-`api` paths forward to `index.html`; `/api/nope` stays JSON 404 → `SpaForwardControllerTest` cases (Task 8).
4. **Enter / submit inside the new Create playlist dialog** must not submit anything outside it and must keep focus management of Radix Dialog → test in Task 3.
5. **Unsaved-changes guard on Chapter and Vietsub editor**: breadcrumb links must go through the same `leave()` guard the old back link used → tests in Task 3 (editor) and Task 5 (chapter).

---

### Task 1: Layout primitives

**Files:**
- Create: `frontend/src/components/ui/Page.tsx`, `Toolbar.tsx`, `Toolbar.css`, `FormActions.tsx`, `Page.css`
- Modify: `frontend/src/components/ui/PageHeader.tsx`, `PageHeader.css`, `frontend/src/components/Breadcrumbs.tsx`, `Breadcrumbs.css`, `frontend/src/styles/base.css` (`.page`, `.form-actions` rules move to `FormActions`/`Page.css` only if nothing else needs them)
- Test: `frontend/src/components/ui/Page.test.tsx`, `PageHeader.test.tsx`, `Toolbar.test.tsx`, `FormActions.test.tsx`, `frontend/src/components/Breadcrumbs.test.tsx`

**Interfaces (produced, used by every later task):**
```ts
// Page.tsx
type PageWidth = 'default' | 'wide' | 'narrow';
export function Page(props: { width?: PageWidth; className?: string; children: ReactNode } & Omit<ComponentPropsWithRef<'main'>, 'className'>): JSX.Element;
// renders <main className="page page--{width} {className}"> (width default → no modifier); passes rest props (Reader needs handlers/ref)

// PageHeader.tsx (extended, old props keep working)
export function PageHeader(props: {
  title: ReactNode; lede?: ReactNode; actions?: ReactNode; className?: string;
  breadcrumbs?: Crumb[];                       // rendered above the header
  variant?: 'default' | 'hero' | 'media';      // default 'default'
  media?: ReactNode;                           // hero only: the cover, left column
  meta?: ReactNode;                            // chips / status badges under the H1 (hero + default)
  onNavigate?: (e: MouseEvent<HTMLAnchorElement>, to: string) => void; // forwarded to Breadcrumbs (unsaved guard)
}): JSX.Element;

// Breadcrumbs.tsx
export function Breadcrumbs(props: { items: Crumb[]; onNavigate?: (e: MouseEvent<HTMLAnchorElement>, to: string) => void }): JSX.Element;
// + renders <Link className="breadcrumbs__back" to={parent.to} aria-label={t(`Back to ${parent.label}`, `Quay lại ${parent.label}`)}>← {parent.label}</Link>
//   where parent = last crumb that has `to`; full trail hidden under 521px, back link hidden from 521px (CSS, mobile-first)

// Toolbar.tsx
export function Toolbar(props: { search?: ReactNode; filters?: ReactNode; actions?: ReactNode; className?: string; 'aria-label'?: string }): JSX.Element;
// plain <div className="toolbar"> (no ARIA role: it holds inputs) with slots .toolbar__search / .toolbar__filters / .toolbar__actions

// FormActions.tsx
export function FormActions(props: { sticky?: boolean; tight?: boolean; start?: ReactNode; children: ReactNode }): JSX.Element;
// <div className="form-actions [form-actions--sticky] [form-actions--tight]">{start && <span className="form-actions__start">{start}</span>}{children}</div>
```

- [ ] **Step 1: Write failing tests**
  - `Page.test.tsx`: renders a `main` landmark; `width="wide"` → class `page--wide`; extra props (e.g. `data-x`) pass through.
  - `PageHeader.test.tsx`: `getByRole('heading', { level: 1, name })` always present and not visually hidden for `default`/`hero`; with `breadcrumbs` a `navigation` named "Breadcrumb" appears before the heading; `actions` rendered inside the header; `variant="hero"` renders `media` before the heading; `meta` rendered after the heading.
  - `Breadcrumbs.test.tsx`: last crumb has `aria-current="page"` and is not a link; back link `Back to Novels` points to the last crumb with `to`; `onNavigate` is called with `(event, to)` when a crumb link is clicked; CSS (via `src/test/css.ts`) contains `.breadcrumbs__label` with `text-overflow: ellipsis` and the back link is `display: none` inside `@media (min-width: 521px)`.
  - `Toolbar.test.tsx`: slots render in DOM order search → filters → actions; empty slots render nothing.
  - `FormActions.test.tsx`: children order kept; `start` wrapped in `.form-actions__start` (assert via `container.querySelector` is acceptable here because the contract is the class used by CSS); `sticky` adds `form-actions--sticky`; CSS has `.form-actions--sticky { position: sticky; bottom: 0 … }` and z-index `var(--z-sticky)`.
- [ ] **Step 2:** `cd frontend && npx vitest run src/components/ui src/components/Breadcrumbs.test.tsx` → FAIL (missing modules / props).
- [ ] **Step 3: Implement.** CSS values from Global Constraints. `.page` becomes `display:grid; gap: var(--space-6)`; `.page--wide { max-width: 1440px }`, `.page--narrow { max-width: calc(760px + 2 * var(--gutter)) }`; `.page-section + .page-section { margin-top: var(--space-6) }` (24 + gap 24 = 48); `.toolbar { display:flex; flex-wrap:wrap; gap: var(--space-3); align-items:center; margin-bottom: calc(-1 * var(--space-2)) }` (16 to content), `.toolbar__search { flex: 1 1 100% }` and from 521px `flex: 0 1 360px`; `.toolbar__actions { margin-inline-start: auto; display:flex; gap: var(--space-2) }`. Header `hero`: grid cover | text from 521px, stacked on phones. Sticky bar: `background: var(--paper); border-top: 1px solid var(--rule); padding: var(--space-3) 0 calc(var(--space-3) + env(safe-area-inset-bottom))`. Keep existing `.masthead*` class names so current CSS keeps working.
- [ ] **Step 4:** same command → PASS; then full `npx vitest run` (count files = `find src -name "*.test.ts*" | wc -l`).
- [ ] **Step 5: Commit** `Add Page, Toolbar, FormActions and breadcrumb back link`.

### Task 2: Get Engsub + Vietsub › Videos / Profiles

**Files:** Modify `pages/HomePage.tsx`, `pages/VietsubPage.tsx`, `pages/ProfilesPage.tsx` (+ their tests); Delete `components/SourceFilter.tsx`, `SourceFilter.css` (+ test).

- [ ] **Step 1: Failing tests:** HomePage H1 is "Get Engsub". VietsubPage: a radio group / pill group named "Filter by source" with options All / AI / Manual (`FilterPills`), picking "AI" filters as the old popover did (port the old SourceFilter test cases); no button named "Filter". ProfilesPage: profile select and "Analyze corrections" render inside the toolbar (assert DOM order select → button).
- [ ] **Step 2:** run those test files → FAIL.
- [ ] **Step 3:** wrap pages in `<Page>`; VietsubPage uses `<Toolbar search={<SearchBar…/>} filters={<FilterPills label="Filter by source" options={[{value:null,label:'All'},{value:'ai',label:'AI'},{value:'manual',label:'Manual'}]} …/>} />`; ProfilesPage `<Toolbar filters={select} actions={analyze} />`.
- [ ] **Step 4:** PASS + full suite.
- [ ] **Step 5: Commit** `Use the standard toolbar on Get Engsub, Videos and Profiles`.

### Task 3: Vietsub › Playlists, playlist edit, editor, Watch, Vietsub list

**Files:** Modify `pages/PlaylistsPage.tsx`, `pages/PlaylistEditPage.tsx`, `pages/VietsubEditPage.tsx`, `pages/WatchPage.tsx`, `pages/VietsubListPage.tsx`, `components/VietsubList.tsx`, `components/SaveToPlaylist.tsx`; Create `components/CreatePlaylistDialog.tsx` (pattern: `components/fanfics/AddFanficDialog.tsx`); tests beside each.

**Interfaces:** `CreatePlaylistDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange(open: boolean): void; onCreated(p: Playlist): void })` — fields Name (required), Description (optional), `FormActions` Cancel / Create playlist; uses the existing create-playlist API call from PlaylistsPage.

- [ ] **Step 1: Failing tests:**
  - PlaylistsPage: header button "Create playlist" opens a dialog; submitting adds the playlist to the list and closes; no textbox "Name" is visible before opening; Enter in Name submits only the dialog (spy on an outer form not needed — assert one POST and dialog closed); empty list shows `EmptyState` text "No playlists yet. Choose Create playlist to add one."
  - PlaylistEditPage: breadcrumb trail Vietsub › Playlists › {name}; no link "Back to Playlists"; header actions buttons are not `.button--s` (assert by role name present inside the banner/header).
  - VietsubEditPage: button named "Save" has visible text "Save" (not icon-only) and tooltip "Ctrl+S"; clicking a breadcrumb with unsaved edits opens the same confirm dialog as before.
  - WatchPage: breadcrumb `Vietsub list › {title}`; with `?playlist=` → `Vietsub list › {playlist} › {title}`; no "Back to Vietsub list" link; H1 still below the player. Public: first crumb "Vietsub" label per public menu.
  - VietsubListPage: search sits in a `Toolbar` under the tabs (CSS caps `.toolbar__search` at 360 px from 521 px — covered by Task 1); playlist view: breadcrumb `Vietsub list › {playlist}` replaces "Back to Playlists"; "No videos with Vietsub yet." rendered through `EmptyState`.
  - SaveToPlaylist: "No playlists yet." rendered via `EmptyState`.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3:** implement; editor uses `<Page width="wide">`, `PageHeader breadcrumbs onNavigate={leave}`; Watch uses `<Breadcrumbs>` at top + `PageHeader variant="media"` under the player.
- [ ] **Step 4:** PASS + full suite.
- [ ] **Step 5: Commit** `Move Vietsub screens to the Master Layout; Create playlist dialog`.

### Task 4: Works, Photos, Profile

**Files:** Modify `pages/WorksPage.tsx`, `pages/WorkEditPage.tsx`, `pages/WorkDetailPage.tsx` (+ `.css`), `pages/PhotosPage.tsx`, `pages/ProfilePage.tsx`, `components/photos/PhotoPostDialog.tsx`, `components/profile/BlockEditor.tsx`, `components/profile/MemberHeaderEditor.tsx`, `components/works/PersonPicker.tsx`, `App.tsx` (BackToTop `liftOn`); tests beside each.

- [ ] **Step 1: Failing tests:**
  - WorksPage / ProfilePage: header buttons "People", "Add member", "Edit" are default size (no `button--s`; check class on the role-found element — the size class is the contract).
  - WorkEditPage: breadcrumb `Works › Add work` (new) and `Works › {title} › Edit` (edit); no "Back to…" link; Save / Cancel / Delete inside one group whose element has `form-actions--sticky`; Delete comes first in DOM.
  - WorkDetailPage: H1 is the work title via `PageHeader` (heading level 1); breadcrumb `Works › {title}`; admin "Edit" link inside the header; public crumb label "Works".
  - The "Coming Soon" / year dividers are `h2` with class `group-label` (12.8 px / 700 / `--muted` in CSS).
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3:** implement; work form `<Page width="narrow">`; `App.tsx` `BackToTop liftOn` gains `/^\/works\/(new|\d+\/edit)$/`, `/^\/novels\/new$/`, `/^\/novels\/\d+\/chapters\/\d+$/` (chapter is currently in `hideOn`: keep it hidden there, i.e. only add the others). Replace hand-written `form-actions` divs with `<FormActions>` (`tight` where the old one had `form-actions--tight`).
- [ ] **Step 4:** PASS + full suite.
- [ ] **Step 5: Commit** `Move Works, Photos and Profile to the Master Layout`.

### Task 5: Novels (admin)

**Files:** Modify `pages/NovelsPage.tsx`, `pages/NovelNewPage.tsx`, `pages/NovelPage.tsx` (+ `.css`), `pages/ChapterPage.tsx` (+ `.css`), `components/novel/NovelForm.tsx`, `components/novel/ChapterList.tsx` (+ css), `components/fanfics/FanficsTab.tsx` (+ css), `components/fanfics/AddFanficDialog.tsx`, novel card CSS (`novel-card` padding 16, 12 under 521 px); tests beside each.

- [ ] **Step 1: Failing tests:**
  - NovelsPage: on Translated tab a toolbar contains "New novel" (primary); the header has no actions; on Fanfics tab DOM order search → status pills → sort → "Refresh all" → "Add fanfic"; "No fanfics yet." via `EmptyState`.
  - NovelNewPage: breadcrumb `Novels › New novel`; "Create novel" inside a sticky `FormActions`.
  - NovelPage: `hero` header (cover before H1), breadcrumb `Novels › {title}`; Chapters tab toolbar with "Add chapter" (not full width: no `button--block`/full-width class); chapter rows have no per-row border box (CSS rule for the row has no `border:` shorthand other than `border-bottom`); empty list via `EmptyState`.
  - ChapterPage: breadcrumb `Novels › {novel} › {chapter}`; Translate / Publish / Unpublish inside the header actions and default size; Save inside sticky `FormActions`; breadcrumb click with unsaved edits triggers the existing `leave()` confirm.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3:** implement (`NovelForm` and Chapter use `<Page width="narrow">`; the chapter textarea may span the narrow width).
- [ ] **Step 4:** PASS + full suite.
- [ ] **Step 5: Commit** `Move admin Novels screens to the Master Layout`.

### Task 6: Public screens

**Files:** Modify `pages/public/PublicNovelsPage.tsx`, `PublicAllNovelsPage.tsx`, `PublicNovelPage.tsx` (+ css), `ReaderPage.tsx`, `pages/NotFoundPage.tsx`; tests beside each.

- [ ] **Step 1: Failing tests:** PublicNovelsPage H1 "Truyện" visible (not `visually-hidden`), header above the tabs; PublicAllNovelsPage + PublicNovelPage breadcrumbs through `PageHeader` (PublicNovelPage `hero`); ReaderPage renders inside `Page` (main landmark still has its handlers — existing reader tests keep passing); NotFoundPage has no "Back to …" lede link: lede says where to go with a normal link to the home path (admin "Go to Get Engsub", public "Về trang Vietsub").
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3:** implement.
- [ ] **Step 4:** PASS + full suite.
- [ ] **Step 5: Commit** `Move public screens to the Master Layout`.

### Task 7: Admin 404 and mobile navbar

**Files:** Modify `src/main/java/com/subtitlestudio/web/SpaForwardController.java`, `src/test/java/com/subtitlestudio/web/SpaForwardControllerTest.java`, `frontend/src/App.tsx` (+ `App.test.tsx`), `frontend/src/components/NavBar.tsx`/`NavBar.css` (+ test).

- [ ] **Step 1: Failing tests:**
  - `SpaForwardControllerTest`: `GET /nope`, `/a/b`, `/novels/1/chapters/2/`, `/x/y/z/w` → forwarded to `/index.html`; `GET /api/nope` → 404 problem JSON; `GET /logo.webp` and `/assets/missing.js` → not forwarded (404).
  - `App.test.tsx`: route `/nope` renders heading "Page not found".
  - NavBar: on mount the active link is scrolled into view with `scrollIntoView({ inline: 'nearest', block: 'nearest' })` (stub `Element.prototype.scrollIntoView`), and CSS has `scroll-snap-type: x` on `.nav` and `scroll-snap-align: start` on `.nav__link`/`.nav__pill` so no clipped fragment remains at the left edge.
- [ ] **Step 2:** `mvn -q test -Dtest=SpaForwardControllerTest -Dskip.npm` and the two vitest files → FAIL.
- [ ] **Step 3:** replace the explicit list with patterns, `a` excluding `api`: `"/{a:(?!api$)[^.]+}"`, `"/{a:(?!api$)[^.]+}/{b:[^.]+}"`, `".../{c:[^.]+}"`, `".../{d:[^.]+}"`, each also with a trailing `/` variant; update the class Javadoc. Add `<Route path="*" element={<NotFoundPage />} />` to `App`.
- [ ] **Step 4:** PASS.
- [ ] **Step 5: Commit** `Serve the app for unknown admin paths; keep whole items in the mobile navbar`.

### Task 8: Enforcement test, docs, cleanup

**Files:** Create `frontend/src/styles/layoutRules.test.ts`; Modify `CLAUDE.md`, `PROGRESS.md`, `docs/ui/screen-layout.md` (remove the "Trạng thái" note); delete unused `.back-link` CSS.

- [ ] **Step 1: Write the test** using `import.meta.glob('/src/**/*.tsx', { query: '?raw', import: 'default', eager: true })`, skipping `*.test.tsx` and `src/components/ui/**`:
  - no `<main` in any file except `components/ui/Page.tsx`;
  - no `<h1` in files under `pages/` except `pages/public/ReaderPage.tsx`;
  - no `back-link` anywhere (also scan `src/**/*.css` via `src/test/css.ts`);
  - no `className="form-actions` outside `FormActions.tsx`;
  - no import of `SourceFilter`.
- [ ] **Step 2:** run → PASS (if it fails, fix the offending page, not the rule).
- [ ] **Step 3a: Loading states.** Page-level `LoadingText` (whole page waiting for data) in `WorkDetailPage`, `NovelPage`, `ChapterPage`, `PlaylistEditPage`, `VietsubEditPage`, `PublicNovelPage` becomes a skeleton (`Skeleton`/`SkeletonList` from `components/ui/Skeleton.tsx`, shaped like the header + content); `LoadingText` stays only inline. Update their tests to query the skeleton's accessible status (as existing `SkeletonList` tests do).
- [ ] **Step 3:** CLAUDE.md: SPA bullet becomes "client routes are served by the pattern mappings in `SpaForwardController` (no list to update; paths with a dot or under `/api` are not forwarded)"; component list adds `Page`, `Toolbar`, `FormActions`; remove `SourceFilter` mentions. PROGRESS.md: add the entry for this work.
- [ ] **Step 4: Full verification:** `cd frontend && npx vitest run` (file count matches), `npm run build`, `npm run build:public`, `mvn -q verify -Dskip.npm` from repo root. Then build the jar/run locally only if the user's running app is not disturbed — otherwise take screenshots with `npm run dev` + Edge (see memory: `MSYS_NO_PATHCONV=1`) of `/`, `/vietsub`, `/vietsub/playlists`, `/works/1/edit`, `/novels/1`, `/novels/1/chapters/<id>` at 390 and 1440 px and check: breadcrumbs ellipsize, no horizontal scroll, sticky bar does not hide the last field, navbar shows whole items.
- [ ] **Step 5: Commit** `Guard the screen layout rules with a source test; update docs`, push `feat/ui-consistency`, `gh pr create --base main` (English title/body: summary per area, test commands + results, screenshots, links to spec/plan/rules; end with the Claude Code attribution line).
