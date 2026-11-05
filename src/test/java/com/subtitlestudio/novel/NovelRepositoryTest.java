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
}
