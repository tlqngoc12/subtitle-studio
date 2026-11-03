-- Initial schema (Oracle SQL; H2 runs it in MODE=Oracle for dev and tests).
-- Every string column uses CHAR length semantics: Oracle counts bytes by default, and Thai or
-- Vietnamese text takes 2-3 bytes per character.
-- ${bigint} / ${int} are Flyway placeholders: NUMBER(19) / NUMBER(10) on Oracle, BIGINT / INTEGER on H2
-- (H2 reports NUMBER as NUMERIC, which Hibernate validate rejects for long/int fields).
-- Never edit this file once it has run on a real database; add V2__..., V3__... instead.

CREATE TABLE video (
  id            VARCHAR2(11 CHAR)   NOT NULL,
  title         VARCHAR2(500 CHAR)  NOT NULL,
  channel       VARCHAR2(255 CHAR),
  duration_sec  ${int},
  sub_lang      VARCHAR2(16 CHAR)   NOT NULL,
  sub_source    VARCHAR2(10 CHAR)   NOT NULL,
  cue_count     ${int}          NOT NULL,
  fetched_at    TIMESTAMP(6) WITH TIME ZONE NOT NULL,
  vi_cue_count  ${int} DEFAULT 0 NOT NULL,
  vi_updated_at TIMESTAMP(6) WITH TIME ZONE,
  CONSTRAINT pk_video PRIMARY KEY (id),
  CONSTRAINT ck_video_sub_source CHECK (sub_source IN ('MANUAL', 'AUTO'))
);

-- Steps of 50 match allocationSize = 50 so Hibernate can batch-insert thousands of cues.
CREATE SEQUENCE cue_seq START WITH 1 INCREMENT BY 50;

CREATE TABLE cue (
  id        ${bigint}          NOT NULL,
  video_id  VARCHAR2(11 CHAR)   NOT NULL,
  idx       ${int}          NOT NULL,
  start_ms  ${bigint}          NOT NULL,
  end_ms    ${bigint}          NOT NULL,
  text_en   VARCHAR2(1000 CHAR) NOT NULL,
  text_vi   VARCHAR2(1000 CHAR),
  CONSTRAINT pk_cue PRIMARY KEY (id),
  CONSTRAINT fk_cue_video FOREIGN KEY (video_id) REFERENCES video (id),
  -- Its index starts with video_id, so it also serves lookups and the foreign key.
  CONSTRAINT uk_cue_video_idx UNIQUE (video_id, idx)
);

CREATE SEQUENCE vi_cue_seq START WITH 1 INCREMENT BY 50;

CREATE TABLE vi_cue (
  id        ${bigint}          NOT NULL,
  video_id  VARCHAR2(11 CHAR)   NOT NULL,
  idx       ${int}          NOT NULL,
  start_ms  ${bigint}          NOT NULL,
  end_ms    ${bigint}          NOT NULL,
  text      VARCHAR2(1000 CHAR) NOT NULL,
  CONSTRAINT pk_vi_cue PRIMARY KEY (id),
  CONSTRAINT fk_vi_cue_video FOREIGN KEY (video_id) REFERENCES video (id),
  CONSTRAINT uk_vi_cue_video_idx UNIQUE (video_id, idx)
);
