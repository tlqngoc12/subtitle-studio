# Wattpad: "Fetch & translate next" from the chapter page — design

Date: 2026-11-14. Branch: `feat/novels-ui-review` (same branch as the Novels UI review batch, per the user). Size: small (one endpoint + two buttons).

## Why

Translating a Wattpad novel is done one chapter at a time, and the user edits each chapter right after it is translated (they want to keep it that way — no batch queue). Today, from the edit page of chapter N they must go back to the novel → Wattpad tab → find the next part → **Fetch & translate**, then open the new chapter. The goal: start the next chapter from where they already are, and land on it.

## Approaches

- **Chosen: one "next" action**, available on the chapter edit page and as the primary action of the Chapters tab for Wattpad novels, backed by one endpoint that picks the next part on the server.
- Rejected: a queue that translates N chapters in a row (the user reviews chapter by chapter; a queue adds background state, partial failures, and loss on restart).
- Rejected: doing it in the browser (GET parts, pick, POST the existing endpoint): two Wattpad calls per click and the "next" rule would live in two places.

## Behaviour

**"Next part"** means the same as the **Next** badge in the Wattpad tab: the first part in Wattpad order that is not deleted and whose chapter is missing or has translation status `NONE`/`FAILED`. (Usually the part right after the last translated one.)

### Backend

- `POST /api/novels/{id}/wattpad/next/fetch-translate` → **202** `ChapterDetail` of the chapter that is now `TRANSLATING`.
  - Calls Wattpad **once** for the part list (`storyWithParts`) and, when the chapter is new, once for its text — never inside a DB transaction (same rules as the existing per-part endpoint).
  - Picks the next part as defined above, then does exactly what `fetchAndTranslate(novelId, partId)` does: an existing `NONE`/`FAILED` chapter is just translated; a new one is fetched and created first. Refactor so the part list is not fetched twice (e.g. a private overload taking the resolved `WattpadPart`).
  - Same errors as the per-part endpoint: `NOVEL_TRANSLATION_BUSY` 409 (another chapter `TRANSLATING` or notebook `UPDATING`), Gemini/profile not ready (as `requireReady` today), `WATTPAD_PART_EMPTY` 409.
  - New: nothing left → **409 `WATTPAD_NOTHING_NEXT`** ("Every Wattpad part is already translated.") — no chapter created. Not a Wattpad novel → 409 `NOT_WATTPAD_NOVEL` (or reuse the existing code if one exists for this case).
  - Tests (`WattpadNovelServiceTest` with the stub client, controller slice test): picks the first missing part; picks an existing `FAILED` chapter without fetching its text; skips deleted parts; skips `TRANSLATED`; busy → 409 and no Wattpad call for the text; nothing next → 409; part list fetched once per request.

### Frontend

- `api/novels.ts`: `fetchTranslateNext(novelId: number): Promise<ChapterDetail>`.
- `lib/errors.ts`: English messages for `WATTPAD_NOTHING_NEXT` (and `NOT_WATTPAD_NOVEL` if added).
- **Chapter edit page** (`pages/ChapterPage.tsx`), Wattpad chapters only (`chapter.wattpadPartId !== null`), and only when there is no next chapter in the app (`nextChapterId === null`): in place of the `›` link, a button **Fetch & translate next** (icon `CloudDownload`, plain `button`, the page's primary stays as it is). When a next chapter already exists, the `›` link stays and works as today (an untranslated next chapter has its own Translate button).
  - Unsaved changes: same guard as the `›` link (`leave`) — confirm before going.
  - While the request runs: button disabled, label **Starting…**.
  - Success: `toast.info('Translation started', { description: <new chapter title> })` and navigate to the new chapter's edit page (it already polls while `TRANSLATING`).
  - Error: `toastError(errorMessage(e))`; stay on the page.
  - Disabled (with a `Tip` explaining why) while this chapter itself is `TRANSLATING`.
- **Chapters tab of a Wattpad novel** (`pages/NovelPage.tsx`): the tab's primary action is **Fetch & translate next** (same call, same success/error handling, navigates to the new chapter). **Add chapter** (screenshot upload) is not shown for Wattpad novels (my call: their chapters come from Wattpad; screenshot chapters in a Wattpad novel would mix sources). Screenshot novels keep **Add chapter** unchanged.
- Tests (Vitest + `fakeFetch`): button shown only for a Wattpad chapter with no next chapter; hidden for screenshot chapters and when `nextChapterId` exists; dirty text → confirm dialog first; success → POST called once, toast, navigation to `/novels/:id/chapters/:newId`; 409 busy → error toast, no navigation; Chapters tab shows Fetch & translate next and no Add chapter for Wattpad, the opposite for screenshot novels.

## Non-goals

Batch translation; changing the Wattpad tab (its per-part buttons and **Next** badge stay); auto-starting the next chapter when one finishes.

## Done when

`mvn test`, `npx vitest run`, `npx tsc -b` green (no SQL change, so no Oracle run needed). `CLAUDE.md` Wattpad section: the new endpoint, the "next part" rule shared with the Wattpad tab, and "no Add chapter for Wattpad novels". `PROGRESS.md` log entry.
