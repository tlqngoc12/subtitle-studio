-- Fanfics tab of the Novels menu (spec docs/superpowers/specs/2026-11-11-fanfics-design.md): Wattpad stories read from
-- Wattpad's public API when the admin pastes a link. Same conventions as V1-V16: CHAR length semantics,
-- ${bigint} / ${int} placeholders, sequences in steps of 50. Never edit this file once it has run on a real database.
--
-- wattpad_id is the unique story id, so the same story cannot be added twice whatever link form was pasted.
-- tags is space separated and only used for searching; cover_source_url lets Refresh skip an unchanged cover.

CREATE SEQUENCE t_fanfic_seq START WITH 1 INCREMENT BY 50;

CREATE TABLE t_fanfic (
  id                ${bigint}                    NOT NULL,
  wattpad_id        VARCHAR2(20 CHAR)            NOT NULL,
  url               VARCHAR2(500 CHAR)           NOT NULL,
  title             VARCHAR2(300 CHAR)           NOT NULL,
  author            VARCHAR2(100 CHAR),
  description       CLOB,
  tags              VARCHAR2(2000 CHAR),
  cover_media_id    ${bigint},
  cover_source_url  VARCHAR2(500 CHAR),
  read_count        ${bigint}                    NOT NULL,
  vote_count        ${bigint}                    NOT NULL,
  part_count        ${bigint}                    NOT NULL,
  word_count        ${bigint}                    NOT NULL,
  completed         ${int}                       NOT NULL,
  story_updated_at  TIMESTAMP(6) WITH TIME ZONE,
  fetched_at        TIMESTAMP(6) WITH TIME ZONE  NOT NULL,
  created_at        TIMESTAMP(6) WITH TIME ZONE  NOT NULL,
  CONSTRAINT t_fanfic_pk PRIMARY KEY (id),
  CONSTRAINT t_fanfic_wattpad_uk UNIQUE (wattpad_id),
  CONSTRAINT t_fanfic_cover_fk FOREIGN KEY (cover_media_id) REFERENCES t_media (id),
  CONSTRAINT t_fanfic_completed_ck CHECK (completed IN (0, 1))
);
CREATE INDEX t_fanfic_updated_ix ON t_fanfic (story_updated_at DESC, id DESC);
CREATE INDEX t_fanfic_cover_ix ON t_fanfic (cover_media_id);
