package com.subtitlestudio.novel;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ChapterImageRepository extends JpaRepository<ChapterImage, Long> {

    List<ChapterImage> findByChapterIdOrderByPosition(long chapterId);

    long countByChapterId(long chapterId);

    /** Every image of every chapter of the novel. */
    List<ChapterImage> findByChapterNovelId(long novelId);
}
