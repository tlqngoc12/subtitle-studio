package com.subtitlestudio.publish;

/** CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID or SUBTITLESTUDIO_PUBLISH_PROJECT is not set. */
public class PublishNotConfiguredException extends RuntimeException {

    public PublishNotConfiguredException() {
        super("Publishing is not set up");
    }
}
