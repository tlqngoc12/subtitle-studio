package com.subtitlestudio.work;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

/** V16 on data written by V15: every work keeps its one category, the photo end date is gone. */
class V16MigrationTest {

    private static Flyway flyway(DriverManagerDataSource ds, String target) {
        return Flyway.configure().dataSource(ds).locations("classpath:db/migration")
                .placeholders(Map.of("bigint", "BIGINT", "int", "INTEGER")).target(target).load();
    }

    @Test
    void existingWorksKeepTheirCategoryAndPhotosLoseTheEndDate() {
        DriverManagerDataSource ds = new DriverManagerDataSource("jdbc:h2:mem:v16-migration;MODE=Oracle;DB_CLOSE_DELAY=-1",
                "sa", "");
        flyway(ds, "15").migrate();
        JdbcTemplate jdbc = new JdbcTemplate(ds);
        jdbc.update("insert into t_work (id, title, category, created_at, updated_at) values (1, 'Love Story', 'FILM_TV', "
                + "current_timestamp, current_timestamp)");
        jdbc.update("insert into t_work (id, title, category, created_at, updated_at) values (2, 'Song', 'MUSIC', "
                + "current_timestamp, current_timestamp)");
        jdbc.update("insert into t_media (id, storage_key, content_type, size_bytes, original_name, created_at) "
                + "values (1, 'k1', 'image/webp', 1, 'a.webp', current_timestamp)");
        jdbc.update("insert into t_photo_post (id, instagram_url, media_id, title, taken_on, taken_until, source, "
                + "created_at, updated_at) values (1, 'https://www.instagram.com/p/AAA/', 1, 'T', DATE '2026-11-01', "
                + "DATE '2026-11-03', 'FAN', current_timestamp, current_timestamp)");

        flyway(ds, "16").migrate();

        List<String> film = jdbc.queryForList("select category from t_work_category where work_id = 1", String.class);
        List<String> music = jdbc.queryForList("select category from t_work_category where work_id = 2", String.class);
        assertThat(film).containsExactly("FILM_TV");
        assertThat(music).containsExactly("MUSIC");
        assertThat(jdbc.queryForObject("select position from t_work_category where work_id = 1", Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForList("select column_name from information_schema.columns where table_name = 'T_WORK'",
                String.class)).doesNotContain("CATEGORY");
        assertThat(jdbc.queryForList("select column_name from information_schema.columns where table_name = 'T_PHOTO_POST'",
                String.class)).doesNotContain("TAKEN_UNTIL");
        assertThat(jdbc.queryForObject("select count(*) from t_photo_post", Integer.class)).isEqualTo(1);
    }
}
