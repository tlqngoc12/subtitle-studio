package com.subtitlestudio.publish;

import java.nio.file.Path;
import java.util.Collection;
import java.util.Set;

/**
 * The R2 bucket that holds the chapter images. Implementations page through long listings and split big deletes
 * themselves, and throw a {@link RuntimeException} on any failure. Never put the access keys in a message.
 */
public interface R2ImageStore {

    /** Every key that starts with {@code prefix}, across all pages. */
    Set<String> listKeys(String prefix);

    void put(String key, Path file, String contentType);

    /** Deletes the keys (in batches of at most 1000). */
    void delete(Collection<String> keys);
}
