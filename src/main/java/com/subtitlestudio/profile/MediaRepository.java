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

    /** True when a novel uses this image as its cover. */
    @Query("select (count(n) > 0) from Novel n where n.cover.id = :id")
    boolean isUsedByNovelCover(@Param("id") Long mediaId);

    /** True when a chapter page is this screenshot. */
    @Query("select (count(p) > 0) from ChapterPage p where p.media.id = :id")
    boolean isUsedByChapterPage(@Param("id") Long mediaId);

    /** True when a profile banner shows this image. */
    @Query("select (count(i) > 0) from ProfileBannerImage i where i.media.id = :id")
    boolean isUsedByBanner(@Param("id") Long mediaId);

    default boolean isReferenced(Long mediaId) {
        return isUsedByBlock(mediaId) || isUsedByItem(mediaId) || isUsedByNovelCover(mediaId)
                || isUsedByChapterPage(mediaId) || isUsedByBanner(mediaId);
    }

    /** Images nobody shows that were uploaded before {@code before} (abandoned uploads). */
    @Query("select m from Media m where m.createdAt < :before "
            + "and not exists (select b from ProfileBlock b where b.media = m) "
            + "and not exists (select i from ProfileBlockItem i where i.media = m) "
            + "and not exists (select n from Novel n where n.cover = m) "
            + "and not exists (select p from ChapterPage p where p.media = m) "
            + "and not exists (select r from ProfileBannerImage r where r.media = m) order by m.id")
    List<Media> findUnreferencedCreatedBefore(@Param("before") Instant before);
}
