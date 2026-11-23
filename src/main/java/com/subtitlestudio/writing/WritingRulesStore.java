package com.subtitlestudio.writing;

import com.subtitlestudio.config.SubtitleStudioProperties;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * The global writing rules: one hand-editable Markdown file, {@code {promptsDir}/writing-rules.md}. Read from disk on
 * every call, so an edit made outside the app is seen at once.
 */
@Component
public class WritingRulesStore {

    public static final String FILE_NAME = "writing-rules.md";

    private final Path dir;

    @Autowired
    public WritingRulesStore(SubtitleStudioProperties properties) {
        this(properties.promptsDir());
    }

    WritingRulesStore(Path dir) {
        this.dir = dir;
    }

    /** The file text, or empty when the file does not exist yet. */
    public Optional<String> read() {
        Path file = dir.resolve(FILE_NAME);
        try {
            if (!Files.isRegularFile(file)) {
                return Optional.empty();
            }
            return Optional.of(Files.readString(file, StandardCharsets.UTF_8));
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    /** Replaces the file: temporary file in the same folder, then one move. No history copy. */
    public synchronized void write(String text) {
        try {
            Files.createDirectories(dir);
            Path temp = Files.createTempFile(dir, ".writing-rules-", ".tmp");
            try {
                Files.writeString(temp, text, StandardCharsets.UTF_8);
                try {
                    Files.move(temp, dir.resolve(FILE_NAME), StandardCopyOption.ATOMIC_MOVE,
                            StandardCopyOption.REPLACE_EXISTING);
                } catch (AtomicMoveNotSupportedException e) {
                    Files.move(temp, dir.resolve(FILE_NAME), StandardCopyOption.REPLACE_EXISTING);
                }
            } finally {
                Files.deleteIfExists(temp);
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
