package com.subtitlestudio.subtitle;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import java.io.IOException;
import java.net.URISyntaxException;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.TestFactory;

/**
 * Regression test on real YouTube subtitles (PLAN 4.5 "golden files").
 *
 * <p>The fixtures are other people's subtitles, so they are NOT committed (the repo is public):
 * {@code src/test/resources/golden/} is git-ignored and this test is skipped when it is absent.
 * Each case is {@code <name>.<MANUAL|AUTO>.vtt} (original from yt-dlp) plus {@code <name>.srt}
 * (output that was checked by hand). See PROGRESS.md for how to (re)create them.
 */
class GoldenSubtitleTest {

    private final VttParser parser = new VttParser();
    private final CaptionNormalizer normalizer = new CaptionNormalizer();
    private final SrtWriter writer = new SrtWriter();

    @TestFactory
    Stream<DynamicTest> realSubtitlesStillProduceTheVerifiedSrt() throws IOException, URISyntaxException {
        URL dirUrl = getClass().getClassLoader().getResource("golden");
        assumeTrue(dirUrl != null, "No local golden files (src/test/resources/golden is git-ignored)");
        Path dir = Path.of(dirUrl.toURI());

        List<Path> vtts;
        try (Stream<Path> files = Files.list(dir)) {
            vtts = files.filter(p -> p.getFileName().toString().endsWith(".vtt")).sorted().toList();
        }
        assumeTrue(!vtts.isEmpty(), "Golden directory has no .vtt files");

        return vtts.stream().map(vtt -> DynamicTest.dynamicTest(vtt.getFileName().toString(), () -> {
            String[] parts = vtt.getFileName().toString().split("\\.");
            String name = parts[0];
            SourceType type = SourceType.valueOf(parts[1]);
            String expected = Files.readString(dir.resolve(name + ".srt"), StandardCharsets.UTF_8);

            List<Cue> cues = normalizer.normalize(parser.parse(Files.readString(vtt, StandardCharsets.UTF_8)), type);

            assertThat(writer.write(cues)).isEqualTo(expected);
        }));
    }
}
