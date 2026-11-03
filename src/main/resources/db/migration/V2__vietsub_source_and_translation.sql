-- Phase 4: where the current Vietsub came from, and the state of the Gemini translation.
-- vi_source: MANUAL = uploaded by the user, AUTO = translated by Gemini (AUTO never replaces MANUAL).
-- translation_status: NULL when idle, TRANSLATING while running, FAILED with translation_error.

ALTER TABLE video ADD (
  vi_source           VARCHAR2(10 CHAR),
  translation_status  VARCHAR2(12 CHAR),
  translation_error   VARCHAR2(500 CHAR),
  translation_profile VARCHAR2(40 CHAR),
  CONSTRAINT ck_video_vi_source CHECK (vi_source IN ('MANUAL', 'AUTO')),
  CONSTRAINT ck_video_translation_status CHECK (translation_status IN ('TRANSLATING', 'FAILED'))
);

-- Every Vietsub stored before Phase 4 was uploaded by hand.
UPDATE video SET vi_source = 'MANUAL' WHERE vi_cue_count > 0;
