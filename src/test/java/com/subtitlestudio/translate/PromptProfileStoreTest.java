package com.subtitlestudio.translate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class PromptProfileStoreTest {

    @TempDir
    private Path root;

    private Path dir() throws IOException {
        return Files.createDirectories(root.resolve("prompts"));
    }

    private PromptProfileStore store() {
        return new PromptProfileStore(root.resolve("prompts"));
    }

    @Test
    void listsValidProfilesSortedCaseInsensitive() throws IOException {
        Files.writeString(dir().resolve("b.md"), "b");
        Files.writeString(dir().resolve("A.md"), "a");
        Files.writeString(dir().resolve("Emi-Bonnie_2.md"), "x");

        assertThat(store().list()).containsExactly("A", "b", "Emi-Bonnie_2");
    }

    @Test
    void skipsUnderscoreInvalidNamesAndNonMarkdown() throws IOException {
        Files.writeString(dir().resolve("_example.md"), "x");
        Files.writeString(dir().resolve("bad name.md"), "x");
        Files.writeString(dir().resolve("x.txt"), "x");
        Files.writeString(dir().resolve("a".repeat(41) + ".md"), "x");
        Files.createDirectories(dir().resolve("folder.md"));

        assertThat(store().list()).isEmpty();
    }

    @Test
    void missingDirectoryListsNothing() {
        assertThat(store().list()).isEmpty();
    }

    @Test
    void readReturnsUtf8Content() throws IOException {
        String content = "## Xưng hô\nEmi gọi Bonnie là \"em\". ตลาดน้อย → Talad Noi";
        Files.writeString(dir().resolve("EmiBonnie.md"), content, StandardCharsets.UTF_8);

        assertThat(store().read("EmiBonnie")).isEqualTo(content);
    }

    @ParameterizedTest
    @ValueSource(strings = {"../x", "nope", "_example", "a b", ""})
    void readRejectsTraversalAndUnknown(String name) throws IOException {
        Files.writeString(dir().resolve("_example.md"), "x");
        Files.writeString(root.resolve("x.md"), "outside");

        assertThatThrownBy(() -> store().read(name)).isInstanceOf(UnknownProfileException.class);
    }

    @Test
    void readRejectsOversizedOrNonUtf8File() throws IOException {
        Files.write(dir().resolve("Big.md"), new byte[PromptProfileStore.MAX_BYTES + 1]);
        Files.write(dir().resolve("Latin1.md"), new byte[] {(byte) 0xC3, 0x28});

        assertThatThrownBy(() -> store().read("Big")).isInstanceOf(UnknownProfileException.class);
        assertThatThrownBy(() -> store().read("Latin1")).isInstanceOf(UnknownProfileException.class);
    }

    @Test
    void listHidesOversizedOrNonUtf8File() throws IOException {
        Files.write(dir().resolve("Big.md"), new byte[PromptProfileStore.MAX_BYTES + 1]);
        Files.write(dir().resolve("Latin1.md"), new byte[] {(byte) 0xC3, 0x28});
        Files.writeString(dir().resolve("Ok.md"), "ok");

        assertThat(store().list()).containsExactly("Ok");
    }

    @Test
    void installsExampleOnlyWhenDirectoryMissing() throws IOException {
        store().installExampleIfMissing();

        assertThat(Files.readString(root.resolve("prompts/_example.md"))).contains("## Xưng hô");

        Files.delete(root.resolve("prompts/_example.md"));
        store().installExampleIfMissing();

        assertThat(root.resolve("prompts/_example.md")).doesNotExist();
    }
}
