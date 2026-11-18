# New Chapter From Chapter Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "New chapter" button on the last chapter of ORIGINAL and SCREENSHOTS novels creates the next chapter and opens it.

**Architecture:** Frontend only. `useChapterActions` gains `addNext()` (mirrors `startNext()`); `ChapterNav` shows the button; `ChapterPage` wires it.

**Tech Stack:** React + TypeScript, Vitest + Testing Library, lucide-react.

**Spec:** `docs/superpowers/specs/2026-11-18-new-chapter-from-chapter-page-design.md`

## Global Constraints

- Branch `feat/new-chapter-from-chapter-page` from latest `main` (independent of PR #62; not stacked). English commits/PR; PR flow per CLAUDE.md, no merge without user OK.
- Shown only when `chapter.nextChapterId === null` and `chapter.sourceType` is `'ORIGINAL'` or `'SCREENSHOTS'`.
- Copy: `New chapter`, while running `Creating…`. Unsaved-edits dialog identical to `startNext`'s (title `Leave without saving?`, confirm `Leave`, destructive).
- Palette orange/purple only; lucide `Plus`.

## Review Focus

- Unsaved edits, user cancels the dialog → no chapter created, stays on the page.
- `addChapter` fails (e.g. server error) → error toast, button enabled again, no navigation.
- Chapter is translating/busy (`locked`) → button disabled.
- Wattpad novel's last chapter → only "Fetch & translate next", never "New chapter".
- Middle chapter of an ORIGINAL novel → no "New chapter" button.

---

### Task 1: New chapter button

**Files:**
- Modify: `frontend/src/lib/useChapterActions.ts` (add `addNext`, return it)
- Modify: `frontend/src/components/chapter/ChapterNav.tsx` (props `onAddNext: () => void`; render the button)
- Modify: `frontend/src/pages/ChapterPage.tsx` (pass `onAddNext={() => void actions.addNext()}`)
- Test: `frontend/src/pages/ChapterPage.test.tsx` (new `describe('ChapterPage: New chapter', …)` next to the "Fetch & translate next" block, reusing its helpers)
- Modify: `PROGRESS.md` (dated entry, Vietnamese, file's style)

**Interfaces:**
- Consumes: `addChapter(novelId: number, input: { chapterNo?: number; title?: string }): Promise<ChapterDetail>` from `api/novels.ts`; `openChapter`, `confirm`, `setStarting`, `dirty` already in `useChapterActions` params.
- Produces: `addNext(): Promise<void>` returned by `useChapterActions`.

- [ ] **Step 1: Write the failing tests** (`ChapterPage.test.tsx`):
  - `shows New chapter on the last chapter of an original novel and opens the created chapter`: chapter `{ sourceType: 'ORIGINAL', nextChapterId: null }`; POST `/api/novels/<novelId>/chapters` returns chapter id 99 → after click, route is `/novels/<novelId>/chapters/99`.
  - `shows it for screenshot novels too`: `sourceType: 'SCREENSHOTS'`, last chapter → button present.
  - `hides it on a middle chapter and on Wattpad novels`: `nextChapterId: 12` → absent; `sourceType: 'WATTPAD', wattpadPartId: 'p1', nextChapterId: null` → absent and "Fetch & translate next" present.
  - `asks before leaving unsaved edits`: type in the text box, click → dialog `Leave without saving?`; Cancel → no POST made.
  - `shows an error toast when creating fails`: POST 500 → `toast.error` called, still on the same chapter, button enabled.
  - `is disabled while the chapter translates`: `translationStatus: 'TRANSLATING'` → button disabled.
- [ ] **Step 2: Run** `cd frontend && npm test -- ChapterPage` → the new tests FAIL.
- [ ] **Step 3: Implement.** `addNext` like `startNext` but calls `addChapter(chapter.novelId, {})`, no "Translation started" toast; on error `toastError(errorMessage(e))`; reset `setStarting(false)` on error the same way `startNext` does. In `ChapterNav`, render after the Wattpad block: when `chapter.nextChapterId === null && (chapter.sourceType === 'ORIGINAL' || chapter.sourceType === 'SCREENSHOTS')`, `<span className="chapter-head__next"><button className="button" type="button" disabled={locked || starting} onClick={onAddNext}><Plus …/>{starting ? 'Creating…' : 'New chapter'}</button></span>`. Update the component's doc comment.
- [ ] **Step 4: Run** `cd frontend && npm test -- ChapterPage ChapterNav && npx tsc --noEmit` → PASS.
- [ ] **Step 5: Docs** `PROGRESS.md`: `### 2026-11-18: Nút New chapter ở trang chương ✅ (không có migration, chỉ frontend)` with 2–3 bullets.
- [ ] **Step 6: Full check** `cd frontend && npm test && npm run build` → PASS.
- [ ] **Step 7: Commit** `feat(novel): add New chapter button on the last chapter`, push, `gh pr create --base main` (summary, test commands/results, links to spec and plan).
