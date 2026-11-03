package com.subtitlestudio.video;

import com.subtitlestudio.config.SubtitleStudioProperties;
import java.io.IOException;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * Keeps a copy of every subtitle as a file next to the downloaded .vtt: {@code <id>.en.srt},
 * {@code <id>.vi_auto.srt} (Gemini) and {@code <id>.vi_manual.srt} (the user's upload, byte for byte).
 * The database stays the source of truth, so file errors are logged and never thrown.
 */
@Component
public class SubtitleFileStore {

    private static final Logger log = LoggerFactory.getLogger(SubtitleFileStore.class);

    private final Path subsDir;

    @Autowired
    public SubtitleFileStore(SubtitleStudioProperties properties) {
        this(properties.subsDir());
    }

    SubtitleFileStore(Path subsDir) {
        this.subsDir = subsDir;
    }

    public void writeEnglish(String id, byte[] srt) {
        write(path(id, "en"), srt);
    }

    public void writeViAuto(String id, byte[] srt) {
        write(path(id, "vi_auto"), srt);
    }

    public void writeViManual(String id, byte[] raw) {
        write(path(id, "vi_manual"), raw);
    }

    /** Deletes the file of one Vietsub source; the other source's file is kept. */
    public void deleteVi(String id, ViSource source) {
        delete(path(id, source == ViSource.AUTO ? "vi_auto" : "vi_manual"));
    }

    /** Deletes every .srt and .vtt of the video. */
    public void deleteAll(String id) {
        if (!Files.isDirectory(subsDir)) {
            return;
        }
        try (DirectoryStream<Path> files = Files.newDirectoryStream(subsDir, id + ".*")) {
            for (Path file : files) {
                String name = file.getFileName().toString();
                if (name.endsWith(".srt") || name.endsWith(".vtt")) {
                    delete(file);
                }
            }
        } catch (IOException e) {
            log.warn("Could not list subtitle files of {}: {}", id, e.getMessage());
        }
    }

    public boolean hasEnglish(String id) {
        return Files.exists(path(id, "en"));
    }

    public boolean hasViManual(String id) {
        return Files.exists(path(id, "vi_manual"));
    }

    /** {@code suffix} is {@code en}, {@code vi_auto} or {@code vi_manual}. */
    public Path path(String id, String suffix) {
        return subsDir.resolve(id + "." + suffix + ".srt");
    }

    private void write(Path file, byte[] content) {
        try {
            Files.createDirectories(file.getParent());
            Files.write(file, content);
        } catch (IOException e) {
            log.warn("Could not write {}: {}", file.getFileName(), e.getMessage());
        }
    }

    private void delete(Path file) {
        try {
            Files.deleteIfExists(file);
        } catch (IOException e) {
            log.warn("Could not delete {}: {}", file.getFileName(), e.getMessage());
        }
    }
}
