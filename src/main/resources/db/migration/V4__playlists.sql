-- Playlists of videos that have Vietsub (spec docs/superpowers/specs/2026-11-04-playlists-design.md).
-- Same conventions as V1/V2: CHAR length semantics, ${bigint} / ${int} placeholders, sequences in steps of 50,
-- new tables use the T_ prefix. Never edit this file once it has run on a real database; add V5__... instead.
--
-- position is kept gapless (1..n) by PlaylistService. There is deliberately no unique (playlist_id, position):
-- rewriting the order would collide halfway through.

CREATE SEQUENCE t_playlist_seq START WITH 1 INCREMENT BY 50;
CREATE SEQUENCE t_playlist_item_seq START WITH 1 INCREMENT BY 50;

CREATE TABLE t_playlist (
  id           ${bigint}                    NOT NULL,
  name         VARCHAR2(100 CHAR)           NOT NULL,
  description  VARCHAR2(1000 CHAR),
  created_at   TIMESTAMP(6) WITH TIME ZONE  NOT NULL,
  updated_at   TIMESTAMP(6) WITH TIME ZONE  NOT NULL,
  CONSTRAINT t_playlist_pk PRIMARY KEY (id)
);

CREATE TABLE t_playlist_item (
  id           ${bigint}           NOT NULL,
  playlist_id  ${bigint}           NOT NULL,
  video_id     VARCHAR2(11 CHAR)   NOT NULL,
  position     ${int}              NOT NULL,
  CONSTRAINT t_playlist_item_pk PRIMARY KEY (id),
  CONSTRAINT t_playlist_item_playlist_fk FOREIGN KEY (playlist_id) REFERENCES t_playlist (id),
  CONSTRAINT t_playlist_item_video_fk FOREIGN KEY (video_id) REFERENCES video (id),
  CONSTRAINT t_playlist_item_video_uk UNIQUE (playlist_id, video_id)
);
CREATE INDEX t_playlist_item_video_ix ON t_playlist_item (video_id);
