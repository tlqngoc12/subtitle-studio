# Profile banner and novel trailer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. TDD per task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Implement `docs/superpowers/specs/2026-11-09-profile-banner-design.md` (Part 1: profile banner; Part 2: novel trailer tab). The spec is the source of truth; read all of it first.

**Architecture:** Spring Boot / JPA / Flyway (Oracle + H2 MODE=Oracle) and React + TS. Follow `CLAUDE.md`:
- CSS tokens, co-located CSS and colour roles
- shared `components/ui/` (`Alert`, `IconButton`, `PopoverPanel`, …)
- `useConfirmDialog`
- dnd-kit as used by playlists
- the `src/test/css.ts` helper for CSS tests

**One migration:** `src/main/resources/db/migration/V10__profile_banner_and_novel_trailer.sql` holds both schema changes. Check first that V10 is still free on main.

## Tasks

### Task 1: Migration + backend for the banner (spec Part 1 › Data, API)
- [ ] Failing tests:
  - add, delete and reorder keep positions gapless
  - limit of 8 (400)
  - optional alt text: trimmed, blank → NULL, more than 200 characters → 400, blank on edit clears it
  - reorder with a missing, duplicate or foreign id → 400 and nothing changes
  - delete or edit with a foreign id → 404
  - the profile DTO carries `banner` in order
  - the public export includes the banner images and their URLs
- [ ] Implement: entity, repository, service, controller, DTO fields and export. Follow the existing profile block and media patterns, including media clean-up on delete.
- [ ] Run `mvn test -Dskip.npm`. Commit `feat(profile): banner images per profile (V10), API and public export`.

### Task 2: Backend for the trailer (spec Part 2)
- [ ] Failing tests:
  - each accepted URL form is stored as the 11-character id
  - invalid and non-YouTube links → 400 with field `trailerUrl`
  - blank clears the trailer
  - `NovelDetail` and `PublicNovelDetail` carry `trailerVideoId`
- [ ] Implement: add the column to V10 (if Task 1 already committed V10, amend that commit only when V10 has not run anywhere — it has not; mention it), then `Novel`, `NovelRequest`, the service and the exporter.
- [ ] Run `mvn test -Dskip.npm`. Commit `feat(novel): optional YouTube trailer per novel`.

### Task 3: Shared `FanCarousel` + `ImageLightbox`; Novels banner switches to it
- [ ] Extract the fan behaviour from `FeaturedNovels` into `components/ui/FanCarousel` (spec › Frontend), and create `components/ui/ImageLightbox` (Radix Dialog).
- [ ] `FeaturedNovels` uses `FanCarousel` with `href` items. The existing FeaturedNovels and home tests must keep passing; move behaviour tests to `FanCarousel` where they belong.
- [ ] Add new tests for `onOpen` mode, single-item mode, centring CSS, and the lightbox: navigation, ←/→, Esc / ✕ / overlay close, focus return.
- [ ] Commit `refactor(ui): shared FanCarousel and ImageLightbox; the Novels banner uses them`.

### Task 4: Profile banner UI (view + Edit section)
- [ ] `ProfileBanner` sits on the Profile page under the title, in admin and public. It renders only when there are images; alt text and the `Ảnh k/n` names follow the spec.
- [ ] Add the Edit-mode `Banner` section (spec › Edit mode):
  - add flow with the optional description
  - inline description edit (save on blur or Enter)
  - limit hint
  - reorder with dnd-kit and the move left/right buttons, optimistic, reverting with an `Alert` on failure
  - delete with confirm
  - API client functions for each call
- [ ] Write the tests the spec lists.
- [ ] Commit `feat(profile): fanned banner with lightbox, managed in Edit mode`.

### Task 5: Trailer UI
- [ ] Admin novel Details form: the `Trailer (YouTube link)` field, which shows `https://youtu.be/<id>` when set and the 400 field error.
- [ ] Public novel page: tabs **Giới thiệu · Danh sách chương · Trailer** with the presence rules, the default and `?tab=` handling, and fallback (spec Part 2).
- [ ] The iframe renders only while the Trailer tab is open, with the attributes from the spec and responsive 16:9 CSS.
- [ ] Write the tests the spec lists.
- [ ] Commit `feat(novel): Trailer tab with an embedded YouTube video on the public novel page`.

### Task 6: Docs
- [ ] `PROGRESS.md`: a 2026-11-09 entry noting V10, that the public site needs Publish, and that this is not deployed.
- [ ] `CLAUDE.md`: if it lists the shared UI components, add `FanCarousel` and `ImageLightbox`.
- [ ] Commit `docs: profile banner and novel trailer`.

## Global Constraints

- **Branch:** `feature/novel-page-checks`. First run `git checkout feature/novel-page-checks`, then `git merge --ff-only main` (main is at 8f90752). Commit the spec and this plan alone first: `docs: spec and plan for the profile banner and novel trailer`.
- **Commits:** one per task (except where Task 2 amends V10). Messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never merge into main, push or deploy.
- **Dependencies and staging:**
  - No new packages; Radix Dialog and dnd-kit are already present. Never run `npm ci`.
  - Stage by path; never use `git add -A`; never stage `frontend/tsconfig.tsbuildinfo` or `.claude/`. Keep LF line endings.
- **UI rules:**
  - `--space-*` spacing; WCAG AA (the contrast test stays green)
  - no gradients; shadows only through the tokens
  - icons from lucide; tooltips through `Tip` / `IconButton`
  - public copy in Vietnamese, admin copy in English
- **Checks after each task:** `mvn test -Dskip.npm` (backend tasks; read the summary line), `cd frontend && npx vitest run`, `npx tsc -b --noEmit`, `npm run build`, `npm run build:public`. If only the known flaky pagination tests fail, rerun once.

## Review Focus

1. **Migration:** V10 runs on H2. Positions and limits are enforced in the service, not only in the UI.
2. **No regression on the Novels banner:** its tests are green and the visual CSS is unchanged apart from the extraction.
3. **Accessibility:**
   - banner items name themselves from the alt text or `Ảnh k/n`
   - the lightbox is a real dialog with focus return
   - the trailer iframe has a `title`
4. **Lazy trailer:** no iframe until the Trailer tab opens.
5. **Reorder robustness:** banner reorder rejects bad lists, and the UI reverts on failure.
