package com.subtitlestudio.novel;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Map;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

/** V31 adds the three Wattpad link columns; the part id of an original chapter is unique, many NULLs are fine. */
class V31MigrationTest {

    private static void chapter(JdbcTemplate jdbc, int id, String partId) {
        jdbc.update("insert into t_chapter (id, novel_id, chapter_no, title, translation_status, publish_status, sort_order, created_at, updated_at, original_wattpad_part_id) "
                + "values (?, 1, ?, 'T', 'NONE', 'DRAFT', 1, current_timestamp, current_timestamp, ?)", id, id, partId);
    }

    @Test
    void addsTheColumnsAndKeepsThePartIdUnique() {
        DriverManagerDataSource ds = new DriverManagerDataSource(
                "jdbc:h2:mem:v31-migration;MODE=Oracle;DB_CLOSE_DELAY=-1", "sa", "");
        Flyway.configure().dataSource(ds).locations("classpath:db/migration")
                .placeholders(Map.of("bigint", "BIGINT", "int", "INTEGER")).load().migrate();
        JdbcTemplate jdbc = new JdbcTemplate(ds);
        jdbc.update("insert into t_novel (id, slug, title, novel_status, source_type, created_at, updated_at) "
                + "values (1, 'n', 'N', 'ONGOING', 'ORIGINAL', current_timestamp, current_timestamp)");

        chapter(jdbc, 1, null);
        chapter(jdbc, 2, null);
        chapter(jdbc, 3, "123");
        assertThatThrownBy(() -> chapter(jdbc, 4, "123")).isInstanceOf(Exception.class);
        jdbc.update("update t_chapter set wattpad_synced_hash = ?, wattpad_modified_at = current_timestamp where id = 3",
                "a".repeat(64));
        assertThat(jdbc.queryForObject("select wattpad_synced_hash from t_chapter where id = 3", String.class))
                .hasSize(64);
    }
}
