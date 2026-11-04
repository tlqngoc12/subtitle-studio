package com.subtitlestudio.playlist;

public class PlaylistNotFoundException extends RuntimeException {

    public PlaylistNotFoundException(long id) {
        super("Playlist not found: " + id);
    }
}
