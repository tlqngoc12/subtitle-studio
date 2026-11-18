package com.subtitlestudio.backup;

import com.subtitlestudio.config.SubtitleStudioProperties;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.CallableStatement;
import java.sql.SQLException;
import java.sql.Types;
import java.util.Locale;
import java.util.TreeSet;
import java.util.function.ToLongFunction;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Exports the app's own schema with {@code DBMS_DATAPUMP} over JDBC into the Oracle directory {@code SS_BACKUP_DIR},
 * which docker-compose.yml bind-mounts to {@code ./data/backups}. The files are named like the ones
 * {@code scripts/backup-db.ps1} makes ({@code ss-yyyyMMdd-HHmmss.dmp/.log}), so {@code scripts/restore-db.ps1}
 * restores them. Only works on Oracle: H2 has no Data Pump.
 */
@Component
public class DbExporter {

    /** The Oracle directory object created by {@code docker/oracle-startdb/10-backup-dir.sql}. */
    static final String DIRECTORY = "SS_BACKUP_DIR";

    private static final Logger log = LoggerFactory.getLogger(DbExporter.class);
    private static final Pattern ORA_CODE = Pattern.compile("ORA-\\d{5}");

    /** One anonymous block: export the connected user's schema as of now and wait for the job to end. */
    private static final String EXPORT_BLOCK = """
            DECLARE
              h NUMBER;
              st VARCHAR2(30);
              owner VARCHAR2(128) := SYS_CONTEXT('USERENV', 'CURRENT_USER');
            BEGIN
              h := DBMS_DATAPUMP.OPEN('EXPORT', 'SCHEMA', NULL, ?);
              DBMS_DATAPUMP.ADD_FILE(h, ?, '%1$s', NULL, DBMS_DATAPUMP.KU$_FILE_TYPE_DUMP_FILE, 1);
              DBMS_DATAPUMP.ADD_FILE(h, ?, '%1$s', NULL, DBMS_DATAPUMP.KU$_FILE_TYPE_LOG_FILE, 1);
              DBMS_DATAPUMP.METADATA_FILTER(h, 'SCHEMA_EXPR', 'IN (''' || owner || ''')');
              DBMS_DATAPUMP.SET_PARAMETER(h, 'FLASHBACK_TIME', 'SYSTIMESTAMP');
              DBMS_DATAPUMP.START_JOB(h);
              DBMS_DATAPUMP.WAIT_FOR_JOB(h, st);
              ? := st;
            END;
            """.formatted(DIRECTORY);

    /** A failed export; the message names the ORA- codes only, never SQL text or data. */
    public static class DbExportException extends RuntimeException {

        public DbExportException(String message) {
            super(message);
        }
    }

    private final JdbcTemplate jdbc;
    private final Path backupsDir;
    private final ToLongFunction<String> dumpSize;

    @Autowired
    public DbExporter(JdbcTemplate jdbc, SubtitleStudioProperties properties) {
        this.jdbc = jdbc;
        this.backupsDir = properties.dataDir().resolve("backups");
        this.dumpSize = name -> {
            try {
                return Files.size(backupsDir.resolve(name + ".dmp"));
            } catch (IOException e) {
                throw new DbExportException("The dump file was not found in data/backups.");
            }
        };
    }

    /** {@code dumpSize} reads the size of {@code name.dmp}; tests whose Oracle is not mounted on the host replace it. */
    DbExporter(JdbcTemplate jdbc, Path backupsDir, ToLongFunction<String> dumpSize) {
        this.jdbc = jdbc;
        this.backupsDir = backupsDir;
        this.dumpSize = dumpSize;
    }

    /** True only when the app talks to Oracle. */
    public boolean supported() {
        try {
            String url = jdbc.execute((java.sql.Connection c) -> c.getMetaData().getURL());
            return url != null && url.toLowerCase(Locale.ROOT).startsWith("jdbc:oracle:");
        } catch (RuntimeException e) {
            return false;
        }
    }

    /**
     * Exports into {@code name.dmp} and {@code name.log} and returns the dump size in bytes. Throws
     * {@link DbExportException} when the job does not end COMPLETED; partial files are deleted first.
     */
    public long export(String name) {
        String job = "SS_BACKUP_" + name.replaceAll("[^A-Za-z0-9]", "_").toUpperCase(Locale.ROOT);
        String state;
        try {
            state = jdbc.execute(EXPORT_BLOCK, (CallableStatement cs) -> {
                cs.setString(1, job.length() > 120 ? job.substring(0, 120) : job);
                cs.setString(2, name + ".dmp");
                cs.setString(3, name + ".log");
                cs.registerOutParameter(4, Types.VARCHAR);
                cs.execute();
                return cs.getString(4);
            });
        } catch (RuntimeException e) {
            deletePartial(name);
            throw new DbExportException("Database export failed (" + oraCodes(e) + ").");
        }
        if (!"COMPLETED".equals(state)) {
            deletePartial(name);
            throw new DbExportException("Database export ended in state " + state + ".");
        }
        try {
            long size = dumpSize.applyAsLong(name);
            if (size <= 0) {
                deletePartial(name);
                throw new DbExportException("The database dump is empty.");
            }
            return size;
        } catch (DbExportException e) {
            deletePartial(name);
            throw e;
        }
    }

    private void deletePartial(String name) {
        for (String ext : new String[] {".dmp", ".log"}) {
            try {
                Files.deleteIfExists(backupsDir.resolve(name + ext));
            } catch (IOException e) {
                log.warn("Could not delete the partial backup file {}{}", name, ext);
            }
        }
    }

    /** The distinct ORA- codes found anywhere in the exception chain, e.g. "ORA-39001, ORA-39000". */
    private static String oraCodes(Throwable error) {
        TreeSet<String> codes = new TreeSet<>();
        for (Throwable t = error; t != null; t = t.getCause()) {
            String message = t.getMessage();
            if (message != null) {
                Matcher m = ORA_CODE.matcher(message);
                while (m.find()) {
                    codes.add(m.group());
                }
            }
            if (t instanceof SQLException sql && sql.getErrorCode() > 0) {
                codes.add(String.format(Locale.ROOT, "ORA-%05d", sql.getErrorCode()));
            }
        }
        return codes.isEmpty() ? "no ORA code" : String.join(", ", codes);
    }
}
