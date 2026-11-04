package com.subtitlestudio.playlist;

/** A new order did not list exactly the videos of the playlist, each once. */
public class InvalidPlaylistOrderException extends RuntimeException {

    public InvalidPlaylistOrderException() {
        super("The order must list every video of the playlist exactly once");
    }
}
