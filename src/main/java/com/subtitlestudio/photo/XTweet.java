package com.subtitlestudio.photo;

import java.time.Instant;

/** What is used from X's syndication answer: the image to download (null if none), when the post was made, its raw text. */
public record XTweet(String imageUrl, Instant createdAt, String text) {
}
