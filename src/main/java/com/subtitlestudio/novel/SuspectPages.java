package com.subtitlestudio.novel;

import java.util.List;

/**
 * Flags pages whose translation is much shorter than the Thai text Gemini read from the same image: a page that
 * lost most of its sentences. The yardstick is the novel's own median ratio (translation length over source length),
 * or a fixed floor while there are too few pages to take a median of.
 */
final class SuspectPages {

    /** A shorter source is too little text to judge a ratio on. */
    static final int MIN_SOURCE_CHARS = 100;
    /** Pages needed before the novel's median is trusted. */
    static final int MIN_SAMPLES = 5;
    /** A page is suspect below this share of the novel's median ratio. */
    static final double SHARE_OF_MEDIAN = 0.6;
    /** Ratio below which a page is suspect when there is no median. */
    static final double FIXED_FLOOR = 0.5;

    private SuspectPages() {
    }

    /** Translation length over source length, both stripped. */
    static double ratio(String text, String source) {
        return (double) text.strip().length() / source.strip().length();
    }

    /** The median ratio over the pages that can be judged; null when there are fewer than {@link #MIN_SAMPLES}. */
    static Double novelMedian(List<ChapterPage> novelPages) {
        double[] ratios = novelPages.stream()
                .filter(p -> judgeable(p.getTextVi(), p.getSourceTh()))
                .mapToDouble(p -> ratio(p.getTextVi(), p.getSourceTh()))
                .sorted().toArray();
        if (ratios.length < MIN_SAMPLES) {
            return null;
        }
        int mid = ratios.length / 2;
        return ratios.length % 2 == 1 ? ratios[mid] : (ratios[mid - 1] + ratios[mid]) / 2;
    }

    static boolean suspect(String text, String source, Double novelMedian) {
        if (!judgeable(text, source)) {
            return false;
        }
        double limit = novelMedian == null ? FIXED_FLOOR : SHARE_OF_MEDIAN * novelMedian;
        return ratio(text, source) < limit;
    }

    private static boolean judgeable(String text, String source) {
        return text != null && !text.isBlank() && source != null && source.strip().length() >= MIN_SOURCE_CHARS;
    }
}
