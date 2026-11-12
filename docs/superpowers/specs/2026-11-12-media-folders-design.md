# Media folders

Uploaded images used to sit flat in `data/media/{storageKey}.{ext}`. They are now filed into one folder per feature and
get readable names. URLs (`/api/media/{id}`) and the public export (`/media/{storageKey}.{ext}`) do not change.

## Layout

```
media/profiles/portraits/   Profile.portrait
media/profiles/banners/     ProfileBannerImage
media/profiles/blocks/      ProfileBlock + ProfileBlockItem
media/photos/               PhotoPost
media/works/covers/         Work.cover
media/works/people/         Person.avatar
media/novels/covers/        Novel.cover
media/novels/<novel-slug>/  ChapterPage (grouped per novel, not per chapter)
media/fanfics/covers/       Fanfic.cover
media/_inbox/               uploaded, not attached to anything yet
```

An image used in several places goes to the folder of the first reference in the order above
(`MediaFiler.RULES`). An unreferenced image is in `_inbox/`.

## Names

`{yyyy-MM-dd}_{slug}_{first 8 chars of storageKey}.{ext}`

- The date is `createdAt` in `Asia/Ho_Chi_Minh`.
- `slug` is the original file name without extension: Vietnamese diacritics folded, other non-ASCII (Thai) dropped,
  lowercase, runs of non `[a-z0-9]` become `-`, trimmed, at most 60 chars. If nothing is left, the category word
  (`portrait`, `banner`, `block`, `photo`, `cover`, `avatar`, `page`, `upload`).
- A name collision in the target folder appends `-2`, `-3`, ... before the extension.

## Database

Flyway V19 adds `t_media.storage_path VARCHAR2(400 CHAR)`, nullable: the path relative to `media/`. NULL means the legacy
flat file `{storageKey}.{ext}`.

## How files get filed

- `MediaService.persist` writes new uploads to `_inbox/` and sets `storage_path`.
- `MediaReferenceListener` (JPA `@PostPersist`/`@PostUpdate` on the ten entities that point at `t_media`) registers an
  after-commit action; `MediaFiler.file(id)` then moves the file to the folder of its first reference and updates
  `storage_path` in a short separate transaction (the move is undone if that update fails). A rolled-back save moves nothing.
  `MediaFilerTest.everyMediaReferenceHasAFilingRule` compares `MediaFiler.RULES` with the JPA metamodel, so a new entity
  that points at `Media` fails the build until it gets a rule (and a branch in the listener).
- Renaming a novel slug re-files that novel's page images (`NovelService.update`).
- On `ApplicationReadyEvent`, after the abandoned-upload cleanup, `MediaFiler.reconcile` files every row. This migrates the
  legacy flat files and logs `Filed N image(s) into folders, M already in place, K missing`. Missing files are warnings
  with ids, never fatal. It is idempotent.

## Shared data directory caveat

The H2 dev database and Oracle share `./data` and may reference the same files (same storage key). Each has its own
`storage_path`, so after one moves a file the other's path is stale. `MediaStorage.locate` therefore falls back to a scan
of the media tree for `{storageKey}.*` or `*_{first8}.*` (cached, at most one scan a minute) for load, delete and filing.
The other database's row heals the next time it files the image (reconcile on its next start). Do not run both databases
against the same directory during the first migration if you can avoid it: start one app, check the summary line, then the other.

## Deploy checklist

1. Back up the database and copy `data/media` to `data/media-backup-YYYYMMDD` before the first start.
2. Start the app and look for the `Filed N image(s) into folders ...` log line (expected: about 346 files, K = 0).
3. Open Profile, Photos, Works and Novels and check that images still show.
