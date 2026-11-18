-- Settings edited in the app (spec docs/superpowers/specs/2026-11-18-settings-gemini-backups-design.md): a key-value
-- table of overrides on top of application.yml. A missing row means "use the yml value".
-- Never edit this file once it has run on a real database; add V29__... instead.

CREATE TABLE t_app_setting (
  setting_key    VARCHAR2(100 CHAR)           NOT NULL,
  setting_value  VARCHAR2(4000 CHAR)          NOT NULL,
  updated_at     TIMESTAMP(6) WITH TIME ZONE  NOT NULL,
  CONSTRAINT t_app_setting_pk PRIMARY KEY (setting_key)
);
