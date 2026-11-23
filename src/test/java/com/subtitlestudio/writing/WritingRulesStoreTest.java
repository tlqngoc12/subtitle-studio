package com.subtitlestudio.writing;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class WritingRulesStoreTest {

    @TempDir
    Path dir;

    @Test
    void readIsEmptyWhenFileMissing() {
        assertThat(new WritingRulesStore(dir).read()).isEmpty();
    }

    @Test
    void writeThenRead() throws IOException {
        WritingRulesStore store = new WritingRulesStore(dir.resolve("prompts"));
        String text = "## Cụm cấm\n- \"cúi đầu\"\n";
        store.write(text);
        assertThat(store.read()).contains(text);
        assertThat(Files.readString(dir.resolve("prompts/writing-rules.md"), StandardCharsets.UTF_8)).isEqualTo(text);
    }

    @Test
    void readSeesOutsideEdit() throws IOException {
        WritingRulesStore store = new WritingRulesStore(dir);
        store.write("old");
        Files.writeString(dir.resolve("writing-rules.md"), "x");
        assertThat(store.read()).contains("x");
    }

    @Test
    void writeLeavesNoTempFile() throws IOException {
        new WritingRulesStore(dir).write("abc");
        try (Stream<Path> files = Files.list(dir)) {
            assertThat(files.map(p -> p.getFileName().toString())).containsExactly("writing-rules.md");
        }
    }
}
