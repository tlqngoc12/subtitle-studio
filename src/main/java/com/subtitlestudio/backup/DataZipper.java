package com.subtitlestudio.backup;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.NoSuchFileException;
import java.nio.file.Path;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.StandardCopyOption;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;
import org.springframework.stereotype.Component;

/**
 * Zips the data folder for a backup and prunes old backups. The zip is written as {@code name.zip.part} and renamed
 * when complete, so a half-written file never looks like a backup. Files that vanish or change while zipping are
 * skipped or copied as read: a run never fails because of that.
 */
@Component
public class DataZipper {

    /** Folders directly under the data folder that are not backed up. */
    static final Set<String> EXCLUDED_DIRS = Set.of("backups", "logs", "translate-partial");
    /** H2 dev database files directly under the data folder. */
    static final Set<String> EXCLUDED_FILES = Set.of("dev.mv.db", "dev.trace.db");

    /** Writes {@code backupsDir/name.zip} from everything under {@code dataDir} that is not excluded. */
    public Path zip(Path dataDir, Path backupsDir, String name) throws IOException {
        Files.createDirectories(backupsDir);
        Path part = backupsDir.resolve(name + ".zip.part");
        Path target = backupsDir.resolve(name + ".zip");
        Path root = dataDir.toAbsolutePath().normalize();
        try {
            try (OutputStream out = Files.newOutputStream(part);
                 ZipOutputStream zip = new ZipOutputStream(out)) {
                Files.walkFileTree(root, new SimpleFileVisitor<>() {
                    @Override
                    public FileVisitResult preVisitDirectory(Path dir, BasicFileAttributes attrs) {
                        Path relative = root.relativize(dir);
                        if (relative.getNameCount() == 1 && EXCLUDED_DIRS.contains(relative.toString())) {
                            return FileVisitResult.SKIP_SUBTREE;
                        }
                        return FileVisitResult.CONTINUE;
                    }

                    @Override
                    public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) throws IOException {
                        Path relative = root.relativize(file);
                        if (!attrs.isRegularFile()
                                || (relative.getNameCount() == 1 && EXCLUDED_FILES.contains(relative.toString()))) {
                            return FileVisitResult.CONTINUE;
                        }
                        try (InputStream in = Files.newInputStream(file)) {
                            zip.putNextEntry(new ZipEntry(entryName(relative)));
                            in.transferTo(zip);
                            zip.closeEntry();
                        } catch (NoSuchFileException vanished) {
                            // Deleted while zipping: leave it out. The entry may have been opened, so close it.
                            try {
                                zip.closeEntry();
                            } catch (IOException ignored) {
                                // nothing was written for this entry
                            }
                        }
                        return FileVisitResult.CONTINUE;
                    }

                    @Override
                    public FileVisitResult visitFileFailed(Path file, IOException e) throws IOException {
                        if (e instanceof NoSuchFileException) {
                            return FileVisitResult.CONTINUE;
                        }
                        throw e;
                    }
                });
            }
            Files.move(part, target, StandardCopyOption.REPLACE_EXISTING);
            return target;
        } catch (IOException | RuntimeException e) {
            Files.deleteIfExists(part);
            throw e;
        }
    }

    private static String entryName(Path relative) {
        List<String> names = new ArrayList<>();
        relative.forEach(p -> names.add(p.toString()));
        return String.join("/", names);
    }

    /**
     * Keeps the newest {@code keep} files named {@code prefix + yyyyMMdd-HHmmss + ext} in {@code backupsDir} and
     * deletes the older ones; for {@code .dmp} the paired {@code .log} goes too. Nothing else is touched:
     * {@code backup.log}, {@code .part} files and anything a person put there stay.
     */
    public static void prune(Path backupsDir, String prefix, String ext, int keep) throws IOException {
        if (!Files.isDirectory(backupsDir)) {
            return;
        }
        Pattern own = Pattern.compile(Pattern.quote(prefix) + "\\d{8}-\\d{6}" + Pattern.quote(ext));
        List<Path> mine;
        try (Stream<Path> files = Files.list(backupsDir)) {
            mine = files.filter(Files::isRegularFile)
                    .filter(p -> own.matcher(p.getFileName().toString()).matches())
                    .sorted() // the timestamp sorts as text, oldest first
                    .toList();
        }
        for (Path old : mine.subList(0, Math.max(0, mine.size() - keep))) {
            Files.deleteIfExists(old);
            if (ext.equals(".dmp")) {
                String name = old.getFileName().toString();
                Files.deleteIfExists(old.resolveSibling(name.substring(0, name.length() - ".dmp".length()) + ".log"));
            }
        }
    }
}
