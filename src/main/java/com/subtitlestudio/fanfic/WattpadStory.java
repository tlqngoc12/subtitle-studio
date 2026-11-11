package com.subtitlestudio.fanfic;

import java.time.Instant;
import java.util.List;

/** What the public Wattpad API says about one story. {@code coverUrl} is the Wattpad URL and may be null. */
public record WattpadStory(String id, String title, String author, String description, List<String> tags,
                           String coverUrl, long readCount, long voteCount, int partCount, long wordCount,
                           boolean completed, Instant storyUpdatedAt) {
}
