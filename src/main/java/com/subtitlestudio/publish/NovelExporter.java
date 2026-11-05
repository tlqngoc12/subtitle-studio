package com.subtitlestudio.publish;

import com.subtitlestudio.config.SubtitleStudioProperties;
import com.subtitlestudio.novel.Chapter;
import com.subtitlestudio.novel.ChapterText;
import com.subtitlestudio.novel.ChapterPageRepository;
import com.subtitlestudio.novel.ChapterPublishStatus;
import com.subtitlestudio.novel.ChapterRepository;
import com.subtitlestudio.novel.Novel;
import com.subtitlestudio.novel.NovelRepository;
import com.subtitlestudio.novel.render.RenderCache;
import com.subtitlestudio.novel.render.RenderInput;
import com.subtitlestudio.publish.PublicNovelDetail.PublicChapterRef;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.function.BiConsumer;
import java.util.function.Function;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Writes the public Novels data (spec section 7): novels with at least one published chapter, their published
 * chapters as drawn images. Chapter text, screenshots, notebooks and translation profiles never leave the app.
 */
@Component
public class NovelExporter {

    private final NovelRepository novels;
    private final ChapterRepository chapters;
    private final ChapterPageRepository pages;
    private final RenderCache renderCache;
    private final SubtitleStudioProperties properties;

    public NovelExporter(NovelRepository novels, ChapterRepository chapters, ChapterPageRepository pages,
                         RenderCache renderCache, SubtitleStudioProperties properties) {
        this.novels = novels;
        this.chapters = chapters;
        this.pages = pages;
        this.renderCache = renderCache;
        this.properties = properties;
    }

    /**
     * @param coverUrl copies an image into the site and returns its public URL (null when missing)
     * @param write    writes a JSON file
     */
    @Transactional(readOnly = true)
    public void export(Path dir, Function<Long, String> coverUrl, BiConsumer<Path, Object> write) {
        String watermark = watermark();
        List<PublicNovelSummary> summaries = new ArrayList<>();
        for (Novel n : novels.findAllByOrderByUpdatedAtDesc()) {
            List<Chapter> published = chapters.findByNovelIdOrderByChapterNo(n.getId()).stream()
                    .filter(c -> c.getPublishStatus() == ChapterPublishStatus.PUBLISHED).toList();
            if (published.isEmpty()) {
                continue;
            }
            String cover = n.getCover() == null ? null : coverUrl.apply(n.getCover().getId());
            List<String> tags = n.getTags() == null ? List.of() : Arrays.asList(n.getTags().split(","));
            for (int i = 0; i < published.size(); i++) {
                Chapter c = published.get(i);
                Integer prev = i > 0 ? published.get(i - 1).getChapterNo() : null;
                Integer next = i < published.size() - 1 ? published.get(i + 1).getChapterNo() : null;
                List<String> images = images(dir, n, c, watermark);
                write.accept(dir.resolve("data/novels/" + n.getSlug() + "/" + c.getChapterNo() + ".json"),
                        new PublicChapterFile(c.getChapterNo(), c.getTitle(), prev, next, images));
            }
            write.accept(dir.resolve("data/novels/" + n.getSlug() + ".json"), new PublicNovelDetail(n.getSlug(),
                    n.getTitle(), cover, n.getOriginalAuthor(), n.getDescription(), tags, n.getNovelStatus(),
                    n.getTranslatorCredit(), n.getSourceUrl(),
                    published.stream().map(c -> new PublicChapterRef(c.getChapterNo(), c.getTitle())).toList()));
            summaries.add(new PublicNovelSummary(n.getSlug(), n.getTitle(), cover, n.getOriginalAuthor(), tags,
                    n.getNovelStatus(), published.size(), n.getUpdatedAt()));
        }
        write.accept(dir.resolve("data/novels.json"), summaries);
    }

    private List<String> images(Path dir, Novel n, Chapter c, String watermark) {
        String text = ChapterText.of(c, pages.findByChapterIdOrderByPosition(c.getId()));
        List<Path> files = renderCache.imagesFor(c.getId(),
                new RenderInput(n.getTitle(), c.getChapterNo(), c.getTitle(), text, watermark));
        List<String> urls = new ArrayList<>();
        Path target = dir.resolve("novels").resolve(n.getSlug());
        try {
            Files.createDirectories(target);
            for (Path f : files) {
                Files.copy(f, target.resolve(f.getFileName()), StandardCopyOption.REPLACE_EXISTING);
                urls.add("/novels/" + n.getSlug() + "/" + f.getFileName());
            }
        } catch (IOException e) {
            throw new UncheckedIOException("Could not copy chapter images of " + n.getSlug(), e);
        }
        return urls;
    }

    /** The configured watermark, or the public site's host. */
    private String watermark() {
        String configured = properties.novel().watermarkText();
        if (!configured.isBlank()) {
            return configured;
        }
        String project = properties.publish().project();
        return project == null || project.isBlank() ? "Subtitle Studio" : project + ".pages.dev";
    }
}
