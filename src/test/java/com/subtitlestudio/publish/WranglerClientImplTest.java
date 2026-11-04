package com.subtitlestudio.publish;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.subtitlestudio.config.SubtitleStudioProperties;
import java.net.URISyntaxException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;

@ExtendWith(OutputCaptureExtension.class)
class WranglerClientImplTest {

    private static final String TOKEN = "cf-secret-123";

    @TempDir
    Path tmp;

    private WranglerClientImpl client(String mode, Duration timeout) {
        String java = Path.of(System.getProperty("java.home"), "bin", "java").toString();
        String testClasses;
        try {
            testClasses = Path.of(FakeWrangler.class.getProtectionDomain().getCodeSource().getLocation().toURI()).toString();
        } catch (URISyntaxException e) {
            throw new IllegalStateException(e);
        }
        var settings = new SubtitleStudioProperties.Publish(TOKEN, "acc-42", "fans", false, "unused", timeout);
        return new WranglerClientImpl(List.of(java, "-Dfake.mode=" + mode, "-Dfake.out=" + tmp.resolve("out.txt"),
                "-cp", testClasses, FakeWrangler.class.getName()), settings);
    }

    private WranglerClientImpl client(String mode) {
        return client(mode, Duration.ofSeconds(30));
    }

    private static String userMessage(Throwable e) {
        return ((PublishFailedException) e).userMessage();
    }

    @Test
    void passesArgumentsAndEnvironment() throws Exception {
        Path site = tmp.resolve("work/site");
        Files.createDirectories(site);

        client("ok").deploy(site);

        // wrangler runs in the site's parent directory (writable by the app user), with an absolute site path.
        assertThat(Files.readAllLines(tmp.resolve("out.txt"), StandardCharsets.UTF_8)).containsExactly(
                "pages", "deploy", site.toAbsolutePath().toString(), "--project-name", "fans", "--branch", "main",
                "account=acc-42", "tokenLength=" + TOKEN.length(), "cwd=" + tmp.resolve("work").toAbsolutePath());
    }

    @Test
    void mapsAuthenticationError() {
        assertThatThrownBy(() -> client("auth").deploy(tmp))
                .satisfies(e -> assertThat(userMessage(e)).isEqualTo("Cloudflare rejected the API token."));
    }

    @Test
    void neverLeaksTokenFromWranglerOutput(CapturedOutput output) {
        assertThatThrownBy(() -> client("auth").deploy(tmp)).satisfies(e -> {
            assertThat(userMessage(e)).doesNotContain(TOKEN);
            assertThat(e.getMessage()).doesNotContain(TOKEN);
        });
        assertThat(output).doesNotContain(TOKEN);
    }

    @Test
    void mapsMissingProject() {
        assertThatThrownBy(() -> client("missing").deploy(tmp))
                .satisfies(e -> assertThat(userMessage(e)).isEqualTo("Cloudflare Pages project \"fans\" was not found."));
    }

    @Test
    void mapsNetworkError() {
        assertThatThrownBy(() -> client("network").deploy(tmp))
                .satisfies(e -> assertThat(userMessage(e)).isEqualTo("Could not reach Cloudflare."));
    }

    @Test
    void mapsOtherExitCode() {
        assertThatThrownBy(() -> client("other").deploy(tmp))
                .satisfies(e -> assertThat(userMessage(e)).isEqualTo("Cloudflare Pages deploy failed (exit 7)."));
    }

    @Test
    void timesOut() {
        long start = System.nanoTime();

        assertThatThrownBy(() -> client("sleep", Duration.ofSeconds(2)).deploy(tmp))
                .satisfies(e -> assertThat(userMessage(e)).isEqualTo("Publishing timed out."));
        assertThat(Duration.ofNanos(System.nanoTime() - start)).isLessThan(Duration.ofSeconds(20));
    }

    @Test
    void timeoutAlsoStopsProcessesWranglerStarted() {
        long start = System.nanoTime();

        assertThatThrownBy(() -> client("child", Duration.ofSeconds(3)).deploy(tmp))
                .satisfies(e -> assertThat(userMessage(e)).isEqualTo("Publishing timed out."));
        assertThat(Duration.ofNanos(System.nanoTime() - start)).isLessThan(Duration.ofSeconds(15));
    }

    @Test
    void reportsMissingBinary() {
        var settings = new SubtitleStudioProperties.Publish(TOKEN, "acc-42", "fans", false, "unused", Duration.ofSeconds(5));
        var missing = new WranglerClientImpl(List.of(tmp.resolve("no-such-wrangler").toString()), settings);

        assertThatThrownBy(() -> missing.deploy(tmp))
                .satisfies(e -> assertThat(userMessage(e)).isEqualTo("Could not start wrangler."));
    }
}
