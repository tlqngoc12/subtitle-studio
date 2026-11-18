-- Runs at every start of the oracle container (gvenzl image: /container-entrypoint-startdb.d), as SYSTEM, so it also
-- reaches a database that already exists (init scripts only run when the database is created).
-- The app exports its own schema with DBMS_DATAPUMP into this directory, which docker-compose.yml bind-mounts to
-- ./data/backups on the host. Idempotent.
ALTER SESSION SET CONTAINER = FREEPDB1;
CREATE OR REPLACE DIRECTORY SS_BACKUP_DIR AS '/opt/oracle/backups';
GRANT READ, WRITE ON DIRECTORY SS_BACKUP_DIR TO SUBTITLE_STUDIO;
