package com.subtitlestudio.work;

import static org.assertj.core.api.Assertions.assertThat;

import com.subtitlestudio.profile.FieldError;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import org.junit.jupiter.api.Test;

class WorkValidatorTest {

    private final WorkValidator validator = new WorkValidator();

    private static WorkLinkRequest link(LinkKind kind, String url) {
        return new WorkLinkRequest(kind, null, url, null);
    }

    private static WorkRequest request(WorkCategory category, List<WorkLinkRequest> links,
                                       List<WorkCreditRequest> credits) {
        return new WorkRequest("Title", null, LocalDate.parse("2026-04-24"), List.of(category), null, null, null, links, credits);
    }

    private static WorkRequest withLinks(WorkLinkRequest... links) {
        return request(WorkCategory.MUSIC, List.of(links), List.of());
    }

    private List<String> fields(WorkRequest r) {
        return validator.check(validator.normalise(r)).stream().map(FieldError::field).toList();
    }

    @Test
    void acceptsAFullWork() {
        WorkRequest r = new WorkRequest(" Love Story ", 4L, null, List.of(WorkCategory.FILM_TV), " Drama ", "emi", " Synopsis ",
                List.of(link(LinkKind.PILOT, "https://youtu.be/dQw4w9WgXcQ"),
                        new WorkLinkRequest(LinkKind.OTHER, "iQIYI", "https://www.iq.com/x", "link")),
                List.of(new WorkCreditRequest(1, "Lead", "Key")));

        assertThat(fields(r)).isEmpty();
        WorkRequest n = validator.normalise(r);
        assertThat(n.title()).isEqualTo("Love Story");
        assertThat(n.subcategory()).isEqualTo("Drama");
        assertThat(n.description()).isEqualTo("Synopsis");
        assertThat(n.links().get(0).label()).isEqualTo("Pilot");
    }

    @Test
    void secondTrailerIsRejectedOnItsKind() {
        assertThat(fields(withLinks(link(LinkKind.TRAILER, "https://youtu.be/dQw4w9WgXcQ"),
                link(LinkKind.TRAILER, "https://youtu.be/dQw4w9WgXcR")))).containsExactly("links[1].kind");
    }

    @Test
    void otherMayRepeat() {
        assertThat(fields(withLinks(new WorkLinkRequest(LinkKind.OTHER, "A", "https://a.example", null),
                new WorkLinkRequest(LinkKind.OTHER, "B", "https://b.example", null)))).isEmpty();
    }

    @Test
    void moreThan20LinksAreRejected() {
        List<WorkLinkRequest> many = new ArrayList<>(Collections.nCopies(21,
                new WorkLinkRequest(LinkKind.OTHER, "L", "https://a.example", null)));
        assertThat(fields(request(WorkCategory.MUSIC, many, List.of()))).containsExactly("links");
    }

    @Test
    void unsafeOrMissingUrlsAreRejected() {
        assertThat(fields(withLinks(new WorkLinkRequest(LinkKind.OTHER, "x", "javascript:alert(1)", null))))
                .containsExactly("links[0].url");
        assertThat(fields(withLinks(new WorkLinkRequest(LinkKind.OTHER, "x", "ftp://a.example", null))))
                .containsExactly("links[0].url");
        assertThat(fields(withLinks(new WorkLinkRequest(LinkKind.OTHER, "x", " ", null))))
                .containsExactly("links[0].url");
        assertThat(fields(withLinks(new WorkLinkRequest(LinkKind.OTHER, "x", "https://a.example/" + "a".repeat(500), null))))
                .containsExactly("links[0].url");
    }

    @Test
    void labelRules() {
        assertThat(fields(withLinks(new WorkLinkRequest(LinkKind.OTHER, " ", "https://a.example", null))))
                .containsExactly("links[0].label");
        assertThat(fields(withLinks(new WorkLinkRequest(LinkKind.OTHER, "a".repeat(61), "https://a.example", null))))
                .containsExactly("links[0].label");
    }

    @Test
    void unknownIconIsRejected() {
        assertThat(fields(withLinks(new WorkLinkRequest(LinkKind.OTHER, "x", "https://a.example", "myspace"))))
                .containsExactly("links[0].icon");
    }

    @Test
    void duplicatePersonAndTooManyCredits() {
        assertThat(fields(request(WorkCategory.FILM_TV, List.of(),
                List.of(new WorkCreditRequest(1, null, null), new WorkCreditRequest(1, null, null)))))
                .containsExactly("credits[1].personId");
        List<WorkCreditRequest> many = new ArrayList<>();
        for (int i = 1; i <= 31; i++) {
            many.add(new WorkCreditRequest(i, null, null));
        }
        assertThat(fields(request(WorkCategory.FILM_TV, List.of(), many))).containsExactly("credits");
    }

    @Test
    void creditTextLimits() {
        assertThat(fields(request(WorkCategory.FILM_TV, List.of(),
                List.of(new WorkCreditRequest(1, "a".repeat(41), "b".repeat(101))))))
                .containsExactly("credits[0].role", "credits[0].characterName");
    }

    @Test
    void characterIsClearedOutsideFilmAndTv() {
        WorkRequest r = request(WorkCategory.MUSIC, List.of(), List.of(new WorkCreditRequest(1, "Singer", "Key")));

        assertThat(validator.normalise(r).credits().get(0).characterName()).isNull();
        assertThat(validator.normalise(r).credits().get(0).role()).isEqualTo("Singer");
    }

    @Test
    void noCategoryIsRejectedOnCategories() {
        assertThat(fields(new WorkRequest("T", null, null, List.of(), null, null, null, List.of(), List.of())))
                .containsExactly("categories");
        assertThat(fields(new WorkRequest("T", null, null, null, null, null, null, null, null)))
                .containsExactly("categories");
    }

    @Test
    void duplicateCategoriesAreRejected() {
        assertThat(fields(new WorkRequest("T", null, null, List.of(WorkCategory.MUSIC, WorkCategory.MUSIC), null, null,
                null, List.of(), List.of()))).containsExactly("categories");
    }

    @Test
    void allEightCategoriesAreAccepted() {
        assertThat(fields(new WorkRequest("T", null, null, List.of(WorkCategory.values()), null, null, null, List.of(),
                List.of()))).isEmpty();
    }

    @Test
    void characterIsKeptWhenFilmAndTvIsOneOfSeveralCategories() {
        WorkRequest r = new WorkRequest("T", null, null, List.of(WorkCategory.MUSIC, WorkCategory.FILM_TV), null, null,
                null, List.of(), List.of(new WorkCreditRequest(1, "Lead", "Key")));

        assertThat(validator.normalise(r).credits().get(0).characterName()).isEqualTo("Key");
    }

    @Test
    void titleAndOtherLimits() {
        assertThat(fields(new WorkRequest(" ", null, null, List.of(WorkCategory.MUSIC), null, null, null, List.of(), List.of())))
                .containsExactly("title");
        assertThat(fields(new WorkRequest("a".repeat(201), null, null, List.of(WorkCategory.MUSIC), null, null, null, List.of(),
                List.of()))).containsExactly("title");
        assertThat(fields(new WorkRequest("t", null, null, List.of(WorkCategory.MUSIC), "a".repeat(51), null, "d".repeat(2001),
                List.of(), List.of()))).containsExactly("subcategory", "description");
        assertThat(fields(new WorkRequest("t", null, null, null, null, null, null, List.of(), List.of())))
                .containsExactly("categories");
    }
}
