package com.subtitlestudio.work;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.catchThrowableOfType;

import com.subtitlestudio.profile.FieldError;
import com.subtitlestudio.profile.Media;
import com.subtitlestudio.profile.MediaRepository;
import com.subtitlestudio.profile.MediaService;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

@SpringBootTest
@ActiveProfiles("test")
class WorkServiceTest {

    private static final Path DATA_DIR;

    static {
        try {
            DATA_DIR = Files.createTempDirectory("subtitle-studio-work-test");
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    @DynamicPropertySource
    static void dataDir(DynamicPropertyRegistry registry) {
        registry.add("subtitle-studio.data-dir", DATA_DIR::toString);
    }

    @Autowired
    private WorkService service;

    @Autowired
    private PersonService peopleService;

    @Autowired
    private WorkRepository works;

    @Autowired
    private PersonRepository people;

    @Autowired
    private MediaService mediaService;

    @Autowired
    private MediaRepository media;

    private final Map<Long, String> keys = new HashMap<>();

    @AfterEach
    void cleanUp() {
        works.deleteAll();
        people.deleteAll();
        media.deleteAll();
    }

    private long image() {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try {
            ImageIO.write(new BufferedImage(40, 50, BufferedImage.TYPE_INT_RGB), "png", out);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        Media m = mediaService.storeResized("a.png", out.toByteArray(), 1600);
        keys.put(m.getId(), m.getStorageKey());
        return m.getId();
    }

    private Path fileOf(long id) {
        return DATA_DIR.resolve("media").resolve(keys.get(id) + ".webp");
    }

    private long person(String name) {
        return peopleService.create(new PersonRequest(name, null)).id();
    }

    private static WorkRequest request(WorkCategory category, Long cover, List<WorkLinkRequest> links,
                                       List<WorkCreditRequest> credits) {
        return new WorkRequest(" Love Story ", cover, LocalDate.parse("2026-04-24"), category, "Drama", "emi", " Synopsis ",
                links, credits);
    }

    @Test
    void createThenGetReturnsListsInOrder() {
        long bonnie = person("Bonnie");
        long emi = person("Emi");
        WorkDto created = service.create(request(WorkCategory.FILM_TV, null,
                List.of(new WorkLinkRequest(LinkKind.PILOT, null, "https://www.netflix.com/title/1", null),
                        new WorkLinkRequest(LinkKind.OTHER, "iQIYI", "https://www.iq.com/x", "link")),
                List.of(new WorkCreditRequest(emi, "Lead", "Key"), new WorkCreditRequest(bonnie, "Lead", "Mon"))));

        WorkDto got = service.get(created.id());

        assertThat(got.title()).isEqualTo("Love Story");
        assertThat(got.description()).isEqualTo("Synopsis");
        assertThat(got.profile()).isEqualTo("emi");
        assertThat(got.links()).extracting(WorkLinkDto::label).containsExactly("Pilot", "iQIYI");
        assertThat(got.credits()).extracting(c -> c.person().name()).containsExactly("Emi", "Bonnie");
        assertThat(got.credits()).extracting(WorkCreditDto::characterName).containsExactly("Key", "Mon");
        assertThat(service.list()).extracting(WorkSummaryDto::title).containsExactly("Love Story");
    }

    @Test
    void updateReplacesLinksAndCredits() {
        long a = person("A");
        long b = person("B");
        WorkDto created = service.create(request(WorkCategory.FILM_TV, null,
                List.of(new WorkLinkRequest(LinkKind.PILOT, null, "https://a.example", null)),
                List.of(new WorkCreditRequest(a, null, null))));

        WorkDto updated = service.update(created.id(), request(WorkCategory.FILM_TV, null,
                List.of(new WorkLinkRequest(LinkKind.TRAILER, null, "https://b.example", null),
                        new WorkLinkRequest(LinkKind.X, null, "https://x.com/c", null)),
                List.of(new WorkCreditRequest(b, "Lead", null))));

        assertThat(updated.links()).extracting(WorkLinkDto::kind).containsExactly(LinkKind.TRAILER, LinkKind.X);
        assertThat(updated.credits()).extracting(c -> c.person().name()).containsExactly("B");
    }

    @Test
    void characterClearedForMusic() {
        long a = person("A");

        WorkDto dto = service.create(request(WorkCategory.MUSIC, null, List.of(),
                List.of(new WorkCreditRequest(a, "Singer", "Key"))));

        assertThat(dto.credits().get(0).characterName()).isNull();
        assertThat(dto.credits().get(0).role()).isEqualTo("Singer");
    }

    @Test
    void trailerVideoIdFromYoutuBeLink() {
        WorkDto dto = service.create(request(WorkCategory.FILM_TV, null,
                List.of(new WorkLinkRequest(LinkKind.TRAILER, null, "https://youtu.be/dQw4w9WgXcQ?si=abc", null)),
                List.of()));
        WorkDto notYoutube = service.create(new WorkRequest("Other", null, null, WorkCategory.FILM_TV, null, null, null,
                List.of(new WorkLinkRequest(LinkKind.TRAILER, null, "https://vimeo.com/123", null)), List.of()));

        assertThat(dto.trailerVideoId()).isEqualTo("dQw4w9WgXcQ");
        assertThat(notYoutube.trailerVideoId()).isNull();
        assertThat(notYoutube.links()).hasSize(1);
    }

    @Test
    void replacingCoverDeletesOldUnusedMedia() {
        long first = image();
        long second = image();
        WorkDto created = service.create(request(WorkCategory.MUSIC, first, List.of(), List.of()));

        service.update(created.id(), request(WorkCategory.MUSIC, second, List.of(), List.of()));

        assertThat(fileOf(first)).doesNotExist();
        assertThat(fileOf(second)).exists();
        assertThat(service.get(created.id()).coverUrl()).isEqualTo("/api/media/" + second);
    }

    @Test
    void deleteRemovesTheWorkAndItsCoverButNotThePerson() {
        long cover = image();
        long a = person("A");
        WorkDto created = service.create(request(WorkCategory.FILM_TV, cover, List.of(),
                List.of(new WorkCreditRequest(a, null, null))));

        service.delete(created.id());

        assertThat(works.count()).isZero();
        assertThat(fileOf(cover)).doesNotExist();
        assertThat(people.count()).isEqualTo(1);
        assertThatThrownBy(() -> service.get(created.id())).isInstanceOf(WorkNotFoundException.class);
    }

    @Test
    void unknownProfileCoverAndPersonAreReportedTogether() {
        WorkRequest r = new WorkRequest("T", 999_999L, null, WorkCategory.MUSIC, null, "ghost", null, List.of(),
                List.of(new WorkCreditRequest(999_999L, null, null)));

        InvalidWorkException e = catchThrowableOfType(InvalidWorkException.class, () -> service.create(r));

        assertThat(e.errors()).extracting(FieldError::field)
                .containsExactlyInAnyOrder("coverMediaId", "profile", "credits[0].personId");
        assertThat(works.count()).isZero();
    }
}
