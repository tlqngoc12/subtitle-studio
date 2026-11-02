package com.subtitlestudio.subtitle;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.stereotype.Component;

/**
 * Parses WebVTT content into {@link RawCue}s.
 *
 * <p>Skips the header and NOTE/STYLE/REGION blocks, ignores cue identifiers and cue settings,
 * strips inline tags (e.g. {@code <00:00:01.234>}, {@code <c>}, {@code <i>}) and decodes HTML entities.
 * Rolling duplicates from YouTube auto-captions are kept as-is; {@code CaptionNormalizer} handles them.
 */
@Component
public class VttParser {

    // Only truly empty lines separate blocks: YouTube auto-captions put whitespace-only lines inside cues.
    private static final Pattern BLANK_LINES = Pattern.compile("\n{2,}");
    private static final Pattern TIMING = Pattern.compile("^(\\S+)\\s+-->\\s+(\\S+)");
    private static final Pattern TIMESTAMP = Pattern.compile("^(?:(\\d+):)?([0-5]\\d):([0-5]\\d)\\.(\\d{3})$");
    private static final Pattern TAG = Pattern.compile("<[^>]*>");
    private static final Pattern ENTITY = Pattern.compile("&(#\\d+|#[xX][0-9a-fA-F]+|amp|lt|gt|quot|apos|nbsp);");

    public List<RawCue> parse(String content) {
        if (content == null || content.isEmpty()) {
            throw new VttParseException("Empty VTT content");
        }
        String text = normalizeLineEndings(stripBom(content));
        if (!hasWebvttHeader(text)) {
            throw new VttParseException("Missing WEBVTT header");
        }

        String[] blocks = BLANK_LINES.split(text.strip());
        List<RawCue> cues = new ArrayList<>();
        // blocks[0] is the header (WEBVTT + optional metadata such as Kind:/Language:)
        for (int i = 1; i < blocks.length; i++) {
            RawCue cue = parseBlock(blocks[i].split("\n"));
            if (cue != null) {
                cues.add(cue);
            }
        }
        return cues;
    }

    private static RawCue parseBlock(String[] lines) {
        if (isNonCueBlock(lines[0])) {
            return null;
        }
        int timingIdx = lines[0].contains("-->") ? 0
                : (lines.length > 1 && lines[1].contains("-->")) ? 1
                : -1;
        if (timingIdx < 0) {
            return null;
        }
        Matcher timing = TIMING.matcher(lines[timingIdx].strip());
        if (!timing.find()) {
            return null;
        }
        Long start = toMillis(timing.group(1));
        Long end = toMillis(timing.group(2));
        if (start == null || end == null) {
            return null;
        }

        List<String> textLines = new ArrayList<>();
        for (int i = timingIdx + 1; i < lines.length; i++) {
            String cleaned = decodeEntities(TAG.matcher(lines[i]).replaceAll("")).strip();
            if (!cleaned.isEmpty()) {
                textLines.add(cleaned);
            }
        }
        return textLines.isEmpty() ? null : new RawCue(start, end, textLines);
    }

    private static boolean isNonCueBlock(String firstLine) {
        return startsWithKeyword(firstLine, "NOTE")
                || startsWithKeyword(firstLine, "STYLE")
                || startsWithKeyword(firstLine, "REGION");
    }

    private static boolean startsWithKeyword(String line, String keyword) {
        return line.startsWith(keyword)
                && (line.length() == keyword.length() || Character.isWhitespace(line.charAt(keyword.length())));
    }

    private static Long toMillis(String timestamp) {
        Matcher m = TIMESTAMP.matcher(timestamp);
        if (!m.matches()) {
            return null;
        }
        long hours = m.group(1) == null ? 0 : Long.parseLong(m.group(1));
        long minutes = Long.parseLong(m.group(2));
        long seconds = Long.parseLong(m.group(3));
        long millis = Long.parseLong(m.group(4));
        return ((hours * 60 + minutes) * 60 + seconds) * 1000 + millis;
    }

    private static String decodeEntities(String s) {
        if (s.indexOf('&') < 0) {
            return s;
        }
        // Single pass, so "&amp;lt;" becomes "&lt;" rather than "<".
        return ENTITY.matcher(s).replaceAll(m -> Matcher.quoteReplacement(decodeEntity(m.group(1))));
    }

    private static String decodeEntity(String name) {
        return switch (name) {
            case "amp" -> "&";
            case "lt" -> "<";
            case "gt" -> ">";
            case "quot" -> "\"";
            case "apos" -> "'";
            case "nbsp" -> " ";
            default -> {
                int codePoint = (name.charAt(1) == 'x' || name.charAt(1) == 'X')
                        ? Integer.parseInt(name.substring(2), 16)
                        : Integer.parseInt(name.substring(1));
                yield Character.toString(codePoint);
            }
        };
    }

    private static String stripBom(String s) {
        return s.charAt(0) == '﻿' ? s.substring(1) : s;
    }

    private static String normalizeLineEndings(String s) {
        return s.replace("\r\n", "\n").replace('\r', '\n');
    }

    private static boolean hasWebvttHeader(String text) {
        return text.startsWith("WEBVTT")
                && (text.length() == 6 || text.charAt(6) == ' ' || text.charAt(6) == '\t' || text.charAt(6) == '\n');
    }
}
