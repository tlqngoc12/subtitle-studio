package com.subtitlestudio.novel;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

/** V20 adds the Wattpad columns; existing novels become SCREENSHOTS / th and existing chapters have no source text. */
class V20MigrationTest {

    private static Flyway flyway(DriverManagerDataSource ds, String target) {
        return Flyway.configure().dataSource(ds).locations("classpath:db/migration")
                .placeholders(Map.of("bigint", "BIGINT", "int", "INTEGER")).target(target).load();
    }

    @Test
    void existingRowsGetTheScreenshotDefaults() {
        DriverManagerDataSource ds = new DriverManagerDataSource(
                "jdbc:h2:mem:v20-migration;MODE=Oracle;DB_CLOSE_DELAY=-1", "sa", "");
        flyway(ds, "19").migrate();
        JdbcTemplate jdbc = new JdbcTemplate(ds);
        jdbc.update("insert into t_novel (id, slug, title, novel_status, notebook_status, created_at, updated_at) "
                + "values (1, 'old', 'Old', 'ONGOING', 'IDLE', current_timestamp, current_timestamp)");
        jdbc.update("insert into t_chapter (id, novel_id, chapter_no, sort_order, translation_status, "
                + "edited_after_translation, publish_status, created_at, updated_at) "
                + "values (1, 1, 1, 1, 'NONE', 'N', 'DRAFT', current_timestamp, current_timestamp)");

        flyway(ds, "20").migrate();

        assertThat(jdbc.queryForObject("select source_type from t_novel where id = 1", String.class))
                .isEqualTo("SCREENSHOTS");
        assertThat(jdbc.queryForObject("select source_language from t_novel where id = 1", String.class))
                .isEqualTo("th");
        assertThat(jdbc.queryForObject("select wattpad_story_id from t_novel where id = 1", String.class)).isNull();
        assertThat(jdbc.queryForObject("select source_text from t_chapter where id = 1", String.class)).isNull();
        List<String> columns = jdbc.queryForList(
                "select column_name from information_schema.columns where table_name = 'T_CHAPTER'", String.class);
        assertThat(columns).contains("SOURCE_TEXT", "WATTPAD_PART_ID", "SOURCE_FETCHED_AT");
    }
}
