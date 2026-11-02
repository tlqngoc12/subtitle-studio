package com.subtitlestudio.ytdlp;

import com.subtitlestudio.config.SubtitleStudioProperties;
import com.subtitlestudio.subtitle.SourceType;
import com.subtitlestudio.subtitle.SubtitleTrack;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * Runs yt-dlp as a child process.
 *
 * <p>Arguments are passed as a list straight to {@link ProcessBuilder}; no shell is involved. Callers
 * must pass a video id already validated by {@code UrlParser}. stdout and stderr are drained
 * concurrently so a full pipe buffer can never block the child.
 */
@Component
public class YtDlpClientImpl implements YtDlpClient {

    private static final String WATCH_URL = "https://www.youtube.com/watch?v=";
    private static final int STDERR_TAIL_CHARS = 500;
    private static final Duration STREAM_DRAIN_GRACE = Duration.ofSeconds(5);

    private final List<String> baseCommand;
    private final Duration timeout;
    private final VideoInfoParser parser;

    @Autowired
    public YtDlpClientImpl(SubtitleStudioProperties properties, VideoInfoParser parser) {
        this(List.of(properties.ytdlp().path()), properties.ytdlp().timeout(), parser);
    }

    /** @param baseCommand the executable plus any fixed leading arguments (tests use a fake JVM program). */
    YtDlpClientImpl(List<String> baseCommand, Duration timeout, VideoInfoParser parser) {
        this.baseCommand = List.copyOf(baseCommand);
        this.timeout = timeout;
        this.parser = parser;
    }

    @Override
    public VideoInfo fetchInfo(String videoId) {
        Result result = run(List.of("-J", "--skip-download", WATCH_URL + videoId));
        return parser.parse(result.stdout());
    }

    @Override
    public Path downloadVtt(String videoId, SubtitleTrack track, Path outDir) {
        try {
            Files.createDirectories(outDir);
        } catch (IOException e) {
            throw new UncheckedIOException("Could not create " + outDir, e);
        }
        run(List.of(
                "--skip-download",
                track.source() == SourceType.MANUAL ? "--write-subs" : "--write-auto-subs",
                "--sub-langs", track.lang(),
                "--sub-format", "vtt",
                "-o", outDir.resolve("%(id)s").toString(),
                WATCH_URL + videoId));

        Path vtt = outDir.resolve(videoId + "." + track.lang() + ".vtt");
        if (!Files.isRegularFile(vtt)) {
            throw new YtDlpFailedException("yt-dlp finished but did not write " + vtt);
        }
        return vtt;
    }

    private Result run(List<String> args) {
        List<String> command = new ArrayList<>(baseCommand);
        command.addAll(args);

        ProcessBuilder pb = new ProcessBuilder(command);
        // Make Python print UTF-8 regardless of the OS console code page (matters on Windows).
        pb.environment().put("PYTHONUTF8", "1");
        pb.environment().put("PYTHONIOENCODING", "utf-8");

        Process process;
        try {
            process = pb.start();
        } catch (IOException e) {
            throw new YtDlpFailedException("Could not start yt-dlp (" + baseCommand.get(0) + "): " + e.getMessage(), e);
        }

        try (ExecutorService readers = Executors.newVirtualThreadPerTaskExecutor()) {
            CompletableFuture<String> stdout = drain(process.getInputStream(), readers);
            CompletableFuture<String> stderr = drain(process.getErrorStream(), readers);
            process.getOutputStream().close();

            if (!process.waitFor(timeout.toMillis(), TimeUnit.MILLISECONDS)) {
                kill(process);
                throw new YtDlpTimeoutException("yt-dlp did not finish within " + timeout.toSeconds() + "s");
            }

            int exitCode = process.exitValue();
            String err = await(stderr);
            if (exitCode != 0) {
                throw new YtDlpFailedException("yt-dlp failed with exit code " + exitCode + ": " + tail(err));
            }
            return new Result(await(stdout), err);
        } catch (InterruptedException e) {
            kill(process);
            Thread.currentThread().interrupt();
            throw new YtDlpFailedException("Interrupted while waiting for yt-dlp", e);
        } catch (IOException e) {
            kill(process);
            throw new YtDlpFailedException("I/O error talking to yt-dlp: " + e.getMessage(), e);
        }
    }

    private static CompletableFuture<String> drain(InputStream in, ExecutorService executor) {
        return CompletableFuture.supplyAsync(() -> {
            try (in) {
                return new String(in.readAllBytes(), StandardCharsets.UTF_8);
            } catch (IOException e) {
                // Stream closed because the process was killed; output is irrelevant then.
                return "";
            }
        }, executor);
    }

    private static String await(CompletableFuture<String> future) throws InterruptedException {
        try {
            return future.get(STREAM_DRAIN_GRACE.toMillis(), TimeUnit.MILLISECONDS);
        } catch (ExecutionException | TimeoutException e) {
            throw new YtDlpFailedException("Could not read yt-dlp output", e);
        }
    }

    /** Kills the process and its children (yt-dlp may spawn ffmpeg or a JS runtime). */
    private static void kill(Process process) {
        process.descendants().forEach(ProcessHandle::destroyForcibly);
        process.destroyForcibly();
    }

    private static String tail(String s) {
        String trimmed = s.strip();
        return trimmed.length() <= STDERR_TAIL_CHARS ? trimmed : "..." + trimmed.substring(trimmed.length() - STDERR_TAIL_CHARS);
    }

    private record Result(String stdout, String stderr) {}
}
