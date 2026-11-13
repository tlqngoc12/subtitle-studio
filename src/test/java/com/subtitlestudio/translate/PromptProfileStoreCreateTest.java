package com.subtitlestudio.translate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class PromptProfileStoreCreateTest {

    @TempDir
    private Path root;

    private Path dir;
    private PromptProfileStore store;

    @BeforeEach
    void setUp() {
        dir = root.resolve("novels");
        store = new PromptProfileStore(dir);
    }

    @Test
    void createWritesTheTextAndMakesTheFolder() {
        store.create("MoonShadow", "Hồ sơ mới");

        assertThat(store.read("MoonShadow")).isEqualTo("Hồ sơ mới");
        assertThat(store.list()).containsExactly("MoonShadow");
        assertThat(dir.toFile().list((d, n) -> n.endsWith(".tmp"))).isEmpty();
    }

    @Test
    void createNeverOverwritesAnExistingProfile() throws IOException {
        Files.createDirectories(dir);
        Files.writeString(dir.resolve("MoonShadow.md"), "cũ", StandardCharsets.UTF_8);

        assertThatThrownBy(() -> store.create("MoonShadow", "mới")).isInstanceOf(ProfileExistsException.class);

        assertThat(store.read("MoonShadow")).isEqualTo("cũ");
    }

    @ParameterizedTest
    @ValueSource(strings = {"../x", "_hidden", "a b", "", "x/y"})
    void createRejectsBadNames(String name) {
        assertThatThrownBy(() -> store.create(name, "text")).isInstanceOf(RuntimeException.class);
        assertThat(store.list()).isEmpty();
    }

    @Test
    void createRejectsEmptyAndOversizedText() {
        assertThatThrownBy(() -> store.create("A", " ")).isInstanceOf(InvalidProfileTextException.class);
        assertThatThrownBy(() -> store.create("A", "x".repeat(20 * 1024 + 1)))
                .isInstanceOf(InvalidProfileTextException.class);
        assertThat(store.exists("A")).isFalse();
    }

    @Test
    void existsAndDelete() {
        assertThat(store.exists("A")).isFalse();
        store.create("A", "x");
        assertThat(store.exists("A")).isTrue();
        assertThat(store.exists("../A")).isFalse();

        store.delete("A");
        store.delete("A");

        assertThat(store.exists("A")).isFalse();
    }
}
