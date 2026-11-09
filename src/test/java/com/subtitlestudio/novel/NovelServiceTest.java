package com.subtitlestudio.novel;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.subtitlestudio.config.SubtitleStudioProperties;
import com.subtitlestudio.profile.FieldError;
import com.subtitlestudio.profile.ImageSniffer;
import com.subtitlestudio.profile.Media;
import com.subtitlestudio.profile.MediaRepository;
import com.subtitlestudio.profile.MediaService;
import com.subtitlestudio.test.MutableClock;
import com.subtitlestudio.translate.PromptProfileStore;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@ActiveProfiles("test")
@Import({com.subtitlestudio.novel.render.NovelRenderConfig.class, TranslatingModels.class, NovelService.class, NovelValidator.class, MediaService.class, ImageSniffer.class, PromptProfileStore.class, NovelProfileStore.class,
    NovelServiceTest.Config.class})
class NovelServiceTest {

    static final Instant NOW = Instant.parse("2026-11-05T10:00:00Z");

    @TempDir
    static Path dataDir;

    @TestConfiguration
    static class Config {
        @Bean
        MutableClock clock() {
            return new MutableClock(NOW);
        }

        @Bean
        SubtitleStudioProperties properties() {
            return new SubtitleStudioProperties(
                    new SubtitleStudioProperties.Ytdlp("yt-dlp", Duration.ofSeconds(60)), dataDir,
                    new SubtitleStudioProperties.Gemini("", "m", Duration.ofMinutes(3), Duration.ofMinutes(60), 0.3,
                            List.of()),
                    new SubtitleStudioProperties.Publish("", "", "", false, "wrangler", Duration.ofMinutes(5)));
        }
    }

    @BeforeAll
    static void profiles() throws IOException {
        Files.createDirectories(dataDir.resolve("prompts/novels"));
        Files.writeString(dataDir.resolve("prompts/novels/SummerLove.md"), "Ngôn ngữ gốc: tiếng Thái");
    }

    @Autowired
    private NovelService service;

    @Autowired
    private MediaService mediaService;

    @Autowired
    private MediaRepository media;

    @Autowired
    private ChapterRepository chapters;

    @Autowired
    private ChapterPageRepository pages;

    @Autowired
    private TestEntityManager em;

    static NovelRequest valid() {
        return new NovelRequest("summer-love", "Tình Yêu Mùa Hạ", null, "ผู้เขียน", "Giới thiệu",
                List.of("romance", "BL"), NovelStatus.ONGOING, "Dịch: @byZenQN", "https://example.com/book",
                "SummerLove");
    }

    private List<FieldError> errorsOf(NovelRequest request) {
        try {
            service.create(request);
        } catch (InvalidNovelException e) {
            return e.errors();
        }
        throw new AssertionError("expected InvalidNovelException");
    }

    private static NovelRequest copy(NovelRequest r, String slug, String title, String description, List<String> tags,
                                     NovelStatus status, String sourceUrl, String profile) {
        return new NovelRequest(slug, title, r.coverMediaId(), r.originalAuthor(), description, tags, status,
                r.translatorCredit(), sourceUrl, profile);
    }

