-- The story notebook feature was removed (spec docs/superpowers/specs/2026-11-16-remove-novel-notebook-design.md).
-- Its data is deleted. Never edit this file once it has run on a real database; add V27__... instead.

DROP TABLE t_novel_notebook;
DROP SEQUENCE t_novel_notebook_seq;

ALTER TABLE t_novel DROP COLUMN notebook_status;
ALTER TABLE t_novel DROP COLUMN notebook_error;
ALTER TABLE t_novel DROP COLUMN notebook_pending_chapter_no;
ALTER TABLE t_novel DROP COLUMN notebook_paused;
