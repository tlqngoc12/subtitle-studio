-- Per-novel switch: while 'Y', publishing a chapter does not start a notebook update.
-- Stored as 'Y'/'N' like t_novel.featured. Every novel starts not paused.
-- Never edit this file once it has run on a real database; add V24__... instead.

ALTER TABLE t_novel ADD (notebook_paused CHAR(1 CHAR) DEFAULT 'N' NOT NULL);
