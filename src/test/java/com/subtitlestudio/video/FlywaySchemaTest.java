package com.subtitlestudio.video;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
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

    @Test
    void appliesV2Migration() {
        assertThat(jdbc.queryForObject(
                "select count(*) from \"flyway_schema_history\" where \"version\" = '2' and \"success\" = true",
                Integer.class)).isEqualTo(1);
    }

    @Test
    void seedsThreeProfiles() {
        assertThat(jdbc.queryForList("select slug from t_profile order by id", String.class))
                .containsExactly("emibonnie", "emi", "bonnie");
        assertThat(jdbc.queryForList("select display_name from t_profile order by id", String.class))
                .containsExactly("EmiBonnie", "Emi", "Bonnie");
    }

    @Test
    void rejectsUnknownBlockType() {
        assertThatThrownBy(() -> jdbc.update(
                "insert into t_profile_block (id, profile_id, position, block_type, created_at, updated_at) "
                        + "select 999999, min(id), 1, 'VIDEO', current_timestamp, current_timestamp from t_profile"))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @ParameterizedTest
    @ValueSource(strings = {"CUE_SEQ", "VI_CUE_SEQ", "T_PROFILE_SEQ", "T_MEDIA_SEQ", "T_PROFILE_BLOCK_SEQ",
            "T_PROFILE_BLOCK_ITEM_SEQ"})
    void sequencesIncrementBy50(String name) {
        assertThat(jdbc.queryForObject(
                "select increment from information_schema.sequences where sequence_name = ?", Long.class, name))
                .isEqualTo(50L);
    }
}
