package com.subtitlestudio.playlist;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PlaylistItemRepository extends JpaRepository<PlaylistItem, Long> {

    List<PlaylistItem> findByPlaylist_IdOrderByPositionAsc(Long playlistId);

    Optional<PlaylistItem> findByPlaylist_IdAndVideo_Id(Long playlistId, String videoId);

    List<PlaylistItem> findByVideo_Id(String videoId);

    long countByPlaylist_Id(Long playlistId);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from PlaylistItem i where i.playlist.id = :id")
    int deleteByPlaylistId(@Param("id") Long id);
}
