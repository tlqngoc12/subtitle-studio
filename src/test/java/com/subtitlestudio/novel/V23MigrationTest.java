package com.subtitlestudio.novel;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

/** V23 adds t_novel.notebook_paused: every novel, old or new, starts not paused. */
class V23MigrationTest {

    private static Flyway flyway(DriverManagerDataSource ds, String target) {
        return Flyway.configure().dataSource(ds).locations("classpath:db/migration")
                .placeholders(Map.of("bigint", "BIGINT", "int", "INTEGER")).target(target).load();
    }

    private static void novel(JdbcTemplate jdbc, int id, String slug) {
        jdbc.update("insert into t_novel (id, slug, title, novel_status, notebook_status, created_at, updated_at) "
                + "values (?, ?, ?, 'ONGOING', 'IDLE', current_timestamp, current_timestamp)", id, slug, slug);
    }

    @Test
    void existingAndNewNovelsAreNotPaused() {
        DriverManagerDataSource ds = new DriverManagerDataSource(
                "jdbc:h2:mem:v23-migration;MODE=Oracle;DB_CLOSE_DELAY=-1", "sa", "");
        flyway(ds, "22").migrate();
        JdbcTemplate jdbc = new JdbcTemplate(ds);
        novel(jdbc, 1, "old-one");

        flyway(ds, "23").migrate();
        novel(jdbc, 2, "new-one");

        assertThat(paused(jdbc, 1)).isEqualTo("N");
        assertThat(paused(jdbc, 2)).isEqualTo("N");
    }

    private static String paused(JdbcTemplate jdbc, int id) {
        return jdbc.queryForObject("select notebook_paused from t_novel where id = ?", String.class, id);
    }
}
