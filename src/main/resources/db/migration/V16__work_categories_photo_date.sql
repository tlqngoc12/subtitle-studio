-- UI polish (spec docs/superpowers/specs/2026-11-11-ui-polish-design.md, section 6 and 7).
-- Same conventions as V1-V15: CHAR length semantics, ${bigint} / ${int} placeholders.
-- Never edit this file once it has run on a real database; add V17__... instead.
--
-- 1. A work can have several categories (a film that is also a music work). They move from t_work.category into a
--    join table; position runs 1..n in the order the admin chose them. Every existing work keeps its one category.
-- 2. A photo post has a single date: t_photo_post.taken_until is dropped.

CREATE TABLE t_work_category (
  work_id   ${bigint}          NOT NULL,
  category  VARCHAR2(20 CHAR)  NOT NULL,
  position  ${int}             NOT NULL,
  CONSTRAINT t_work_category_pk PRIMARY KEY (work_id, category),
  CONSTRAINT t_work_category_work_fk FOREIGN KEY (work_id) REFERENCES t_work (id) ON DELETE CASCADE,
  CONSTRAINT t_work_category_value_ck CHECK (category IN ('FILM_TV', 'PERFORMANCE', 'MUSIC', 'VARIETY',
    'ADVERTISEMENT', 'CEREMONY', 'INTERVIEW', 'FASHION'))
);

INSERT INTO t_work_category (work_id, category, position) SELECT id, category, 1 FROM t_work;

ALTER TABLE t_work DROP CONSTRAINT t_work_category_ck;
ALTER TABLE t_work DROP COLUMN category;

ALTER TABLE t_photo_post DROP COLUMN taken_until;
