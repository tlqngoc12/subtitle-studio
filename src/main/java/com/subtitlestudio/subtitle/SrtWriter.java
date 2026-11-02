package com.subtitlestudio.subtitle;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;
import org.springframework.stereotype.Component;

/**
 * Serializes {@link Cue}s to SubRip (.srt).
 *
 * <p>Uses CRLF line endings (the de-facto SubRip convention, best supported by older players),
 * UTF-8 encoding and an optional BOM.
 */
@Component
public class SrtWriter {

    private static final String CRLF = "\r\n";
    private static final byte[] UTF8_BOM = {(byte) 0xEF, (byte) 0xBB, (byte) 0xBF};
    private static final int MAX_TITLE_CODE_POINTS = 80;

    private static final Pattern ILLEGAL_FILENAME_CHARS = Pattern.compile("[\\\\/:*?\"<>|]");
    private static final Pattern WHITESPACE_OR_CONTROL = Pattern.compile("[\\s\\p{Cntrl}]+");
    private static final Pattern TRAILING_DOTS_SPACES = Pattern.compile("[. ]+$");

    /** Formats milliseconds as {@code HH:MM:SS,mmm}; hours grow beyond two digits when needed. */
    public static String formatTimestamp(long ms) {
        if (ms < 0) {
            throw new IllegalArgumentException("Negative timestamp: " + ms);
        }
        long hours = ms / 3_600_000;
        long minutes = (ms / 60_000) % 60;
        long seconds = (ms / 1_000) % 60;
        long millis = ms % 1_000;
        // Locale.ROOT: always ASCII digits, whatever the JVM default locale is.
        return String.format(Locale.ROOT, "%02d:%02d:%02d,%03d", hours, minutes, seconds, millis);
    }

    public String write(List<Cue> cues) {
        StringBuilder sb = new StringBuilder();
        int index = 1;
        for (Cue cue : cues) {
            sb.append(index++).append(CRLF)
                    .append(formatTimestamp(cue.startMs())).append(" --> ").append(formatTimestamp(cue.endMs())).append(CRLF)
                    .append(cue.text().replace("\r\n", "\n").replace("\n", CRLF)).append(CRLF)
                    .append(CRLF);
        }
        return sb.toString();
    }

    public byte[] toBytes(List<Cue> cues, boolean bom) {
        byte[] body = write(cues).getBytes(StandardCharsets.UTF_8);
        if (!bom) {
            return body;
        }
        byte[] out = new byte[UTF8_BOM.length + body.length];
        System.arraycopy(UTF8_BOM, 0, out, 0, UTF8_BOM.length);
        System.arraycopy(body, 0, out, UTF8_BOM.length, body.length);
        return out;
    }

    /** Builds {@code {sanitized-title}_{videoId}.{lang}.srt}, or {@code {videoId}.{lang}.srt} when the title is unusable. */
    public String fileName(String title, String videoId, String lang) {
        String safeTitle = sanitizeTitle(title);
        return (safeTitle.isEmpty() ? "" : safeTitle + "_") + videoId + "." + lang + ".srt";
    }

    public String fileName(String title, String videoId) {
        return fileName(title, videoId, "en");
    }

    private static String sanitizeTitle(String title) {
        if (title == null) {
            return "";
        }
        String s = ILLEGAL_FILENAME_CHARS.matcher(title).replaceAll("");
        s = WHITESPACE_OR_CONTROL.matcher(s).replaceAll(" ").strip();
        if (s.codePointCount(0, s.length()) > MAX_TITLE_CODE_POINTS) {
            s = s.substring(0, s.offsetByCodePoints(0, MAX_TITLE_CODE_POINTS));
        }
        // Windows rejects names ending in a dot or space; strip again after truncation.
        return TRAILING_DOTS_SPACES.matcher(s).replaceAll("").strip();
    }
}
