# Chapter list sync (admin popover ↔ public reader TOC) + "Add chapter"
Approved by the user 2026-11-23.

Task A — Admin ChapterJump simplified (frontend/src/components/chapter/ChapterJump.tsx + .css + test, ChapterNav.tsx, ChapterPage.tsx):
- The trigger button shows only the `List` icon, no "3 / 42" text. Accessible name "All chapters" (aria-label), Tip "All chapters". Keep class button--icon style like the < > IconLinks.
- Remove the search box, `filterChapters`, the custom ArrowUp/ArrowDown/Enter handling and the `data-active` state. Rows are plain links (Tab moves through them, Radix Esc closes). On open, focus the current chapter's link and scroll it into view (block: 'center').
- Keep: lazy load via getNovel on first open, skeleton, error + Retry, compact StatusBadges with interactive={false}, onLeave for unsaved edits, `aria-current="page"` on the current row.
- Props drop `position`/`total`.

Task B — Remove `position`/`chapterCount` from the API: ChapterDetail.java (fields, withPosition, constructors), ChapterService.detail, frontend api/novels.ts ChapterDetail type, fixtures, ChapterServiceTest test detailCarriesPositionAndCount (delete it).

Task C — Shared chapter-row CSS for both lists: create frontend/src/styles/chapter-toc.css (import it from both ChapterJump and ReaderTocDrawer, or from styles index — follow the project's CSS convention in CLAUDE.md). Classes `.chapter-toc__list`, `.chapter-toc__item`, `.chapter-toc__item--current`, `.chapter-toc__link`, `.chapter-toc__name`:
- list: padding 8px (var(--space-2)), its scroll container gets `scrollbar-width: thin; scrollbar-color: var(--brand-2) var(--paper)`.
- item: flex row, align center, gap var(--space-2), border-radius var(--radius-control); hover background var(--paper).
- current item: background color-mix(in srgb, var(--brand-2) 28%, var(--surface)); its link/name font-weight 700.
- name: one line, `min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap` (public too — previously it wrapped with overflow-wrap:anywhere). Add a `title` attribute with the full name on the link in both lists.
- Admin current row no longer uses solid purple / inset border / --on-brand text; status icons keep their normal colours.
- Public ReaderTocDrawer keeps everything else unchanged: drawer, "Đang đọc" badge, read ✓, scroll to current. Move its row styles out of ReaderBar.css into the shared file (delete the old .reader-toc__item/.reader-toc__link rules), keeping the drawer's own rules.
- Update CSS tests that read these files (src/test/css.ts helpers) and contrast/brand tests if needed.

Task D — Label sync "Add chapter": in ChapterNav.tsx the last-chapter button for ORIGINAL/SCREENSHOTS novels says "New chapter" → "Add chapter", busy text "Creating…" → "Adding…". Check NovelPage's "Add chapter" button busy text and use "Adding…" there too if it differs. Update the doc comment and tests.

Tests: ChapterJump (icon-only button named "All chapters"; no searchbox; focus on current link on open; current row has class chapter-toc__item--current; rows have title attr), ReaderTocDrawer (uses shared classes, current row still has "Đang đọc"), ChapterNav ("Add chapter"/"Adding…"), backend full suite after removing the fields. Commit each task separately in English with the Co-Authored-By line.
