package com.subtitlestudio.video;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
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

    @ParameterizedTest
    @ValueSource(strings = {"CUE_SEQ", "VI_CUE_SEQ"})
    void sequencesIncrementBy50(String name) {
        assertThat(jdbc.queryForObject(
                "select increment from information_schema.sequences where sequence_name = ?", Long.class, name))
                .isEqualTo(50L);
    }
}
