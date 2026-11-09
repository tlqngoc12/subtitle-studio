package com.subtitlestudio.profile;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.subtitlestudio.web.ApiExceptionHandler;
import java.time.Instant;
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

@WebMvcTest(ProfileController.class)
@Import(ApiExceptionHandler.class)
class ProfileControllerTest {

    private static final String LINKS_JSON = """
            {"type":"LINKS","title":"Mạng xã hội","items":[{"label":"Instagram","value":"https://instagram.com/x"}]}""";
    private static final BlockDto LINKS = new BlockDto(12, BlockType.LINKS, "Mạng xã hội", null, null, null, null, null,
            List.of(new ItemDto("Instagram", "https://instagram.com/x", null, null)));

    @Autowired
    private MockMvc mvc;

    @MockitoBean
    private ProfileService service;

    private ResultActions json(MockHttpServletRequestBuilder request, String body) throws Exception {
        return mvc.perform(request.contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private static void expectProblem(ResultActions result, int status, String code) throws Exception {
        result.andExpect(status().is(status)).andExpect(jsonPath("$.code").value(code));
    }

    @Test
    void listsProfiles() throws Exception {
        when(service.list()).thenReturn(List.of(new ProfileSummary("emibonnie", "EmiBonnie")));

        mvc.perform(get("/api/profiles")).andExpect(status().isOk())
                .andExpect(jsonPath("$[0].slug").value("emibonnie"))
                .andExpect(jsonPath("$[0].displayName").value("EmiBonnie"));
    }

    @Test
    void getsProfileWithBlocks() throws Exception {
        when(service.get("emi")).thenReturn(
                new ProfileDto("emi", "Emi", Instant.parse("2026-11-03T10:00:00Z"), List.of(LINKS),
                        List.of(new BannerImageDto(4, null, "/api/media/7", "Alt"))));

        mvc.perform(get("/api/profiles/emi")).andExpect(status().isOk())
                .andExpect(jsonPath("$.blocks[0].id").value(12))
                .andExpect(jsonPath("$.banner[0].mediaUrl").value("/api/media/7"))
                .andExpect(jsonPath("$.banner[0].altText").value("Alt"))
                .andExpect(jsonPath("$.blocks[0].type").value("LINKS"))
                .andExpect(jsonPath("$.blocks[0].items[0].value").value("https://instagram.com/x"));
    }

    @Test
    void addsBlock() throws Exception {
        when(service.addBlock(eq("emi"), any())).thenReturn(LINKS);

        json(post("/api/profiles/emi/blocks"), LINKS_JSON).andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(12));
        verify(service).addBlock("emi", new BlockRequest(BlockType.LINKS, "Mạng xã hội", null, null, null, null,
                List.of(new ItemRequest("Instagram", "https://instagram.com/x", null))));
    }

    @Test
    void updatesBlock() throws Exception {
        when(service.updateBlock(eq("emi"), eq(12L), any())).thenReturn(LINKS);

        json(put("/api/profiles/emi/blocks/12"), LINKS_JSON).andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("Mạng xã hội"));
    }

    @Test
    void deletesBlock() throws Exception {
        mvc.perform(delete("/api/profiles/emi/blocks/12")).andExpect(status().isNoContent());
        verify(service).deleteBlock("emi", 12);
    }

    @Test
    void movesBlock() throws Exception {
        when(service.move("emi", 12, Direction.UP)).thenReturn(List.of(LINKS));

        json(post("/api/profiles/emi/blocks/12/move"), "{\"direction\":\"UP\"}").andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(12));
    }

    @Test
    void unknownProfileReturns404() throws Exception {
        when(service.get("x")).thenThrow(new ProfileNotFoundException("x"));

        expectProblem(mvc.perform(get("/api/profiles/x")), 404, "PROFILE_NOT_FOUND");
    }

    @Test
    void unknownBlockReturns404() throws Exception {
        when(service.updateBlock(eq("emi"), eq(9L), any())).thenThrow(new BlockNotFoundException(9));

        expectProblem(json(put("/api/profiles/emi/blocks/9"), LINKS_JSON), 404, "BLOCK_NOT_FOUND");
    }

    @Test
    void invalidBlockReturns400WithFieldErrors() throws Exception {
        when(service.addBlock(eq("emi"), any())).thenThrow(new InvalidBlockException(
                List.of(new FieldError("items[0].value", "Links must start with http:// or https://"))));

        expectProblem(json(post("/api/profiles/emi/blocks"), LINKS_JSON), 400, "INVALID_BLOCK");
        json(post("/api/profiles/emi/blocks"), LINKS_JSON)
                .andExpect(jsonPath("$.errors[0].field").value("items[0].value"))
                .andExpect(jsonPath("$.errors[0].message").value("Links must start with http:// or https://"));
    }

    @Test
    void unknownTypeIsBadRequest() throws Exception {
        json(post("/api/profiles/emi/blocks"), "{\"type\":\"VIDEO\"}").andExpect(status().isBadRequest());
    }
}
