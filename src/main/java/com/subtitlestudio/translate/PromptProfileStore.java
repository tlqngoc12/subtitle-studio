package com.subtitlestudio.translate;

import com.subtitlestudio.config.SubtitleStudioProperties;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CharsetEncoder;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.nio.file.DirectoryStream;
import java.nio.file.FileAlreadyExistsException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.AtomicMoveNotSupportedException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.HexFormat;
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
 * Translation profiles: one Markdown file per series in {@code {dataDir}/prompts/<Name>.md} (Vietsub), sent to
 * Gemini as written. Novels keep theirs in a subfolder ({@code NovelProfileStore}), which this store does not list. Names are restricted so a profile name can never reach outside that folder.
 */
@Component
public class PromptProfileStore {

    static final int MAX_BYTES = 20 * 1024;
    private static final Pattern NAME = Pattern.compile("[A-Za-z0-9_-]{1,40}");
    static final String EXAMPLE = "prompts/_example.md";
    private static final Logger log = LoggerFactory.getLogger(PromptProfileStore.class);

    private final Path dir;
    private final String example;

    @Autowired
    public PromptProfileStore(SubtitleStudioProperties properties) {
        this(properties.promptsDir());
    }

    PromptProfileStore(Path dir) {
        this(dir, EXAMPLE);
    }

    /** A store for another folder, installing the classpath resource {@code example} as its {@code _example.md}. */
    public PromptProfileStore(Path dir, String example) {
        this.dir = dir;
        this.example = example;
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

    /** SHA-256 (lower-case hex) of the profile text as stored; the editor sends it back to detect a changed file. */
    public String sha(String name) {
        return sha256(read(name));
    }

    static String sha256(String text) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(text.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    /**
     * Replaces an existing profile. Fails with {@link ProfileChangedException} when the file no longer has
     * {@code baseSha}. The old file is first copied to {@code .history/<name>-<yyyyMMdd-HHmmss>.md}, then the new text
     * is written to a temporary file in the same folder and moved over the profile in one step.
     *
     * @return the SHA-256 of the new text
     */
    public synchronized String write(String name, String text, String baseSha) {
        String current = read(name);
        if (text == null || text.isBlank()) {
            throw new InvalidProfileTextException("The profile text is empty");
        }
        byte[] bytes = encode(text);
        if (bytes.length > MAX_BYTES) {
            throw new InvalidProfileTextException("The profile text is larger than " + MAX_BYTES / 1024 + " KB");
        }
        if (!sha256(current).equals(baseSha)) {
            throw new ProfileChangedException("The profile changed on disk since it was opened");
        }
        Path file = dir.resolve(name + ".md");
        try {
            Path history = Files.createDirectories(dir.resolve(".history"));
            Files.copy(file, backupPath(history, name), StandardCopyOption.COPY_ATTRIBUTES);
            Path temp = Files.createTempFile(dir, "." + name + "-", ".tmp");
            try {
                Files.write(temp, bytes);
                try {
                    Files.move(temp, file, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
                } catch (AtomicMoveNotSupportedException e) {
                    Files.move(temp, file, StandardCopyOption.REPLACE_EXISTING);
                }
            } finally {
                Files.deleteIfExists(temp);
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        return sha256(text);
    }

    /**
     * Writes a new profile; never overwrites. The text goes to a temporary file in the same folder, which is then
     * moved to {@code <name>.md} without replacing, so a concurrent writer cannot be overwritten either.
     *
     * @throws ProfileExistsException when the file already exists
     */
    public synchronized void create(String name, String text) {
        if (name == null || !NAME.matcher(name).matches() || name.startsWith("_")) {
            throw new InvalidProfileTextException("Invalid profile name");
        }
        if (text == null || text.isBlank()) {
            throw new InvalidProfileTextException("The profile text is empty");
        }
        byte[] bytes = encode(text);
        if (bytes.length > MAX_BYTES) {
            throw new InvalidProfileTextException("The profile text is larger than " + MAX_BYTES / 1024 + " KB");
        }
        Path file = dir.resolve(name + ".md");
        if (Files.exists(file)) {
            throw new ProfileExistsException(name);
        }
        try {
            Files.createDirectories(dir);
            Path temp = Files.createTempFile(dir, "." + name + "-", ".tmp");
            try {
                Files.write(temp, bytes);
                Files.move(temp, file);
            } catch (FileAlreadyExistsException e) {
                throw new ProfileExistsException(name);
            } finally {
                Files.deleteIfExists(temp);
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    /** True when a usable-named profile file is present. */
    public boolean exists(String name) {
        return name != null && NAME.matcher(name).matches() && !name.startsWith("_")
                && Files.isRegularFile(dir.resolve(name + ".md"));
    }

    /** Deletes the profile file if it is there; ignores invalid names. */
    public synchronized void delete(String name) {
        if (name == null || !NAME.matcher(name).matches() || name.startsWith("_")) {
            return;
        }
        try {
            Files.deleteIfExists(dir.resolve(name + ".md"));
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static byte[] encode(String text) {
        CharsetEncoder encoder = StandardCharsets.UTF_8.newEncoder()
                .onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT);
        try {
            ByteBuffer buffer = encoder.encode(java.nio.CharBuffer.wrap(text));
            byte[] bytes = new byte[buffer.remaining()];
            buffer.get(bytes);
            return bytes;
        } catch (CharacterCodingException e) {
            throw new InvalidProfileTextException("The profile text is not valid UTF-8");
        }
    }

    private static Path backupPath(Path history, String name) {
        String stamp = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss"));
        Path path = history.resolve(name + "-" + stamp + ".md");
        for (int n = 2; Files.exists(path); n++) {
            path = history.resolve(name + "-" + stamp + "-" + n + ".md");
        }
        return path;
    }

    /** Copies the bundled {@code _example.md} the first time, when the prompts folder does not exist yet. */
    @EventListener(ApplicationReadyEvent.class)
    public void installExampleIfMissing() {
        if (Files.exists(dir)) {
            return;
        }
        try (InputStream in = getClass().getClassLoader().getResourceAsStream(example)) {
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
