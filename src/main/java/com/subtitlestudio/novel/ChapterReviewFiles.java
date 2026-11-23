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
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * Files written by the story-reviewer agent: {@code {dataDir}/reviews/review-<Profile>-ch-<x>-<date>[-vN].md}. Finds the
 * newest one of a chapter and keeps the names in step when chapters move, are deleted, or the profile is renamed. Only
 * files whose names match the exact pattern of the profile are ever touched; failures are logged, never thrown, and
 * contents are never logged.
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
    private record Found(Path path, int position, String date, int version) {
        String name(String profile, int newPosition) {
            return "review-" + profile + "-ch-" + newPosition + "-" + date + (version > 1 ? "-v" + version : "") + ".md";
        }
    }

    public static String pattern(String profile, int position) {
        return "review-" + profile + "-ch-" + position + "-*.md";
    }

    public Optional<Path> newest(String profile, int position) {
        return list(profile).stream()
                .filter(f -> f.position() == position)
                .max(Comparator.comparing(Found::date).thenComparingInt(Found::version))
                .map(Found::path);
    }

    /** Renames every version of the chapters whose position changed ({@code old -> new}); swaps never overwrite. */
    public void renumber(String profile, Map<Integer, Integer> oldToNew) {
        try {
            List<Found> affected = new ArrayList<>();
            for (Found f : list(profile)) {
                Integer target = oldToNew.get(f.position());
                if (target != null && target != f.position()) {
                    affected.add(f);
                }
            }
            if (affected.isEmpty()) {
                return;
            }
            List<Path> temps = new ArrayList<>();
            for (Found f : affected) {
                Path temp = dir.resolve("." + UUID.randomUUID() + ".renumber");
                Files.move(f.path(), temp);
                temps.add(temp);
            }
            for (int i = 0; i < affected.size(); i++) {
                Found f = affected.get(i);
                Files.move(temps.get(i), dir.resolve(f.name(profile, oldToNew.get(f.position()))));
            }
        } catch (IOException | RuntimeException e) {
            log.warn("Could not renumber review files of {}", profile, e);
        }
    }

    /** Moves every version of a chapter's review to {@code _archive/}; a name clash gets {@code -1}, {@code -2}. */
    public void archive(String profile, int position) {
        try {
            List<Found> all = list(profile).stream().filter(f -> f.position() == position).toList();
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
                Files.move(f.path(), dir.resolve(f.name(to, f.position())));
            }
        } catch (IOException | RuntimeException e) {
            log.warn("Could not rename review files of {}", from, e);
        }
    }

    private List<Found> list(String profile) {
        if (profile == null || profile.isBlank() || !Files.isDirectory(dir)) {
            return List.of();
        }
        Pattern p = Pattern.compile(
                "^review-" + Pattern.quote(profile) + "-ch-(\\d+)-(\\d{4}-\\d{2}-\\d{2})(?:-v(\\d+))?\\.md$");
        List<Found> out = new ArrayList<>();
        try (Stream<Path> files = Files.list(dir)) {
            for (Path path : (Iterable<Path>) files::iterator) {
                if (!Files.isRegularFile(path)) {
                    continue;
                }
                Matcher m = p.matcher(path.getFileName().toString());
                if (m.matches()) {
                    out.add(new Found(path, Integer.parseInt(m.group(1)), m.group(2),
                            m.group(3) == null ? 1 : Integer.parseInt(m.group(3))));
                }
            }
        } catch (IOException | NumberFormatException e) {
            log.warn("Could not list review files of {}", profile, e);
        }
        return out;
    }
}
