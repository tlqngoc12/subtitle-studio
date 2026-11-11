-- Works menu (spec docs/superpowers/specs/2026-11-10-works-design.md): films, series, MVs, ads... with links and cast.
-- Same conventions as V1-V14: CHAR length semantics, ${bigint} / ${int} placeholders, sequences in steps of 50.
-- Never edit this file once it has run on a real database; add V16__... instead.
--
-- t_person is the reusable directory (name + avatar). Links and credits of a work are replaced as a whole by the
-- service, so there is no unique (work_id, person_id): rewriting a list would collide halfway through. The service
-- enforces the limits (20 links, 30 credits, each non-OTHER link kind once, a person once per work).

CREATE SEQUENCE t_person_seq START WITH 1 INCREMENT BY 50;
CREATE SEQUENCE t_work_seq START WITH 1 INCREMENT BY 50;
CREATE SEQUENCE t_work_link_seq START WITH 1 INCREMENT BY 50;
CREATE SEQUENCE t_work_credit_seq START WITH 1 INCREMENT BY 50;

CREATE TABLE t_person (
  id               ${bigint}                    NOT NULL,
  name             VARCHAR2(100 CHAR)           NOT NULL,
  avatar_media_id  ${bigint},
  created_at       TIMESTAMP(6) WITH TIME ZONE  NOT NULL,
  CONSTRAINT t_person_pk PRIMARY KEY (id),
  CONSTRAINT t_person_avatar_fk FOREIGN KEY (avatar_media_id) REFERENCES t_media (id)
);
CREATE INDEX t_person_avatar_ix ON t_person (avatar_media_id);

CREATE TABLE t_work (
  id              ${bigint}                    NOT NULL,
  title           VARCHAR2(200 CHAR)           NOT NULL,
  cover_media_id  ${bigint},
  release_date    DATE,
  category        VARCHAR2(20 CHAR)            NOT NULL,
  subcategory     VARCHAR2(50 CHAR),
  profile_id      ${bigint},
  description     VARCHAR2(2000 CHAR),
  created_at      TIMESTAMP(6) WITH TIME ZONE  NOT NULL,
  updated_at      TIMESTAMP(6) WITH TIME ZONE  NOT NULL,
  CONSTRAINT t_work_pk PRIMARY KEY (id),
  CONSTRAINT t_work_cover_fk FOREIGN KEY (cover_media_id) REFERENCES t_media (id),
  CONSTRAINT t_work_profile_fk FOREIGN KEY (profile_id) REFERENCES t_profile (id),
  CONSTRAINT t_work_category_ck CHECK (category IN ('FILM_TV', 'PERFORMANCE', 'MUSIC', 'VARIETY', 'ADVERTISEMENT',
    'CEREMONY', 'INTERVIEW', 'FASHION'))
);
CREATE INDEX t_work_release_ix ON t_work (release_date);
CREATE INDEX t_work_cover_ix ON t_work (cover_media_id);
CREATE INDEX t_work_profile_ix ON t_work (profile_id);

CREATE TABLE t_work_link (
  id        ${bigint}           NOT NULL,
  work_id   ${bigint}           NOT NULL,
  position  ${int}              NOT NULL,
  kind      VARCHAR2(10 CHAR)   NOT NULL,
  label     VARCHAR2(60 CHAR)   NOT NULL,
  url       VARCHAR2(500 CHAR)  NOT NULL,
  icon      VARCHAR2(30 CHAR),
  CONSTRAINT t_work_link_pk PRIMARY KEY (id),
  CONSTRAINT t_work_link_work_fk FOREIGN KEY (work_id) REFERENCES t_work (id) ON DELETE CASCADE,
  CONSTRAINT t_work_link_kind_ck CHECK (kind IN ('PILOT', 'TRAILER', 'X', 'INSTAGRAM', 'OTHER'))
);
CREATE INDEX t_work_link_work_ix ON t_work_link (work_id, position);

CREATE TABLE t_work_credit (
  id              ${bigint}           NOT NULL,
  work_id         ${bigint}           NOT NULL,
  position        ${int}              NOT NULL,
  person_id       ${bigint}           NOT NULL,
  role            VARCHAR2(40 CHAR),
  character_name  VARCHAR2(100 CHAR),
  CONSTRAINT t_work_credit_pk PRIMARY KEY (id),
  CONSTRAINT t_work_credit_work_fk FOREIGN KEY (work_id) REFERENCES t_work (id) ON DELETE CASCADE,
  CONSTRAINT t_work_credit_person_fk FOREIGN KEY (person_id) REFERENCES t_person (id)
);
CREATE INDEX t_work_credit_work_ix ON t_work_credit (work_id, position);
CREATE INDEX t_work_credit_person_ix ON t_work_credit (person_id);
