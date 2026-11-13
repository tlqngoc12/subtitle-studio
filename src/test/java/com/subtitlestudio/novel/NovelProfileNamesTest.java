package com.subtitlestudio.novel;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Set;
import org.junit.jupiter.api.Test;

class NovelProfileNamesTest {

    private static String name(String title) {
        return NovelProfileNames.fromTitle(title, "123", n -> false);
    }

    @Test
    void dropsTheSuffixAfterAPipe() {
        assertThat(name("My Grumpy Vampire | EmiBonnie")).isEqualTo("MyGrumpyVampire");
    }

    @Test
    void dropsParenthesesAndPunctuation() {
        assertThat(name("Be My Sugar! (GL)")).isEqualTo("BeMySugar");
    }

    @Test
    void removesAccentsAndDashSuffix() {
        assertThat(name("Tình đầu - EmiBonnie")).isEqualTo("TinhDau");
    }

    @Test
    void usesTheWholeTitleWhenTheFirstPartHasNoLatin() {
        assertThat(name("เงาใต้พระจันทร์ | Moonshadow")).isEqualTo("Moonshadow");
    }

    @Test
    void fallsBackToTheStoryIdWhenNoLatinAtAll() {
        assertThat(NovelProfileNames.fromTitle("เงาใต้พระจันทร์", "123", n -> false)).isEqualTo("Wattpad123");
    }

    @Test
    void cutsToFortyCharacters() {
        String title = "abcdefghij".repeat(6);
        assertThat(name(title)).hasSize(40);
    }

    @Test
    void appendsANumberWhenTaken() {
        assertThat(NovelProfileNames.fromTitle("My Grumpy Vampire | X", "1", Set.of("MyGrumpyVampire")::contains))
                .isEqualTo("MyGrumpyVampire-2");
        assertThat(NovelProfileNames.fromTitle("My Grumpy Vampire | X", "1",
                Set.of("MyGrumpyVampire", "MyGrumpyVampire-2")::contains)).isEqualTo("MyGrumpyVampire-3");
    }

    @Test
    void keepsTheSuffixedNameWithinFortyCharacters() {
        String base = "A" + "b".repeat(39);
        String taken = base.substring(0, 40);
        String result = NovelProfileNames.fromTitle(base + "z", "1", Set.of(taken)::contains);
        assertThat(result).isEqualTo(taken.substring(0, 38) + "-2");
    }
}
