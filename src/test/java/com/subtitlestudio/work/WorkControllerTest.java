package com.subtitlestudio.work;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.subtitlestudio.profile.FieldError;
import com.subtitlestudio.web.ApiExceptionHandler;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

@WebMvcTest(WorkController.class)
@Import(ApiExceptionHandler.class)
class WorkControllerTest {

    private static final PersonDto BONNIE = new PersonDto(2, "Bonnie", null, null);
    private static final WorkDto DTO = new WorkDto(5, "Love Story", "/api/media/9", null, List.of(WorkCategory.FILM_TV), "Drama",
            "emi", 9L, "Synopsis", List.of(new WorkLinkDto(LinkKind.TRAILER, "Trailer", "https://youtu.be/dQw4w9WgXcQ", null)),
            List.of(new WorkCreditDto(BONNIE, "Lead", "Key")));
    private static final String BODY = """
            {"title":"Love Story","coverMediaId":9,"releaseDate":null,"categories":["FILM_TV","MUSIC"],"subcategory":"Drama",
             "profile":"emi","description":"Synopsis",
             "links":[{"kind":"TRAILER","label":"Trailer","url":"https://youtu.be/dQw4w9WgXcQ","icon":null}],
             "credits":[{"personId":2,"role":"Lead","characterName":"Key"}]}""";

    @Autowired
    private MockMvc mvc;

    @MockitoBean
    private WorkService works;

    @MockitoBean
    private PersonService people;

    private ResultActions json(MockHttpServletRequestBuilder request, String body) throws Exception {
        return mvc.perform(request.contentType(MediaType.APPLICATION_JSON).content(body));
    }

    @Test
    void listsWorksWithNullDateForComingSoon() throws Exception {
        when(works.list()).thenReturn(List.of(new WorkSummaryDto(5, "Love Story", null, null, List.of(WorkCategory.FILM_TV), null,
                null), new WorkSummaryDto(6, "Old", null, LocalDate.parse("2026-01-05"), List.of(WorkCategory.MUSIC), null, "emi")));

        mvc.perform(get("/api/works")).andExpect(status().isOk())
                .andExpect(jsonPath("$[0].releaseDate").doesNotExist())
                .andExpect(jsonPath("$[0].categories[0]").value("FILM_TV"))
                .andExpect(jsonPath("$[1].releaseDate").value("2026-01-05"))
                .andExpect(jsonPath("$[1].profile").value("emi"));
    }

    @Test
    void getsAWorkWithLinksAndCredits() throws Exception {
        when(works.get(5)).thenReturn(DTO);

        mvc.perform(get("/api/works/5")).andExpect(status().isOk())
                .andExpect(jsonPath("$.trailerVideoId").doesNotExist())
                .andExpect(jsonPath("$.links[0].kind").value("TRAILER"))
                .andExpect(jsonPath("$.credits[0].person.name").value("Bonnie"))
                .andExpect(jsonPath("$.credits[0].characterName").value("Key"));
    }

    @Test
    void createsUpdatesAndDeletes() throws Exception {
        when(works.create(any())).thenReturn(DTO);
        when(works.update(eq(5L), any())).thenReturn(DTO);

        json(post("/api/works"), BODY).andExpect(status().isCreated()).andExpect(jsonPath("$.id").value(5));
        json(put("/api/works/5"), BODY).andExpect(status().isOk());
        mvc.perform(delete("/api/works/5")).andExpect(status().isNoContent());
        verify(works).delete(5);
        verify(works).create(new WorkRequest("Love Story", 9L, null, List.of(WorkCategory.FILM_TV, WorkCategory.MUSIC), "Drama", "emi", "Synopsis",
                List.of(new WorkLinkRequest(LinkKind.TRAILER, "Trailer", "https://youtu.be/dQw4w9WgXcQ", null)),
                List.of(new WorkCreditRequest(2, "Lead", "Key"))));
    }

    @Test
    void mapsErrors() throws Exception {
        when(works.get(9)).thenThrow(new WorkNotFoundException(9));
        mvc.perform(get("/api/works/9")).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("WORK_NOT_FOUND"));

        when(works.create(any())).thenThrow(new InvalidWorkException(List.of(new FieldError("links[2].url", "bad"))));
        json(post("/api/works"), BODY).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_WORK"))
                .andExpect(jsonPath("$.errors[0].field").value("links[2].url"));
    }

    @Test
    void peopleEndpoints() throws Exception {
        when(people.list()).thenReturn(List.of(BONNIE));
        when(people.create(any())).thenReturn(BONNIE);
        when(people.update(eq(2L), any())).thenReturn(BONNIE);

        mvc.perform(get("/api/people")).andExpect(status().isOk()).andExpect(jsonPath("$[0].name").value("Bonnie"));
        json(post("/api/people"), "{\"name\":\"Bonnie\",\"avatarMediaId\":null}").andExpect(status().isCreated());
        json(put("/api/people/2"), "{\"name\":\"Bonnie\",\"avatarMediaId\":4}").andExpect(status().isOk());
        verify(people).update(2, new PersonRequest("Bonnie", 4L));
        mvc.perform(delete("/api/people/2")).andExpect(status().isNoContent());
    }

    @Test
    void deletingAPersonInUseIs409WithTitles() throws Exception {
        doThrow(new PersonInUseException(List.of("Alpha", "Zeta"))).when(people).delete(2);

        mvc.perform(delete("/api/people/2")).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("PERSON_IN_USE"))
                .andExpect(jsonPath("$.works[0]").value("Alpha"))
                .andExpect(jsonPath("$.works[1]").value("Zeta"));
    }
}
