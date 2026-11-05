package com.subtitlestudio.novel;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ChapterPageRepository extends JpaRepository<ChapterPage, Long> {

    List<ChapterPage> findByChapterIdOrderByPosition(long chapterId);

    long countByChapterId(long chapterId);
}
