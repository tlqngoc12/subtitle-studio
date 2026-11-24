package com.subtitlestudio.publish;

import com.subtitlestudio.config.SubtitleStudioProperties;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Comparator;
import java.util.stream.Stream;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

/**
 * The Cloudflare Pages Functions behind novel read counts ({@code GET /api/reads}, {@code POST /api/reads/:slug})
 * and the {@code wrangler.toml} that binds them to a D1 database. {@code wrangler pages deploy <site>} picks up
 * {@code functions/} and {@code wrangler.toml} from its working directory, which is the parent of the site
 * directory, so they are written there. The database id is not a secret; the API token never goes into the file.
 */
@Component
public class ReadCountsFunctions {

    static final String FUNCTIONS_DIR = "functions";
    static final String CONFIG_FILE = "wrangler.toml";
    private static final String COMPATIBILITY_DATE = "2025-01-01";

    private final SubtitleStudioProperties.Publish settings;

    public ReadCountsFunctions(SubtitleStudioProperties properties) {
        this.settings = properties.publish();
    }

    /** Writes the functions and config beside {@code site} when read counts are on; otherwise removes any left over. */
    public void prepare(Path site) {
        Path root = site.toAbsolutePath().getParent();
        clean(root);
        if (!settings.readCountsEnabled()) {
            return;
        }
        try {
            Path api = root.resolve(FUNCTIONS_DIR).resolve("api").resolve("reads");
            Files.createDirectories(api);
            copy("public-functions/reads-get.js", api.resolve("index.js"));
            copy("public-functions/reads-post.js", api.resolve("[slug].js"));
            Files.writeString(root.resolve(CONFIG_FILE), config(site.toAbsolutePath().getFileName().toString()),
                    StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException("Could not prepare the read-count functions", e);
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
            throw new UncheckedIOException("Could not clean the read-count functions", e);
        }
    }

    private String config(String siteDirName) {
        // Values go into a TOML string: refuse anything that could break out of it.
        for (String value : new String[] {settings.project(), settings.cloudflareD1DatabaseId().trim(), siteDirName}) {
            if (!value.matches("[A-Za-z0-9_-]+")) {
                throw new IllegalStateException("Unsafe value for wrangler.toml");
            }
        }
        return "name = \"" + settings.project() + "\"\n"
                + "pages_build_output_dir = \"" + siteDirName + "\"\n"
                + "compatibility_date = \"" + COMPATIBILITY_DATE + "\"\n\n"
                + "[[d1_databases]]\n"
                + "binding = \"READS\"\n"
                + "database_name = \"novel-reads\"\n"
                + "database_id = \"" + settings.cloudflareD1DatabaseId().trim() + "\"\n";
    }

    private static void copy(String resource, Path target) throws IOException {
        try (InputStream in = new ClassPathResource(resource).getInputStream()) {
            Files.copy(in, target, StandardCopyOption.REPLACE_EXISTING);
        }
    }
}
