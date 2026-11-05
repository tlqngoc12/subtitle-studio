package com.subtitlestudio.novel;

import com.subtitlestudio.translate.TranslationFailedException;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/** Checks Gemini's pages against the screenshots sent: same page numbers, no blank text. */
final class PageTextOutput {

    private PageTextOutput() {
    }

    static List<TranslatedPage> validate(List<PageImage> sent, List<TranslatedPage> got) {
        Set<Integer> expected = sent.stream().map(PageImage::page).collect(Collectors.toSet());
        if (got == null) {
            throw incomplete(0, expected.size());
        }
        Map<Integer, String> byPage = new HashMap<>();
        boolean bad = false;
        for (TranslatedPage p : got) {
            if (p == null || p.text() == null || p.text().isBlank() || !expected.contains(p.page())
                    || byPage.containsKey(p.page())) {
                bad = true;
                continue;
            }
            byPage.put(p.page(), p.text().strip());
        }
        if (bad || byPage.size() != expected.size()) {
            throw incomplete(byPage.size(), expected.size());
        }
        return byPage.entrySet().stream().sorted(Map.Entry.comparingByKey())
                .map(e -> new TranslatedPage(e.getKey(), e.getValue()))
                .sorted(Comparator.comparingInt(TranslatedPage::page)).toList();
    }

    private static TranslationFailedException incomplete(int got, int expected) {
        return new TranslationFailedException(
                "Gemini returned an incomplete translation (got " + got + " of " + expected + " pages).");
    }
}
