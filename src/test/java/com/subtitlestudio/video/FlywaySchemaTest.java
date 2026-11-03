package com.subtitlestudio.video;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.context.ActiveProfiles;

/** The schema comes from Flyway's Oracle SQL (H2 in MODE=Oracle), not from Hibernate. */
@SpringBootTest
@ActiveProfiles("test")
class FlywaySchemaTest {

    @Autowired
    private JdbcTemplate jdbc;

    @Test
    void appliesV1Migration() {
        assertThat(jdbc.queryForObject(
                "select count(*) from \"flyway_schema_history\" where \"version\" = '1' and \"success\" = true",
                Integer.class)).isEqualTo(1);
    }

    @Test
    void appliesV2Migration() {
        assertThat(jdbc.queryForObject(
                "select count(*) from \"flyway_schema_history\" where \"version\" = '2' and \"success\" = true",
                Integer.class)).isEqualTo(1);
    }

    @Test
    void v2BackfillMarksExistingVietsubManual() {
        DriverManagerDataSource ds = new DriverManagerDataSource(
                "jdbc:h2:mem:v2-backfill;MODE=Oracle;DB_CLOSE_DELAY=-1", "sa", "");
        Map<String, String> types = Map.of("bigint", "BIGINT", "int", "INTEGER");
        Flyway.configure().dataSource(ds).placeholders(types).target("1").load().migrate();
        JdbcTemplate db = new JdbcTemplate(ds);
        String insert = "insert into video (id, title, sub_lang, sub_source, cue_count, fetched_at, vi_cue_count)"
                + " values (?, 't', 'en', 'MANUAL', 1, current_timestamp, ?)";
        db.update(insert, "WITHVIETSUB", 3);
        db.update(insert, "NOVIETSUB01", 0);

        Flyway.configure().dataSource(ds).placeholders(types).target("2").load().migrate();

        assertThat(db.queryForObject("select vi_source from video where id = 'WITHVIETSUB'", String.class))
                .isEqualTo("MANUAL");
        assertThat(db.queryForObject("select vi_source from video where id = 'NOVIETSUB01'", String.class))
                .isNull();
    }

    @ParameterizedTest
    @ValueSource(strings = {"CUE_SEQ", "VI_CUE_SEQ"})
    void sequencesIncrementBy50(String name) {
        assertThat(jdbc.queryForObject(
                "select increment from information_schema.sequences where sequence_name = ?", Long.class, name))
                .isEqualTo(50L);
    }
}
