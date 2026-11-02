package com.subtitlestudio.video;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface CueRepository extends JpaRepository<CueEntity, Long> {

    List<CueEntity> findByVideo_IdOrderByIdxAsc(String videoId);

    /**
     * Bulk delete in one statement (no per-row loading). Flushes before and clears the persistence
     * context after, so no stale managed cues survive. Entities loaded earlier become detached:
     * re-load them after calling this.
     */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from CueEntity c where c.video.id = :videoId")
    int deleteByVideoId(@Param("videoId") String videoId);
}
