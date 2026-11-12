package com.subtitlestudio.test;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.stream.Stream;

/** Finds an uploaded image on disk by storage key, wherever MediaFiler has put it; a missing file gives a path that does not exist. */
public final class MediaTestFiles {

    private MediaTestFiles() {
    }

    public static Path fileOf(Path dataDir, String storageKey) {
        Path root = dataDir.resolve("media");
        if (Files.isDirectory(root)) {
            String short8 = storageKey.substring(0, 8);
            try (Stream<Path> walk = Files.walk(root)) {
                return walk.filter(Files::isRegularFile)
                        .filter(p -> p.getFileName().toString().startsWith(storageKey + ".")
                                || p.getFileName().toString().contains("_" + short8 + "."))
                        .findFirst().orElse(root.resolve("missing-" + storageKey));
            } catch (IOException e) {
                throw new UncheckedIOException(e);
            }
        }
        return root.resolve("missing-" + storageKey);
    }
}
