# Profile Single Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the three Profile tabs with one `/profiles` page (EmiBonnie banner on top, one alternating section per member) and add the resized-image upload that Photos and Works reuse.

**Architecture:** Keep the block system; `t_profile` gains kind/sort/tagline/full name/portrait (V13) and a `CHIPS` block type. One `GET /api/profiles` returns `{ group, members }` for both the admin API source and the static public JSON. A shared `ImageResizer` re-encodes uploads to lossy WebP when `POST /api/media?maxSide=` is used.

**Tech Stack:** Spring Boot + JPA + Flyway (Oracle / H2 MODE=Oracle), webp-imageio; React + Vite + TS, Radix, vitest.

**Spec:** `docs/superpowers/specs/2026-11-10-profile-single-page-design.md`

## Global Constraints

- Branch `feat/profile-single-page` from the latest `main`; one PR, merge only after the user approves (CLAUDE.md flow). Commit messages and PR text in English.
- Flyway file `V13__profile_single_page.sql`. Before starting, `ls src/main/resources/db/migration`: if V13 is taken, use the next free number everywhere this plan says V13.
- SQL conventions as V1–V12: `${bigint}` / `${int}` placeholders, `VARCHAR2(n CHAR)`, `T_` prefix, never edit an applied migration.
- UI copy in English. Colours: orange `#F39A42` = actions, purple `#D9A1D9` = state/hover/focus, red only for delete/errors. Breakpoints 520 / 760 / 1024 px.
- Limits copied from the spec: `tagline` ≤ 300, `fullName` ≤ 200, `displayName` 1–100, slug ≤ 20, CHIPS item label 1–100, ≤ 50 chips per block.
- Backend tests: `mvn test -Dskip.npm` (worktree). Frontend: `cd frontend && npm test`. If a Vite dev server holds the main repo's `node_modules`, do not run `npm ci` there.
- Never `git add -A` after `npx tsc -b` (it writes `frontend/tsconfig.tsbuildinfo`).

## Review Focus

1. **Startup image cleanup deleting portraits:** `MediaService.cleanUpOnStartup` deletes media unreferenced for 24 h; a portrait must count as a reference → test in Task 2.
2. **Member names without Latin letters** (e.g. Thai `เอนี่`): slug falls back to `member-N`, never empty or `order` → test in Task 3.
3. **Old shared links** `/profiles/emi`, `/profiles/emibonnie`, `/profiles/unknown` redirect to `/profiles#…` and the page still renders (unknown hash ignored) → test in Task 6.
4. **No members left** (both deleted): page shows banner + `EmptyState`, admin still sees `Add member` → test in Task 6.
5. **GIF or 15 MB file sent with `maxSide`:** 400 / 413 with the existing error shapes, nothing written to `./data/media` → test in Task 2.

---

### Task 1: Schema V13, entity fields, CHIPS block type

**Files:**
- Create: `src/main/resources/db/migration/V13__profile_single_page.sql`
- Create: `src/main/java/com/subtitlestudio/profile/ProfileKind.java`
- Modify: `src/main/java/com/subtitlestudio/profile/Profile.java`, `BlockType.java`, `ProfileBlockValidator.java`, `ProfileRepository.java`
- Modify: `src/test/java/com/subtitlestudio/oracle/PersistenceOracleIT.java` (no new table; assert CHIPS insert works on Oracle)
- Test: `src/test/java/com/subtitlestudio/profile/ProfileRepositoryTest.java`, `ProfileBlockValidatorTest.java`

**Interfaces:**
- Produces: `enum ProfileKind { GROUP, MEMBER }`; `Profile` getters `getKind()`, `getSortOrder()`, `getTagline()`, `getFullName()`, `getPortrait()` (`Media`, nullable); `Profile.member(String slug, String displayName, int sortOrder, Instant now)` factory; `updateHeader(String displayName, String tagline, String fullName, Media portrait, Instant now)`; `setSortOrder(int)`; `BlockType.CHIPS`; `ProfileRepository.findAllByOrderBySortOrderAscIdAsc()`, `findByKind(ProfileKind)`, `existsBySlug(String)`, `maxSortOrder()` (`coalesce(max, 0)`).

