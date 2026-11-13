-- Which novels the public Novels page banner shows (picked by hand, at most 5; enforced by the API, not here).
-- The novels that exist today start as picked, so the banner looks the same after this migration.
-- Never edit this file once it has run on a real database; add V23__... instead.

ALTER TABLE t_novel ADD (featured NUMBER(1) DEFAULT 0 NOT NULL);

UPDATE t_novel SET featured = 1;
