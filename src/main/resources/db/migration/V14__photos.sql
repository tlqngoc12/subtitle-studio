-- Photos menu (spec docs/superpowers/specs/2026-11-10-photos-design.md): Instagram posts shown as a bento grid.
-- Same conventions as V1-V13: CHAR length semantics, ${bigint} / ${int} placeholders, sequences in steps of 50.
-- Never edit this file once it has run on a real database; add V15__... instead.
--
-- The tile shape comes from t_media.width / height (set by resized uploads, V13). instagram_url holds the normalised
-- link https://www.instagram.com/{p|reel|tv}/{code}/ and is unique, so the same post cannot be added twice.

CREATE SEQUENCE t_photo_post_seq START WITH 1 INCREMENT BY 50;

CREATE TABLE t_photo_post (
  id             ${bigint}                    NOT NULL,
  instagram_url  VARCHAR2(300 CHAR)           NOT NULL,
  media_id       ${bigint}                    NOT NULL,
  title          VARCHAR2(200 CHAR)           NOT NULL,
  taken_on       DATE                         NOT NULL,
  taken_until    DATE,
  source         VARCHAR2(10 CHAR)            NOT NULL,
  photo_count    ${int},
  created_at     TIMESTAMP(6) WITH TIME ZONE  NOT NULL,
  updated_at     TIMESTAMP(6) WITH TIME ZONE  NOT NULL,
  CONSTRAINT t_photo_post_pk PRIMARY KEY (id),
  CONSTRAINT t_photo_post_url_uk UNIQUE (instagram_url),
  CONSTRAINT t_photo_post_media_fk FOREIGN KEY (media_id) REFERENCES t_media (id),
  CONSTRAINT t_photo_post_source_ck CHECK (source IN ('OFFICIAL', 'MEDIA', 'FAN'))
);
CREATE INDEX t_photo_post_taken_ix ON t_photo_post (taken_on DESC, id DESC);
CREATE INDEX t_photo_post_media_ix ON t_photo_post (media_id);

CREATE TABLE t_photo_post_profile (
  post_id     ${bigint} NOT NULL,
  profile_id  ${bigint} NOT NULL,
  CONSTRAINT t_photo_post_profile_pk PRIMARY KEY (post_id, profile_id),
  CONSTRAINT t_photo_post_profile_post_fk FOREIGN KEY (post_id) REFERENCES t_photo_post (id) ON DELETE CASCADE,
  CONSTRAINT t_photo_post_profile_profile_fk FOREIGN KEY (profile_id) REFERENCES t_profile (id)
);
CREATE INDEX t_photo_post_profile_ix ON t_photo_post_profile (profile_id);
