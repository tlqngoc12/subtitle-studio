-- Which novels the public Novels page banner shows (picked by hand, at most 5; enforced by the API, not here).
-- The novels that exist today start as picked, so the banner looks the same after this migration.
-- Stored as 'Y'/'N' like t_chapter.edited_after_translation.
-- Never edit this file once it has run on a real database; add V23__... instead.

ALTER TABLE t_novel ADD (featured CHAR(1 CHAR) DEFAULT 'N' NOT NULL);

UPDATE t_novel SET featured = 'Y';
