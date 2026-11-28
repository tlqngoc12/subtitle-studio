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

    /** The chapters of an original story last synced from this Wattpad part (at most one). */
    List<Chapter> findByNovelIdAndOriginalWattpadPartId(long novelId, String originalWattpadPartId);

    /** Rows of {partId, chapterId} for the imported Wattpad chapters (no chapter text is loaded). */
    @org.springframework.data.jpa.repository.Query("select c.wattpadPartId, c.id from Chapter c "
            + "where c.novel.id = :novelId and c.wattpadPartId is not null")
    List<Object[]> importedParts(@org.springframework.data.repository.query.Param("novelId") long novelId);

    Optional<Chapter> findByNovelIdAndChapterNo(long novelId, int chapterNo);

    List<Chapter> findByTranslationStatus(ChapterTranslationStatus status);

    Optional<Chapter> findFirstByNovelIdAndTranslationStatusOrderByChapterNo(long novelId, ChapterTranslationStatus status);

    boolean existsByNovelIdAndTranslationStatus(long novelId, ChapterTranslationStatus status);

    /**
     * Published, translated chapters of the novels that use {@code profile}, newest published first: the chapters whose
     * corrections can improve the profile.
     */
    @org.springframework.data.jpa.repository.Query("select c from Chapter c join fetch c.novel n "
            + "where n.promptProfile = :profile and c.publishStatus = "
            + "com.subtitlestudio.novel.ChapterPublishStatus.PUBLISHED and c.translationStatus = "
            + "com.subtitlestudio.novel.ChapterTranslationStatus.TRANSLATED "
            + "order by c.publishedAt desc, c.id desc")
    List<Chapter> findAnalysisChapters(@org.springframework.data.repository.query.Param("profile") String profile);

    /** The nearest earlier chapter (any status); callers check that its pages have text. */
    List<Chapter> findByNovelIdAndChapterNoLessThanOrderByChapterNoDesc(long novelId, int chapterNo);

    /** Chapter totals for every novel that has chapters (a novel without chapters has no row). */
    @org.springframework.data.jpa.repository.Query("select new com.subtitlestudio.novel.NovelChapterStats("
            + "c.novel.id, count(c), "
            + "sum(case when c.publishStatus = com.subtitlestudio.novel.ChapterPublishStatus.PUBLISHED then 1L else 0L end), "
            + "max(case when c.publishStatus = com.subtitlestudio.novel.ChapterPublishStatus.PUBLISHED then c.publishedAt end)) "
            + "from Chapter c group by c.novel.id")
    List<NovelChapterStats> chapterStats();

    /** The same totals for one novel; null when it has no chapters. */
    @org.springframework.data.jpa.repository.Query("select new com.subtitlestudio.novel.NovelChapterStats("
            + "c.novel.id, count(c), "
            + "sum(case when c.publishStatus = com.subtitlestudio.novel.ChapterPublishStatus.PUBLISHED then 1L else 0L end), "
            + "max(case when c.publishStatus = com.subtitlestudio.novel.ChapterPublishStatus.PUBLISHED then c.publishedAt end)) "
            + "from Chapter c where c.novel.id = :novelId group by c.novel.id")
    NovelChapterStats chapterStats(@org.springframework.data.repository.query.Param("novelId") long novelId);

    /** Chapter metadata in reading order, without the text columns. */
    @org.springframework.data.jpa.repository.Query("select new com.subtitlestudio.novel.ChapterRow(c.id, c.chapterNo, "
            + "c.title, c.translationStatus, c.translationError, c.translationModel, c.publishStatus, "
            + "c.sourceFetchedAt, c.wattpadModifiedAt) "
            + "from Chapter c where c.novel.id = :novelId order by c.sortOrder asc, c.chapterNo asc")
    List<ChapterRow> findRowsByNovel(@org.springframework.data.repository.query.Param("novelId") long novelId);

    /** The highest chapter number among the published chapters; null when none is published. */
    @org.springframework.data.jpa.repository.Query("select max(c.chapterNo) from Chapter c where c.novel.id = :novelId "
            + "and c.publishStatus = com.subtitlestudio.novel.ChapterPublishStatus.PUBLISHED")
    Integer maxPublishedChapterNo(@org.springframework.data.repository.query.Param("novelId") long novelId);

    /** Ids of the chapters before {@code chapterNo}, nearest first. */
    @org.springframework.data.jpa.repository.Query("select c.id from Chapter c where c.novel.id = :novelId "
            + "and c.chapterNo < :chapterNo order by c.chapterNo desc")
    List<Long> findIdsBefore(@org.springframework.data.repository.query.Param("novelId") long novelId, @org.springframework.data.repository.query.Param("chapterNo") int chapterNo);
}
