package com.subtitlestudio.ytdlp;

import java.io.InputStream;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.List;

/**
 * Stand-in for the yt-dlp binary, launched as a separate JVM by {@link YtDlpClientImplTest}.
 * Written in Java (not a shell script) so the tests run on Windows and Linux alike.
 *
 * <p>System properties:
 * <ul>
 *   <li>{@code fake.mode}: json | fail | longfail | sleep | flood | download | download-nofile</li>
 *   <li>{@code fake.fixture}: classpath JSON printed in json/flood mode</li>
 *   <li>{@code fake.argsFile}: if set, received arguments are written there, one per line</li>
 * </ul>
 */
public final class FakeYtDlp {

    public static void main(String[] args) throws Exception {
        PrintStream out = new PrintStream(System.out, true, StandardCharsets.UTF_8);
        PrintStream err = new PrintStream(System.err, true, StandardCharsets.UTF_8);

        String argsFile = System.getProperty("fake.argsFile");
        if (argsFile != null) {
            Files.write(Path.of(argsFile), Arrays.asList(args), StandardCharsets.UTF_8);
        }

        switch (System.getProperty("fake.mode", "json")) {
            case "json" -> out.print(fixture());
            case "fail" -> {
                err.println("ERROR: [youtube] dQw4w9WgXcQ: Video unavailable");
                System.exit(1);
            }
            case "longfail" -> {
                err.print("START-MARKER");
                err.print("x".repeat(2_000));
                err.print("END-MARKER");
                System.exit(2);
            }
            case "sleep" -> Thread.sleep(60_000);
            case "flood" -> {
                // Far more than an OS pipe buffer on both streams: deadlocks unless both are drained concurrently.
                String noise = "n".repeat(1_024);
                for (int i = 0; i < 2_048; i++) {
                    err.println(noise);
                }
                String json = fixture();
                out.print(json.substring(0, json.length() - 2)
                        + ",\"description\":\"" + "d".repeat(2 * 1024 * 1024) + "\"}");
            }
            case "download" -> writeVtt(args);
            case "download-nofile" -> err.println("WARNING: no subtitles written");
            default -> throw new IllegalArgumentException("Unknown fake.mode");
        }
    }

    private static String fixture() throws Exception {
        String path = System.getProperty("fake.fixture", "ytdlp/info-no-english.json");
        try (InputStream in = FakeYtDlp.class.getClassLoader().getResourceAsStream(path)) {
            return new String(in.readAllBytes(), StandardCharsets.UTF_8).strip();
        }
    }

    private static void writeVtt(String[] args) throws Exception {
        List<String> list = Arrays.asList(args);
        String template = list.get(list.indexOf("-o") + 1);
        String lang = list.get(list.indexOf("--sub-langs") + 1);
        String url = list.get(list.size() - 1);
        String id = url.substring(url.indexOf("v=") + 2);
        Path file = Path.of(template.replace("%(id)s", id) + "." + lang + ".vtt");
        Files.writeString(file, "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nhello\n", StandardCharsets.UTF_8);
    }
}
