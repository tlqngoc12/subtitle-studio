package com.subtitlestudio.novel;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

/** V22 adds t_novel.featured: existing novels start picked, new ones start unpicked. */
class V22MigrationTest {

    private static Flyway flyway(DriverManagerDataSource ds, String target) {
        return Flyway.configure().dataSource(ds).locations("classpath:db/migration")
                .placeholders(Map.of("bigint", "BIGINT", "int", "INTEGER")).target(target).load();
    }

    private static void novel(JdbcTemplate jdbc, int id, String slug) {
        jdbc.update("insert into t_novel (id, slug, title, novel_status, notebook_status, created_at, updated_at) "
                + "values (?, ?, ?, 'ONGOING', 'IDLE', current_timestamp, current_timestamp)", id, slug, slug);
    }

    @Test
    void existingNovelsArePickedAndNewOnesAreNot() {
        DriverManagerDataSource ds = new DriverManagerDataSource(
                "jdbc:h2:mem:v22-migration;MODE=Oracle;DB_CLOSE_DELAY=-1", "sa", "");
        flyway(ds, "21").migrate();
        JdbcTemplate jdbc = new JdbcTemplate(ds);
        novel(jdbc, 1, "old-one");
        novel(jdbc, 2, "old-two");

        flyway(ds, "22").migrate();
        novel(jdbc, 3, "new-one");

        assertThat(featured(jdbc, 1)).isEqualTo("Y");
        assertThat(featured(jdbc, 2)).isEqualTo("Y");
        assertThat(featured(jdbc, 3)).isEqualTo("N");
    }

    private static String featured(JdbcTemplate jdbc, int id) {
        return jdbc.queryForObject("select featured from t_novel where id = ?", String.class, id);
    }
}
