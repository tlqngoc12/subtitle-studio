package com.subtitlestudio.novel;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Zips every chapter of a novel that has text: one {@code .md} (archive) and one paste-ready {@code .html} each
 * (spec docs/superpowers/specs/2026-11-18-novel-chapter-export-design.md). Never logs chapter text.
 */
@Service
public class NovelExportService {

    private static final Logger log = LoggerFactory.getLogger(NovelExportService.class);

    public record NovelExport(String fileName, byte[] zip) {
    }

    private record Exported(Chapter chapter, String text, int position) {
    }

    private final NovelRepository novels;
    private final ChapterRepository chapters;
    private final ChapterPageRepository pages;
    private final Clock clock;

    public NovelExportService(NovelRepository novels, ChapterRepository chapters, ChapterPageRepository pages,
                              Clock clock) {
        this.novels = novels;
        this.chapters = chapters;
        this.pages = pages;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public NovelExport export(long novelId) {
        Novel novel = novels.findById(novelId).orElseThrow(() -> new NovelNotFoundException(novelId));
        Map<Long, List<ChapterPage>> pagesByChapter = new HashMap<>();
        for (ChapterPage p : pages.findByChapterNovelId(novelId)) {
            pagesByChapter.computeIfAbsent(p.getChapter().getId(), k -> new ArrayList<>()).add(p);
        }
        List<Exported> withText = new ArrayList<>();
        List<Chapter> all = chapters.findByNovelIdOrderBySortOrderAscChapterNoAsc(novelId);
        for (int i = 0; i < all.size(); i++) {
            Chapter c = all.get(i);
            String text = textOf(c, pagesByChapter.getOrDefault(c.getId(), List.of()));
            if (!text.isBlank()) {
                // The number is the chapter's place in the full reading order, so it matches review file names.
                withText.add(new Exported(c, text, i + 1));
            }
        }
        if (withText.isEmpty()) {
            throw new NothingToExportException(novelId);
        }
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(bytes, StandardCharsets.UTF_8)) {
            for (int i = 0; i < withText.size(); i++) {
                Exported e = withText.get(i);
                String heading = ChapterExportFormat.heading(e.chapter().getTitle());
                String base = ChapterExportFormat.fileBase(e.position(), all.size(), heading);
                add(zip, base + ".md", ChapterExportFormat.markdown(heading, e.text()));
                add(zip, base + ".html", ChapterExportFormat.html(heading, e.text()));
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        log.info("Exported novel {} ({} chapters)", novelId, withText.size());
        String date = LocalDate.now(clock.withZone(ZoneId.systemDefault())).toString();
        return new NovelExport(novel.getSlug() + "-" + date + ".zip", bytes.toByteArray());
    }

    /** One chapter as a zip with its {@code .md} and {@code .html}. */
    @Transactional(readOnly = true)
    public NovelExport exportChapter(long chapterId) {
        Chapter chapter = chapters.findById(chapterId).orElseThrow(() -> new ChapterNotFoundException(chapterId));
        String text = textOf(chapter, pages.findByChapterIdOrderByPosition(chapterId));
        if (text.isBlank()) {
            throw NothingToExportException.forChapter(chapterId);
        }
        String heading = ChapterExportFormat.heading(chapter.getTitle());
        List<Chapter> all = chapters.findByNovelIdOrderBySortOrderAscChapterNoAsc(chapter.getNovel().getId());
        int position = 1;
        for (int i = 0; i < all.size(); i++) {
            if (all.get(i).getId().equals(chapterId)) {
                position = i + 1;
            }
        }
        String base = ChapterExportFormat.fileBase(position, all.size(), heading);
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(bytes, StandardCharsets.UTF_8)) {
            add(zip, base + ".md", ChapterExportFormat.markdown(heading, text));
            add(zip, base + ".html", ChapterExportFormat.html(heading, text));
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        log.info("Exported chapter {} of novel {}", chapterId, chapter.getNovel().getId());
        String date = LocalDate.now(clock.withZone(ZoneId.systemDefault())).toString();
        return new NovelExport(chapter.getNovel().getSlug() + "-"
                + ChapterTitles.reviewKey(chapter.getTitle()).orElse("chapter-" + chapter.getChapterNo()) + "-" + date
                + ".zip", bytes.toByteArray());
    }

    private static String textOf(Chapter c, List<ChapterPage> chapterPages) {
        List<ChapterPage> own = new ArrayList<>(chapterPages);
        own.sort(Comparator.comparingInt(ChapterPage::getPosition));
        return ChapterText.of(c, own);
    }

    private static void add(ZipOutputStream zip, String name, String content) throws IOException {
        zip.putNextEntry(new ZipEntry(name));
        zip.write(content.getBytes(StandardCharsets.UTF_8));
        zip.closeEntry();
    }
}
