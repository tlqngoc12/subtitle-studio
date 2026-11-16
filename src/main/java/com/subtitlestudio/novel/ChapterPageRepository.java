package com.subtitlestudio.novel;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ChapterPageRepository extends JpaRepository<ChapterPage, Long> {

    List<ChapterPage> findByChapterIdOrderByPosition(long chapterId);

    long countByChapterId(long chapterId);

    /** Every page of every chapter of the novel. */
    List<ChapterPage> findByChapterNovelId(long novelId);

    /** Rows of [chapterId, page count] for the chapters of the novel that have pages (none for a chapter without pages). */
    @org.springframework.data.jpa.repository.Query("select p.chapter.id, count(p) from ChapterPage p "
            + "where p.chapter.novel.id = :novelId group by p.chapter.id")
    List<Object[]> countPerChapter(@org.springframework.data.repository.query.Param("novelId") long novelId);
}
