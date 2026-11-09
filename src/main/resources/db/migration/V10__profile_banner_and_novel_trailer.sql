-- Profile banner images and the optional novel trailer
-- (spec docs/superpowers/specs/2026-11-09-profile-banner-design.md, parts 1 and 2).
-- Same conventions as V1-V9: CHAR length semantics, ${bigint} / ${int} placeholders, sequences in steps of 50,
-- new tables use the T_ prefix. Never edit this file once it has run on a real database; add V11__... instead.
--
-- position is kept gapless (1..n) per profile by ProfileBannerService; no unique (profile_id, position) because
-- rewriting the order would collide halfway through (same reason as t_chapter_page). The limit of 8 images is
-- enforced in the service too.

CREATE SEQUENCE t_profile_banner_image_seq START WITH 1 INCREMENT BY 50;

CREATE TABLE t_profile_banner_image (
  id          ${bigint}                    NOT NULL,
  profile_id  ${bigint}                    NOT NULL,
  media_id    ${bigint}                    NOT NULL,
  position    ${int}                       NOT NULL,
  alt_text    VARCHAR2(200 CHAR),
  created_at  TIMESTAMP(6) WITH TIME ZONE  NOT NULL,
  CONSTRAINT t_profile_banner_image_pk PRIMARY KEY (id),
  CONSTRAINT t_profile_banner_image_profile_fk FOREIGN KEY (profile_id) REFERENCES t_profile (id),
  CONSTRAINT t_profile_banner_image_media_fk FOREIGN KEY (media_id) REFERENCES t_media (id)
);
CREATE INDEX t_profile_banner_image_profile_ix ON t_profile_banner_image (profile_id, position);
CREATE INDEX t_profile_banner_image_media_ix ON t_profile_banner_image (media_id);

-- Optional YouTube trailer of a novel: only the 11-character video id is stored (NovelValidator extracts it).
ALTER TABLE t_novel ADD (trailer_video_id VARCHAR2(11 CHAR));
