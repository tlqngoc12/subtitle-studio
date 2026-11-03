package com.subtitlestudio.translate;

import com.subtitlestudio.config.SubtitleStudioProperties;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * Translation profiles: one Markdown file per series in {@code {dataDir}/prompts/<Name>.md}, sent to
 * Gemini as written. Names are restricted so a profile name can never reach outside that folder.
 */
@Component
public class PromptProfileStore {

    static final int MAX_BYTES = 20 * 1024;
    private static final Pattern NAME = Pattern.compile("[A-Za-z0-9_-]{1,40}");
    private static final String EXAMPLE = "prompts/_example.md";
    private static final Logger log = LoggerFactory.getLogger(PromptProfileStore.class);

    private final Path dir;

    @Autowired
    public PromptProfileStore(SubtitleStudioProperties properties) {
        this(properties.promptsDir());
    }

    PromptProfileStore(Path dir) {
        this.dir = dir;
    }

    /** Usable profile names, sorted case-insensitively. */
    public List<String> list() {
        List<String> names = new ArrayList<>();
        if (!Files.isDirectory(dir)) {
            return names;
        }
        try (DirectoryStream<Path> files = Files.newDirectoryStream(dir, "*.md")) {
            for (Path file : files) {
                String name = file.getFileName().toString();
                name = name.substring(0, name.length() - ".md".length());
                if (load(name).isPresent()) {
                    names.add(name);
                }
            }
        } catch (IOException e) {
            log.warn("Could not list translation profiles: {}", e.getMessage());
        }
        names.sort(String.CASE_INSENSITIVE_ORDER);
        return names;
    }

    /** The profile text; throws {@link UnknownProfileException} when it is missing or unusable. */
    public String read(String name) {
        return load(name).orElseThrow(() -> new UnknownProfileException(name));
    }

    /** Copies the bundled {@code _example.md} the first time, when the prompts folder does not exist yet. */
    @EventListener(ApplicationReadyEvent.class)
    public void installExampleIfMissing() {
        if (Files.exists(dir)) {
            return;
        }
        try (InputStream in = getClass().getClassLoader().getResourceAsStream(EXAMPLE)) {
            if (in == null) {
                return;
            }
            Files.createDirectories(dir);
            Files.write(dir.resolve("_example.md"), in.readAllBytes());
        } catch (IOException e) {
            log.warn("Could not install the example translation profile: {}", e.getMessage());
        }
    }

    private Optional<String> load(String name) {
        if (name == null || !NAME.matcher(name).matches() || name.startsWith("_")) {
            return Optional.empty();
        }
        Path file = dir.resolve(name + ".md");
        try {
            if (!Files.isRegularFile(file) || Files.size(file) > MAX_BYTES) {
                return Optional.empty();
            }
            return Optional.of(StandardCharsets.UTF_8.newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT)
                    .decode(ByteBuffer.wrap(Files.readAllBytes(file)))
                    .toString());
        } catch (CharacterCodingException e) {
            return Optional.empty();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
