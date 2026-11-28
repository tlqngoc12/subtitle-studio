package com.subtitlestudio.novel;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

/** The mark of a chapter's text at its last sync from Wattpad: a different mark later means it was edited. */
public final class ChapterSyncHash {

    private ChapterSyncHash() {}

    /** SHA-256 of the text as lower-case hex; a null text counts as an empty one. */
    public static String of(String text) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest((text == null ? "" : text).getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
