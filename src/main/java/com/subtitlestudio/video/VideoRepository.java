package com.subtitlestudio.video;

import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface VideoRepository extends JpaRepository<Video, String> {

    List<Video> findAllByOrderByFetchedAtDesc();

    /**
     * Marks the video as translating, in one statement, only when no translation is running and the
     * Vietsub is not the user's own. Returns 0 when that is not the case (or the video is gone).
     */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update Video v
               set v.translationStatus = com.subtitlestudio.video.TranslationStatus.TRANSLATING,
                   v.translationProfile = :profile,
                   v.translationError = null
             where v.id = :id
               and (v.translationStatus is null or v.translationStatus = com.subtitlestudio.video.TranslationStatus.FAILED)
               and (v.viSource is null or v.viSource = com.subtitlestudio.video.ViSource.AUTO)""")
    int markTranslating(@Param("id") String id, @Param("profile") String profile);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update Video v
               set v.translationStatus = com.subtitlestudio.video.TranslationStatus.FAILED,
                   v.translationError = :message
             where v.id = :id""")
    int markFailed(@Param("id") String id, @Param("message") String message);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update Video v
               set v.translationStatus = com.subtitlestudio.video.TranslationStatus.FAILED,
                   v.translationError = :message
             where v.translationStatus = com.subtitlestudio.video.TranslationStatus.TRANSLATING""")
    int failAllTranslating(@Param("message") String message);

    /** Loads the video with a row lock, held until the surrounding transaction ends. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select v from Video v where v.id = :id")
    Optional<Video> findForUpdate(@Param("id") String id);
}
