package com.subtitlestudio.novel;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ChapterRepository extends JpaRepository<Chapter, Long> {

    List<Chapter> findByNovelIdOrderByChapterNo(long novelId);

    /** Reading order; chapter_no breaks ties. */
    List<Chapter> findByNovelIdOrderBySortOrderAscChapterNoAsc(long novelId);

    Optional<Chapter> findByNovelIdAndWattpadPartId(long novelId, String wattpadPartId);

    List<Chapter> findByNovelIdAndWattpadPartIdIsNotNull(long novelId);

    /** Rows of {partId, chapterId} for the imported Wattpad chapters (no chapter text is loaded). */
    @org.springframework.data.jpa.repository.Query("select c.wattpadPartId, c.id from Chapter c "
            + "where c.novel.id = :novelId and c.wattpadPartId is not null")
    List<Object[]> importedParts(@org.springframework.data.repository.query.Param("novelId") long novelId);

    Optional<Chapter> findByNovelIdAndChapterNo(long novelId, int chapterNo);

    List<Chapter> findByTranslationStatus(ChapterTranslationStatus status);

    /** The nearest earlier chapter (any status); callers check that its pages have text. */
    List<Chapter> findByNovelIdAndChapterNoLessThanOrderByChapterNoDesc(long novelId, int chapterNo);
}
