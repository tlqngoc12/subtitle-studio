-- Novels translated from Wattpad text (spec docs/superpowers/specs/2026-11-12-wattpad-novels-design.md): a Wattpad novel
-- is an ordinary novel with source_type WATTPAD whose chapters carry the fetched original text. Same conventions as
-- V1-V19: CHAR length semantics, ${bigint} / ${int} placeholders. Never edit this file once it has run on a real database.
--
-- wattpad_part_id is unique on its own (Wattpad part ids are global, and one story maps to one novel through
-- t_novel.wattpad_story_id). A composite (novel_id, wattpad_part_id) would make Oracle reject a second screenshot chapter,
-- because it treats (novel_id, NULL) keys as equal.

ALTER TABLE t_novel ADD (
  source_type       VARCHAR2(20 CHAR) DEFAULT 'SCREENSHOTS' NOT NULL,
  source_language   VARCHAR2(5 CHAR)  DEFAULT 'th'          NOT NULL,
  wattpad_story_id  VARCHAR2(20 CHAR)
);
ALTER TABLE t_novel ADD CONSTRAINT t_novel_wattpad_story_uk UNIQUE (wattpad_story_id);
ALTER TABLE t_novel ADD CONSTRAINT t_novel_source_type_ck CHECK (source_type IN ('SCREENSHOTS', 'WATTPAD'));

ALTER TABLE t_chapter ADD (
  source_text        CLOB,
  wattpad_part_id    VARCHAR2(20 CHAR),
  source_fetched_at  TIMESTAMP(6) WITH TIME ZONE
);
ALTER TABLE t_chapter ADD CONSTRAINT t_chapter_wattpad_part_uk UNIQUE (wattpad_part_id);
