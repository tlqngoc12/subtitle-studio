package com.subtitlestudio.profile;

/** The block does not exist or belongs to another profile. */
public class BlockNotFoundException extends RuntimeException {

    public BlockNotFoundException(long id) {
        super("Block not found: " + id);
    }
}
