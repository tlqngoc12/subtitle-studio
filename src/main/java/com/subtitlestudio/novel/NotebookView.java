package com.subtitlestudio.novel;

import java.util.List;

/**
 * One notebook version for the Notebook tab. {@code content} and {@code afterChapterNo} are null when there is no
 * version yet; {@code staleLaterVersions} is true when a later version was built before this one changed.
 */
public record NotebookView(Integer afterChapterNo, NotebookContent content, List<Integer> versions,
                           NotebookStatus status, String error, boolean staleLaterVersions) {
}
