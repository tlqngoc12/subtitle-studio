-- Edit status of a hand-edited Vietsub: NULL = not edited yet, IN_PROGRESS = being edited, DONE = finished.
-- Only DONE videos go on the public site. Never edit this file once it has run on a real database; add V12__... instead.

ALTER TABLE video ADD (
  edit_status VARCHAR2(12 CHAR),
  CONSTRAINT ck_video_edit_status CHECK (edit_status IN ('IN_PROGRESS', 'DONE'))
);

-- Every uploaded (MANUAL) Vietsub that exists today was already published, so it counts as done.
UPDATE video SET edit_status = 'DONE' WHERE vi_source = 'MANUAL';
