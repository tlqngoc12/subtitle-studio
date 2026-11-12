package com.subtitlestudio.novel.wattpad;

/** Recognises a scene-break line: only symbols such as {@code ***}, {@code * * *}, {@code ---}, {@code ~~~}. */
public final class SceneBreak {

    private static final String SYMBOLS = "*-~#\u2022_=\u00B7\u2014\u2013";

    private SceneBreak() {
    }

    public static boolean isBreak(String line) {
        if (line == null) {
            return false;
        }
        int symbols = 0;
        for (char c : line.toCharArray()) {
            if (Character.isWhitespace(c)) {
                continue;
            }
            if (SYMBOLS.indexOf(c) < 0) {
                return false;
            }
            symbols++;
        }
        return symbols >= 3;
    }
}
