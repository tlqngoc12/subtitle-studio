package com.subtitlestudio.config;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.ConstructorBinding;
import org.springframework.util.unit.DataSize;
import org.springframework.validation.annotation.Validated;

/** Application settings bound from the {@code subtitle-studio.*} prefix in application.yml. */
@Validated
@ConfigurationProperties(prefix = "subtitle-studio")
public record SubtitleStudioProperties(@Valid @NotNull Ytdlp ytdlp, @NotNull Path dataDir, @Valid @NotNull Gemini gemini,
                                       @Valid @NotNull Publish publish, @Valid Novel novel) {

    /** Missing {@code novel} settings fall back to {@link Novel#defaults()}. */
    @ConstructorBinding
    public SubtitleStudioProperties {
        novel = novel == null ? Novel.defaults() : novel;
    }

    /** For tests and callers that do not care about novels. */
    public SubtitleStudioProperties(Ytdlp ytdlp, Path dataDir, Gemini gemini, Publish publish) {
        this(ytdlp, dataDir, gemini, publish, Novel.defaults());
    }

    /** Directory holding the original downloaded .vtt files: {@code {dataDir}/subs}. */
    public Path subsDir() {
        return dataDir.resolve("subs");
    }

    /** Translation profiles ({@code <name>.md}) for Gemini: {@code {dataDir}/prompts}. */
    public Path promptsDir() {
        return dataDir.resolve("prompts");
    }

    /** Translation profiles for novels, apart from the Vietsub ones: {@code {dataDir}/prompts/novels}. */
    public Path novelPromptsDir() {
        return promptsDir().resolve("novels");
    }

    /** Directory holding uploaded profile images: {@code {dataDir}/media}. */
    public Path mediaDir() {
        return dataDir.resolve("media");
    }

    /** Cache of chapter images drawn for the public site: {@code {dataDir}/novel-render}. */
    public Path novelRenderDir() {
        return dataDir.resolve("novel-render");
    }

    /**
     * Novels: how many page screenshots go to Gemini per request, the upload limit, how chapters are drawn for the
     * public site, and the watermark text (blank = the public site's host).
     */
    public record Novel(int pagesPerRequest, DataSize maxPageImageSize, @Valid Render render, String watermarkText) {

        public Novel {
            pagesPerRequest = pagesPerRequest <= 0 ? 20 : pagesPerRequest;
            maxPageImageSize = maxPageImageSize == null ? DataSize.ofMegabytes(10) : maxPageImageSize;
            render = render == null ? Render.defaults() : render;
            watermarkText = watermarkText == null ? "" : watermarkText;
        }

        public static Novel defaults() {
            return new Novel(20, DataSize.ofMegabytes(10), Render.defaults(), "");
        }

        public record Render(int fontSize) {

            public Render {
                fontSize = fontSize <= 0 ? 44 : fontSize;
            }

            public static Render defaults() {
                return new Render(44);
            }
        }
    }

    public record Ytdlp(@NotBlank String path, @NotNull Duration timeout) {}

    /**
     * Publishing the public site to Cloudflare Pages with wrangler. Blank token, account id or project turns it off.
     * Never log the token.
     */
    public record Publish(String cloudflareApiToken, String cloudflareAccountId, String project, boolean indexable,
                          @NotBlank String wranglerPath, @NotNull Duration timeout, String cloudflareD1DatabaseId) {

        @ConstructorBinding
        public Publish {
        }

        /** Without a D1 database (read counts off); for tests and callers that do not care about it. */
        public Publish(String cloudflareApiToken, String cloudflareAccountId, String project, boolean indexable,
                       String wranglerPath, Duration timeout) {
            this(cloudflareApiToken, cloudflareAccountId, project, indexable, wranglerPath, timeout, "");
        }

        /** True when novel read counts are on: the site is published and a D1 database id is set. */
        public boolean readCountsEnabled() {
            return configured() && notBlank(cloudflareD1DatabaseId);
        }

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
            return "Publish[project=" + project + ", indexable=" + indexable + ", configured=" + configured() + ", readCounts=" + readCountsEnabled() + "]";
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
