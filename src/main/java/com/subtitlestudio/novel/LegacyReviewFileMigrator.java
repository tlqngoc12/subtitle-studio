package com.subtitlestudio.novel;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

/**
 * At startup, renames old review files {@code review-<Profile>-ch-<reading position>-<date>.md} to the title-key
 * format. It only matches the old format, so later runs find nothing to do. Failures are logged, never thrown.
 */
@Component
public class LegacyReviewFileMigrator implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(LegacyReviewFileMigrator.class);

    private final NovelRepository novels;
    private final ChapterRepository chapters;
    private final ChapterReviewFiles reviewFiles;

    public LegacyReviewFileMigrator(NovelRepository novels, ChapterRepository chapters,
                                    ChapterReviewFiles reviewFiles) {
        this.novels = novels;
        this.chapters = chapters;
        this.reviewFiles = reviewFiles;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            migrate();
        } catch (RuntimeException e) {
            log.warn("Could not convert old review file names", e);
        }
    }

    void migrate() {
        for (Novel novel : novels.findAll()) {
            String profile = novel.getPromptProfile();
            if (profile == null || profile.isBlank()) {
                continue;
            }
            Map<Integer, String> positionToKey = new HashMap<>();
            List<ChapterRow> rows = chapters.findRowsByNovel(novel.getId());
            for (int i = 0; i < rows.size(); i++) {
                int position = i + 1;
                ChapterTitles.reviewKey(rows.get(i).title()).ifPresent(key -> positionToKey.put(position, key));
            }
            reviewFiles.migrateLegacy(profile, positionToKey);
        }
    }
}
