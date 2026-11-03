-- Profile pages (Emi, Bonnie, EmiBonnie): free-form blocks with uploaded images.
-- Same conventions as V1: CHAR length semantics, ${bigint} / ${int} placeholders, sequences in steps of 50
-- (allocationSize = 50). New tables use the T_ prefix.
-- Never edit this file once it has run on a real database; add V3__... instead.

CREATE SEQUENCE t_profile_seq START WITH 1 INCREMENT BY 50;
CREATE SEQUENCE t_media_seq START WITH 1 INCREMENT BY 50;
CREATE SEQUENCE t_profile_block_seq START WITH 1 INCREMENT BY 50;
CREATE SEQUENCE t_profile_block_item_seq START WITH 1 INCREMENT BY 50;

CREATE TABLE t_profile (
  id            ${bigint}                    NOT NULL,
  slug          VARCHAR2(20 CHAR)            NOT NULL,
  display_name  VARCHAR2(100 CHAR)           NOT NULL,
  updated_at    TIMESTAMP(6) WITH TIME ZONE  NOT NULL,
  CONSTRAINT t_profile_pk PRIMARY KEY (id),
  CONSTRAINT t_profile_slug_uk UNIQUE (slug)
);

-- One uploaded image; the file is {data-dir}/media/{id}.{ext}. The user's file name is only kept here.
CREATE TABLE t_media (
  id             ${bigint}                    NOT NULL,
  content_type   VARCHAR2(50 CHAR)            NOT NULL,
  size_bytes     ${bigint}                    NOT NULL,
  original_name  VARCHAR2(255 CHAR),
  created_at     TIMESTAMP(6) WITH TIME ZONE  NOT NULL,
  CONSTRAINT t_media_pk PRIMARY KEY (id)
);

-- One block per row; which columns a block uses depends on block_type (checked in Java).
CREATE TABLE t_profile_block (
  id          ${bigint}                    NOT NULL,
  profile_id  ${bigint}                    NOT NULL,
  position    ${int}                       NOT NULL,
  block_type  VARCHAR2(10 CHAR)            NOT NULL,
  title       VARCHAR2(200 CHAR),
  body        CLOB,
  media_id    ${bigint},
  caption     VARCHAR2(500 CHAR),
  embed_url   VARCHAR2(500 CHAR),
  created_at  TIMESTAMP(6) WITH TIME ZONE  NOT NULL,
  updated_at  TIMESTAMP(6) WITH TIME ZONE  NOT NULL,
  CONSTRAINT t_profile_block_pk PRIMARY KEY (id),
  CONSTRAINT t_profile_block_profile_fk FOREIGN KEY (profile_id) REFERENCES t_profile (id),
  CONSTRAINT t_profile_block_media_fk FOREIGN KEY (media_id) REFERENCES t_media (id),
  CONSTRAINT t_profile_block_type_ck CHECK (block_type IN ('TEXT', 'IMAGE', 'GALLERY', 'EMBED', 'LINKS', 'FACTS'))
);
CREATE INDEX t_profile_block_profile_ix ON t_profile_block (profile_id, position);
CREATE INDEX t_profile_block_media_ix ON t_profile_block (media_id);

-- Items of GALLERY / LINKS / FACTS blocks. item_value, not value: VALUE is an H2 keyword.
CREATE TABLE t_profile_block_item (
  id          ${bigint}            NOT NULL,
  block_id    ${bigint}            NOT NULL,
  position    ${int}               NOT NULL,
  label       VARCHAR2(200 CHAR),
  item_value  VARCHAR2(1000 CHAR),
  media_id    ${bigint},
  CONSTRAINT t_profile_block_item_pk PRIMARY KEY (id),
  CONSTRAINT t_profile_block_item_block_fk FOREIGN KEY (block_id) REFERENCES t_profile_block (id) ON DELETE CASCADE,
  CONSTRAINT t_profile_block_item_media_fk FOREIGN KEY (media_id) REFERENCES t_media (id)
);
CREATE INDEX t_profile_block_item_block_ix ON t_profile_block_item (block_id, position);
CREATE INDEX t_profile_block_item_media_ix ON t_profile_block_item (media_id);

-- The three fixed profiles; tabs are ordered by id (EmiBonnie, Emi, Bonnie).
INSERT INTO t_profile (id, slug, display_name, updated_at) VALUES (t_profile_seq.NEXTVAL, 'emibonnie', 'EmiBonnie', CURRENT_TIMESTAMP);
INSERT INTO t_profile (id, slug, display_name, updated_at) VALUES (t_profile_seq.NEXTVAL, 'emi', 'Emi', CURRENT_TIMESTAMP);
INSERT INTO t_profile (id, slug, display_name, updated_at) VALUES (t_profile_seq.NEXTVAL, 'bonnie', 'Bonnie', CURRENT_TIMESTAMP);
