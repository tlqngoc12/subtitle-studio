package com.subtitlestudio.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.file.Path;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** Not transactional: {@code save} publishes its snapshot after commit, which a rolled-back test would never reach. */
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@ActiveProfiles("test")
@Transactional(propagation = Propagation.NOT_SUPPORTED)
@Import({GeminiSettings.class, GeminiSettingsTest.Config.class})
class GeminiSettingsTest {

    static final SubtitleStudioProperties.Gemini DEFAULTS = new SubtitleStudioProperties.Gemini("secret-key", "main",
            Duration.ofMinutes(3), Duration.ofMinutes(180), Duration.ofMinutes(45), 0.3, List.of("f1", "f2"), "low",
            Duration.ofMinutes(10));

    @TestConfiguration
    static class Config {
        @Bean
        SubtitleStudioProperties properties() {
            return new SubtitleStudioProperties(
                    new SubtitleStudioProperties.Ytdlp("yt-dlp", Duration.ofSeconds(60)), Path.of("data"), DEFAULTS,
                    new SubtitleStudioProperties.Publish("", "", "", false, "wrangler", Duration.ofMinutes(5)));
        }

        @Bean
        Clock clock() {
            return Clock.systemUTC();
        }
    }

    @Autowired
    private GeminiSettings settings;

    @Autowired
    private AppSettingRepository repository;

    @BeforeEach
    @AfterEach
    void clean() {
        repository.deleteAll();
        settings.reload();
    }

    @Test
    void noOverridesGivesDefaults() {
        assertThat(settings.current()).isEqualTo(DEFAULTS);
        assertThat(settings.overridden()).isEmpty();
        assertThat(settings.defaults()).isEqualTo(DEFAULTS);
    }

    @Test
    void overrideMergesOverDefaults() {
        settings.save(new GeminiSettings.Form("other", List.of("x"), null, null, null, null));

        var current = settings.current();
        assertThat(current.model()).isEqualTo("other");
        assertThat(current.fallbackModels()).containsExactly("x");
        assertThat(current.temperature()).isEqualTo(0.3);
        assertThat(current.timeout()).isEqualTo(Duration.ofMinutes(3));
        assertThat(settings.overridden()).containsExactlyInAnyOrder(GeminiSettings.MODEL, GeminiSettings.FALLBACKS);
    }

    @Test
    void overrideSurvivesReload() {
        settings.save(new GeminiSettings.Form("other", List.of(), "high", 1.0, Duration.ofSeconds(90),
                Duration.ofMinutes(5)));
        settings.reload();

        var current = settings.current();
        assertThat(current.model()).isEqualTo("other");
        assertThat(current.fallbackModels()).isEmpty();
        assertThat(current.thinkingLevel()).isEqualTo("high");
        assertThat(current.temperature()).isEqualTo(1.0);
        assertThat(current.timeout()).isEqualTo(Duration.ofSeconds(90));
        assertThat(current.overloadCooldown()).isEqualTo(Duration.ofMinutes(5));
    }

    @Test
    void valueEqualToDefaultDeletesRow() {
        settings.save(new GeminiSettings.Form("other", null, null, null, null, null));
        assertThat(repository.count()).isEqualTo(1);

        settings.save(new GeminiSettings.Form("main", null, null, null, null, null));

        assertThat(repository.count()).isZero();
        assertThat(settings.current().model()).isEqualTo("main");
    }

    @Test
    void blankDeletesRow() {
        settings.save(new GeminiSettings.Form("other", null, "high", null, null, null));

        settings.save(new GeminiSettings.Form("  ", null, "", null, null, null));

        assertThat(repository.count()).isZero();
        assertThat(settings.current()).isEqualTo(DEFAULTS);
    }

    @Test
    void rejectsFallbackContainingMainModel() {
        assertThatThrownBy(() -> settings.save(new GeminiSettings.Form("a", List.of("b", "a"), null, null, null, null)))
                .isInstanceOfSatisfying(GeminiSettings.InvalidSettingException.class,
                        e -> assertThat(e.field()).isEqualTo("fallbackModels"));
    }

