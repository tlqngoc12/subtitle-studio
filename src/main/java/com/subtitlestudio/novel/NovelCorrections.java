package com.subtitlestudio.novel;

import java.util.ArrayList;
import java.util.List;

/**
 * The paragraphs a translator corrected in a chapter: the AI translation against the final text, paragraph by
 * paragraph. Pure, no Spring.
 */
public final class NovelCorrections {

    private NovelCorrections() {
    }

    /**
     * One corrected spot. {@code source} is the original text of the same paragraphs (null when unknown); {@code ai}
     * or {@code fin} is {@code ""} for an insertion or a deletion. Paragraphs inside a side are joined with a blank line.
     */
    public record Edit(String source, String ai, String fin) {
    }

    /** CRLF becomes LF, split on blank lines, each paragraph stripped, empty ones dropped. */
    public static List<String> paragraphs(String text) {
        List<String> out = new ArrayList<>();
        if (text == null) {
            return out;
        }
        for (String p : text.replace("\r\n", "\n").replace('\r', '\n').split("\n[ \t]*\n")) {
            String s = p.strip();
            if (!s.isEmpty()) {
                out.add(s);
            }
        }
        return out;
    }

    /** {@code source} is null for screenshot chapters; it is attached only when it has as many paragraphs as the AI text. */
    public static List<Edit> edits(String ai, String fin, String source) {
        List<String> a = paragraphs(ai);
        List<String> f = paragraphs(fin);
        List<String> s = source == null ? null : paragraphs(source);
        boolean withSource = s != null && s.size() == a.size();
        String[] ka = a.stream().map(NovelCorrections::key).toArray(String[]::new);
        String[] kf = f.stream().map(NovelCorrections::key).toArray(String[]::new);
        int n = ka.length;
        int m = kf.length;
        int[][] lcs = new int[n + 1][m + 1];
        for (int i = n - 1; i >= 0; i--) {
            for (int j = m - 1; j >= 0; j--) {
                lcs[i][j] = ka[i].equals(kf[j]) ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
            }
        }
        List<Edit> edits = new ArrayList<>();
        int i = 0;
        int j = 0;
        int ai0 = 0;
        int fj0 = 0;
        while (i < n || j < m) {
            if (i < n && j < m && ka[i].equals(kf[j])) {
                flush(edits, a, f, s, withSource, ai0, i, fj0, j);
                i++;
                j++;
                ai0 = i;
                fj0 = j;
            } else if (j < m && (i == n || lcs[i][j + 1] >= lcs[i + 1][j])) {
                j++;
            } else {
                i++;
            }
        }
        flush(edits, a, f, s, withSource, ai0, n, fj0, m);
        return edits;
    }

    private static void flush(List<Edit> edits, List<String> a, List<String> f, List<String> s, boolean withSource,
                              int ai0, int ai1, int fj0, int fj1) {
        if (ai0 == ai1 && fj0 == fj1) {
            return;
        }
        String src = withSource && ai1 > ai0 ? String.join("\n\n", s.subList(ai0, ai1)) : null;
        edits.add(new Edit(src, String.join("\n\n", a.subList(ai0, ai1)), String.join("\n\n", f.subList(fj0, fj1))));
    }

    private static String key(String paragraph) {
        return paragraph.replaceAll("\\s+", " ").strip();
    }
}
