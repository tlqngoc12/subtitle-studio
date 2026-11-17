package com.subtitlestudio.novel;

/**
 * A save would drop, add or change an image marker line of a chapter that has images. The translator may move a marker
 * line but every {@code [[image:N]]} line of the chapter must stay, so no image is lost by accident.
 */
public class ChapterImageMarkersException extends RuntimeException {

    public ChapterImageMarkersException() {
        super("You can move or remove [[image:…]] lines, but not edit them or add new ones.");
    }
}