    @Test
    void rejectsFallbackContainingDefaultMainModelWhenMainNotOverridden() {
        assertThatThrownBy(() -> settings.save(new GeminiSettings.Form(null, List.of("main"), null, null, null, null)))
                .isInstanceOfSatisfying(GeminiSettings.InvalidSettingException.class,
                        e -> assertThat(e.field()).isEqualTo("fallbackModels"));
    }

    @Test
    void rejectsDuplicateFallbacks() {
        assertThatThrownBy(() -> settings.save(new GeminiSettings.Form(null, List.of("b", "b"), null, null, null, null)))
                .isInstanceOfSatisfying(GeminiSettings.InvalidSettingException.class,
                        e -> assertThat(e.field()).isEqualTo("fallbackModels"));
    }

    @Test
    void rejectsMoreThanFiveFallbacks() {
        assertThatThrownBy(() -> settings.save(
                new GeminiSettings.Form(null, List.of("a", "b", "c", "d", "e", "f"), null, null, null, null)))
                .isInstanceOfSatisfying(GeminiSettings.InvalidSettingException.class,
                        e -> assertThat(e.field()).isEqualTo("fallbackModels"));
    }

    @Test
    void rejectsTemperatureOutside0to2() {
        assertThatThrownBy(() -> settings.save(new GeminiSettings.Form(null, null, null, 2.1, null, null)))
                .isInstanceOfSatisfying(GeminiSettings.InvalidSettingException.class,
                        e -> assertThat(e.field()).isEqualTo("temperature"));
        assertThatThrownBy(() -> settings.save(new GeminiSettings.Form(null, null, null, -0.1, null, null)))
                .isInstanceOf(GeminiSettings.InvalidSettingException.class);
    }

    @Test
    void rejectsTimeoutOutside10sTo10m() {
        assertThatThrownBy(() -> settings.save(
                new GeminiSettings.Form(null, null, null, null, Duration.ofSeconds(9), null)))
                .isInstanceOfSatisfying(GeminiSettings.InvalidSettingException.class,
                        e -> assertThat(e.field()).isEqualTo("timeoutSeconds"));
        assertThatThrownBy(() -> settings.save(
                new GeminiSettings.Form(null, null, null, null, Duration.ofSeconds(601), null)))
                .isInstanceOf(GeminiSettings.InvalidSettingException.class);
    }

    @Test
    void rejectsCooldownOver60m() {
        assertThatThrownBy(() -> settings.save(
                new GeminiSettings.Form(null, null, null, null, null, Duration.ofMinutes(61))))
                .isInstanceOfSatisfying(GeminiSettings.InvalidSettingException.class,
                        e -> assertThat(e.field()).isEqualTo("overloadCooldownMinutes"));
    }

    @Test
    void rejectsUnknownThinkingLevel() {
        assertThatThrownBy(() -> settings.save(new GeminiSettings.Form(null, null, "extreme", null, null, null)))
                .isInstanceOfSatisfying(GeminiSettings.InvalidSettingException.class,
                        e -> assertThat(e.field()).isEqualTo("thinkingLevel"));
    }

    @Test
    void failedSaveChangesNothing() {
        settings.save(new GeminiSettings.Form("other", null, null, null, null, null));

        assertThatThrownBy(() -> settings.save(new GeminiSettings.Form("third", null, null, 5.0, null, null)))
                .isInstanceOf(GeminiSettings.InvalidSettingException.class);

        assertThat(settings.current().model()).isEqualTo("other");
        assertThat(repository.findByKeyStartingWith("gemini.")).extracting(AppSetting::getKey)
                .containsExactly(GeminiSettings.MODEL);
    }

    @Test
    void apiKeyAlwaysFromYml() {
        settings.save(new GeminiSettings.Form("other", null, null, null, null, null));
        repository.saveAndFlush(new AppSetting("gemini.api-key", "evil", Instant.now()));
        settings.reload();

        assertThat(settings.current().apiKey()).isEqualTo("secret-key");
    }

    @Test
    void fixedAlwaysReturnsTheSameSnapshot() {
        var fixed = GeminiSettings.fixed(DEFAULTS);
        assertThat(fixed.current()).isSameAs(DEFAULTS);
        assertThat(fixed.defaults()).isSameAs(DEFAULTS);
        assertThat(fixed.overridden()).isEmpty();
    }
}
