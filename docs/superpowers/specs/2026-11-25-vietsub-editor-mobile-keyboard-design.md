# Vietsub editor on phones: room to type when the keyboard is open

Date: 2026-11-25 · Size: small change · Status: approved by the user (2026-11-25)

## Why

On a phone, the Vietsub editor (`/vietsub/:id/edit`) is very hard to use. When you tap a line to edit it, the
keyboard opens and you can no longer see the screen. The cause:

- The player is sticky under the top bar and as wide as the screen. On an iPhone it is about 220 px tall, plus the
  56 px top bar.
- The line table scrolls in its own box, sized with `--cue-table-max` from `100dvh`. iOS Safari does not take the
  keyboard (~300 px) off `100dvh`, so the box stays as tall as before. Safari then pans the page to show the
  focused textarea, and the sticky player covers it. What is left is a thin strip, sometimes without the line
  being typed.

## Goal

While the keyboard is open on a phone, these stay visible together: a smaller video, the English line, and the
textarea being typed in (plus part of the next line when there is room).

## Non-goals

- No change on desktop (≥ 1024 px, two columns) or on a phone while the keyboard is closed.
- No new edit flow (bottom sheet, one-line-at-a-time screen). That was option B, which was not chosen.
- No change to the editor's behaviour: save, seek/pause on focus, highlight, the 3 s scroll wait.

## Approaches

- **A. Shrink the video while typing and size the table to the visible area (chosen).** Keeps the picture, the
  English and the textarea on screen. CSS plus one small hook.
- B. A bottom sheet for editing one line, with ‹ › buttons. Neatest while typing, but a new flow that takes much
  longer to build and test.
- C. No sticky player on phones. Quickest, but no picture at all while typing.

## Design

1. **Detect the keyboard.** A hook `useVisualViewport` (in `lib/`) reads `window.visualViewport`
   (`resize` + `scroll` events) and publishes:
   - `--vv-height`: the visible height, on `document.documentElement`;
   - a "keyboard open" state = a textarea of the editor has focus **and** `visualViewport.height` is clearly
     smaller than `window.innerHeight` (more than 150 px less).
   Without `visualViewport` (old browsers, jsdom), nothing changes.
2. **Compact mode** (`.vedit--typing` on the page, only below 1024 px while the keyboard is open):
   - the player shrinks to about 110 px tall (16:9 width ≈ 196 px), centred, still sticky, smooth size change
     (no animation with `prefers-reduced-motion`);
   - `--cue-table-max` = `--vv-height` − the top bar − the compact player − a small margin, so the table fits the
     area above the keyboard.
3. **Keep the textarea in view.** When a textarea gets focus in compact mode (and after the viewport size
   changes), scroll its row to near the top of the table box (`block: 'start'`), so the English line above it and
   part of the next line can be seen. This uses the existing "hold" logic and does not move focus.
4. Closing the keyboard (blur, or `visualViewport` back to full height) puts the normal layout back.

## Constraints

- Brand colours and `docs/ui/screen-layout.md` unchanged (nothing new on screen).
- The 44 px touch target rule for buttons stays.
- Test with vitest (hook + class switch, mocked `visualViewport`). Then the user tries it on a real iPhone over
  Tailscale (the admin works from a phone after PR #72).

## Left to the builder

- The exact compact height (100–120 px) and margins, if 110 px does not fit an iPhone SE.
- Whether the top bar hides on its own while typing (if it does, use its real height through `--topbar-h`).
