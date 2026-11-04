package com.subtitlestudio.config;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/** Application settings bound from the {@code subtitle-studio.*} prefix in application.yml. */
@Validated
@ConfigurationProperties(prefix = "subtitle-studio")
public record SubtitleStudioProperties(@Valid @NotNull Ytdlp ytdlp, @NotNull Path dataDir, @Valid @NotNull Gemini gemini,
                                       @Valid @NotNull Publish publish) {

    /** Directory holding the original downloaded .vtt files: {@code {dataDir}/subs}. */
    public Path subsDir() {
        return dataDir.resolve("subs");
    }

    /** Translation profiles ({@code <name>.md}) for Gemini: {@code {dataDir}/prompts}. */
    public Path promptsDir() {
        return dataDir.resolve("prompts");
    }

    /** Directory holding uploaded profile images: {@code {dataDir}/media}. */
    public Path mediaDir() {
        return dataDir.resolve("media");
    }

    public record Ytdlp(@NotBlank String path, @NotNull Duration timeout) {}

    /**
     * Publishing the public site to Cloudflare Pages with wrangler. Blank token, account id or project turns it off.
     * Never log the token.
     */
    public record Publish(String cloudflareApiToken, String cloudflareAccountId, String project, boolean indexable,
                          @NotBlank String wranglerPath, @NotNull Duration timeout) {

        public boolean configured() {
            return notBlank(cloudflareApiToken) && notBlank(cloudflareAccountId) && notBlank(project);
        }

        /** The site address on Cloudflare's free subdomain. */
        public String url() {
            return "https://" + project + ".pages.dev";
        }

        private static boolean notBlank(String value) {
            return value != null && !value.isBlank();
        }

        @Override
        public String toString() {
            return "Publish[project=" + project + ", indexable=" + indexable + ", configured=" + configured() + "]";
        }
    }

    /** Gemini translation. A blank {@code apiKey} turns the feature off. Never log the key. */
    public record Gemini(String apiKey, @NotBlank String model, @NotNull Duration timeout,
                         @NotNull Duration maxDuration, double temperature, List<String> fallbackModels) {

        /** Models tried in order when the previous one is overloaded (HTTP 503); never null. */
        public Gemini {
            fallbackModels = fallbackModels == null ? List.of() : List.copyOf(fallbackModels);
        }

        public boolean configured() {
            return apiKey != null && !apiKey.isBlank();
        }

        @Override
        public String toString() {
            return "Gemini[model=" + model + ", fallbackModels=" + fallbackModels + ", configured=" + configured() + "]";
        }
    }
}
