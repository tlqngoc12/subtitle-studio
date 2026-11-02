package com.subtitlestudio.subtitle;

import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CharsetDecoder;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.stereotype.Component;

/**
 * Parses SubRip (.srt) files uploaded by the user (translated subtitles).
 *
 * <p>Lenient about layout (BOM, CRLF/LF/CR, extra blank lines, missing index lines, ',' or '.' before
 * milliseconds) but strict about encoding: anything that is not valid UTF-8 is rejected rather than
 * silently stored with replacement characters.
 */
@Component
public class SrtParser {

    private static final Pattern BLANK_LINES = Pattern.compile("\n{2,}");
    private static final Pattern TIMING = Pattern.compile(
            "^(\\d+):(\\d{2}):(\\d{2})[,.](\\d{3})\\s*-->\\s*(\\d+):(\\d{2}):(\\d{2})[,.](\\d{3})");
    private static final Pattern INDEX = Pattern.compile("^\\d+$");

    public SrtParseResult parse(byte[] content) {
        String text = normalizeLineEndings(stripBom(decodeUtf8(content)));
        List<SrtEntry> entries = new ArrayList<>();
        int skipped = 0;
        int position = 0;

        for (String block : BLANK_LINES.split(text.strip())) {
            if (block.isBlank()) {
                continue;
            }
            position++;
            String[] lines = block.split("\n");
            int timingLine;
            int index;
            if (TIMING.matcher(lines[0].strip()).find()) {
                timingLine = 0;
                index = position;
            } else if (lines.length > 1 && INDEX.matcher(lines[0].strip()).matches()
                    && TIMING.matcher(lines[1].strip()).find()) {
                timingLine = 1;
                index = Integer.parseInt(lines[0].strip());
            } else {
                skipped++;
                continue;
            }

            Matcher m = TIMING.matcher(lines[timingLine].strip());
            m.find();
            List<String> textLines = new ArrayList<>();
            for (int i = timingLine + 1; i < lines.length; i++) {
                String line = lines[i].strip();
                if (!line.isEmpty()) {
                    textLines.add(line);
                }
            }
            entries.add(new SrtEntry(index, millis(m, 1), millis(m, 5), String.join("\n", textLines)));
        }

        if (entries.isEmpty()) {
            throw new InvalidSrtException("No subtitle blocks found");
        }
        return new SrtParseResult(entries, skipped);
    }

    private static String decodeUtf8(byte[] content) {
        if (content.length >= 2 && ((content[0] == (byte) 0xFF && content[1] == (byte) 0xFE)
                || (content[0] == (byte) 0xFE && content[1] == (byte) 0xFF))) {
            throw new InvalidSrtException("Subtitle file must be UTF-8 encoded (found UTF-16)");
        }
        CharsetDecoder decoder = StandardCharsets.UTF_8.newDecoder()
                .onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT);
        try {
            return decoder.decode(ByteBuffer.wrap(content)).toString();
        } catch (CharacterCodingException e) {
            throw new InvalidSrtException("Subtitle file must be UTF-8 encoded");
        }
    }

    private static long millis(Matcher m, int firstGroup) {
        long hours = Long.parseLong(m.group(firstGroup));
        long minutes = Long.parseLong(m.group(firstGroup + 1));
        long seconds = Long.parseLong(m.group(firstGroup + 2));
        long ms = Long.parseLong(m.group(firstGroup + 3));
        return ((hours * 60 + minutes) * 60 + seconds) * 1000 + ms;
    }

    private static String stripBom(String s) {
        return !s.isEmpty() && s.charAt(0) == '﻿' ? s.substring(1) : s;
    }

    private static String normalizeLineEndings(String s) {
        return s.replace("\r\n", "\n").replace('\r', '\n');
    }
}
