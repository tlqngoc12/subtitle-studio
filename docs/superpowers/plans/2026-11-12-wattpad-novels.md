# Plan — Translated novels from Wattpad

Spec: `docs/superpowers/specs/2026-11-12-wattpad-novels-design.md`. Branch `feat/wattpad-novels`, worktree
`.claude/worktrees/wattpad-novels`. One PR at the end; Opus reviews the whole branch once (no per-task review).

Rules for every task: TDD where practical (write/adjust the test first), small commits (English, trailers from the
session), `mvn test` for backend tasks and `npx vitest run` + `npx tsc -b --noEmit` for frontend tasks before each
commit; never `git add -A`; never touch the main checkout or the real `./data`; the running app at :8080 has real
data — GET only.

## Task 1 — Wattpad part API spike + client
- Extend `fanfic/WattpadClient` (or a new `novel/wattpad/WattpadStoryClient` that reuses its HTTP setup) with:
  `storyWithParts(storyId)` (v3 fields from the spec) and `partText(partId)` (`apiv2/storytext`).
- One real check against story 396487502: longest part — confirm whether `page=` paging exists; implement the loop
  if it does; write the finding into the spec's Feasibility section.
- `WattpadText.toPlain(html)`: paragraphs → blank-line separated, `<br>` → newline, entities decoded, tags and images
  dropped, whitespace trimmed. Use Jsoup (add the dependency, pinned version) rather than regex.
- Tests with recorded fixtures (no network in tests): parts JSON, short part, multi-paragraph part with `<br>`,
  entities, an `<img>` paragraph, empty/locked answer.

## Task 2 — Flyway V20 + entities
- `V20__wattpad_novels.sql` (Oracle syntax + `${...}` placeholders as in earlier migrations) per the spec's Data
  section; `NovelSourceType` enum; fields on `Novel` and `Chapter` with getters/setters; DTOs (`NovelDetail`,
  `NovelSummary` if useful, `ChapterDetail`) expose `sourceType`, `sourceLanguage`, `wattpadStoryId`,
  `authorPermission`, `sourceText`, `wattpadPartId`, `sourceFetchedAt`.
- `NovelRequest`/`NovelValidator`: accept `sourceType`, `sourceLanguage` (th|en), `wattpadStoryId`,
  `authorPermission`; WATTPAD requires `authorPermission=true` and a story id (field errors as today).
- Repository finders: `findByWattpadStoryId`, chapter `findByNovelIdAndWattpadPartId`.
- Tests: migration on H2 (existing migration tests), validator, `mvn verify -Poracle -Dskip.npm` once at the end of
  the backend tasks (Testcontainers; confirm it never touches the production schema).

## Task 3 — Preview + create from Wattpad
- `POST /api/novels/wattpad/preview {url}` (reuse Fanfic link parsing/messages) → preview DTO incl.
  `existingNovelId`, guessed `sourceLanguage`.
- Creating a WATTPAD novel downloads the cover (reuse Fanfic cover download → `MediaService`), stores source
  fields; duplicate `wattpad_story_id` → 409 with a clear message.
- Tests: controller/service with a fake client.

## Task 4 — Parts list + import
- `GET /api/novels/{id}/wattpad/parts`, `POST /api/novels/{id}/wattpad/import {partIds}` per spec (story order,
  next chapter numbers/sort order, skip imported, per-part failures, pause between requests via the Fanfic
  `Sleeper` pattern).
- `POST /api/chapters/{id}/reload-original` (Draft only; 409 `CHAPTER_PUBLISHED` otherwise).
- Page endpoints (upload/reorder/rotate/delete page) answer 409 `CHAPTER_TEXT_SOURCE` for chapters with
  `source_text`; new exception + handler mapping.
- Tests: ordering, skip, failure isolation, the 409s.

## Task 5 — Text translation
- `TextChapterTranslator` interface + `GeminiTextChapterTranslator` (share the Gemini client, model list, fallback,
  429/503 behaviour, `onTrying`; extract shared code rather than copy if it is clean to do so).
- `ChapterTranslationService`: when the chapter has `source_text`, run the text path: chunking (≤ ~12,000 chars on
  paragraph boundaries), `carryOver`, `previousText`, notebook, profile, language-specific rules; write `text_vi`,
  `edited_after_translation=false`, status/model/time as today; failure → FAILED with message.
- Thai-ratio guard for Thai sources (reuse the existing >30% rule helper).
- Tests: chunk splitting, prompt contents per language, success, fallback, failure, Translate again overwrites.

## Task 6 — Export
- `SiteExporter` / public novel JSON: add the spec's fields (check what already exists); frontend `novelTypes`.
- Tests: exporter JSON contains the fields; screenshot novels unchanged.

## Task 7 — Frontend admin
- `NovelNewPage`: source switch Screenshots | From Wattpad; link field + Fetch (40px button, inline errors), prefill,
  language Select (Thai/English), permission checkbox (required), "Already translated → Open" when
  `existingNovelId`; `?wattpad=` auto-fetch.
- `NovelPage` (admin): for WATTPAD novels a "Wattpad chapters" section: list with checkboxes, word count, modify date
  (`lib/dates`), imported badge/link, Select all new, Import (result toast + failures list), Check for new chapters.
  Screenshot novels unchanged.
- `ChapterPage` (admin): when `sourceText` — hide page grid/upload; Original (read-only, language label, scroll) next
  to Chapter text (stack under 760px, mobile-first CSS); Reload original (Draft, confirm). Translate flows as today.
- Fanfic card menu: Translate this story / Open translation.
- Tests for each (fake API), keeping existing screenshot-novel tests green.

## Task 8 — Frontend public
- Public novel page: author line, "Bản gốc trên Wattpad ↗" link, permission line (Vietnamese), for WATTPAD novels;
  screenshot novels unchanged. Tests.

## Task 9 — Docs + PR
- CLAUDE.md (novel sources, text translation, Wattpad endpoints), PROGRESS.md entry, update the spec with spike
  findings and any deviations.
- Full verification: `mvn test`, `mvn verify -Poracle -Dskip.npm`, `npx vitest run` (file count check),
  `npx tsc -b --noEmit`.
- Push, `gh pr create --base main` (English; summary, migration V20, how tested with numbers, deploy notes: backup
  DB before deploy; no Publish needed until a Wattpad novel has published chapters). Do not merge or deploy.
