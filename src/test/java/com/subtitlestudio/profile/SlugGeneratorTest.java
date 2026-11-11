package com.subtitlestudio.profile;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Set;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

class SlugGeneratorTest {

    @ParameterizedTest
    @CsvSource({"Any,any", "Ánh Dương,anh-duong", "'  Mary  Jane!! ',mary-jane", "Đặng,dang"})
    void normalisesNames(String name, String slug) {
        assertThat(SlugGenerator.slugFor(name, s -> false)).isEqualTo(slug);
    }

    @Test
    void namesWithoutLatinLettersFallBackToMemberN() {
        assertThat(SlugGenerator.slugFor("เอนี่", s -> false)).isEqualTo("member-2");
        assertThat(SlugGenerator.slugFor("เอนี่", Set.of("member-2", "member-3")::contains)).isEqualTo("member-4");
    }

    @Test
    void reservedWordOrderFallsBack() {
        assertThat(SlugGenerator.slugFor("Order", s -> false)).isEqualTo("member-2");
    }

    @Test
    void collisionGetsNumericSuffix() {
        assertThat(SlugGenerator.slugFor("Emi", Set.of("emi")::contains)).isEqualTo("emi-2");
        assertThat(SlugGenerator.slugFor("Emi", Set.of("emi", "emi-2")::contains)).isEqualTo("emi-3");
    }

    @Test
    void neverLongerThan20Characters() {
        String name = "abcdefghijklmnopqrstuvwxyz0123";
        String slug = SlugGenerator.slugFor(name, s -> false);
        assertThat(slug).hasSize(20);
        String second = SlugGenerator.slugFor(name, Set.of(slug)::contains);
        assertThat(second).hasSizeLessThanOrEqualTo(20).endsWith("-2");
    }
}
