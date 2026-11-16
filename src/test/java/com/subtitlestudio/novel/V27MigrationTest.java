package com.subtitlestudio.novel;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

/** V27 clears the failed status and error of chapters that are already published. */
class V27MigrationTest {

    private static Flyway flyway(DriverManagerDataSource ds, String target) {
        return Flyway.configure().dataSource(ds).locations("classpath:db/migration")
                .placeholders(Map.of("bigint", "BIGINT", "int", "INTEGER")).target(target).load();
    }

    private static void chapter(JdbcTemplate jdbc, int id, String translation, String publish) {
        jdbc.update("insert into t_chapter (id, novel_id, chapter_no, sort_order, translation_status, "
                + "translation_error, edited_after_translation, publish_status, created_at, updated_at) "
                + "values (?, 1, ?, ?, ?, 'Gemini failed', 'N', ?, current_timestamp, current_timestamp)",
                id, id, id, translation, publish);
    }

    @Test
    void publishedFailedChaptersBecomeTranslatedAndDraftsKeepTheirError() {
        DriverManagerDataSource ds = new DriverManagerDataSource(
                "jdbc:h2:mem:v27-migration;MODE=Oracle;DB_CLOSE_DELAY=-1", "sa", "");
        flyway(ds, "26").migrate();
        JdbcTemplate jdbc = new JdbcTemplate(ds);
        jdbc.update("insert into t_novel (id, slug, title, novel_status, created_at, updated_at) "
                + "values (1, 'n', 'N', 'ONGOING', current_timestamp, current_timestamp)");
        chapter(jdbc, 1, "FAILED", "PUBLISHED");
        chapter(jdbc, 2, "FAILED", "DRAFT");

        flyway(ds, "27").migrate();

        assertThat(status(jdbc, 1)).isEqualTo("TRANSLATED");
        assertThat(error(jdbc, 1)).isNull();
        assertThat(status(jdbc, 2)).isEqualTo("FAILED");
        assertThat(error(jdbc, 2)).isEqualTo("Gemini failed");
    }

    private static String status(JdbcTemplate jdbc, int id) {
        return jdbc.queryForObject("select translation_status from t_chapter where id = ?", String.class, id);
    }

    private static String error(JdbcTemplate jdbc, int id) {
        return jdbc.queryForObject("select translation_error from t_chapter where id = ?", String.class, id);
    }
}
