package com.subtitlestudio.publish;

import com.subtitlestudio.config.SubtitleStudioProperties;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * Runs {@code wrangler pages deploy} as a child process (list arguments, never a shell). The token and account id
 * go only into the child's environment. wrangler's output may echo account details, so it is only scanned to pick
 * a message and is never logged or put into exceptions.
 */
@Component
public class WranglerClientImpl implements WranglerClient {

    private static final Logger log = LoggerFactory.getLogger(WranglerClientImpl.class);
    private static final int MAX_OUTPUT = 64 * 1024;

    private final List<String> baseCommand;
    private final SubtitleStudioProperties.Publish settings;

    @Autowired
    public WranglerClientImpl(SubtitleStudioProperties properties) {
        this(List.of(properties.publish().wranglerPath()), properties.publish());
    }

    WranglerClientImpl(List<String> baseCommand, SubtitleStudioProperties.Publish settings) {
        this.baseCommand = List.copyOf(baseCommand);
        this.settings = settings;
    }

    @Override
    public void deploy(Path dir) {
        Path site = dir.toAbsolutePath();
        List<String> command = new ArrayList<>(baseCommand);
        command.addAll(List.of("pages", "deploy", site.toString(), "--project-name", settings.project(),
                "--branch", "main"));
        ProcessBuilder pb = new ProcessBuilder(command);
        // wrangler writes a cache (.wrangler/) into its working directory: use one the app user can write.
        pb.directory(site.getParent().toFile());
        pb.environment().put("CLOUDFLARE_API_TOKEN", settings.cloudflareApiToken());
        pb.environment().put("CLOUDFLARE_ACCOUNT_ID", settings.cloudflareAccountId());

        Process process;
        try {
            process = pb.start();
        } catch (IOException e) {
            log.warn("Could not start wrangler ({})", baseCommand.get(0));
            throw new PublishFailedException("Could not start wrangler.");
        }

        try (ExecutorService readers = Executors.newVirtualThreadPerTaskExecutor()) {
            CompletableFuture<String> stdout = drain(process.getInputStream(), readers);
            CompletableFuture<String> stderr = drain(process.getErrorStream(), readers);
            process.getOutputStream().close();

            if (!process.waitFor(settings.timeout().toMillis(), TimeUnit.MILLISECONDS)) {
                kill(process);
                throw new PublishFailedException("Publishing timed out.");
            }
            int exit = process.exitValue();
            if (exit != 0) {
                log.warn("wrangler exited with {}", exit);
                throw new PublishFailedException(messageFor(exit, stdout.get() + "\n" + stderr.get()));
            }
        } catch (InterruptedException e) {
            kill(process);
            Thread.currentThread().interrupt();
            throw new PublishFailedException("Publishing was interrupted.");
        } catch (IOException | ExecutionException e) {
            kill(process);
            throw new PublishFailedException("Could not run wrangler.");
        }
    }

    /**
     * Kills the process and everything it started (wrangler.cmd starts node, which holds the output pipes).
     * Descendants are listed first: once the parent is gone they can no longer be found through it.
     */
    private static void kill(Process process) {
        List<ProcessHandle> descendants = process.descendants().toList();
        descendants.forEach(ProcessHandle::destroyForcibly);
        process.destroyForcibly();
    }

    private String messageFor(int exit, String output) {
        if (output.contains("Authentication error") || output.contains("[code: 10000]")) {
            return "Cloudflare rejected the API token.";
        }
        if (output.contains("Project not found") || output.contains("[code: 8000007]")) {
            return "Cloudflare Pages project \"" + settings.project() + "\" was not found.";
        }
        if (output.contains("ENOTFOUND") || output.contains("ECONNRESET") || output.contains("fetch failed")) {
            return "Could not reach Cloudflare.";
        }
        return "Cloudflare Pages deploy failed (exit " + exit + ").";
    }

    /** Reads at most {@link #MAX_OUTPUT} bytes and discards the rest, so a chatty process never blocks. */
    private static CompletableFuture<String> drain(InputStream in, ExecutorService executor) {
        return CompletableFuture.supplyAsync(() -> {
            try (in) {
                byte[] kept = in.readNBytes(MAX_OUTPUT);
                in.transferTo(java.io.OutputStream.nullOutputStream());
                return new String(kept, StandardCharsets.UTF_8);
            } catch (IOException e) {
                return ""; // the process was killed
            }
        }, executor);
    }
}
