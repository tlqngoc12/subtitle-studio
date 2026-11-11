package com.subtitlestudio.photo;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.catchThrowableOfType;

import com.subtitlestudio.profile.FieldError;
import com.subtitlestudio.profile.InvalidBlockException;
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
class PhotoServiceTest {

    private static final Path DATA_DIR;
    private static final String URL = "https://www.instagram.com/p/DQx1abc/";

    static {
        try {
            DATA_DIR = Files.createTempDirectory("subtitle-studio-photo-test");
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    @DynamicPropertySource
    static void dataDir(DynamicPropertyRegistry registry) {
        registry.add("subtitle-studio.data-dir", DATA_DIR::toString);
    }

    @Autowired
    private PhotoService service;

    @Autowired
    private PhotoPostRepository posts;

    @Autowired
    private MediaService mediaService;

    @Autowired
    private MediaRepository media;

    private final Map<Long, String> keys = new HashMap<>();

    @AfterEach
    void cleanUp() {
        posts.deleteAll();
        media.deleteAll();
    }

    private static byte[] png(int w, int h) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try {
            ImageIO.write(new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB), "png", out);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        return out.toByteArray();
    }

    private long resizedImage() {
        Media m = mediaService.storeResized("a.png", png(300, 400), 1600);
        keys.put(m.getId(), m.getStorageKey());
        return m.getId();
    }

    private Path fileOf(long id) {
        return DATA_DIR.resolve("media").resolve(keys.get(id) + ".webp");
    }

    private static PhotoPostRequest request(String url, Long mediaId) {
        return new PhotoPostRequest(url, mediaId, " Title ", LocalDate.parse("2026-11-09"), PhotoSource.OFFICIAL,
                3, List.of("emi", "emibonnie"));
    }

    private static List<String> fields(Throwable t) {
        return ((InvalidBlockException) t).errors().stream().map(FieldError::field).toList();
    }

    @Test
    void createNormalisesLinkAndReadsSizeFromMedia() {
        long img = resizedImage();

        PhotoPostDto dto = service.create(request("https://instagram.com/p/DQx1abc?igsh=xyz", img));

        assertThat(dto.instagramUrl()).isEqualTo(URL);
        assertThat(dto.title()).isEqualTo("Title");
        assertThat(dto.width()).isEqualTo(300);
        assertThat(dto.height()).isEqualTo(400);
        assertThat(dto.imageUrl()).isEqualTo("/api/media/" + img);
        assertThat(dto.profiles()).containsExactly("emibonnie", "emi");
        assertThat(service.list()).hasSize(1);
    }

    @Test
    void duplicateLinkIs409WithExistingTitle() {
        service.create(request(URL, resizedImage()));

        assertThatThrownBy(() -> service.create(request("https://www.instagram.com/emiamily/p/DQx1abc/?x=1", resizedImage())))
                .isInstanceOf(PhotoPostExistsException.class)
                .satisfies(e -> assertThat(((PhotoPostExistsException) e).title()).isEqualTo("Title"));
    }

    @Test
    void updateKeepsOwnLink() {
        long img = resizedImage();
        PhotoPostDto dto = service.create(request(URL, img));

        PhotoPostDto updated = service.update(dto.id(), new PhotoPostRequest(URL, img, "New", LocalDate.parse("2026-11-09"),
                PhotoSource.FAN, null, List.of()));

        assertThat(updated.title()).isEqualTo("New");
        assertThat(updated.source()).isEqualTo(PhotoSource.FAN);
        assertThat(updated.photoCount()).isNull();
        assertThat(updated.profiles()).isEmpty();
    }

    @Test
    void mediaWithoutSizeIs400() {
        Media plain = mediaService.store("a.png", png(10, 10));

        InvalidBlockException e = catchThrowableOfType(InvalidBlockException.class,
                () -> service.create(request(URL, plain.getId())));

        assertThat(fields(e)).containsExactly("mediaId");
    }

    @Test
    void anUnknownTakenUntilPropertyInTheJsonIsIgnored() throws Exception {
        String json = """
                {"instagramUrl":"%s","mediaId":%d,"title":"T","takenOn":"2026-11-09","takenUntil":"2026-11-12",
                 "source":"MEDIA","photoCount":null,"profiles":[]}""".formatted(URL, resizedImage());
        PhotoPostRequest r = new com.fasterxml.jackson.databind.ObjectMapper()
                .registerModule(new com.fasterxml.jackson.datatype.jsr310.JavaTimeModule())
                .configure(com.fasterxml.jackson.databind.DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false)
                .readValue(json, PhotoPostRequest.class);

        PhotoPostDto dto = service.create(r);

        assertThat(dto.takenOn()).isEqualTo(LocalDate.parse("2026-11-09"));
        assertThat(PhotoPostDto.class.getRecordComponents()).extracting(c -> c.getName()).doesNotContain("takenUntil");
    }

    @Test
    void photoCountOutOfRangeIs400() {
        long img = resizedImage();
        for (int bad : new int[] {0, 100}) {
            PhotoPostRequest r = new PhotoPostRequest(URL, img, "T", LocalDate.parse("2026-11-09"),
                    PhotoSource.MEDIA, bad, List.of());
            assertThat(fields(catchThrowableOfType(InvalidBlockException.class, () -> service.create(r))))
                    .containsExactly("photoCount");
        }
    }

    @Test
    void unknownProfileAndMissingFieldsAreReportedTogether() {
        PhotoPostRequest r = new PhotoPostRequest("nope", null, " ", null, null, null, List.of("ghost"));

        assertThat(fields(catchThrowableOfType(InvalidBlockException.class, () -> service.create(r))))
                .containsExactlyInAnyOrder("instagramUrl", "mediaId", "title", "takenOn", "source", "profiles");
    }

    @Test
    void replacingImageDeletesOldUnusedMedia() {
        long first = resizedImage();
        long second = resizedImage();
        PhotoPostDto dto = service.create(request(URL, first));

        service.update(dto.id(), request(URL, second));

        assertThat(fileOf(first)).doesNotExist();
        assertThat(fileOf(second)).exists();
    }

    @Test
    void deleteRemovesJoinRowsAndUnusedMedia() {
        long img = resizedImage();
        PhotoPostDto dto = service.create(request(URL, img));

        service.delete(dto.id());

        assertThat(posts.count()).isZero();
        assertThat(fileOf(img)).doesNotExist();
        assertThatThrownBy(() -> service.delete(dto.id())).isInstanceOf(PhotoPostNotFoundException.class);
    }
}
