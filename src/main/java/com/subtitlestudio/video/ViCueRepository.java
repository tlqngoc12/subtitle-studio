package com.subtitlestudio.video;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ViCueRepository extends JpaRepository<ViCueEntity, Long> {

    List<ViCueEntity> findByVideo_IdOrderByIdxAsc(String videoId);

    /** Bulk delete; clears the persistence context afterwards, so re-load entities after calling it. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from ViCueEntity c where c.video.id = :videoId")
    int deleteByVideoId(@Param("videoId") String videoId);
}
