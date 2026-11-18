package com.subtitlestudio.backup;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.subtitlestudio.oracle.OracleTestContainer;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.DriverManager;
import java.sql.SQLException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.oracle.OracleContainer;

/**
 * The Data Pump export on real Oracle. The container's directory is {@code /tmp} (it is not mounted on the host
 * here), so the dump size is read from inside the container; the bind mount itself is checked by the spike in
 * docker-compose.yml.
 */
@SpringBootTest(properties = {"SUBTITLESTUDIO_DB_USER=unused", "SUBTITLESTUDIO_DB_PASSWORD=unused"})
@ActiveProfiles("oracle")
@Import(OracleTestContainer.Config.class)
class DbExporterOracleIT {

    @DynamicPropertySource
    static void dataDir(DynamicPropertyRegistry registry) {
        try {
            Path dir = Files.createTempDirectory("subtitle-studio-exporter-it");
            registry.add("subtitle-studio.data-dir", dir::toString);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private OracleContainer oracle;

    private void asSystem(String... statements) throws SQLException {
        try (var connection = DriverManager.getConnection(oracle.getJdbcUrl(), "system", oracle.getPassword());
             var statement = connection.createStatement()) {
            for (String sql : statements) {
                statement.execute(sql);
            }
        }
    }

    private long dumpSizeInContainer(String name) {
        try {
            var result = oracle.execInContainer("stat", "-c", "%s", "/tmp/" + name + ".dmp");
            return Long.parseLong(result.getStdout().trim());
        } catch (IOException | InterruptedException | NumberFormatException e) {
            throw new IllegalStateException("no dump in the container", e);
        }
    }

    private DbExporter exporter() {
        return new DbExporter(jdbc, Path.of("unused"), this::dumpSizeInContainer);
    }

    @BeforeEach
    void directory() throws SQLException {
        asSystem("CREATE OR REPLACE DIRECTORY SS_BACKUP_DIR AS '/tmp'",
                "GRANT READ, WRITE ON DIRECTORY SS_BACKUP_DIR TO " + oracle.getUsername());
    }

    @Test
    void isSupportedOnOracle() {
        assertThat(exporter().supported()).isTrue();
    }

    @Test
    void exportsOwnSchemaIntoBackupDir() throws Exception {
        long size = exporter().export("ss-20261118-120000");

        assertThat(size).isGreaterThan(0);
        assertThat(oracle.execInContainer("ls", "/tmp/ss-20261118-120000.log").getExitCode()).isZero();
    }

    @Test
    void aMissingDirectoryFailsWithOraCodesOnly() throws Exception {
        asSystem("DROP DIRECTORY SS_BACKUP_DIR");

        assertThatThrownBy(() -> exporter().export("ss-20261118-130000"))
                .isInstanceOf(DbExporter.DbExportException.class)
                .hasMessageStartingWith("Database export failed (ORA-")
                .hasMessageNotContaining("SS_BACKUP_DIR");
    }
}
