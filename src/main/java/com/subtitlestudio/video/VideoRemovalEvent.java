package com.subtitlestudio.video;

/**
 * Published inside the transaction, before a video loses its Vietsub or is deleted, so that rows referencing the
 * video in other packages (playlists) can go first. Keeps the video package free of a dependency on them.
 */
public record VideoRemovalEvent(String videoId) {
}
