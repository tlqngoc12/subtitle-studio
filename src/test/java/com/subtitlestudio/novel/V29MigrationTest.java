package com.subtitlestudio.novel;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Map;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

/** V29 lets a novel have source_type ORIGINAL and keeps the other values and the check. */
class V29MigrationTest {

    private static Flyway flyway(DriverManagerDataSource ds, String target) {
        return Flyway.configure().dataSource(ds).locations("classpath:db/migration")
                .placeholders(Map.of("bigint", "BIGINT", "int", "INTEGER")).target(target).load();
    }

    private static void novel(JdbcTemplate jdbc, int id, String type) {
        jdbc.update("insert into t_novel (id, slug, title, novel_status, source_type, created_at, updated_at) "
                + "values (?, ?, 'N', 'ONGOING', ?, current_timestamp, current_timestamp)", id, "n" + id, type);
    }

    @Test
    void originalIsAcceptedAfterV29AndUnknownTypesStillAreNot() {
        DriverManagerDataSource ds = new DriverManagerDataSource(
                "jdbc:h2:mem:v29-migration;MODE=Oracle;DB_CLOSE_DELAY=-1", "sa", "");
        flyway(ds, "28").migrate();
        JdbcTemplate jdbc = new JdbcTemplate(ds);
        novel(jdbc, 1, "WATTPAD");
        assertThatThrownBy(() -> novel(jdbc, 2, "ORIGINAL")).isInstanceOf(Exception.class);

        flyway(ds, "29").migrate();

        novel(jdbc, 3, "ORIGINAL");
        assertThatThrownBy(() -> novel(jdbc, 4, "BOGUS")).isInstanceOf(Exception.class);
        assertThat(jdbc.queryForObject("select source_type from t_novel where id = 1", String.class))
                .isEqualTo("WATTPAD");
        assertThat(jdbc.queryForObject("select source_type from t_novel where id = 3", String.class))
                .isEqualTo("ORIGINAL");
    }
}
