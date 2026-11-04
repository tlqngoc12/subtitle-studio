package com.subtitlestudio.playlist;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PlaylistRepository extends JpaRepository<Playlist, Long> {

    List<Playlist> findAllByOrderByUpdatedAtDesc();
}