    @Test
    void rejectsBadFields() {
        NovelRequest v = valid();
        assertThat(errorsOf(copy(v, "Bad Slug", v.title(), v.description(), v.tags(), v.novelStatus(), v.sourceUrl(),
                v.promptProfile())))
                .containsExactly(new FieldError("slug", "Use lowercase letters, numbers and single hyphens."));
        assertThat(errorsOf(copy(v, v.slug(), "  ", v.description(), v.tags(), v.novelStatus(), v.sourceUrl(),
                v.promptProfile())))
                .containsExactly(new FieldError("title", "Title is required."));
        assertThat(errorsOf(copy(v, v.slug(), "x".repeat(201), v.description(), v.tags(), v.novelStatus(),
                v.sourceUrl(), v.promptProfile())))
                .extracting(FieldError::field).containsExactly("title");
        assertThat(errorsOf(copy(v, v.slug(), v.title(), "x".repeat(5001), v.tags(), v.novelStatus(), v.sourceUrl(),
                v.promptProfile())))
                .extracting(FieldError::field).containsExactly("description");
        assertThat(errorsOf(copy(v, v.slug(), v.title(), v.description(),
                List.of("a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k"), v.novelStatus(), v.sourceUrl(),
                v.promptProfile())))
                .extracting(FieldError::field).containsExactly("tags");
        assertThat(errorsOf(copy(v, v.slug(), v.title(), v.description(), List.of("x".repeat(41)), v.novelStatus(),
                v.sourceUrl(), v.promptProfile())))
                .extracting(FieldError::field).containsExactly("tags");
        assertThat(errorsOf(copy(v, v.slug(), v.title(), v.description(), v.tags(), v.novelStatus(),
                "javascript:alert(1)", v.promptProfile())))
                .containsExactly(new FieldError("sourceUrl", "Use an http(s) link."));
        assertThat(errorsOf(copy(v, v.slug(), v.title(), v.description(), v.tags(), null, v.sourceUrl(),
                v.promptProfile())))
                .extracting(FieldError::field).containsExactly("novelStatus");
        assertThat(errorsOf(copy(v, v.slug(), v.title(), v.description(), v.tags(), v.novelStatus(), v.sourceUrl(),
                "Nope")))
                .containsExactly(new FieldError("promptProfile", "Unknown translation profile."));
    }

    @Test
    void vietsubProfileIsNotANovelProfile() throws IOException {
        Files.writeString(dataDir.resolve("prompts/EmiBonnie.md"), "vlog");
        NovelRequest v = valid();

        assertThat(errorsOf(copy(v, v.slug(), v.title(), v.description(), v.tags(), v.novelStatus(), v.sourceUrl(),
                "EmiBonnie")))
                .containsExactly(new FieldError("promptProfile", "Unknown translation profile."));
    }

    @Test
    void promptProfileIsOptional() {
        NovelRequest v = valid();
        NovelDetail d = service.create(copy(v, v.slug(), v.title(), v.description(), v.tags(), v.novelStatus(),
                v.sourceUrl(), null));

        assertThat(d.promptProfile()).isNull();
    }

    @Test
    void createsAndListsNovel() {
        NovelDetail d = service.create(valid());

        assertThat(d.slug()).isEqualTo("summer-love");
        assertThat(d.tags()).containsExactly("romance", "BL");
        assertThat(d.notebookStatus()).isEqualTo(NotebookStatus.IDLE);
        assertThat(d.chapters()).isEmpty();
        assertThat(service.list()).singleElement().satisfies(s -> {
            assertThat(s.title()).isEqualTo("Tình Yêu Mùa Hạ");
            assertThat(s.chapterCount()).isZero();
            assertThat(s.publishedCount()).isZero();
            assertThat(s.coverUrl()).isNull();
        });
    }

    @Test
    void trimsTagsAndDropsEmpty() {
        NovelRequest v = valid();
        NovelDetail d = service.create(copy(v, v.slug(), v.title(), v.description(), List.of(" romance ", "", "BL"),
                v.novelStatus(), v.sourceUrl(), v.promptProfile()));

        assertThat(d.tags()).containsExactly("romance", "BL");
    }

    @Test
    void coverUrlPointsAtMedia() {
        Media cover = mediaService.store("c.png", TestImages.png());
        NovelRequest v = valid();
        NovelDetail d = service.create(new NovelRequest(v.slug(), v.title(), cover.getId(), null, null, List.of(),
                v.novelStatus(), null, null, null));

        assertThat(d.coverMediaId()).isEqualTo(cover.getId());
        assertThat(d.coverUrl()).isEqualTo("/api/media/" + cover.getId());
    }

