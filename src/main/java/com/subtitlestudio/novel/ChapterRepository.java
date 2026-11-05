package com.subtitlestudio.novel;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ChapterRepository extends JpaRepository<Chapter, Long> {

    List<Chapter> findByNovelIdOrderByChapterNo(long novelId);

    Optional<Chapter> findByNovelIdAndChapterNo(long novelId, int chapterNo);

    List<Chapter> findByTranslationStatus(ChapterTranslationStatus status);

    /** The nearest earlier chapter (any status); callers check that its pages have text. */
    List<Chapter> findByNovelIdAndChapterNoLessThanOrderByChapterNoDesc(long novelId, int chapterNo);
}
