package com.subtitlestudio.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.file.Path;
import java.util.Arrays;
import java.util.List;
import org.junit.jupiter.api.Test;

class AllowedHostsPropertiesTest {

    private static SubtitleStudioProperties with(List<String> hosts) {
        return new SubtitleStudioProperties(null, Path.of("data"), null, null, null, null, hosts);
    }

    @Test
    void entries_are_trimmed_lowercased_and_blanks_dropped() {
        assertThat(with(Arrays.asList(" Admin.Tailnet.ts.net ", "", "  ", "B.ts.net")).allowedHosts())
                .containsExactly("admin.tailnet.ts.net", "b.ts.net");
    }

    @Test
    void missing_setting_is_empty() {
        assertThat(with(null).allowedHosts()).isEmpty();
    }

    @Test
    void invalid_entries_fail_fast() {
        for (String bad : List.of("*.ts.net", "a.ts.net/x", "a.ts.net:8443", "a b.ts.net", "https://a.ts.net")) {
            assertThatThrownBy(() -> with(List.of(bad)))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("subtitle-studio.allowed-hosts");
        }
    }
}
