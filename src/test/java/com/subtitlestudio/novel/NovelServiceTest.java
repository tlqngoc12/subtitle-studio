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
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
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
@Import({com.subtitlestudio.novel.render.NovelRenderConfig.class, TranslatingModels.class, NovelService.class, NovelValidator.class, com.subtitlestudio.url.UrlParser.class, MediaService.class, com.subtitlestudio.profile.MediaStorage.class, com.subtitlestudio.profile.MediaFiler.class, ImageSniffer.class, com.subtitlestudio.profile.ImageResizer.class, PromptProfileStore.class, NovelProfileStore.class,
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
        com.subtitlestudio.config.GeminiSettings geminiSettings(SubtitleStudioProperties properties) {
            return com.subtitlestudio.config.GeminiSettings.fixed(properties.gemini());
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
    private ChapterImageRepository chapterImages;

    @Autowired
    private TestEntityManager em;

    static NovelRequest valid() {
        return new NovelRequest("summer-love", "Tình Yêu Mùa Hạ", null, "ผู้เขียน", "Giới thiệu",
                List.of("romance", "BL"), NovelStatus.ONGOING, "Dịch: @byZenQN", "https://example.com/book",
                "SummerLove", null);
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
                r.translatorCredit(), sourceUrl, profile, r.trailerUrl());
    }

    private static NovelRequest withTrailer(NovelRequest r, String trailerUrl) {
        return new NovelRequest(r.slug(), r.title(), r.coverMediaId(), r.originalAuthor(), r.description(), r.tags(),
                r.novelStatus(), r.translatorCredit(), r.sourceUrl(), r.promptProfile(), trailerUrl);
    }

    private static NovelRequest original(String slug, String title, String author, String profile) {
        return new NovelRequest(slug, title, null, author, "Một câu chuyện", List.of("GL", "romance"),
                NovelStatus.ONGOING, "ignored credit", "https://example.com/x", profile, null,
                NovelSourceType.ORIGINAL, "th", null, null);
    }

    @Test
    void validatorAcceptsOriginalWithVi() {
        NovelDetail d = service.create(original("my-story", "Câu chuyện của tôi", "EmiBonnie", null));

        assertThat(d.sourceType()).isEqualTo(NovelSourceType.ORIGINAL);
        assertThat(d.sourceLanguage()).isEqualTo("vi");
        assertThat(d.translatorCredit()).isNull();
        assertThat(d.sourceUrl()).isNull();
        assertThat(d.wattpadStoryId()).isNull();
    }

    @Test
    void theListAndTheChapterDetailCarryTheKind() {
        NovelDetail d = service.create(original("kind-list", "Kind", "A", "SummerLove"));

        assertThat(service.list()).filteredOn(s -> s.id() == d.id()).extracting(NovelSummary::sourceType)
                .containsExactly(NovelSourceType.ORIGINAL);
        assertThat(service.list()).extracting(NovelSummary::sourceType).doesNotContainNull();
    }

    @Test
    void validatorRejectsViForOthers() {
        NovelRequest r = valid();
        NovelRequest vi = new NovelRequest(r.slug(), r.title(), null, r.originalAuthor(), r.description(), r.tags(),
                r.novelStatus(), r.translatorCredit(), r.sourceUrl(), r.promptProfile(), null,
                NovelSourceType.SCREENSHOTS, "vi", null, null);

        assertThat(errorsOf(vi)).extracting(FieldError::field).containsExactly("sourceLanguage");
    }

    @Test
    void originalRequiresAuthor() {
        assertThat(errorsOf(original("my-story", "Truyện", " ", null)))
                .containsExactly(new FieldError("originalAuthor", "Author is required."));
    }

    @Test
    void createOriginalMakesProfileFromOriginalTemplate() throws IOException {
        NovelDetail d = service.create(original("my-story", "Truyện Của Tôi", "EmiBonnie", null));

        assertThat(d.promptProfile()).isEqualTo("TruyenCuaToi");
        String profile = Files.readString(dataDir.resolve("prompts/novels/TruyenCuaToi.md"));
        assertThat(profile).contains("## Kiểm tra", "Truyện Của Tôi", "EmiBonnie")
                .doesNotContain("## Ngôn ngữ gốc").doesNotContain("{{");
    }

    @Test
    void originalProfileNameAvoidsCollision() throws IOException {
        NovelDetail first = service.create(original("story-1", "Cùng Tên", "A", null));
        NovelDetail second = service.create(original("story-2", "Cùng Tên", "B", null));

        assertThat(first.promptProfile()).isEqualTo("CungTen");
        assertThat(second.promptProfile()).isEqualTo("CungTen-2");
        assertThat(Files.readString(dataDir.resolve("prompts/novels/CungTen-2.md"))).contains("B");
    }

    @Test
    void anOriginalWithAChosenProfileKeepsIt() {
        NovelDetail d = service.create(original("chosen", "Truyện", "A", "SummerLove"));

        assertThat(d.promptProfile()).isEqualTo("SummerLove");
    }

    @Test
    void theNewProfileIsRemovedWhenTheNovelCannotBeCreated() {
        service.create(original("dup", "Truyện Một", "A", null));

        assertThatThrownBy(() -> service.create(original("dup", "Truyện Hai", "A", null)))
                .isInstanceOf(DuplicateNovelSlugException.class);
        assertThat(dataDir.resolve("prompts/novels/TruyenHai.md")).doesNotExist();
    }

    @Test
    void editingAnOriginalKeepsItsKindAndLanguage() {
        NovelDetail d = service.create(original("edit-me", "Truyện", "A", null));
        NovelRequest edit = new NovelRequest("edit-me", "Truyện mới", null, "B", "d", List.of(), NovelStatus.COMPLETED,
                null, null, d.promptProfile(), null, null, null, null, null);

        NovelDetail edited = service.update(d.id(), edit);

        assertThat(edited.sourceType()).isEqualTo(NovelSourceType.ORIGINAL);
        assertThat(edited.sourceLanguage()).isEqualTo("vi");
        assertThat(edited.originalAuthor()).isEqualTo("B");
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            "https://youtube.com/watch?v=dQw4w9WgXcQ&t=30s",
            "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
            "http://www.youtube.com/watch?v=dQw4w9WgXcQ",
            "youtube.com/watch?v=dQw4w9WgXcQ",
            "https://youtu.be/dQw4w9WgXcQ",
            "https://youtu.be/dQw4w9WgXcQ?si=abc",
            "https://www.youtube.com/shorts/dQw4w9WgXcQ",
            "https://m.youtube.com/shorts/dQw4w9WgXcQ",
            "https://www.youtube.com/embed/dQw4w9WgXcQ",
            "https://youtube.com/embed/dQw4w9WgXcQ?start=3",
            "  https://youtu.be/dQw4w9WgXcQ  ",
            "dQw4w9WgXcQ"})
    void storesTheVideoIdOfEveryAcceptedTrailerForm(String url) {
        NovelDetail d = service.create(withTrailer(valid(), url));

        assertThat(d.trailerVideoId()).isEqualTo("dQw4w9WgXcQ");
        assertThat(service.get(d.id()).trailerVideoId()).isEqualTo("dQw4w9WgXcQ");
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "https://vimeo.com/76979871",
            "https://example.com/watch?v=dQw4w9WgXcQ",
            "https://notyoutube.com/watch?v=dQw4w9WgXcQ",
            "https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ",
            "https://www.youtube.com/watch?v=short",
            "https://www.youtube.com/watch",
            "https://www.youtube.com/playlist?list=PLabcdefghijk",
            "https://youtu.be/",
            "javascript:alert(1)",
            "ftp://youtu.be/dQw4w9WgXcQ",
            "not a link",
            "https://www.youtube.com/watch?v=dQw4w9WgXc!"})
    void rejectsInvalidAndNonYouTubeTrailers(String url) {
        assertThat(errorsOf(withTrailer(valid(), url)))
                .containsExactly(new FieldError("trailerUrl", "Use a YouTube link (youtube.com or youtu.be)."));
    }

    @Test
    void rejectsAnOverlongTrailerLink() {
        assertThat(errorsOf(withTrailer(valid(), "https://youtu.be/dQw4w9WgXcQ?" + "a".repeat(1_000))))
                .extracting(FieldError::field).containsExactly("trailerUrl");
    }

    @Test
    void blankTrailerClearsIt() {
        NovelDetail d = service.create(withTrailer(valid(), "https://youtu.be/dQw4w9WgXcQ"));
        assertThat(d.trailerVideoId()).isEqualTo("dQw4w9WgXcQ");

        assertThat(service.update(d.id(), withTrailer(valid(), "   ")).trailerVideoId()).isNull();
        assertThat(service.update(d.id(), withTrailer(valid(), "https://youtu.be/dQw4w9WgXcQ")).trailerVideoId())
                .isEqualTo("dQw4w9WgXcQ");
        assertThat(service.update(d.id(), withTrailer(valid(), null)).trailerVideoId()).isNull();
        assertThat(service.get(d.id()).trailerVideoId()).isNull();
    }

    @Test
    void updateReplacesTheTrailerAndAnInvalidOneKeepsTheOld() {
        NovelDetail d = service.create(withTrailer(valid(), "https://youtu.be/dQw4w9WgXcQ"));

        assertThat(service.update(d.id(), withTrailer(valid(), "https://youtu.be/aaaaaaaaaaa")).trailerVideoId())
                .isEqualTo("aaaaaaaaaaa");
        assertThatThrownBy(() -> service.update(d.id(), withTrailer(valid(), "https://vimeo.com/1")))
                .isInstanceOf(InvalidNovelException.class);
        assertThat(service.get(d.id()).trailerVideoId()).isEqualTo("aaaaaaaaaaa");
    }

    @Test
    void trailerIsOptional() {
        assertThat(service.create(valid()).trailerVideoId()).isNull();
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
        assertThat(d.chapters()).isEmpty();
        assertThat(service.list()).singleElement().satisfies(s -> {
            assertThat(s.title()).isEqualTo("Tình Yêu Mùa Hạ");
            assertThat(s.chapterCount()).isZero();
            assertThat(s.publishedCount()).isZero();
            assertThat(s.coverUrl()).isNull();
            assertThat(s.tags()).containsExactly("romance", "BL");
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
                v.novelStatus(), null, null, null, null));

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

    private long novel(String slug) {
        NovelRequest v = valid();
        return service.create(new NovelRequest(slug, slug, null, "Author", "About it", List.of(), v.novelStatus(),
                null, null, null, null)).id();
    }

    @Test
    void featuredTogglesOnAndOffWithoutTouchingUpdatedAt() {
        long id = novel("a");
        Instant before = em.find(Novel.class, id).getUpdatedAt();

        assertThat(service.setFeatured(id, true).featured()).isTrue();
        assertThat(service.list().get(0).featured()).isTrue();
        assertThat(service.setFeatured(id, false).featured()).isFalse();

        em.flush();
        em.clear();
        assertThat(em.find(Novel.class, id).getUpdatedAt()).isEqualTo(before);
    }

    @Test
    void theSixthPickIsRefusedButAPickedNovelCanBeResaved() {
        long first = 0;
        for (int i = 0; i < 5; i++) {
            long id = novel("n" + i);
            if (i == 0) {
                first = id;
            }
            service.setFeatured(id, true);
        }
        long sixth = novel("n5");

        assertThatThrownBy(() -> service.setFeatured(sixth, true)).isInstanceOf(BannerFullException.class);
        assertThat(service.setFeatured(first, true).featured()).isTrue();
        assertThat(service.setFeatured(first, false).featured()).isFalse();
        assertThat(service.setFeatured(sixth, true).featured()).isTrue();
    }

    @Test
    void setFeaturedOfAnUnknownNovelIsNotFound() {
        assertThatThrownBy(() -> service.setFeatured(999_999, true)).isInstanceOf(NovelNotFoundException.class);
    }

    @Test
    void listCarriesCreationTimeAuthorDescriptionAndLastPublishedAt() {
        long id = novel("pub");
        Novel novel = em.find(Novel.class, id);
        Chapter one = new Chapter(novel, 1, null, NOW);
        one.setPublishStatus(ChapterPublishStatus.PUBLISHED);
        one.setPublishedAt(NOW.plusSeconds(10));
        Chapter two = new Chapter(novel, 2, null, NOW);
        two.setPublishStatus(ChapterPublishStatus.PUBLISHED);
        two.setPublishedAt(NOW.plusSeconds(99));
        Chapter draft = new Chapter(novel, 3, null, NOW);
        draft.setPublishedAt(NOW.plusSeconds(500));
        chapters.save(one);
        chapters.save(two);
        chapters.save(draft);
        long none = novel("none");
        em.flush();
        em.clear();

        NovelSummary s = service.list().stream().filter(n -> n.id() == id).findFirst().orElseThrow();
        assertThat(s.lastPublishedAt()).isEqualTo(NOW.plusSeconds(99));
        assertThat(s.createdAt()).isEqualTo(NOW);
        assertThat(s.originalAuthor()).isEqualTo("Author");
        assertThat(s.description()).isEqualTo("About it");
        assertThat(service.list().stream().filter(n -> n.id() == none).findFirst().orElseThrow().lastPublishedAt())
                .isNull();
    }

    @Test
    void deleteRemovesChaptersAndUnusedImages() throws IOException {
        Media cover = mediaService.store("c.png", TestImages.png());
        Media page = mediaService.store("p.png", TestImages.png());
        NovelRequest v = valid();
        NovelDetail d = service.create(new NovelRequest(v.slug(), v.title(), cover.getId(), null, null, List.of(),
                v.novelStatus(), null, null, null, null));
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
    void deleteRemovesChapterImagesAndTheirUnusedMedia() {
        Media image = mediaService.store("i.png", TestImages.png());
        NovelDetail d = service.create(valid());
        Novel novel = em.find(Novel.class, d.id());
        Chapter chapter = chapters.save(new Chapter(novel, 1, null, NOW));
        chapterImages.save(new ChapterImage(chapter, image, "https://img.wattpad.com/i.jpg", 1));
        em.flush();
        em.clear();

        service.delete(d.id());
        em.flush();
        em.clear();

        assertThat(chapterImages.count()).isZero();
        assertThat(media.findById(image.getId())).isEmpty();
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

    private static NovelRequest wattpad(String storyId, String language, NovelSourceType type) {
        NovelRequest r = valid();
        return new NovelRequest(r.slug(), r.title(), null, r.originalAuthor(), r.description(), r.tags(),
                r.novelStatus(), r.translatorCredit(), r.sourceUrl(), r.promptProfile(), null, type, language,
                storyId, "https://img.wattpad.com/cover/1-256-x.jpg");
    }

    @Test
    void aNovelDefaultsToScreenshotsAndThai() {
        NovelDetail d = service.create(valid());

        assertThat(d.sourceType()).isEqualTo(NovelSourceType.SCREENSHOTS);
        assertThat(d.sourceLanguage()).isEqualTo("th");
        assertThat(d.wattpadStoryId()).isNull();
    }

    @Test
    void aWattpadNovelKeepsItsStoryIdAndLanguage() {
        NovelDetail d = service.create(wattpad(" 396487502 ", "EN", NovelSourceType.WATTPAD));

        assertThat(d.sourceType()).isEqualTo(NovelSourceType.WATTPAD);
        assertThat(d.sourceLanguage()).isEqualTo("en");
        assertThat(d.wattpadStoryId()).isEqualTo("396487502");
        assertThat(service.get(d.id()).wattpadStoryId()).isEqualTo("396487502");
    }

    @Test
    void aWattpadNovelNeedsANumericStoryId() {
        assertThat(errorsOf(wattpad(null, "en", NovelSourceType.WATTPAD))).extracting(FieldError::field)
                .containsExactly("wattpadStoryId");
        assertThat(errorsOf(wattpad("12/../x", "en", NovelSourceType.WATTPAD))).extracting(FieldError::field)
                .containsExactly("wattpadStoryId");
    }

    @Test
    void theSourceLanguageMustBeThaiEnglishOrSpanish() {
        assertThat(errorsOf(wattpad("5", "fr", NovelSourceType.WATTPAD))).extracting(FieldError::field)
                .containsExactly("sourceLanguage");
        assertThat(errorsOf(wattpad("5", "fr", NovelSourceType.WATTPAD))).extracting(FieldError::message)
                .containsExactly("Choose Thai, English or Spanish.");
    }

    @Test
    void aWattpadNovelStoresSpanishOnCreateAndUpdate() {
        NovelDetail d = service.create(wattpad("5", "ES", NovelSourceType.WATTPAD));
        assertThat(d.sourceLanguage()).isEqualTo("es");

        NovelDetail u = service.update(d.id(), wattpad("5", "en", NovelSourceType.WATTPAD));
        assertThat(u.sourceLanguage()).isEqualTo("en");
        NovelDetail back = service.update(d.id(), wattpad("5", "es", NovelSourceType.WATTPAD));
        assertThat(back.sourceLanguage()).isEqualTo("es");
    }

    @Test
    void aScreenshotNovelIgnoresAStrayStoryId() {
        NovelDetail d = service.create(wattpad("5", "th", NovelSourceType.SCREENSHOTS));

        assertThat(d.wattpadStoryId()).isNull();
    }

    @Test
    void updateChangesTheLanguageButNotTheSourceType() {
        NovelDetail d = service.create(wattpad("5", "th", NovelSourceType.WATTPAD));

        NovelDetail u = service.update(d.id(), wattpad("99", "en", NovelSourceType.SCREENSHOTS));

        assertThat(u.sourceLanguage()).isEqualTo("en");
        assertThat(u.sourceType()).isEqualTo(NovelSourceType.WATTPAD);
        assertThat(u.wattpadStoryId()).isEqualTo("5");
    }

    @Test
    void aSecondNovelForTheSameWattpadStoryIsRejected() {
        NovelDetail first = service.create(wattpad("396487502", "en", NovelSourceType.WATTPAD));
        NovelRequest again = wattpad("396487502", "en", NovelSourceType.WATTPAD);
        NovelRequest other = new NovelRequest("other-slug", again.title(), null, null, null, List.of(),
                NovelStatus.ONGOING, null, null, null, null, NovelSourceType.WATTPAD, "en", "396487502", null);

        assertThatThrownBy(() -> service.create(other)).isInstanceOf(DuplicateWattpadNovelException.class)
                .satisfies(e -> assertThat(((DuplicateWattpadNovelException) e).novelId()).isEqualTo(first.id()));
    }

    @Test
    void list_counts_chapters_without_loading_texts() {
        long a = novel("count-a");
        Novel novel = em.find(Novel.class, a);
        Chapter one = new Chapter(novel, 1, null, NOW);
        one.setPublishStatus(ChapterPublishStatus.PUBLISHED);
        one.setPublishedAt(NOW.plusSeconds(10));
        Chapter two = new Chapter(novel, 2, null, NOW);
        two.setPublishStatus(ChapterPublishStatus.PUBLISHED);
        two.setPublishedAt(NOW.plusSeconds(20));
        Chapter draft = new Chapter(novel, 3, null, NOW);
        chapters.save(one);
        chapters.save(two);
        chapters.save(draft);
        long b = novel("count-b");
        em.flush();
        em.clear();

        NovelSummary sa = service.list().stream().filter(n -> n.id() == a).findFirst().orElseThrow();
        assertThat(sa.chapterCount()).isEqualTo(3);
        assertThat(sa.publishedCount()).isEqualTo(2);
        assertThat(sa.lastPublishedAt()).isEqualTo(NOW.plusSeconds(20));
        NovelSummary sb = service.list().stream().filter(n -> n.id() == b).findFirst().orElseThrow();
        assertThat(sb.chapterCount()).isZero();
        assertThat(sb.publishedCount()).isZero();
        assertThat(sb.lastPublishedAt()).isNull();
        // setFeatured uses the single-novel aggregate and must give the same numbers
        assertThat(service.setFeatured(a, true).chapterCount()).isEqualTo(3);
        assertThat(service.setFeatured(b, true).chapterCount()).isZero();
    }

    @Test
    void detail_page_counts_include_chapters_without_pages() throws IOException {
        long id = novel("page-counts");
        Novel novel = em.find(Novel.class, id);
        Chapter x = chapters.save(new Chapter(novel, 1, null, NOW));
        Chapter y = chapters.save(new Chapter(novel, 2, null, NOW));
        Media m1 = mediaService.store("p1.png", TestImages.png());
        Media m2 = mediaService.store("p2.png", TestImages.png());
        pages.save(new ChapterPage(x, 1, m1));
        pages.save(new ChapterPage(x, 2, m2));
        em.flush();
        em.clear();

        assertThat(service.get(id).chapters()).extracting(ChapterSummary::chapterNo, ChapterSummary::pageCount)
                .containsExactly(org.assertj.core.groups.Tuple.tuple(1, 2), org.assertj.core.groups.Tuple.tuple(2, 0));
        assertThat(y.getId()).isNotNull();
    }

    @Test
    void detail_rows_match_previous_shape() throws IOException {
        long id = novel("shape");
        Novel novel = em.find(Novel.class, id);
        Chapter one = new Chapter(novel, 1, "Một", NOW);
        one.setLabel("Ngoại truyện 1");
        one.setSortOrder(2);
        one.setPublishStatus(ChapterPublishStatus.PUBLISHED);
        one.setTranslationModel("gemini-x");
        Chapter two = new Chapter(novel, 2, null, NOW);
        two.setSortOrder(1);
        chapters.save(one);
        chapters.save(two);
        pages.save(new ChapterPage(one, 1, mediaService.store("s1.png", TestImages.png())));
        em.flush();
        em.clear();

        // the previous code path: entities -> ChapterSummary
        List<ChapterSummary> old = chapters.findByNovelIdOrderBySortOrderAscChapterNoAsc(id).stream()
                .map(c -> new ChapterSummary(c.getId(), c.getChapterNo(), c.getTitle(), c.getLabel(),
                        c.getTranslationStatus(), c.getTranslationError(), c.getTranslationModel(),
                        c.getPublishStatus(), (int) pages.countByChapterId(c.getId()), 0,
                        c.getTranslationModel() != null)) // "gemini-x" is not the main model "m"
                .toList();
        em.clear();

        assertThat(service.get(id).chapters()).isEqualTo(old);
    }

    @Test
    void metadata_queries_do_not_need_chapter_entities() {
        long id = novel("meta");
        Novel novel = em.find(Novel.class, id);
        Chapter one = new Chapter(novel, 1, "A", NOW);
        one.setPublishStatus(ChapterPublishStatus.PUBLISHED);
        one.setPublishedAt(NOW.plusSeconds(5));
        Chapter two = new Chapter(novel, 2, "B", NOW);
        Chapter three = new Chapter(novel, 3, "C", NOW);
        three.setPublishStatus(ChapterPublishStatus.PUBLISHED);
        three.setPublishedAt(NOW.plusSeconds(7));
        chapters.save(one);
        chapters.save(two);
        chapters.save(three);
        long empty = novel("meta-empty");
        em.flush();
        em.clear();

        assertThat(chapters.maxPublishedChapterNo(id)).isEqualTo(3);
        assertThat(chapters.maxPublishedChapterNo(empty)).isNull();
        assertThat(chapters.findIdsBefore(id, 3)).containsExactly(two.getId(), one.getId());
        assertThat(chapters.chapterStats(id)).isEqualTo(new NovelChapterStats(id, 3, 2, NOW.plusSeconds(7)));
        assertThat(chapters.chapterStats(empty)).isNull();
        assertThat(chapters.findRowsByNovel(id)).extracting(ChapterRow::chapterNo).containsExactly(1, 2, 3);
        assertThat(chapters.chapterStats()).extracting(NovelChapterStats::novelId).contains(id).doesNotContain(empty);
    }
}
