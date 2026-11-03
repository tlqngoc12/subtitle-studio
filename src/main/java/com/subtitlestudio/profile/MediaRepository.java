package com.subtitlestudio.profile;

import java.time.Instant;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface MediaRepository extends JpaRepository<Media, Long> {

    /** True when a block (IMAGE) or a block item (GALLERY) still shows this image. */
    @Query("select (count(b) > 0) from ProfileBlock b where b.media.id = :id")
    boolean isUsedByBlock(@Param("id") Long mediaId);

    @Query("select (count(i) > 0) from ProfileBlockItem i where i.media.id = :id")
    boolean isUsedByItem(@Param("id") Long mediaId);

    default boolean isReferenced(Long mediaId) {
        return isUsedByBlock(mediaId) || isUsedByItem(mediaId);
    }

    /** Images nobody shows that were uploaded before {@code before} (abandoned uploads). */
    @Query("select m from Media m where m.createdAt < :before "
            + "and not exists (select b from ProfileBlock b where b.media = m) "
            + "and not exists (select i from ProfileBlockItem i where i.media = m) order by m.id")
    List<Media> findUnreferencedCreatedBefore(@Param("before") Instant before);
}
