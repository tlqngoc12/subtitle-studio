package com.subtitlestudio.novel.wattpad;

import java.util.List;

/**
 * What the New novel form is prefilled with: the story details, a guessed source language and, when a novel already
 * uses this Wattpad story, its id so the admin opens it instead of creating a duplicate, plus the story's parts in story order.
 * {@code suggestedProfile} is the file name (without .md) the translation profile gets when the form leaves it empty.
 */
public record WattpadNovelPreview(String storyId, String title, String author, String description, List<String> tags,
                                  boolean completed, String languageName, String sourceLanguage, int partCount,
                                  String coverUrl, String storyUrl, Long existingNovelId,
                                  List<WattpadPreviewPart> parts, String suggestedProfile) {
}
