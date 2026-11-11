package com.subtitlestudio.work;

import static org.assertj.core.api.Assertions.assertThat;
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
import java.util.List;
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
class PersonServiceTest {

    private static final Path DATA_DIR;

    static {
        try {
            DATA_DIR = Files.createTempDirectory("subtitle-studio-person-test");
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    @DynamicPropertySource
    static void dataDir(DynamicPropertyRegistry registry) {
        registry.add("subtitle-studio.data-dir", DATA_DIR::toString);
    }

    @Autowired
    private PersonService service;

    @Autowired
    private WorkService workService;

    @Autowired
    private WorkRepository works;

    @Autowired
    private PersonRepository people;

    @Autowired
    private MediaService mediaService;

    @Autowired
    private MediaRepository media;

    @AfterEach
    void cleanUp() {
        works.deleteAll();
        people.deleteAll();
        media.deleteAll();
    }

    private Media avatar() {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try {
            ImageIO.write(new BufferedImage(20, 20, BufferedImage.TYPE_INT_RGB), "png", out);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        return mediaService.storeResized("a.png", out.toByteArray(), 400);
    }

    @Test
    void nameUniqueIgnoringCase() {
        service.create(new PersonRequest("Bonnie", null));

        InvalidWorkException e = catchThrowableOfType(InvalidWorkException.class,
                () -> service.create(new PersonRequest(" bonnie ", null)));

        assertThat(e.errors()).containsExactly(new FieldError("name", "A person with this name already exists."));
    }

    @Test
    void renameToOwnNameAllowed() {
        PersonDto bonnie = service.create(new PersonRequest("Bonnie", null));

        PersonDto renamed = service.update(bonnie.id(), new PersonRequest("BONNIE", null));

        assertThat(renamed.name()).isEqualTo("BONNIE");
        assertThat(service.list()).extracting(PersonDto::name).containsExactly("BONNIE");
    }

    @Test
    void blankAndLongNamesAreRejected() {
        for (String bad : new String[] {" ", "a".repeat(101)}) {
            InvalidWorkException e = catchThrowableOfType(InvalidWorkException.class,
                    () -> service.create(new PersonRequest(bad, null)));
            assertThat(e.errors()).extracting(FieldError::field).containsExactly("name");
        }
    }

    @Test
    void deleteInUseIs409WithTitles() {
        PersonDto emi = service.create(new PersonRequest("Emi", null));
        workService.create(new WorkRequest("Zeta", null, LocalDate.parse("2026-01-01"), List.of(WorkCategory.MUSIC), null, null,
                null, List.of(), List.of(new WorkCreditRequest(emi.id(), "Singer", null))));
        workService.create(new WorkRequest("Alpha", null, null, List.of(WorkCategory.MUSIC), null, null, null, List.of(),
                List.of(new WorkCreditRequest(emi.id(), null, null))));

        PersonInUseException e = catchThrowableOfType(PersonInUseException.class, () -> service.delete(emi.id()));

        assertThat(e.works()).containsExactly("Alpha", "Zeta");
        assertThat(service.list()).hasSize(1);
    }

    @Test
    void deleteUnusedRemovesAvatarIfUnreferenced() {
        Media image = avatar();
        Path file = DATA_DIR.resolve("media").resolve(image.getStorageKey() + ".webp");
        PersonDto p = service.create(new PersonRequest("Emi", image.getId()));
        assertThat(file).exists();
        assertThat(p.avatarUrl()).isEqualTo("/api/media/" + image.getId());

        service.delete(p.id());

        assertThat(service.list()).isEmpty();
        assertThat(file).doesNotExist();
    }

    @Test
    void changingAvatarDeletesTheOldOne() {
        Media first = avatar();
        Media second = avatar();
        PersonDto p = service.create(new PersonRequest("Emi", first.getId()));

        service.update(p.id(), new PersonRequest("Emi", second.getId()));

        assertThat(DATA_DIR.resolve("media").resolve(first.getStorageKey() + ".webp")).doesNotExist();
        assertThat(DATA_DIR.resolve("media").resolve(second.getStorageKey() + ".webp")).exists();
    }
}
