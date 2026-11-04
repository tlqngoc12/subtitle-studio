package com.subtitlestudio.publish;

import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * Stand-in for the wrangler CLI, launched as a separate JVM by {@link WranglerClientImplTest}.
 *
 * <p>System properties: {@code fake.mode} = ok | auth | missing | network | other | sleep | child (starts a sleeping
 * child process that inherits stdout/stderr, like wrangler.cmd starting node, then sleeps);
 * {@code fake.out}: file receiving the arguments (one per line), then {@code account=<id>} and {@code tokenLength=<n>}.
 */
public final class FakeWrangler {

    public static void main(String[] args) throws Exception {
        PrintStream out = new PrintStream(System.out, true, StandardCharsets.UTF_8);
        PrintStream err = new PrintStream(System.err, true, StandardCharsets.UTF_8);
        String token = System.getenv().getOrDefault("CLOUDFLARE_API_TOKEN", "");

        String outFile = System.getProperty("fake.out");
        if (outFile != null) {
            List<String> lines = new ArrayList<>(Arrays.asList(args));
            lines.add("account=" + System.getenv().getOrDefault("CLOUDFLARE_ACCOUNT_ID", ""));
            lines.add("tokenLength=" + token.length());
            lines.add("cwd=" + Path.of("").toAbsolutePath());
            Files.write(Path.of(outFile), lines, StandardCharsets.UTF_8);
        }

        switch (System.getProperty("fake.mode", "ok")) {
            case "ok" -> out.println("✨ Deployment complete! Take a peek over at https://abc.fans.pages.dev");
            case "auth" -> {
                err.println("✘ [ERROR] A request to the Cloudflare API failed. Authentication error [code: 10000]");
                err.println("Token used: " + token);
                System.exit(1);
            }
            case "missing" -> {
                err.println("✘ [ERROR] Project not found. The specified project name does not match [code: 8000007]");
                System.exit(1);
            }
            case "network" -> {
                err.println("✘ [ERROR] fetch failed: getaddrinfo ENOTFOUND api.cloudflare.com");
                System.exit(1);
            }
            case "other" -> System.exit(7);
            case "sleep" -> Thread.sleep(30_000);
            case "child" -> {
                String java = Path.of(System.getProperty("java.home"), "bin", "java").toString();
                new ProcessBuilder(java, "-Dfake.mode=sleep", "-cp", System.getProperty("java.class.path"),
                        FakeWrangler.class.getName()).inheritIO().start();
                Thread.sleep(30_000);
            }
            default -> throw new IllegalArgumentException("unknown fake.mode");
        }
    }
}
