-- Original stories (spec docs/superpowers/specs/2026-11-18-original-stories-design.md): a novel can now have source_type
-- ORIGINAL (the user's own writing, no translation). Only the check constraint changes; source_language stays 'vi' for them.
-- Never edit this file once it has run on a real database.

ALTER TABLE t_novel DROP CONSTRAINT t_novel_source_type_ck;
ALTER TABLE t_novel ADD CONSTRAINT t_novel_source_type_ck CHECK (source_type IN ('SCREENSHOTS', 'WATTPAD', 'ORIGINAL'));
