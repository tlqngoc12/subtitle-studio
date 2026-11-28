-- Original stories: which Wattpad part a chapter was synced from, and enough to tell later whether the text was edited
-- in the app or changed on Wattpad (spec docs/superpowers/specs/2026-11-28-original-wattpad-bulk-sync-design.md).
-- original_wattpad_part_id is separate from wattpad_part_id (V20), which makes a translated novel's chapter show
-- Fetch & translate / Reload original. It is unique on its own: Oracle accepts many NULLs in a single-column unique key.
-- wattpad_synced_hash is the SHA-256 (hex) of text_vi right after the last sync; wattpad_modified_at is the part's
-- modifyDate on Wattpad in the synced version. Never edit this file once it has run on a real database.

ALTER TABLE t_chapter ADD (
  original_wattpad_part_id  VARCHAR2(20 CHAR),
  wattpad_synced_hash       CHAR(64),
  wattpad_modified_at       TIMESTAMP(6) WITH TIME ZONE
);
ALTER TABLE t_chapter ADD CONSTRAINT t_chapter_orig_wattpad_part_uk UNIQUE (original_wattpad_part_id);
