package com.subtitlestudio.publish;

import com.subtitlestudio.config.SubtitleStudioProperties;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Stream;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

/**
 * The Cloudflare Pages Functions behind novel read counts ({@code GET /api/reads}, {@code POST /api/reads/:slug},
 * bound to a D1 database) and chapter images ({@code GET /novel-images/*}, read from an R2 bucket), plus the
 * {@code wrangler.toml} with those bindings and {@code _routes.json}, which limits Functions to those paths.
 * {@code wrangler pages deploy <site>} picks up {@code functions/} and {@code wrangler.toml} from its working
 * directory, which is the parent of the site directory, so they are written there. The database id and bucket name
 * are not secrets; the API token and the R2 keys never go into the file.
 */
@Component
public class PagesFunctions {

    static final String FUNCTIONS_DIR = "functions";
    static final String CONFIG_FILE = "wrangler.toml";
    static final String ROUTES_FILE = "_routes.json";
    private static final String COMPATIBILITY_DATE = "2025-01-01";

    private final SubtitleStudioProperties.Publish settings;

    public PagesFunctions(SubtitleStudioProperties properties) {
        this.settings = properties.publish();
    }

    /** Writes the functions and config beside {@code site} when read counts or R2 are on; otherwise removes any left over. */
    public void prepare(Path site) {
        Path root = site.toAbsolutePath().getParent();
        clean(root);
        try {
            Files.deleteIfExists(site.resolve(ROUTES_FILE));
        } catch (IOException e) {
            throw new UncheckedIOException("Could not clean the Pages functions", e);
        }
        boolean reads = settings.readCountsEnabled();
        boolean images = settings.r2Enabled();
        if (!reads && !images) {
            return;
        }
        String config = config(site.toAbsolutePath().getFileName().toString(), reads, images);
        try {
            if (reads) {
                Path api = root.resolve(FUNCTIONS_DIR).resolve("api").resolve("reads");
                Files.createDirectories(api);
                copy("public-functions/reads-get.js", api.resolve("index.js"));
                copy("public-functions/reads-post.js", api.resolve("[slug].js"));
            }
            if (images) {
                Path dir = root.resolve(FUNCTIONS_DIR).resolve("novel-images");
                Files.createDirectories(dir);
                copy("public-functions/novel-images.js", dir.resolve("[[path]].js"));
            }
            Files.writeString(root.resolve(CONFIG_FILE), config, StandardCharsets.UTF_8);
            Files.createDirectories(site);
            Files.writeString(site.resolve(ROUTES_FILE), routes(reads, images), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException("Could not prepare the Pages functions", e);
        }
    }

    /** Removes what {@link #prepare} wrote: a later publish must not inherit it. Safe when nothing is there. */
    public void clean(Path root) {
        try {
            Files.deleteIfExists(root.resolve(CONFIG_FILE));
            Path functions = root.resolve(FUNCTIONS_DIR);
            if (Files.exists(functions)) {
                try (Stream<Path> paths = Files.walk(functions)) {
                    for (Path p : paths.sorted(Comparator.reverseOrder()).toList()) {
                        Files.deleteIfExists(p);
                    }
                }
            }
        } catch (IOException e) {
            throw new UncheckedIOException("Could not clean the Pages functions", e);
        }
    }

    private String config(String siteDirName, boolean reads, boolean images) {
        // Values go into a TOML string: refuse anything that could break out of it.
        List<String> values = new ArrayList<>(List.of(settings.project(), siteDirName));
        if (reads) {
            values.add(settings.cloudflareD1DatabaseId().trim());
        }
        if (images) {
            values.add(settings.r2Bucket().trim());
        }
        for (String value : values) {
            if (!value.matches("[A-Za-z0-9_-]+")) {
                throw new IllegalStateException("Unsafe value for wrangler.toml");
            }
        }
        StringBuilder toml = new StringBuilder()
                .append("name = \"").append(settings.project()).append("\"\n")
                .append("pages_build_output_dir = \"").append(siteDirName).append("\"\n")
                .append("compatibility_date = \"").append(COMPATIBILITY_DATE).append("\"\n");
        if (reads) {
            toml.append("\n[[d1_databases]]\n")
                    .append("binding = \"READS\"\n")
                    .append("database_name = \"novel-reads\"\n")
                    .append("database_id = \"").append(settings.cloudflareD1DatabaseId().trim()).append("\"\n");
        }
        if (images) {
            toml.append("\n[[r2_buckets]]\n")
                    .append("binding = \"NOVEL_IMAGES\"\n")
                    .append("bucket_name = \"").append(settings.r2Bucket().trim()).append("\"\n");
        }
        return toml.toString();
    }

    /** Only the Functions' own paths run Functions, so pages, JS and CSS do not use the request quota. */
    private static String routes(boolean reads, boolean images) {
        List<String> include = new ArrayList<>();
        if (reads) {
            // Both: it is not documented whether "/api/reads/*" also matches the bare "/api/reads" (GET, index.js).
            include.add("\"/api/reads\"");
            include.add("\"/api/reads/*\"");
        }
        if (images) {
            include.add("\"/novel-images/*\"");
        }
        return "{\"version\":1,\"include\":[" + String.join(",", include) + "],\"exclude\":[]}\n";
    }

    private static void copy(String resource, Path target) throws IOException {
        try (InputStream in = new ClassPathResource(resource).getInputStream()) {
            Files.copy(in, target, StandardCopyOption.REPLACE_EXISTING);
        }
    }
}
