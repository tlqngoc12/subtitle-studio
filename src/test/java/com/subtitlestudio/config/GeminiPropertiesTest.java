package com.subtitlestudio.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import java.util.List;
import org.junit.jupiter.api.Test;

class GeminiPropertiesTest {

    private static SubtitleStudioProperties.Gemini gemini(Duration cooldown) {
        return new SubtitleStudioProperties.Gemini("k", "m", Duration.ofMinutes(3), Duration.ofMinutes(60),
                Duration.ofMinutes(45), 0.3, List.of(), null, cooldown);
    }

    @Test
    void overloadCooldownDefaultsToTenMinutes() {
        assertThat(gemini(null).overloadCooldown()).isEqualTo(Duration.ofMinutes(10));
    }

    @Test
    void overloadCooldownAcceptsZeroAndOneHour() {
        assertThat(gemini(Duration.ZERO).overloadCooldown()).isEqualTo(Duration.ZERO);
        assertThat(gemini(Duration.ofHours(1)).overloadCooldown()).isEqualTo(Duration.ofHours(1));
    }

    @Test
    void overloadCooldownOutsideZeroToOneHourFails() {
        assertThatThrownBy(() -> gemini(Duration.ofSeconds(-1))).isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("overload-cooldown");
        assertThatThrownBy(() -> gemini(Duration.ofMinutes(61))).isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("overload-cooldown");
    }

    @Test
    void conveniencePropertiesHaveNoCooldown() {
        var g = new SubtitleStudioProperties.Gemini("k", "m", Duration.ofMinutes(3), Duration.ofMinutes(60), 0.3,
                List.of());
        assertThat(g.overloadCooldown()).isEqualTo(Duration.ZERO);
    }
}
