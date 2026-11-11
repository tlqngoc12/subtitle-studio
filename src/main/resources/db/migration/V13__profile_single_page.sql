-- Profile as one page (spec docs/superpowers/specs/2026-11-10-profile-single-page-design.md).
-- Same conventions as V1-V12: CHAR length semantics, ${bigint} / ${int} placeholders.
-- Never edit this file once it has run on a real database; add V14__... instead.
--
-- t_profile: kind (exactly one GROUP row, the seeded emibonnie; the API never creates or deletes it), page order,
-- header fields and the portrait. t_media gets the stored pixel size (set by resized uploads; old rows stay NULL).
-- t_profile_block gets the CHIPS block type: drop and recreate the check constraint.

ALTER TABLE t_profile ADD (
  kind              VARCHAR2(10 CHAR) DEFAULT 'MEMBER' NOT NULL,
  sort_order        ${int}            DEFAULT 0 NOT NULL,
  tagline           VARCHAR2(300 CHAR),
  full_name         VARCHAR2(200 CHAR),
  portrait_media_id ${bigint}
);
ALTER TABLE t_profile ADD CONSTRAINT t_profile_kind_ck CHECK (kind IN ('GROUP', 'MEMBER'));
ALTER TABLE t_profile ADD CONSTRAINT t_profile_portrait_fk FOREIGN KEY (portrait_media_id) REFERENCES t_media (id);
CREATE INDEX t_profile_portrait_ix ON t_profile (portrait_media_id);

UPDATE t_profile SET kind = 'GROUP', sort_order = 0 WHERE slug = 'emibonnie';
UPDATE t_profile SET sort_order = 1 WHERE slug = 'emi';
UPDATE t_profile SET sort_order = 2 WHERE slug = 'bonnie';

ALTER TABLE t_media ADD (width ${int}, height ${int});

ALTER TABLE t_profile_block DROP CONSTRAINT t_profile_block_type_ck;
ALTER TABLE t_profile_block ADD CONSTRAINT t_profile_block_type_ck
  CHECK (block_type IN ('TEXT', 'IMAGE', 'GALLERY', 'EMBED', 'LINKS', 'FACTS', 'CHIPS'));
