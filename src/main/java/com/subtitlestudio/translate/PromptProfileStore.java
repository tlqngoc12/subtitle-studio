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
import java.util.function.UnaryOperator;
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
    /** Files in this folder that are not translation profiles (the global writing rules). */
    private static final java.util.Set<String> RESERVED = java.util.Set.of("writing-rules");
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
        if (name == null || !NAME.matcher(name).matches() || name.startsWith("_") || reserved(name)) {
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

    /**
     * Renames a profile: writes {@code edit(text)} to {@code <to>.md}, moves the matching {@code .history/<from>-<stamp>.md}
     * files to {@code <to>-<stamp>.md} and removes {@code <from>.md}. With {@code from == to} the file is rewritten in
     * place. The rename is not a history entry.
     *
     * @throws UnknownProfileException when {@code from} is missing
     * @throws ProfileExistsException when {@code to} is another existing file
     */
    public synchronized void rename(String from, String to, UnaryOperator<String> edit) {
        String text = read(from);
        if (to == null || !NAME.matcher(to).matches() || to.startsWith("_") || reserved(to)) {
            throw new InvalidProfileTextException("Invalid profile name");
        }
        String edited = edit.apply(text);
        if (edited == null || edited.isBlank()) {
            throw new InvalidProfileTextException("The profile text is empty");
        }
        byte[] bytes = encode(edited);
        if (bytes.length > MAX_BYTES) {
            throw new InvalidProfileTextException("The profile text is larger than " + MAX_BYTES / 1024 + " KB");
        }
        Path source = dir.resolve(from + ".md");
        Path target = dir.resolve(to + ".md");
        boolean sameName = from.equals(to);
        boolean caseOnly = !sameName && from.equalsIgnoreCase(to);
        try {
            if (!sameName && Files.exists(target) && !(caseOnly && Files.isSameFile(source, target))) {
                throw new ProfileExistsException(to);
            }
            Path temp = Files.createTempFile(dir, "." + to + "-", ".tmp");
            try {
                Files.write(temp, bytes);
                if (sameName) {
                    try {
                        Files.move(temp, source, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
                    } catch (AtomicMoveNotSupportedException e) {
                        Files.move(temp, source, StandardCopyOption.REPLACE_EXISTING);
                    }
                    return;
                }
                if (caseOnly) {
                    // Keep the old file until the new one is in place, so a failed move loses nothing.
                    Path aside = Files.createTempFile(dir, "." + from + "-", ".bak");
                    Files.move(source, aside, StandardCopyOption.REPLACE_EXISTING);
                    try {
                        Files.move(temp, target);
                    } catch (IOException | RuntimeException e) {
                        Files.move(aside, source, StandardCopyOption.REPLACE_EXISTING);
                        throw e;
                    }
                    Files.delete(aside);
                } else {
                    Files.move(temp, target);
                    Files.delete(source);
                }
            } catch (FileAlreadyExistsException e) {
                throw new ProfileExistsException(to);
            } finally {
                Files.deleteIfExists(temp);
            }
            moveHistory(from, to, caseOnly);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private void moveHistory(String from, String to, boolean caseOnly) throws IOException {
        Path history = dir.resolve(".history");
        if (!Files.isDirectory(history)) {
            return;
        }
        Pattern pattern = Pattern.compile(Pattern.quote(from) + "(-\\d{8}-\\d{6}(?:-\\d+)?\\.md)");
        List<Path> matches = new ArrayList<>();
        try (DirectoryStream<Path> files = Files.newDirectoryStream(history, "*.md")) {
            for (Path file : files) {
                if (pattern.matcher(file.getFileName().toString()).matches()) {
                    matches.add(file);
                }
            }
        }
        for (Path file : matches) {
            String rest = file.getFileName().toString().substring(from.length());
            Path moved = history.resolve(to + rest);
            if (caseOnly) {
                Path temp = Files.move(file, history.resolve(file.getFileName() + ".tmp"));
                Files.move(temp, moved);
            } else if (Files.exists(moved)) {
                Files.move(file, backupPath(history, to));
            } else {
                Files.move(file, moved);
            }
        }
    }

    /** True when a usable-named profile file is present. */
    public boolean exists(String name) {
        return name != null && NAME.matcher(name).matches() && !name.startsWith("_") && !reserved(name)
                && Files.isRegularFile(dir.resolve(name + ".md"));
    }

    /** Deletes the profile file if it is there; ignores invalid names. */
    public synchronized void delete(String name) {
        if (name == null || !NAME.matcher(name).matches() || name.startsWith("_") || reserved(name)) {
            return;
        }
        try {
            Files.deleteIfExists(dir.resolve(name + ".md"));
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static boolean reserved(String name) {
        return RESERVED.stream().anyMatch(name::equalsIgnoreCase);
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
        if (name == null || !NAME.matcher(name).matches() || name.startsWith("_") || reserved(name)) {
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
