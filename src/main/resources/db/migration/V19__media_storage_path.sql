-- Uploaded images are filed into folders per feature (spec docs/superpowers/specs/2026-11-12-media-folders-design.md).
-- storage_path is the file's path relative to {data-dir}/media, e.g. photos/2026-11-12_emi_3f9a2c1b.webp.
-- NULL means the legacy flat file {storage_key}.{ext}. Same conventions as V1-V18. Never edit this file once it has run
-- on a real database.

ALTER TABLE t_media ADD storage_path VARCHAR2(400 CHAR);
