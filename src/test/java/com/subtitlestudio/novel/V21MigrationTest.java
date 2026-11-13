package com.subtitlestudio.novel;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

/** V21 clears labels that only repeat the chapter's own default name. */
class V21MigrationTest {

    private static Flyway flyway(DriverManagerDataSource ds, String target) {
        return Flyway.configure().dataSource(ds).locations("classpath:db/migration")
                .placeholders(Map.of("bigint", "BIGINT", "int", "INTEGER")).target(target).load();
    }

    private static void chapter(JdbcTemplate jdbc, int id, int no, String label) {
        jdbc.update("insert into t_chapter (id, novel_id, chapter_no, sort_order, translation_status, "
                + "edited_after_translation, publish_status, label, created_at, updated_at) "
                + "values (?, 1, ?, ?, 'NONE', 'N', 'DRAFT', ?, current_timestamp, current_timestamp)",
                id, no, no, label);
    }

    @Test
    void defaultNamesAreClearedAndOtherLabelsKept() {
        DriverManagerDataSource ds = new DriverManagerDataSource(
                "jdbc:h2:mem:v21-migration;MODE=Oracle;DB_CLOSE_DELAY=-1", "sa", "");
        flyway(ds, "20").migrate();
        JdbcTemplate jdbc = new JdbcTemplate(ds);
        jdbc.update("insert into t_novel (id, slug, title, novel_status, notebook_status, created_at, updated_at) "
                + "values (1, 'old', 'Old', 'ONGOING', 'IDLE', current_timestamp, current_timestamp)");
        chapter(jdbc, 1, 16, "Chapter 16");
        chapter(jdbc, 2, 17, "chương 17");
        chapter(jdbc, 3, 18, "Ngoại truyện 1");
        chapter(jdbc, 4, 19, "Chapter 3");
        chapter(jdbc, 5, 20, null);

        flyway(ds, "21").migrate();

        assertThat(label(jdbc, 1)).isNull();
        assertThat(label(jdbc, 2)).isNull();
        assertThat(label(jdbc, 3)).isEqualTo("Ngoại truyện 1");
        assertThat(label(jdbc, 4)).isEqualTo("Chapter 3");
        assertThat(label(jdbc, 5)).isNull();
    }

    private static String label(JdbcTemplate jdbc, int id) {
        return jdbc.queryForObject("select label from t_chapter where id = ?", String.class, id);
    }
}
