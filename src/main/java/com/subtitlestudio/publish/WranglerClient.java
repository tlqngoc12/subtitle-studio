package com.subtitlestudio.publish;

import java.nio.file.Path;

/** Uploads a prepared site directory to Cloudflare Pages. */
public interface WranglerClient {

    /** @throws PublishFailedException with a message safe to show to the user */
    void deploy(Path dir);
}
