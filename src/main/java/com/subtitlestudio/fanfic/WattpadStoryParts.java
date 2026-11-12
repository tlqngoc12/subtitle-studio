package com.subtitlestudio.fanfic;

import java.util.List;

/** A story plus its language name (may be null) and its parts in story order. */
public record WattpadStoryParts(WattpadStory story, String languageName, List<WattpadPart> parts) {
}