    @Test
    void duplicateSlugIsRejected() {
        service.create(valid());

        assertThatThrownBy(() -> service.create(valid())).isInstanceOf(DuplicateNovelSlugException.class);
    }

    @Test
    void updateChangesFieldsAndKeepsSlugCheck() {
        NovelDetail a = service.create(valid());
        NovelRequest v = valid();
        service.create(copy(v, "other", v.title(), v.description(), v.tags(), v.novelStatus(), v.sourceUrl(),
                v.promptProfile()));

        NovelDetail updated = service.update(a.id(), copy(v, v.slug(), "Mới", v.description(), v.tags(),
                NovelStatus.COMPLETED, v.sourceUrl(), v.promptProfile()));

        assertThat(updated.title()).isEqualTo("Mới");
        assertThat(updated.novelStatus()).isEqualTo(NovelStatus.COMPLETED);
        assertThatThrownBy(() -> service.update(a.id(), copy(v, "other", v.title(), v.description(), v.tags(),
                v.novelStatus(), v.sourceUrl(), v.promptProfile()))).isInstanceOf(DuplicateNovelSlugException.class);
    }

    @Test
    void missingNovelIsNotFound() {
        assertThatThrownBy(() -> service.get(999)).isInstanceOf(NovelNotFoundException.class);
    }

    @Test
    void deleteRemovesChaptersAndUnusedImages() throws IOException {
        Media cover = mediaService.store("c.png", TestImages.png());
        Media page = mediaService.store("p.png", TestImages.png());
        NovelRequest v = valid();
        NovelDetail d = service.create(new NovelRequest(v.slug(), v.title(), cover.getId(), null, null, List.of(),
                v.novelStatus(), null, null, null));
        Novel novel = em.find(Novel.class, d.id());
        Chapter chapter = chapters.save(new Chapter(novel, 1, null, NOW));
        pages.save(new ChapterPage(chapter, 1, page));
        em.flush();
        em.clear();
        Path cached = dataDir.resolve("novel-render").resolve(String.valueOf(chapter.getId()));
        Files.createDirectories(cached);
        Files.writeString(cached.resolve("x.count"), "1");

        service.delete(d.id());
        em.flush();
        em.clear();

        assertThat(chapters.count()).isZero();
        assertThat(media.findById(cover.getId())).isEmpty();
        assertThat(media.findById(page.getId())).isEmpty();
        assertThatThrownBy(() -> service.get(d.id())).isInstanceOf(NovelNotFoundException.class);
        assertThat(cached).doesNotExist();
    }

    @Test
    void chapterListFollowsTheReadingOrder() {
        NovelDetail d = service.create(valid());
        Novel novel = em.find(Novel.class, d.id());
        Chapter one = new Chapter(novel, 1, null, NOW);
        Chapter two = new Chapter(novel, 2, null, NOW);
        one.setSortOrder(2);
        two.setSortOrder(1);
        chapters.save(one);
        chapters.save(two);
        em.flush();
        em.clear();

        assertThat(service.get(d.id()).chapters()).extracting(ChapterSummary::chapterNo).containsExactly(2, 1);
    }

    @Test
    void summaryCountsSuspectPages() {
        NovelDetail d = service.create(valid());
        Novel novel = em.find(Novel.class, d.id());
        Chapter chapter = chapters.save(new Chapter(novel, 1, null, NOW));
        String source = "ก".repeat(200);
        for (int i = 0; i < 6; i++) {
            ChapterPage p = new ChapterPage(chapter, i + 1, mediaService.store("p.png", TestImages.png()));
            p.setSourceTh(source);
            p.setTextVi("a".repeat(i == 5 ? 80 : 200));
            pages.save(p);
        }
        em.flush();
        em.clear();

        assertThat(service.get(d.id()).chapters()).singleElement()
                .satisfies(c -> assertThat(c.suspectPages()).isEqualTo(1));
    }
}
