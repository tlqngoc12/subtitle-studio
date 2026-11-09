# Vietsub live editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. TDD per task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Implement `docs/superpowers/specs/2026-11-09-vietsub-live-editor-design.md`. The spec is the source of truth; read all of it first.

**Architecture:**
- **Backend** (`com.subtitlestudio.video`): a new save-text method in `VietsubService`, a `PUT /api/videos/{id}/vietsub/text` endpoint in `VietsubController`, and request/validation records. No schema change and no migration.
- **Frontend:**
  - new page `pages/VietsubEditPage.tsx` with route `/vietsub/:id/edit`
  - components `components/vietsub/CueEditorTable.tsx` (and row)
  - API client additions
  - reuses `VideoPlayer`, `useYouTubePlayer`, `SubtitleOverlay`, `components/ui/*`, `useConfirmDialog` and `Breadcrumbs`
  - follows `CLAUDE.md` (tokens, co-located CSS, colour roles, `src/test/css.ts`)

## Tasks

### Task 1: Backend: save edited text
- [ ] Write failing tests for every backend item in the spec › Testing (service and controller), including the 409 stale and 409 translating cases and the AUTO-after-MANUAL regression.
- [ ] Implement:
  - a request record `{ Instant baseUpdatedAt, List<LineText> lines }`, with validation and field errors `lines[i].text` in the existing `FieldError` style
  - the locked transaction (the same pattern as `saveAuto`)
  - set MANUAL, `viUpdatedAt`, and write `vi_manual.srt` via `SrtWriter` and `SubtitleFileStore`
- [ ] Make sure the video DTO exposes `viUpdatedAt` (it does in the list) and `translationStatus` for the editor.
- [ ] Run `mvn test -Dskip.npm`, then commit `feat(vietsub): save edited Vietsub text as Manual (409 on stale or while translating)`.

### Task 2: Editor page: layout, player, table, highlight, overlay
- [ ] Add the route `/vietsub/:id/edit` in `App.tsx`. Manage Vietsub (`VietsubList` in Manage mode) row links point to it; the Vietsub list tab keeps the watch link.
- [ ] Build the page: header (`PageHeader`, breadcrumb, source badge), sticky player with an overlay of the **edited** text, a table with read-only times, `#` seek buttons, auto-growing textareas, the current-line highlight with `aria-current`, auto-scroll that pauses while a textarea has focus (3 s resume), edited-row dots, and responsive stacking below 1024 px.
- [ ] Add loading, not found, no Vietsub, and translating (read-only + polling) states.
- [ ] Write tests: the rendering, highlight, overlay, focus-pause, translating and routing items from the spec.
- [ ] Run vitest, tsc and both builds, then commit `feat(vietsub): live editor page with the video beside its Vietsub lines`.

### Task 3: Save flow
- [ ] Add a Save button (enabled when dirty and valid) and Ctrl+S / ⌘S.
- [ ] Wire the API client to send `baseUpdatedAt` and all lines.
- [ ] On success: the toast `Vietsub saved`, the badge becomes Manual, and the dirty state resets.
- [ ] On 409: the reload `Alert` with a Reload button. On 400: field errors, with the first one scrolled into view. On a network error: an `Alert`. Edits are kept in all three cases.
- [ ] Unsaved edits: the `beforeunload` prompt and the in-app leave confirm.
- [ ] Write tests for each of the above, then run the checks and commit `feat(vietsub): save edits with Ctrl+S, stale and validation errors, unsaved-changes guard`.

### Task 4: Docs
- [ ] Add a `PROGRESS.md` 2026-11-09 entry (the Vietsub editor; Manage Vietsub rows now open the editor; not deployed).
- [ ] Update `CLAUDE.md` if it lists routes or pages.
- [ ] Commit `docs: Vietsub live editor`.

## Global Constraints

- Branch `feature/novel-page-checks`. First run `git checkout feature/novel-page-checks`, then `git merge --ff-only main`. Before starting, commit the spec and this plan alone: `docs: spec and plan for the Vietsub live editor`.
- One commit per task. Messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never merge into main, push or deploy.
- No new packages. Never run `npm ci`. Stage by path and never use `git add -A`. Never stage `frontend/tsconfig.tsbuildinfo` or `.claude/`. Keep LF line endings.
- **UI rules:**
  - `--space-*` spacing tokens
  - colour roles: orange for actions, orchid for the current line and hover
  - WCAG AA
  - no gradients; shadows only through the tokens
  - lucide icons; `Tip` / `IconButton`
  - admin copy in English
- **Checks after each task:**
  - backend tasks: `mvn test -Dskip.npm`, reading the summary line
  - every task: `cd frontend && npx vitest run`, `npx tsc -b --noEmit`, `npm run build` and `npm run build:public`
  - if only the known flaky pagination tests fail, rerun once

## Review Focus

1. Saving never changes timing; source becomes MANUAL; `vi_manual.srt` is regenerated; stale (409) and translating (409) leave data untouched.
2. Typing performance: editing one row re-renders only that row (memoised rows; check with a render-count test or React Profiler note).
3. Typing never controls the player (Space/arrows in a textarea) and auto-scroll never moves the table while a textarea has focus.
4. The overlay shows unsaved edits; the highlight follows the player time.
5. The unsaved-changes guard works for in-app links and browser close.
