package com.subtitlestudio.translate;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/** Checks Gemini's answer against what was sent: exactly the same ids, each with non-blank text. */
public final class TranslationOutput {

    private static final Pattern LINE_BREAK = Pattern.compile("\\r\\n?");

    private TranslationOutput() {
    }

    /**
     * Returns the lines in the order of {@code sent}, text stripped and line breaks normalised to
     * {@code \n}; throws {@link TranslationFailedException} when anything is missing, extra, duplicated or blank.
     */
    public static List<TranslatedLine> validate(List<SourceLine> sent, List<TranslatedLine> got) {
        Map<Integer, Integer> seen = new HashMap<>();
        Map<Integer, String> textById = new HashMap<>();
        for (TranslatedLine line : got) {
            seen.merge(line.id(), 1, Integer::sum);
            textById.put(line.id(), line.text() == null ? "" : LINE_BREAK.matcher(line.text()).replaceAll("\n").strip());
        }

        List<TranslatedLine> ordered = new ArrayList<>(sent.size());
        for (SourceLine source : sent) {
            String text = textById.get(source.id());
            if (seen.getOrDefault(source.id(), 0) == 1 && !text.isEmpty()) {
                ordered.add(new TranslatedLine(source.id(), text));
            }
        }
        boolean extra = seen.size() > sent.size()
                || seen.keySet().stream().anyMatch(id -> sent.stream().noneMatch(s -> s.id() == id));
        if (ordered.size() != sent.size() || extra) {
            throw invalid(ordered.size(), sent.size());
        }
        return ordered;
    }

    static TranslationFailedException invalid(int valid, int total) {
        return new TranslationFailedException(
                "Gemini trả về thiếu/lệch câu (" + valid + "/" + total + " câu hợp lệ), thử dịch lại.");
    }
}
