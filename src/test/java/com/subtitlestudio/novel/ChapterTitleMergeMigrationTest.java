package com.subtitlestudio.novel;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

/** V30 merges the chapter label into the title in reading order and drops the label column. */
class ChapterTitleMergeMigrationTest {

    private static Flyway flyway(DriverManagerDataSource ds, String target) {
        var cfg = Flyway.configure().dataSource(ds).locations("classpath:db/migration")
                .placeholders(Map.of("bigint", "BIGINT", "int", "INTEGER"));
        if (target != null) {
            cfg.target(target);
        }
        return cfg.load();
    }

    private static void chapter(JdbcTemplate jdbc, int id, int novel, int no, int order, String label, String title) {
        jdbc.update("insert into t_chapter (id, novel_id, chapter_no, sort_order, label, title, translation_status, "
                + "edited_after_translation, publish_status, created_at, updated_at) "
                + "values (?, ?, ?, ?, ?, ?, 'TRANSLATED', 'N', 'DRAFT', current_timestamp, current_timestamp)",
                id, novel, no, order, label, title);
    }

    @Test
    void migratesTitlesAndDropsLabel() {
        DriverManagerDataSource ds = new DriverManagerDataSource(
                "jdbc:h2:mem:v30;MODE=Oracle;DB_CLOSE_DELAY=-1", "sa", "");
        flyway(ds, "29").migrate();
        JdbcTemplate jdbc = new JdbcTemplate(ds);
        jdbc.update("insert into t_novel (id, slug, title, novel_status, created_at, updated_at) "
                + "values (1, 'a', 'A', 'ONGOING', current_timestamp, current_timestamp)");
        jdbc.update("insert into t_novel (id, slug, title, novel_status, created_at, updated_at) "
                + "values (2, 'b', 'B', 'ONGOING', current_timestamp, current_timestamp)");
        // reading order differs from chapter_no on purpose: sort_order decides
        chapter(jdbc, 10, 1, 5, 4, "Chương 4", "14 năm trước");
        chapter(jdbc, 11, 1, 1, 1, "Nhân vật", null);
        chapter(jdbc, 12, 1, 2, 2, null, "Người đứng sau cô");
        chapter(jdbc, 13, 1, 3, 3, null, "B");
        chapter(jdbc, 20, 2, 1, 1, null, null);

        flyway(ds, null).migrate();

        assertThat(title(jdbc, 11)).isEqualTo("Nhân vật");
        assertThat(title(jdbc, 12)).isEqualTo("Chương 1: Người đứng sau cô");
        assertThat(title(jdbc, 13)).isEqualTo("Chương 2: B");
        assertThat(title(jdbc, 10)).isEqualTo("Chương 4: 14 năm trước");
        assertThat(title(jdbc, 20)).isEqualTo("Chương 1");
        assertThat(jdbc.queryForObject("select count(*) from information_schema.columns "
                + "where table_name = 'T_CHAPTER' and column_name = 'LABEL'", Integer.class)).isZero();
    }

    private static String title(JdbcTemplate jdbc, int id) {
        return jdbc.queryForObject("select title from t_chapter where id = ?", String.class, id);
    }
}
