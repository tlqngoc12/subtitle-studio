package com.subtitlestudio.translate;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.subtitlestudio.config.SubtitleStudioProperties;
import com.subtitlestudio.video.VideoRemovalEvent;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.List;
import java.util.Optional;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * The finished parts of a long video that is still being translated, kept in
 * {@code {dataDir}/translate-partial/<videoId>.json} so that "Translate again" continues from the first missing part.
 * Holds subtitle text, so it is never logged.
 */
@Component
public class PartialTranslationStore {

    /** One translated line: the English cue's {@code idx} and its Vietnamese text. */
    public record PartLine(int idx, String text) {}

    /** A finished part, numbered from 0, and the Gemini model(s) that translated it. */
    public record Part(int index, List<PartLine> lines, String model) {}

    /** All finished parts for one profile; {@code cueCount} is the number of English cues they were cut from. */
    public record Partial(String profile, int cueCount, List<Part> parts) {}

    private static final Pattern VIDEO_ID = Pattern.compile("[A-Za-z0-9_-]{1,32}");
    private static final Logger log = LoggerFactory.getLogger(PartialTranslationStore.class);

    private final Path dir;
    private final ObjectMapper mapper;

    @Autowired
    public PartialTranslationStore(SubtitleStudioProperties properties, ObjectMapper mapper) {
        this.dir = properties.dataDir().resolve("translate-partial");
        this.mapper = mapper;
    }

    /** Empty when there is no file, or it cannot be read (then it is as if there were none). */
    public Optional<Partial> load(String videoId) {
        Path file = file(videoId);
        if (!Files.isRegularFile(file)) {
            return Optional.empty();
        }
        try {
            Partial partial = mapper.readValue(Files.readAllBytes(file), Partial.class);
            return partial.parts() == null ? Optional.empty() : Optional.of(partial);
        } catch (IOException | RuntimeException e) {
            log.warn("Could not read the partial translation of {}: {}", videoId, e.getClass().getSimpleName());
            return Optional.empty();
        }
    }

    /** Writes a temporary file, then moves it into place, so a crash never leaves half a file. */
    public void save(String videoId, Partial partial) {
        Path file = file(videoId);
        try {
            Files.createDirectories(dir);
            Path tmp = Files.createTempFile(dir, videoId, ".tmp");
            Files.write(tmp, mapper.writeValueAsString(partial).getBytes(StandardCharsets.UTF_8));
            try {
                Files.move(tmp, file, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
            } catch (AtomicMoveNotSupportedException e) {
                Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING);
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    public void delete(String videoId) {
        try {
            Files.deleteIfExists(file(videoId));
        } catch (IOException e) {
            log.warn("Could not delete the partial translation of {}: {}", videoId, e.getClass().getSimpleName());
        }
    }

    /** A removed video or cleared Vietsub leaves no partial translation behind. */
    @EventListener
    public void on(VideoRemovalEvent event) {
        delete(event.videoId());
    }

    private Path file(String videoId) {
        if (!VIDEO_ID.matcher(videoId).matches()) {
            throw new IllegalArgumentException("Invalid video id");
        }
        return dir.resolve(videoId + ".json");
    }
}
