package com.subtitlestudio.novel;

import com.subtitlestudio.config.SubtitleStudioProperties;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * Files written by the story-reviewer agent: {@code {dataDir}/reviews/review-<Profile>--<key>--<date>[-vN].md}, where
 * the key comes from the chapter title ({@link ChapterTitles#reviewKey}). Finds the newest one of a chapter and keeps
 * the names in step when a title changes, a chapter is deleted, or the profile is renamed. Only files whose names
 * match the exact pattern of the profile are ever touched; failures are logged, never thrown, and contents are never
 * logged.
 */
@Component
public class ChapterReviewFiles {

    private static final Logger log = LoggerFactory.getLogger(ChapterReviewFiles.class);
    private static final String ARCHIVE = "_archive";

    private final Path dir;

    @Autowired
    public ChapterReviewFiles(SubtitleStudioProperties properties) {
        this(properties.dataDir().resolve("reviews"));
    }

    ChapterReviewFiles(Path reviewsDir) {
        this.dir = reviewsDir;
    }

    /** One review file of a profile, parsed from its name. */
    private record Found(Path path, String key, String date, int version) {
        String name(String profile, String newKey, int newVersion) {
            return "review-" + profile + "--" + newKey + "--" + date + (newVersion > 1 ? "-v" + newVersion : "") + ".md";
        }
    }

    public static String pattern(String profile, String key) {
        return "review-" + profile + "--" + key + "--*.md";
    }

    public Optional<Path> newest(String profile, String key) {
        return list(profile).stream()
                .filter(f -> f.key().equals(key))
                .max(Comparator.comparing(Found::date).thenComparingInt(Found::version))
                .map(Found::path);
    }

    /**
     * Renames every version of a chapter's review to a new key. Never overwrites: when the target name is taken the
     * moved file becomes the next free {@code -vN} of that date.
     */
    public void rename(String profile, String fromKey, String toKey) {
        if (fromKey == null || toKey == null || fromKey.equals(toKey)) {
            return;
        }
        try {
            List<Found> mine = list(profile).stream().filter(f -> f.key().equals(fromKey))
                    .sorted(Comparator.comparing(Found::date).thenComparingInt(Found::version)).toList();
            for (Found f : mine) {
                int version = f.version();
                Path target = dir.resolve(f.name(profile, toKey, version));
                while (Files.exists(target)) {
                    target = dir.resolve(f.name(profile, toKey, ++version));
                }
                Files.move(f.path(), target);
            }
        } catch (IOException | RuntimeException e) {
            log.warn("Could not rename review files of {}", profile, e);
        }
    }

    /** Moves every version of a chapter's review to {@code _archive/}; a name clash gets {@code -1}, {@code -2}. */
    public void archive(String profile, String key) {
        try {
            List<Found> all = list(profile).stream().filter(f -> f.key().equals(key)).toList();
            if (all.isEmpty()) {
                return;
            }
            Path archive = dir.resolve(ARCHIVE);
            Files.createDirectories(archive);
            for (Found f : all) {
                String name = f.path().getFileName().toString();
                String base = name.substring(0, name.length() - ".md".length());
                Path target = archive.resolve(name);
                for (int n = 1; Files.exists(target); n++) {
                    target = archive.resolve(base + "-" + n + ".md");
                }
                Files.move(f.path(), target);
            }
        } catch (IOException | RuntimeException e) {
            log.warn("Could not archive review files of {}", profile, e);
        }
    }

    public void renameProfile(String from, String to) {
        if (from == null || to == null || from.equals(to)) {
            return;
        }
        try {
            for (Found f : list(from)) {
                Files.move(f.path(), dir.resolve(f.name(to, f.key(), f.version())));
            }
        } catch (IOException | RuntimeException e) {
            log.warn("Could not rename review files of {}", from, e);
        }
    }

    /**
     * One-time conversion of old names {@code review-<Profile>-ch-<position>-<date>[-vN].md} to the key format, where
     * {@code positionToKey} maps a 1-based reading position to the key of the chapter there. Files whose position has
     * no chapter are left alone and their names logged.
     */
    public void migrateLegacy(String profile, Map<Integer, String> positionToKey) {
        if (profile == null || profile.isBlank() || !Files.isDirectory(dir)) {
            return;
        }
        Pattern legacy = Pattern.compile("^review-" + Pattern.quote(profile)
                + "-ch-([0-9]+)-([0-9]{4}-[0-9]{2}-[0-9]{2})(?:-v([0-9]+))?[.]md$");
        try (Stream<Path> files = Files.list(dir)) {
            List<Path> all = files.filter(Files::isRegularFile).sorted().toList();
            for (Path path : all) {
                Matcher m = legacy.matcher(path.getFileName().toString());
                if (!m.matches()) {
                    continue;
                }
                String key = positionToKey.get(Integer.parseInt(m.group(1)));
                if (key == null) {
                    log.warn("Review file {} matches no chapter and was left as it is", path.getFileName());
                    continue;
                }
                int version = m.group(3) == null ? 1 : Integer.parseInt(m.group(3));
                Found f = new Found(path, key, m.group(2), version);
                Path target = dir.resolve(f.name(profile, key, version));
                while (Files.exists(target)) {
                    target = dir.resolve(f.name(profile, key, ++version));
                }
                Files.move(path, target);
            }
        } catch (IOException | RuntimeException e) {
            log.warn("Could not convert old review file names of {}", profile, e);
        }
    }

    private List<Found> list(String profile) {
        if (profile == null || profile.isBlank() || !Files.isDirectory(dir)) {
            return List.of();
        }
        Pattern p = Pattern.compile("^review-" + Pattern.quote(profile)
                + "--([a-z0-9]+(?:-[a-z0-9]+)*)--([0-9]{4}-[0-9]{2}-[0-9]{2})(?:-v([0-9]+))?[.]md$");
        List<Found> out = new ArrayList<>();
        try (Stream<Path> files = Files.list(dir)) {
            for (Path path : (Iterable<Path>) files::iterator) {
                if (!Files.isRegularFile(path)) {
                    continue;
                }
                Matcher m = p.matcher(path.getFileName().toString());
                if (m.matches()) {
                    out.add(new Found(path, m.group(1), m.group(2),
                            m.group(3) == null ? 1 : Integer.parseInt(m.group(3))));
                }
            }
        } catch (IOException | NumberFormatException e) {
            log.warn("Could not list review files of {}", profile, e);
        }
        return out;
    }
}
