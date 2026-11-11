package com.subtitlestudio.photo;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.Map;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

/** V17 renames instagram_url to post_url without losing rows or the unique constraint. */
class V17MigrationTest {

    private static Flyway flyway(DriverManagerDataSource ds, String target) {
        return Flyway.configure().dataSource(ds).locations("classpath:db/migration")
                .placeholders(Map.of("bigint", "BIGINT", "int", "INTEGER")).target(target).load();
    }

    @Test
    void renamesTheColumnKeepingRowsAndUniqueness() {
        DriverManagerDataSource ds = new DriverManagerDataSource("jdbc:h2:mem:v17-migration;MODE=Oracle;DB_CLOSE_DELAY=-1",
                "sa", "");
        flyway(ds, "16").migrate();
        JdbcTemplate jdbc = new JdbcTemplate(ds);
        jdbc.update("insert into t_media (id, storage_key, content_type, size_bytes, original_name, created_at) "
                + "values (1, 'k1', 'image/webp', 1, 'a.webp', current_timestamp)");
        jdbc.update("insert into t_photo_post (id, instagram_url, media_id, title, taken_on, source, "
                + "created_at, updated_at) values (1, 'https://www.instagram.com/p/AAA/', 1, 'T', DATE '2026-11-01', "
                + "'FAN', current_timestamp, current_timestamp)");

        flyway(ds, "17").migrate();

        assertThat(jdbc.queryForObject("select post_url from t_photo_post where id = 1", String.class))
                .isEqualTo("https://www.instagram.com/p/AAA/");
        List<String> columns = jdbc.queryForList(
                "select column_name from information_schema.columns where table_name = 'T_PHOTO_POST'", String.class);
        assertThat(columns).contains("POST_URL").doesNotContain("INSTAGRAM_URL");
        assertThatThrownBy(() -> jdbc.update("insert into t_photo_post (id, post_url, media_id, title, taken_on, source, "
                + "created_at, updated_at) values (2, 'https://www.instagram.com/p/AAA/', 1, 'T', DATE '2026-11-01', "
                + "'FAN', current_timestamp, current_timestamp)")).isInstanceOf(Exception.class);
    }
}
