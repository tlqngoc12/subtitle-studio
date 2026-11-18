# New chapter from the chapter page — design

Date: 2026-11-18 · Size: small change · Status: approved by the user in chat

## Why

Writing an original story (or adding screenshot chapters), the user is on chapter X and wants the next chapter. Today
they must go back to the novel page, press **Add chapter**, then open the new chapter. Too many steps.

## Goals / non-goals

- On the **last chapter** (no next chapter) of a novel whose `sourceType` is `ORIGINAL` or `SCREENSHOTS`, the sticky
  chapter bar shows **New chapter** (lucide `Plus`) where Wattpad's "Fetch & translate next" sits.
- Click → asks first when there are unsaved edits (same dialog as leaving the page) → creates a chapter at the end of
  the novel (`addChapter(novelId, {})`, same call as the novel page's Add chapter) → opens it.
- While creating: label `Creating…`, disabled. Disabled too while the chapter is locked (translating/busy). Errors →
  error toast, stay on the page.
- Non-goals: no button on non-last chapters (› already goes on), none for Wattpad novels (they keep Fetch & translate
  next), no backend change, no choosing the number/title before creating.

## Approaches

- **Button on the last chapter, beside ‹ ›** — chosen: mirrors the Wattpad button already there, one click.
- In the `⋯` menu: one more click, hidden. On every chapter: clutters the bar, › already covers non-last chapters.

## Left to the builder

Exact class names (follow the Wattpad button: `button` inside `chapter-head__next`).
