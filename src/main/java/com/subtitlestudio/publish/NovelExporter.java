package com.subtitlestudio.publish;

import com.subtitlestudio.config.SubtitleStudioProperties;
import com.subtitlestudio.novel.Chapter;
import com.subtitlestudio.novel.ChapterText;
import com.subtitlestudio.novel.ChapterPageRepository;
import com.subtitlestudio.novel.ChapterPublishStatus;
import com.subtitlestudio.novel.ChapterRepository;
import com.subtitlestudio.novel.Novel;
import com.subtitlestudio.novel.NovelRepository;
import com.subtitlestudio.novel.NovelSourceType;
import com.subtitlestudio.novel.render.PageFormat;
import com.subtitlestudio.novel.render.RenderCache;
import com.subtitlestudio.novel.render.RenderInput;
import com.subtitlestudio.profile.MediaService;
import com.subtitlestudio.novel.render.RenderedFormat;
import com.subtitlestudio.publish.PublicNovelDetail.PublicChapterRef;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.function.BiConsumer;
import java.util.function.Function;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Writes the public Novels data (spec section 7): novels with at least one published chapter, their published
 * chapters as drawn images. Chapter text, screenshots and translation profiles never leave the app.
 */
@Component
public class NovelExporter {

    private final NovelRepository novels;
    private final ChapterRepository chapters;
    private final ChapterPageRepository pages;
    private final RenderCache renderCache;
    private final MediaService mediaService;
    private final SubtitleStudioProperties properties;

    public NovelExporter(NovelRepository novels, ChapterRepository chapters, ChapterPageRepository pages,
                         RenderCache renderCache, MediaService mediaService, SubtitleStudioProperties properties) {
        this.novels = novels;
        this.chapters = chapters;
        this.pages = pages;
        this.renderCache = renderCache;
        this.mediaService = mediaService;
        this.properties = properties;
    }

    /**
     * @param coverUrl copies an image into the site and returns its public URL (null when missing)
     * @param write    writes a JSON file
     * @return every chapter image of the site. With R2 on they are not copied into {@code dir}: the publish uploads them
     *         to the bucket instead (chapter JSON still points at {@code /novel-images/...}).
     */
    @Transactional(readOnly = true)
    public List<ChapterImage> export(Path dir, Function<Long, String> coverUrl, BiConsumer<Path, Object> write) {
        String watermark = watermark();
        List<ChapterImage> chapterImages = new ArrayList<>();
        List<PublicNovelSummary> summaries = new ArrayList<>();
        for (Novel n : novels.findAllByOrderByUpdatedAtDesc()) {
            List<Chapter> all = chapters.findByNovelIdOrderBySortOrderAscChapterNoAsc(n.getId());
            List<Chapter> published = all.stream()
                    .filter(c -> c.getPublishStatus() == ChapterPublishStatus.PUBLISHED).toList();
            if (published.isEmpty()) {
                continue;
            }
            String cover = n.getCover() == null ? null : coverUrl.apply(n.getCover().getId());
            boolean original = n.getSourceType() == NovelSourceType.ORIGINAL;
            List<String> tags = n.getTags() == null ? List.of() : Arrays.asList(n.getTags().split(","));
            for (int i = 0; i < published.size(); i++) {
                Chapter c = published.get(i);
                Integer prev = i > 0 ? published.get(i - 1).getChapterNo() : null;
                Integer next = i < published.size() - 1 ? published.get(i + 1).getChapterNo() : null;
                List<PublicPageFormat> formats = formats(dir, n, c, watermark, chapterImages);
                List<String> images = formats.stream().filter(f -> PageFormat.S.key().equals(f.key()))
                        .findFirst().orElseThrow().images();
                write.accept(dir.resolve("data/novels/" + n.getSlug() + "/" + c.getChapterNo() + ".json"),
                        new PublicChapterFile(c.getChapterNo(), c.getTitle(), c.getLabel(), prev, next, images, formats));
            }
            write.accept(dir.resolve("data/novels/" + n.getSlug() + ".json"), new PublicNovelDetail(n.getSlug(),
                    n.getTitle(), cover, n.getOriginalAuthor(), n.getDescription(), tags, n.getNovelStatus(),
                    n.getTranslatorCredit(), n.getSourceUrl(), n.getTrailerVideoId(),
                    published.stream().map(c -> new PublicChapterRef(c.getChapterNo(), c.getTitle(), c.getLabel(),
                            c.getPublishedAt())).toList(), original));
            summaries.add(new PublicNovelSummary(n.getSlug(), n.getTitle(), cover, n.getOriginalAuthor(), tags,
                    n.getNovelStatus(), published.size(), all.size(), lastPublishedAt(published), n.getUpdatedAt(), n.isFeatured(),
                    n.getCreatedAt(), n.getDescription(), original));
        }
        write.accept(dir.resolve("data/novels.json"), summaries);
        return chapterImages;
    }

    /** The latest publish date among the published chapters (drafts never count). */
    private static Instant lastPublishedAt(List<Chapter> published) {
        return published.stream().map(Chapter::getPublishedAt).filter(Objects::nonNull).max(Comparator.naturalOrder())
                .orElse(null);
    }

    private List<PublicPageFormat> formats(Path dir, Novel n, Chapter c, String watermark, List<ChapterImage> chapterImages) {
        String text = ChapterText.of(c, pages.findByChapterIdOrderByPosition(c.getId()));
        List<RenderedFormat> rendered = renderCache.imagesFor(c.getId(),
                new RenderInput(n.getTitle(), c.getChapterNo(), c.getLabel(), c.getTitle(), text, watermark,
                        mediaService::loadImage));
        boolean r2 = properties.publish().r2Enabled();
        Path target = dir.resolve("novel-images").resolve(n.getSlug());
        List<PublicPageFormat> result = new ArrayList<>();
        try {
            if (!r2) {
                Files.createDirectories(target);
            }
            for (RenderedFormat r : rendered) {
                List<String> urls = new ArrayList<>();
                for (Path f : r.files()) {
                    String url = "/novel-images/" + n.getSlug() + "/" + f.getFileName();
                    if (!r2) {
                        Files.copy(f, target.resolve(f.getFileName()), StandardCopyOption.REPLACE_EXISTING);
                    }
                    chapterImages.add(new ChapterImage(url.substring(1), f));
                    urls.add(url);
                }
                result.add(new PublicPageFormat(r.format().key(), r.format().width(), r.format().height(), urls));
            }
        } catch (IOException e) {
            throw new UncheckedIOException("Could not copy chapter images of " + n.getSlug(), e);
        }
        return result;
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
