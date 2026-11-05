package com.subtitlestudio.novel;

import com.subtitlestudio.translate.TranslationFailedException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.stream.Collectors;

/** Checks Gemini's pages against the screenshots sent: which pages came back usable, which are missing. */
final class PageTextOutput {

    /**
     * The usable pages (expected page number, text not blank, first answer for that page; sorted, stripped), the
     * pages still missing, and a one-line description of the answer's shape for the log, without any text.
     */
    record Check(List<TranslatedPage> valid, List<Integer> missing, String description) {}

    private PageTextOutput() {
    }

    static Check check(List<PageImage> sent, List<TranslatedPage> got) {
        Set<Integer> expected = sent.stream().map(PageImage::page).collect(Collectors.toSet());
        List<TranslatedPage> answer = got == null ? List.of() : got;
        Map<Integer, String> valid = new TreeMap<>();
        List<Integer> returned = new ArrayList<>();
        List<Integer> unexpected = new ArrayList<>();
        List<Integer> duplicate = new ArrayList<>();
        List<Integer> blank = new ArrayList<>();
        Set<Integer> seen = new java.util.HashSet<>();
        for (TranslatedPage p : answer) {
            if (p == null) {
                continue;
            }
            returned.add(p.page());
            if (!expected.contains(p.page())) {
                unexpected.add(p.page());
            } else if (!seen.add(p.page())) {
                duplicate.add(p.page());
            } else if (p.text() == null || p.text().isBlank()) {
                blank.add(p.page());
            } else {
                valid.put(p.page(), p.text().strip());
            }
        }
        List<Integer> missing = sent.stream().map(PageImage::page).filter(n -> !valid.containsKey(n)).sorted()
                .toList();
        Map<Integer, Integer> chars = new LinkedHashMap<>();
        valid.forEach((page, text) -> chars.put(page, text.length()));
        StringBuilder d = new StringBuilder("returned ").append(returned);
        if (!missing.isEmpty()) {
            d.append(", missing ").append(missing);
        }
        if (!unexpected.isEmpty()) {
            d.append(", unexpected ").append(unexpected);
        }
        if (!duplicate.isEmpty()) {
            d.append(", duplicate ").append(duplicate);
        }
        if (!blank.isEmpty()) {
            d.append(", blank ").append(blank);
        }
        d.append(", chars ").append(chars);
        List<TranslatedPage> pages = valid.entrySet().stream()
                .map(e -> new TranslatedPage(e.getKey(), e.getValue())).toList();
        return new Check(pages, missing, d.toString());
    }

    /** Every page sent must come back usable; extra pages are ignored. */
    static List<TranslatedPage> validate(List<PageImage> sent, List<TranslatedPage> got) {
        Check check = check(sent, got);
        if (!check.missing().isEmpty()) {
            throw incomplete(check.valid().size(), sent.size());
        }
        return check.valid();
    }

    static TranslationFailedException incomplete(int got, int expected) {
        return new TranslationFailedException(
                "Gemini returned an incomplete translation (got " + got + " of " + expected + " pages).");
    }
}