- [ ] **Step 1: Write failing tests**
  - `ProfileRepositoryTest.seededProfilesHaveKindsAndOrder`: emibonnie → `GROUP`, sort 0; emi → `MEMBER`, 1; bonnie → `MEMBER`, 2; tagline/fullName/portrait null.
  - `ProfileBlockValidatorTest.chipsAcceptsLabelsOnly`: 2 items with labels → valid; `chipsRejectsValueOrMedia` (item with `value` → field error `items[0].value`); `chipsRejectsEmptyOrLongLabel` (`""`, 101 chars); `chipsRejectsMoreThan50Items`.
- [ ] **Step 2: Run** `mvn test -Dskip.npm -Dtest=ProfileRepositoryTest,ProfileBlockValidatorTest` → FAIL (columns / enum missing).
- [ ] **Step 3: Migration** — `ALTER TABLE t_profile ADD (kind VARCHAR2(10 CHAR) DEFAULT 'MEMBER' NOT NULL, sort_order ${int} DEFAULT 0 NOT NULL, tagline VARCHAR2(300 CHAR), full_name VARCHAR2(200 CHAR), portrait_media_id ${bigint})`; check constraint `t_profile_kind_ck`; FK `t_profile_portrait_fk` → `t_media`; index on `portrait_media_id`; `UPDATE` emibonnie → GROUP/0, emi → 1, bonnie → 2. `ALTER TABLE t_media ADD (width ${int}, height ${int})` (mapped as nullable `Integer` on `Media`, setter used only by Task 2). Drop and recreate `t_profile_block_type_ck` adding `'CHIPS'`. Header comment like V10.
- [ ] **Step 4: Entity / enum / validator** — map the columns (`@Enumerated(STRING)` kind, `@ManyToOne(fetch = LAZY)` portrait); CHIPS branch in `ProfileBlockValidator` (title optional like FACTS; items label-only, limits from Global Constraints).
- [ ] **Step 5: Run** the two tests → PASS; then full `mvn test -Dskip.npm` → PASS.
- [ ] **Step 6: Commit** `feat(profile): V13 profile kind, order, header fields and CHIPS blocks`

### Task 2: Resized image upload + media references

**Files:**
- Create: `src/main/java/com/subtitlestudio/profile/ImageResizer.java`
- Modify: `MediaService.java`, `MediaController.java`, `MediaRepository.java`
- Test: `src/test/java/com/subtitlestudio/profile/ImageResizerTest.java`, `MediaServiceTest.java`, `MediaControllerTest.java`

