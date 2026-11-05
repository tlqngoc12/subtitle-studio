-- Novels translated from page screenshots (spec docs/superpowers/specs/2026-11-05-novels-design.md).
-- Same conventions as V1-V4: CHAR length semantics, ${bigint} / ${int} placeholders, sequences in steps of 50,
-- new tables use the T_ prefix. Never edit this file once it has run on a real database; add V6__... instead.
--
-- position in t_chapter_page is kept gapless (1..n) by ChapterService; no unique (chapter_id, position) because
-- rewriting the order would collide halfway through.

CREATE SEQUENCE t_novel_seq START WITH 1 INCREMENT BY 50;
CREATE SEQUENCE t_chapter_seq START WITH 1 INCREMENT BY 50;
CREATE SEQUENCE t_chapter_page_seq START WITH 1 INCREMENT BY 50;
CREATE SEQUENCE t_novel_notebook_seq START WITH 1 INCREMENT BY 50;

CREATE TABLE t_novel (
  id                           ${bigint}                    NOT NULL,
  slug                         VARCHAR2(60 CHAR)            NOT NULL,
  title                        VARCHAR2(200 CHAR)           NOT NULL,
  cover_media_id               ${bigint},
  original_author              VARCHAR2(200 CHAR),
  description                  CLOB,
  tags                         VARCHAR2(500 CHAR),
  novel_status                 VARCHAR2(20 CHAR)            NOT NULL,
  translator_credit            VARCHAR2(200 CHAR),
  source_url                   VARCHAR2(1000 CHAR),
  prompt_profile               VARCHAR2(40 CHAR),
  notebook_status              VARCHAR2(20 CHAR)            NOT NULL,
  notebook_error               VARCHAR2(500 CHAR),
  notebook_pending_chapter_no  ${int},
  created_at                   TIMESTAMP(6) WITH TIME ZONE  NOT NULL,
  updated_at                   TIMESTAMP(6) WITH TIME ZONE  NOT NULL,
  CONSTRAINT t_novel_pk PRIMARY KEY (id),
  CONSTRAINT t_novel_slug_uk UNIQUE (slug),
  CONSTRAINT t_novel_cover_fk FOREIGN KEY (cover_media_id) REFERENCES t_media (id)
);

CREATE TABLE t_chapter (
  id                        ${bigint}                    NOT NULL,
  novel_id                  ${bigint}                    NOT NULL,
  chapter_no                ${int}                       NOT NULL,
  title                     VARCHAR2(200 CHAR),
  translation_status        VARCHAR2(20 CHAR)            NOT NULL,
  translation_error         VARCHAR2(500 CHAR),
  translated_at             TIMESTAMP(6) WITH TIME ZONE,
  edited_after_translation  CHAR(1 CHAR) DEFAULT 'N'     NOT NULL,
  publish_status            VARCHAR2(20 CHAR)            NOT NULL,
  published_at              TIMESTAMP(6) WITH TIME ZONE,
  created_at                TIMESTAMP(6) WITH TIME ZONE  NOT NULL,
  updated_at                TIMESTAMP(6) WITH TIME ZONE  NOT NULL,
  CONSTRAINT t_chapter_pk PRIMARY KEY (id),
  CONSTRAINT t_chapter_novel_fk FOREIGN KEY (novel_id) REFERENCES t_novel (id) ON DELETE CASCADE,
  CONSTRAINT t_chapter_no_uk UNIQUE (novel_id, chapter_no)
);

CREATE TABLE t_chapter_page (
  id          ${bigint}  NOT NULL,
  chapter_id  ${bigint}  NOT NULL,
  position    ${int}     NOT NULL,
  media_id    ${bigint}  NOT NULL,
  text_vi     CLOB,
  CONSTRAINT t_chapter_page_pk PRIMARY KEY (id),
  CONSTRAINT t_chapter_page_chapter_fk FOREIGN KEY (chapter_id) REFERENCES t_chapter (id) ON DELETE CASCADE,
  CONSTRAINT t_chapter_page_media_fk FOREIGN KEY (media_id) REFERENCES t_media (id)
);
CREATE INDEX t_chapter_page_chapter_ix ON t_chapter_page (chapter_id);
CREATE INDEX t_chapter_page_media_ix ON t_chapter_page (media_id);

-- The story notebook after chapter N was published; content_json is NotebookContent.
CREATE TABLE t_novel_notebook (
  id                ${bigint}                    NOT NULL,
  novel_id          ${bigint}                    NOT NULL,
  after_chapter_no  ${int}                       NOT NULL,
  content_json      CLOB                         NOT NULL,
  created_at        TIMESTAMP(6) WITH TIME ZONE  NOT NULL,
  CONSTRAINT t_novel_notebook_pk PRIMARY KEY (id),
  CONSTRAINT t_novel_notebook_novel_fk FOREIGN KEY (novel_id) REFERENCES t_novel (id) ON DELETE CASCADE,
  CONSTRAINT t_novel_notebook_uk UNIQUE (novel_id, after_chapter_no)
);
