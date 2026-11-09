# Vietsub live editor — design

Date: 2026-11-09 · Status: decisions approved in chat, awaiting spec review

## Goal

From **Vietsub › Manage Vietsub**, clicking a video opens an editor:
- the **YouTube video on the left**, with the current Vietsub line shown on it as the video plays;
- the **Vietsub lines in a table on the right**, where the **text** of each line can be edited in place;
- **Save** stores the result. Saving an AI Vietsub turns it into a **Manual** one.

## Decisions (from the user)

| Topic | Decision |
|---|---|
| Right panel | **One table row per line**: `#`, start, end, text. While the video plays, the line on screen is highlighted in the table, and its text (with unsaved edits) shows on the video. |
| What can be edited | **Text only.** Timing, adding, deleting, splitting and merging lines are out of scope. |
| Source after saving | The editor loads the current Vietsub, which is the AI one if it is AUTO. **Saving any edit makes it MANUAL**, so a later Gemini run never overwrites it (existing rule: AUTO never replaces MANUAL). |
| Entry point | **Clicking a row in Manage Vietsub** opens the editor. The Vietsub list tab and the watch page keep opening the watch page. |

## Route and layout

- **Route:** `/vietsub/:id/edit`, admin only. It does not exist on the public site. Manage Vietsub row links (`VietsubList` in Manage mode) point here instead of `/vietsub/:id`. The Download, Replace and Delete buttons are unchanged.
- **Header:**
  - `PageHeader` with the video title and a breadcrumb `Vietsub › Manage Vietsub › <title>`.
  - On the right: the source badge (`AI` / `Manual`, the existing styles), a **Save** primary button, and an unsaved-changes hint (`Unsaved changes`, muted) while dirty.
- **Body, ≥ 1024 px:** two columns.
  - **Left (about 58%):** the player, **sticky** under the top bar, 16:9, with the subtitle overlay. It reuses `VideoPlayer`, `useYouTubePlayer` and `SubtitleOverlay` exactly as the watch page does.
  - **Right:** the table in its own scroll area, as tall as the viewport minus the header.
- **Body, below 1024 px:** stacked. The player stays sticky at the top and the table scrolls below it.

## Table

| Column | Content |
|---|---|
| `#` | 1-based index; a button that seeks the video to the line's start (`Go to line N`) |
| Start / End | `hh:mm:ss,mmm`, read-only, monospace, muted |
| Text | an auto-growing `<textarea>` (1 row minimum, wraps), label `Line N text` (visually hidden) |

- **Highlight:** the line whose `[start, end)` contains the player's current time gets the "you are here" style (orchid left bar and `--hover` background, as in the colour roles), plus `aria-current="true"`.
- **Auto-scroll:**
  - The table keeps the highlighted line in view (smooth scroll, instant with reduced motion).
  - It pauses while a textarea has focus, so typing never jumps.
  - It resumes 3 s after focus leaves the table.
- **Edited rows:** rows whose text differs from the loaded text show a small orange dot (`Edited`, as a `Tip`).
- **Live overlay:** the overlay on the video shows the **current edited text**, not the saved one.
- **Typing does not move the video.** Space and arrow keys inside a textarea type text and never control the player.
- **Size:** the video is never auto-paused. Typical Vietsubs have 300–1,000 lines, so a plain table is enough (no virtualisation); rows are memoised so typing re-renders only one row.

## Saving

- **Save** is enabled only when dirty and valid. **Ctrl+S / ⌘S** saves too (preventDefault, like the chapter page).
- **API:** `PUT /api/videos/{id}/vietsub/text`, body `{ baseUpdatedAt, lines: [{ idx, text }] }`, where `idx` is 0-based. The client sends **all lines** in index order, so the request is self-checking.
- **Server rules:**
  1. The video exists and has a Vietsub; otherwise 404.
  2. If `baseUpdatedAt` differs from the stored `viUpdatedAt`, the Vietsub changed since it was loaded (for example a translation finished, or another tab saved), so return **409** and change nothing.
  3. The `lines` count equals the stored count, and `idx` is 0..n-1 in order; otherwise 400.
  4. Each text is trimmed, **1–1000 characters**, line breaks allowed. Otherwise 400, with field errors `lines[idx].text`.
  5. While a Gemini translation is running for this video (`translationStatus` running), return 409.
  6. In one transaction, under the same row lock pattern as `saveAuto`:
     - update each cue's text (timing unchanged)
     - set `viSource = MANUAL` and `viUpdatedAt = now`
     - write `vi_manual.srt` from the cues with the existing `SrtWriter`; this replaces the earlier uploaded file, if any, which is intended because the edit is now the manual version
     - if the source was AUTO, keep the `vi_auto.srt` file as it is (history), but MANUAL now wins everywhere
- **Response:** the updated video DTO (with the new `viUpdatedAt` and `viSource`). The client resets the dirty state and shows the toast `Vietsub saved`.
- **Errors in the UI:**
  - 409: `Alert` "This Vietsub changed since you opened it. Reload to see the latest version." with a **Reload** button; edits stay in the fields until reload.
  - 400: field errors under the rows, and the first one scrolls into view.
  - Network error: `Alert`, edits kept.
- **Leaving with unsaved edits:** the browser `beforeunload` prompt, and the existing confirm dialog (`useConfirmDialog`) for in-app links.

## Loading states

- **Loading:** `LoadingText`.
- **Video not found:** `Alert` + link back to Manage Vietsub.
- **No Vietsub:** `Alert` "This video has no Vietsub yet." (no editor).
- **Translation in progress:** the table is read-only and Save is disabled, with the note `Gemini is translating this video. Editing is available when it finishes.` The page polls the status like the existing pages and becomes editable when the translation is done.

## Accessibility and UI rules

- **Accessibility:**
  - The table is a real `<table>` with a caption (visually hidden: `Vietsub lines`).
  - Each textarea is labelled.
  - The highlighted row has `aria-current`.
  - Save state changes are announced through the toast.
- **UI rules:** tokens only (`--space-*`, colours by role), WCAG AA (the contrast test stays green), no gradients, shadows only through the tokens. Admin copy is in English.

## Testing

- **Backend** (`VietsubService`/controller):
  - saving replaces the texts, makes the source MANUAL, updates `viUpdatedAt` and writes `vi_manual.srt`
  - timing is unchanged
  - a stale `baseUpdatedAt` gives 409 and nothing changes
  - a wrong count or order gives 400
  - empty or over-1000-character text gives 400 with field errors
  - an unknown video gives 404, and a video without Vietsub gives 404
  - a running translation gives 409
  - an AUTO translation finishing after a manual save does not overwrite it (existing rule, one regression test)
- **Frontend:**
  - Manage Vietsub row links to `/vietsub/:id/edit`; the list tab still links to the watch page
  - the editor renders the rows
  - the current-time highlight follows a mocked player time
  - the overlay shows edited text
  - Save is disabled until dirty; Ctrl+S saves
  - after saving: the toast, the source badge becomes Manual, and the dirty state resets
  - 409 shows the reload alert; 400 shows the field errors
  - leaving while dirty asks for confirmation
  - the read-only state while translating
  - auto-scroll pauses while a textarea has focus
- **Checks:** `mvn test -Dskip.npm`, vitest, tsc, `npm run build`, `npm run build:public`.

## Out of scope

- Editing timing.
- Adding, deleting, splitting or merging lines.
- Undo history beyond the browser's per-field undo.
- Editing the English (Engsub) track.
- Collaborative editing.
- Editing on the public site.
