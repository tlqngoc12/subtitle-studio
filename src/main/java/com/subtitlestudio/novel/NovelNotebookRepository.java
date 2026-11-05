package com.subtitlestudio.novel;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface NovelNotebookRepository extends JpaRepository<NovelNotebook, Long> {

    Optional<NovelNotebook> findTopByNovelIdAndAfterChapterNoLessThanOrderByAfterChapterNoDesc(long novelId,
                                                                                               int chapterNo);

    Optional<NovelNotebook> findByNovelIdAndAfterChapterNo(long novelId, int afterChapterNo);

    List<NovelNotebook> findByNovelIdOrderByAfterChapterNo(long novelId);
}
