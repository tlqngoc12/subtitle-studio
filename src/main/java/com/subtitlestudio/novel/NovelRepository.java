package com.subtitlestudio.novel;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface NovelRepository extends JpaRepository<Novel, Long> {

    Optional<Novel> findBySlug(String slug);

    Optional<Novel> findByWattpadStoryId(String wattpadStoryId);

    boolean existsBySlug(String slug);

    List<Novel> findAllByOrderByUpdatedAtDesc();

    List<Novel> findByNotebookStatus(NotebookStatus status);
}
