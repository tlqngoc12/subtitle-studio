package com.subtitlestudio.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.test.context.ActiveProfiles;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@ActiveProfiles("test")
class AppSettingRepositoryTest {

    @Autowired
    private AppSettingRepository settings;

    @Test
    void savesAndFindsByPrefix() {
        var now = Instant.parse("2026-11-18T10:00:00Z");
        settings.saveAndFlush(new AppSetting("gemini.model", "x", now));
        settings.saveAndFlush(new AppSetting("other.k", "y", now));

        assertThat(settings.findByKeyStartingWith("gemini.")).extracting(AppSetting::getKey)
                .containsExactly("gemini.model");
    }
}
