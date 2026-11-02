package com.subtitlestudio.ytdlp;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.subtitlestudio.subtitle.SourceType;
import com.subtitlestudio.subtitle.SubtitleTrack;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.junit.jupiter.api.io.TempDir;

class YtDlpClientImplTest {

    private static final String ID = "dQw4w9WgXcQ";
    private static final String URL = "https://www.youtube.com/watch?v=" + ID;
    private static final Duration TIMEOUT = Duration.ofSeconds(20);

    @TempDir
    Path tmp;

    private final VideoInfoParser parser = new VideoInfoParser();

    // --- fetchInfo ---

    @Test
    void fetchInfoParsesJsonFromStdoutAsUtf8() {
        VideoInfo info = client("json", TIMEOUT).fetchInfo(ID);

        assertThat(info.title()).isEqualTo("Video tiếng Việt");
        assertThat(info.channel()).isEqualTo("Kênh Việt");
    }

    @Test
    void fetchInfoPassesArgumentsAsListWithoutShell() throws Exception {
        client("json", TIMEOUT).fetchInfo(ID);

        assertThat(recordedArgs()).containsExactly("-J", "--skip-download", URL);
    }

    @Test
    void nonZeroExitThrowsFailedWithStderr() {
        assertThatThrownBy(() -> client("fail", TIMEOUT).fetchInfo(ID))
                .isInstanceOf(YtDlpFailedException.class)
                .hasMessageContaining("exit code 1")
                .hasMessageContaining("Video unavailable");
    }

    @Test
    void failureMessageKeepsOnlyLast500CharsOfStderr() {
        assertThatThrownBy(() -> client("longfail", TIMEOUT).fetchInfo(ID))
                .isInstanceOf(YtDlpFailedException.class)
                .hasMessageContaining("END-MARKER")
                .hasMessageNotContaining("START-MARKER")
                .satisfies(e -> assertThat(e.getMessage().length()).isLessThan(600));
    }

    @Test
    @Timeout(15)
    void killsProcessAndThrowsTimeoutWhenTooSlow() {
        long started = System.nanoTime();

        assertThatThrownBy(() -> client("sleep", Duration.ofSeconds(2)).fetchInfo(ID))
                .isInstanceOf(YtDlpTimeoutException.class);

        assertThat(Duration.ofNanos(System.nanoTime() - started)).isLessThan(Duration.ofSeconds(10));
    }

    @Test
    @Timeout(30)
    void drainsLargeStdoutAndStderrWithoutDeadlock() {
        VideoInfo info = client("flood", TIMEOUT).fetchInfo(ID);

        assertThat(info.id()).isEqualTo("NOEN0000001");
    }

    @Test
    void missingBinaryThrowsFailed() {
        YtDlpClientImpl client = new YtDlpClientImpl(
                List.of(tmp.resolve("no-such-yt-dlp-binary").toString()), TIMEOUT, parser);

        assertThatThrownBy(() -> client.fetchInfo(ID))
                .isInstanceOf(YtDlpFailedException.class)
                .hasMessageContaining("Could not start yt-dlp");
    }

    // --- downloadVtt ---

    @Test
    void downloadsManualSubtitleWithWriteSubs() throws Exception {
        Path outDir = tmp.resolve("subs");

        Path vtt = client("download", TIMEOUT).downloadVtt(ID, new SubtitleTrack("en", SourceType.MANUAL), outDir);

        assertThat(vtt).isEqualTo(outDir.resolve(ID + ".en.vtt"));
        assertThat(Files.readString(vtt)).startsWith("WEBVTT");
        assertThat(recordedArgs()).containsExactly(
                "--skip-download", "--write-subs",
                "--sub-langs", "en", "--sub-format", "vtt",
                "-o", outDir.resolve("%(id)s").toString(),
                URL);
    }

    @Test
    void downloadsAutoCaptionWithWriteAutoSubs() throws Exception {
        Path outDir = tmp.resolve("subs");

        Path vtt = client("download", TIMEOUT).downloadVtt(ID, new SubtitleTrack("en-orig", SourceType.AUTO), outDir);

        assertThat(vtt).isEqualTo(outDir.resolve(ID + ".en-orig.vtt"));
        assertThat(recordedArgs()).contains("--write-auto-subs").doesNotContain("--write-subs");
    }

    @Test
    void createsOutputDirectoryWhenMissing() {
        Path outDir = tmp.resolve("a/b/c");

        client("download", TIMEOUT).downloadVtt(ID, new SubtitleTrack("en", SourceType.MANUAL), outDir);

        assertThat(outDir).isDirectory();
    }

    @Test
    void throwsFailedWhenNoFileWasProduced() {
        assertThatThrownBy(() -> client("download-nofile", TIMEOUT)
                .downloadVtt(ID, new SubtitleTrack("en", SourceType.MANUAL), tmp))
                .isInstanceOf(YtDlpFailedException.class)
                .hasMessageContaining(ID + ".en.vtt");
    }

    // --- helpers ---

    private YtDlpClientImpl client(String mode, Duration timeout) {
        String java = Path.of(System.getProperty("java.home"), "bin", "java").toString();
        String testClasses;
        try {
            testClasses = Path.of(FakeYtDlp.class.getProtectionDomain().getCodeSource().getLocation().toURI()).toString();
        } catch (java.net.URISyntaxException e) {
            throw new IllegalStateException(e);
        }
        List<String> command = new ArrayList<>(List.of(
                java,
                "-Dfake.mode=" + mode,
                "-Dfake.argsFile=" + tmp.resolve("args.txt"),
                "-cp", testClasses,
                FakeYtDlp.class.getName()));
        return new YtDlpClientImpl(command, timeout, parser);
    }

    private List<String> recordedArgs() throws Exception {
        return Files.readAllLines(tmp.resolve("args.txt"), StandardCharsets.UTF_8);
    }
}
