package com.subtitlestudio.novel;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.subtitlestudio.profile.Media;
import com.subtitlestudio.profile.MediaRepository;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.test.context.ActiveProfiles;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@ActiveProfiles("test")
class NovelRepositoryTest {

    private static final Instant T0 = Instant.parse("2026-11-05T10:00:00Z");

    @Autowired
    private NovelRepository novels;

    @Autowired
    private ChapterRepository chapters;

    @Autowired
    private ChapterPageRepository pages;

    @Autowired
    private NovelNotebookRepository notebooks;

    @Autowired
    private MediaRepository media;

    @Autowired
    private TestEntityManager em;

    private Novel novel(String slug) {
        return novels.save(new Novel(slug, "Title " + slug, NovelStatus.ONGOING, T0));
    }

    private Media image() {
        return media.save(new Media("image/png", 10, "p.png", T0));
    }

    @Test
    void savesNovelWithChaptersPagesAndNotebook() {
        Novel n = novel("summer-love");
        Media cover = image();
        n.setCover(cover);
        n.setOriginalAuthor("ผู้เขียน");
        n.setDescription("Giới thiệu");
        n.setTags("romance,BL");
        n.setTranslatorCredit("Dịch: @byZenQN");
        n.setSourceUrl("https://example.com/book");
        n.setPromptProfile("SummerLove");
        Chapter c = chapters.save(new Chapter(n, 1, "Mở đầu", T0));
        String longText = "ạ".repeat(50_000);
        ChapterPage p = new ChapterPage(c, 1, image());
        p.setTextVi(longText);
        pages.save(p);
        notebooks.save(new NovelNotebook(n, 1, "{\"glossary\":[]}", T0));
        em.flush();
        em.clear();

        Novel loaded = novels.findBySlug("summer-love").orElseThrow();
        assertThat(loaded.getTitle()).isEqualTo("Title summer-love");
        assertThat(loaded.getCover().getId()).isEqualTo(cover.getId());
        assertThat(loaded.getOriginalAuthor()).isEqualTo("ผู้เขียน");
        assertThat(loaded.getTags()).isEqualTo("romance,BL");
        assertThat(loaded.getNovelStatus()).isEqualTo(NovelStatus.ONGOING);
        assertThat(loaded.getNotebookStatus()).isEqualTo(NotebookStatus.IDLE);
        assertThat(loaded.getPromptProfile()).isEqualTo("SummerLove");

        Chapter lc = chapters.findByNovelIdOrderByChapterNo(n.getId()).getFirst();
        assertThat(lc.getTitle()).isEqualTo("Mở đầu");
        assertThat(lc.getTranslationStatus()).isEqualTo(ChapterTranslationStatus.NONE);
        assertThat(lc.getPublishStatus()).isEqualTo(ChapterPublishStatus.DRAFT);
        assertThat(lc.isEditedAfterTranslation()).isFalse();
        assertThat(pages.findByChapterIdOrderByPosition(c.getId()).getFirst().getTextVi()).isEqualTo(longText);
        assertThat(notebooks.findByNovelIdAndAfterChapterNo(n.getId(), 1)).isPresent();
        assertThat(novels.existsBySlug("summer-love")).isTrue();
    }

    @Test
    void chapterNumberIsUniquePerNovel() {
        Novel a = novel("a");
        Novel b = novel("b");
        chapters.save(new Chapter(a, 1, null, T0));
        chapters.save(new Chapter(b, 1, null, T0));
        em.flush();

        assertThatThrownBy(() -> chapters.saveAndFlush(new Chapter(a, 1, null, T0))).isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void deletingNovelCascadesToChaptersPagesAndNotebooks() {
        Novel n = novel("gone");
        Chapter c = chapters.save(new Chapter(n, 1, null, T0));
        pages.save(new ChapterPage(c, 1, image()));
        notebooks.save(new NovelNotebook(n, 1, "{}", T0));
        em.flush();
        em.clear();

        novels.deleteById(n.getId());
        em.flush();
        em.clear();

        assertThat(chapters.count()).isZero();
        assertThat(pages.count()).isZero();
        assertThat(notebooks.count()).isZero();
    }

    @Test
    void findsLatestNotebookBeforeChapter() {
        Novel n = novel("nb");
        notebooks.save(new NovelNotebook(n, 2, "{}", T0));
        notebooks.save(new NovelNotebook(n, 5, "{}", T0));
        notebooks.save(new NovelNotebook(n, 9, "{}", T0));
        em.flush();

        assertThat(notebooks.findTopByNovelIdAndAfterChapterNoLessThanOrderByAfterChapterNoDesc(n.getId(), 9))
                .map(NovelNotebook::getAfterChapterNo).contains(5);
        assertThat(notebooks.findTopByNovelIdAndAfterChapterNoLessThanOrderByAfterChapterNoDesc(n.getId(), 2))
                .isEmpty();
        assertThat(notebooks.findByNovelIdOrderByAfterChapterNo(n.getId()))
                .extracting(NovelNotebook::getAfterChapterNo).containsExactly(2, 5, 9);
    }

    @Test
    void findsANovelByItsWattpadStoryId() {
        Novel n = novel("wp");
        n.setSourceType(NovelSourceType.WATTPAD);
        n.setWattpadStoryId("396487502");
        novels.flush();

        assertThat(novels.findByWattpadStoryId("396487502")).map(Novel::getId).contains(n.getId());
        assertThat(novels.findByWattpadStoryId("1")).isEmpty();
    }

    @Test
    void aWattpadStoryBelongsToOneNovel() {
        Novel a = novel("wp-a");
        a.setWattpadStoryId("5");
        novels.flush();
        Novel b = novel("wp-b");
        b.setWattpadStoryId("5");

        assertThatThrownBy(() -> novels.flush()).isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void severalScreenshotNovelsMayHaveNoStoryId() {
        novel("s1");
        novel("s2");

        novels.flush();
    }

    @Test
    void storesChapterSourceTextAndFindsItByPartId() {
        Novel n = novel("wp-text");
        Chapter c = new Chapter(n, 1, "Prologue", T0);
        c.setSourceText("Line one.\n\nLine two.");
        c.setWattpadPartId("1552276256");
        c.setSourceFetchedAt(T0);
        chapters.save(c);
        chapters.save(new Chapter(n, 2, "Screenshot chapter", T0));
        chapters.save(new Chapter(n, 3, "Another screenshot chapter", T0));
        chapters.flush();
        em.clear();

        Chapter found = chapters.findByNovelIdAndWattpadPartId(n.getId(), "1552276256").orElseThrow();

        assertThat(found.getSourceText()).isEqualTo("Line one.\n\nLine two.");
        assertThat(found.getSourceFetchedAt()).isEqualTo(T0);
        assertThat(found.hasSourceText()).isTrue();
        assertThat(chapters.findByNovelIdAndWattpadPartId(n.getId(), "2")).isEmpty();
        assertThat(chapters.findByNovelIdAndWattpadPartIdIsNotNull(n.getId())).hasSize(1);
    }

    @Test
    void aPartIsImportedOnce() {
        Novel n = novel("wp-dup");
        Chapter a = new Chapter(n, 1, "A", T0);
        a.setWattpadPartId("77");
        chapters.save(a);
        Chapter b = new Chapter(n, 2, "B", T0);
        b.setWattpadPartId("77");

        assertThatThrownBy(() -> chapters.saveAndFlush(b)).isInstanceOf(DataIntegrityViolationException.class);
    }
}