**Interfaces:**
- Produces: `@Component ImageResizer { Resized resize(byte[] bytes, int maxSide) }`, `record Resized(byte[] bytes, ImageType type, int width, int height)`; lossy WebP quality `0.82f` via the ImageIO WebP writer (compression type containing "Lossy"), falling back to JPEG quality `0.85f` when no WebP writer loads; never upscales; JPEG/PNG/WebP input only (GIF → `InvalidMediaException("Animated or GIF images cannot be resized")`).
- Produces: `MediaService.storeResized(String originalName, byte[] bytes, int maxSide): Media` — the saved `Media` has `getWidth()` / `getHeight()` set (new nullable `t_media.width` / `height` columns, added in V13 by Task 1's migration: `ALTER TABLE t_media ADD (width ${int}, height ${int})`; old rows stay NULL). Photos reads the tile shape from these columns.
- Produces: `POST /api/media?maxSide={400|1600}` → `MediaDto(long id, String url, Integer width, Integer height)` (width/height null when `maxSide` absent). Other `maxSide` values → 400 field `maxSide`.
- Produces: `MediaRepository.isUsedByPortrait(Long)` included in `isReferenced` and in `findUnreferencedCreatedBefore` (`not exists (select p from Profile p where p.portrait = m)`). Later plans add their own clauses the same way.

- [ ] **Step 1: Failing tests**
  - `ImageResizerTest`: 3000×2000 PNG with `maxSide 1600` → width 1600, height 1067; 800×600 → unchanged size; GIF bytes → `InvalidMediaException`; output sniffs as WEBP (or JPEG when the writer is absent — assert `type` matches the bytes).
  - `MediaServiceTest.storeResizedWritesOneFileWithReturnedSize`; `oversizedInputRejectedBeforeDecoding` (> 10 MB → `MediaTooLargeException`, media dir empty).
  - `MediaServiceTest.portraitCountsAsReference`: media set as emi's portrait, created 2 days ago → `deleteUnreferencedOlderThan(24h)` returns 0 and file still exists.
  - `MediaControllerTest.uploadWithMaxSideReturnsSize` (JSON has `width`, `height`), `uploadWithBadMaxSideIs400`.
- [ ] **Step 2: Run** `mvn test -Dskip.npm -Dtest=ImageResizerTest,MediaServiceTest,MediaControllerTest` → FAIL.
- [ ] **Step 3: Implement** `ImageResizer`, `storeResized` (size check first, then resize, then the existing store path with the resized bytes), controller param, repository clauses.
- [ ] **Step 4: Run** the tests → PASS; full backend suite → PASS.
- [ ] **Step 5: Commit** `feat(media): resized WebP upload and portraits count as image references`

### Task 3: Profile page API (list, header, add/delete/reorder members)

**Files:**
- Create: `src/main/java/com/subtitlestudio/profile/ProfilePageDto.java`, `ProfileHeaderRequest.java`, `NewMemberRequest.java`, `MemberOrderRequest.java`, `SlugGenerator.java`, `GroupProfileException.java` (→ 409)
- Modify: `ProfileDto.java`, `ProfileService.java`, `ProfileController.java`; delete `ProfileSummary.java` once nothing uses it (Task 4 removes the exporter use)
- Test: `ProfileServiceTest.java`, `ProfileControllerTest.java`, `src/test/java/com/subtitlestudio/profile/SlugGeneratorTest.java`

**Interfaces:**
- Consumes: Task 1 entity API; Task 2 `MediaRepository.isReferenced`, `MediaService.deleteIfUnreferenced`.
- Produces: `ProfileDto(String slug, String displayName, ProfileKind kind, String tagline, String fullName, Long portraitMediaId, String portraitUrl, Instant updatedAt, List<BlockDto> blocks, List<BannerImageDto> banner)`; `ProfilePageDto(ProfileDto group, List<ProfileDto> members)`.
- Produces service methods: `ProfilePageDto page()`, `ProfileDto updateHeader(String slug, ProfileHeaderRequest r)`, `ProfileDto addMember(NewMemberRequest r)`, `void deleteMember(String slug)`, `List<ProfileDto> reorder(MemberOrderRequest r)`.
- Produces endpoints: `GET /api/profiles` → `ProfilePageDto` (replaces the summary list); `PUT /api/profiles/{slug}/header`; `POST /api/profiles` (201); `DELETE /api/profiles/{slug}` (204, 409 `GROUP_PROFILE` for GROUP); `PUT /api/profiles/order` `{ slugs }`. Map `PUT /api/profiles/order` before `{slug}` patterns so `order` never resolves as a slug.
- Produces: `SlugGenerator.slugFor(String name, Predicate<String> taken): String` — NFD + strip marks, lowercase, non `[a-z0-9]` runs → `-`, trim `-`, cut to 20; empty or `order` → `member-2`, `member-3`…; collision → `-2`, `-3` (cut base so the whole stays ≤ 20).

- [ ] **Step 1: Failing tests**
  - `SlugGeneratorTest` (parameterised): `"Any" → "any"`, `"Ánh Dương" → "anh-duong"`, `"เอนี่" → "member-2"` (with nothing taken → first free `member-N` starting at 2), `"Emi"` with `emi` taken → `"emi-2"`, 30-char name → ≤ 20 chars, `"Order" → "member-2"`.
  - `ProfileServiceTest.pageReturnsGroupAndMembersInOrder`, `updateHeaderValidatesLengthsAndMedia` (tagline 301 → `FieldError tagline`; unknown media → `portraitMediaId`), `blankHeaderFieldsStoredAsNull`, `addMemberAppendsLast`, `deleteMemberRemovesBlocksBannerAndUnusedMedia`, `deleteGroupIs409`, `reorderMustListEveryMemberOnce` (missing / duplicate / unknown → 400).
  - `ProfileControllerTest.getProfilesReturnsPage` (JSON `group.slug == "emibonnie"`, `members[0].slug == "emi"`), `putOrderIsNotTreatedAsSlug`.
- [ ] **Step 2: Run** the three test classes → FAIL.
- [ ] **Step 3: Implement** DTOs, generator, service, controller (validation errors via the existing `FieldError`/400 handler; new 409 handler next to the existing ones).
- [ ] **Step 4: Run** → PASS; full suite → PASS (fix compile breaks in `SiteExporter` minimally if needed; Task 4 reworks it).
- [ ] **Step 5: Commit** `feat(profile): one-page profile API with header, members and order`

### Task 4: Public export of the profile page

**Files:**
- Modify: `src/main/java/com/subtitlestudio/publish/SiteExporter.java` (`exportProfiles`)
- Test: `src/test/java/com/subtitlestudio/publish/SiteExporterTest.java` (find with `grep -rn "profiles.json" src/test`)

**Interfaces:**
- Consumes: `ProfileService.page()`.
- Produces: `data/profiles.json` = `ProfilePageDto` with every media URL (`portraitUrl`, block/item `mediaUrl`, banner `mediaUrl`) rewritten to `/media/{file}` through the existing `publicUrl(...)`, and `portraitMediaId`/`mediaId` fields set to null; no `data/profiles/*.json` files.

- [ ] **Step 1: Failing test** `SiteExporterTest.exportsProfilePageWithPublicImageUrls`: emi has a portrait → `members[0].portraitUrl` starts with `/media/`, the file exists in the export dir, `data/profiles/` does not exist.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS + full suite.
- [ ] **Step 5: Commit** `feat(publish): export the one-page profile`

### Task 5: Frontend API types and data sources

**Files:**
- Modify: `frontend/src/api/profiles.ts`, `frontend/src/data/types.ts`, `apiSource.ts`, `staticSource.ts`
- Test: `frontend/src/data/staticSource.test.ts`, create `frontend/src/api/profiles.test.ts`

**Interfaces:**
- Produces TS: `BlockType` adds `'CHIPS'`; `type ProfileKind = 'GROUP' | 'MEMBER'`; `Profile` adds `kind`, `tagline: string | null`, `fullName: string | null`, `portraitMediaId: number | null`, `portraitUrl: string | null`; `interface ProfilePage { group: Profile; members: Profile[] }`; `interface ProfileHeaderInput { displayName: string; tagline: string | null; fullName: string | null; portraitMediaId: number | null }`.
- Produces functions: `getProfilePage(): Promise<ProfilePage>`, `updateProfileHeader(slug, input): Promise<Profile>`, `addMember(displayName): Promise<Profile>`, `deleteMember(slug): Promise<void>`, `reorderMembers(slugs: string[]): Promise<Profile[]>`; `uploadMedia(file: File, maxSide?: 400 | 1600): Promise<{ id: number; url: string; width: number | null; height: number | null }>`.
- `ReadSource`: remove `listProfiles` / `getProfile`, add `getProfilePage(): Promise<ProfilePage>`; static source reads `profiles.json`. Remove `ProfileSummary`.

- [ ] **Step 1: Failing tests** — `staticSource.test.ts` "reads the profile page" (`/data/profiles.json` → `{ group, members }`); `profiles.test.ts` `uploadMedia` appends `?maxSide=1600` only when given; `reorderMembers` sends `{ slugs }` with `PUT /api/profiles/order`.
- [ ] **Step 2: Run** `npm test -- src/data src/api` → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS (type errors in pages are fixed in Task 6; run `npx tsc -b` only after Task 6).
- [ ] **Step 5: Commit** `feat(frontend): profile page API and data sources`

### Task 6: One-page Profile view (admin + public, read mode)

**Files:**
- Create: `frontend/src/components/profile/MemberSection.tsx` (+ `.css`, `.test.tsx`), `FactsGrid.tsx`, `ChipList.tsx`, `SocialIcons.tsx`
- Modify: `frontend/src/pages/ProfilePage.tsx` (+ `.css`, `.test.tsx`), `components/profile/BlockView.tsx` (CHIPS, FACTS-as-grid), `App.tsx`, `PublicApp.tsx`
- Delete: `frontend/src/components/profile/ProfileTabs.tsx`

**Interfaces:**
- Consumes: `ReadSource.getProfilePage`, `FilmStrip`, `ImageLightbox`, `BrandIcon`, `PageHeader`, `EmptyState`.
- Produces: `MemberSection({ profile, side: 'left' | 'right', editable, onChanged })` rendering `<section id={profile.slug} className={`member member--${side}`}>`; `FactsGrid({ items })`; `ChipList({ title, items })`; `SocialIcons({ blocks })` (all LINKS items, in block order); `ProfileRedirect` element for `/profiles/:slug` → `<Navigate to={`/profiles#${slug}`} replace />` (GROUP slug → `/profiles`).
- Layout values from the spec: portrait aspect 3:4, columns ≈ 1/3 + 2/3 at ≥ 1024 px, single column below 1024 px with portrait max-width 420 px centred; facts grid 2 columns, 1 below 520 px; first FACTS block of a member hides its title; LINKS blocks are not rendered in the details column.

- [ ] **Step 1: Failing tests**
  - `ProfilePage.test.tsx`: renders banner from `group.banner`, members in order with classes `member--left`, `member--right`; `/profiles/emi` route lands on `/profiles#emi` and scrolls `#emi` into view after load (mock `scrollIntoView`); `/profiles/unknown` renders the page without error; `members: []` shows `EmptyState`.
  - `MemberSection.test.tsx`: full name heading, tagline, social links (`target="_blank"`, accessible name = item label), FACTS grid `Label` / `value` pairs, first FACTS title hidden and second shown, CHIPS rendered as list items, LINKS block not repeated in details.
- [ ] **Step 2: Run** `npm test -- ProfilePage MemberSection` → FAIL.
- [ ] **Step 3: Implement** (scroll to hash in an effect that runs after data loads; portrait click opens `ImageLightbox`; no portrait → placeholder with the first letter).
- [ ] **Step 4: Run** → PASS; `npm test` → PASS; `npx tsc -b` → no errors.
- [ ] **Step 5: Commit** `feat(profile): one-page profile layout with alternating member sections`

### Task 7: Admin editing on the one page

**Files:**
- Create: `frontend/src/components/profile/MemberHeaderEditor.tsx` (+ test), `MemberMenu.tsx`
- Modify: `ProfilePage.tsx`, `MemberSection.tsx`, `BlockEditor.tsx` (+ test), `BlockToolbar.tsx`, `BannerEditor.tsx` (now attached to `group.slug`)

**Interfaces:**
- Consumes: Task 5 functions; `ImagePicker` (upload through `uploadMedia(file, 1600)`), `useConfirmDialog`, `AppToaster` toasts, `PopoverPanel`.
- Produces: `MemberHeaderEditor({ profile, onSaved, onCancel })` — fields Display name, Tagline, Full name, Portrait; GROUP shows only Display name + Portrait (hint "Used as the EmiBonnie avatar in filters"). `MemberMenu({ profile, isFirst, isLast, onMoved, onDeleted })` — Edit header, Move up, Move down, Delete member (red, confirm "Delete {name}? Their blocks and banner are removed.").
- Page header action `Add member` (admin only): small popover with a name input → `addMember`, then scroll to the new section in edit mode.
- `BlockEditor`: type list gains `Chips`; CHIPS items edited with `ItemListEditor` showing only a Label input.

- [ ] **Step 1: Failing tests** — `MemberHeaderEditor.test.tsx`: saves trimmed values and `null` for blanks; shows the server `FieldError` under Tagline; GROUP hides Tagline/Full name. `BlockEditor.test.tsx`: Chips type offers label-only rows. `ProfilePage.test.tsx` (admin): `Add member` adds a section; Delete member asks to confirm then removes the section; Move down swaps order (calls `reorderMembers(['bonnie','emi'])`); public `readOnly` shows none of these controls.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `npm test` → PASS, `npx tsc -b` → clean.
- [ ] **Step 5: Commit** `feat(profile): edit member headers, chips blocks, add/move/delete members`

### Task 8: Verification, docs, PR

**Files:**
- Modify: `PROGRESS.md`, `CLAUDE.md` (Profile section: one page, V13, CHIPS, `?maxSide`, media references rule "every table that points at `t_media` must be added to `MediaRepository.isReferenced` and `findUnreferencedCreatedBefore`")

- [ ] **Step 1:** `mvn test -Dskip.npm` → BUILD SUCCESS; `cd frontend && npm test` → all files pass (compare file count with `find src -name "*.test.ts*" | wc -l`).
- [ ] **Step 2:** `mvn verify -Poracle -Dskip.npm` → `PersistenceOracleIT` passes (Docker must be running).
- [ ] **Step 3:** Run the app from the worktree on H2 (`./data` copy, not the real one) and take Edge headless screenshots of `/profiles` at 1440 px and 390 px, admin view and `Edit` mode; check alternating sides, chips wrap, icons row.
- [ ] **Step 4:** Update the docs, commit `docs: profile single page progress and media reference rule`.
- [ ] **Step 5:** `git push -u origin feat/profile-single-page`; `gh pr create --base main` with summary, test commands + results, screenshots, spec/plan links. Send the PR link to the user and wait. **Do not deploy or Publish** until the user asks (deploy note: the user must upload an EmiBonnie portrait and re-Publish).
