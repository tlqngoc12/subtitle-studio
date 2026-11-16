-- Images of a Wattpad text chapter (spec docs/superpowers/specs/2026-11-16-wattpad-chapter-images-design.md): the chapter
-- text holds a marker paragraph [[image:<media id>]] where the image stands; this table owns the media so the garbage
-- collector keeps it, and remembers the Wattpad URL so a reload reuses the same media (and the markers stay valid).
-- Same conventions as V1-V24: CHAR length semantics, ${bigint} / ${int} placeholders, sequences in steps of 50.
-- Never edit this file once it has run on a real database.

CREATE SEQUENCE t_chapter_image_seq START WITH 1 INCREMENT BY 50;

CREATE TABLE t_chapter_image (
  id          ${bigint}            NOT NULL,
  chapter_id  ${bigint}            NOT NULL,
  media_id    ${bigint}            NOT NULL,
  source_url  VARCHAR2(1000 CHAR)  NOT NULL,
  position    ${int}               NOT NULL,
  CONSTRAINT t_chapter_image_pk PRIMARY KEY (id),
  CONSTRAINT t_chapter_image_chapter_fk FOREIGN KEY (chapter_id) REFERENCES t_chapter (id) ON DELETE CASCADE,
  CONSTRAINT t_chapter_image_media_fk FOREIGN KEY (media_id) REFERENCES t_media (id),
  CONSTRAINT t_chapter_image_url_uk UNIQUE (chapter_id, source_url)
);
CREATE INDEX t_chapter_image_media_ix ON t_chapter_image (media_id);
