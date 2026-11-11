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
    void getProfilesReturnsPage() throws Exception {
        when(service.page()).thenReturn(new ProfilePageDto(profile("emibonnie", ProfileKind.GROUP),
                List.of(profile("emi", ProfileKind.MEMBER))));

        mvc.perform(get("/api/profiles")).andExpect(status().isOk())
                .andExpect(jsonPath("$.group.slug").value("emibonnie"))
                .andExpect(jsonPath("$.members[0].slug").value("emi"))
                .andExpect(jsonPath("$.members[0].kind").value("MEMBER"));
    }

    @Test
    void getsProfileWithBlocks() throws Exception {
        when(service.get("emi")).thenReturn(
                new ProfileDto("emi", "Emi", ProfileKind.MEMBER, null, null, null, null,
                        Instant.parse("2026-11-03T10:00:00Z"), List.of(LINKS),
                        List.of(new BannerImageDto(4, null, "/api/media/7", "Alt"))));

        mvc.perform(get("/api/profiles/emi")).andExpect(status().isOk())
                .andExpect(jsonPath("$.blocks[0].id").value(12))
                .andExpect(jsonPath("$.banner[0].mediaUrl").value("/api/media/7"))
                .andExpect(jsonPath("$.banner[0].altText").value("Alt"))
                .andExpect(jsonPath("$.blocks[0].type").value("LINKS"))
                .andExpect(jsonPath("$.blocks[0].items[0].value").value("https://instagram.com/x"));
    }

    private static ProfileDto profile(String slug, ProfileKind kind) {
        return new ProfileDto(slug, slug, kind, null, null, null, null, Instant.parse("2026-11-03T10:00:00Z"),
                List.of(), List.of());
    }

    @Test
    void putOrderIsNotTreatedAsSlug() throws Exception {
        when(service.reorder(any())).thenReturn(List.of(profile("bonnie", ProfileKind.MEMBER)));

        json(put("/api/profiles/order"), "{\"slugs\":[\"bonnie\"]}").andExpect(status().isOk())
                .andExpect(jsonPath("$[0].slug").value("bonnie"));
        verify(service).reorder(new MemberOrderRequest(List.of("bonnie")));
    }

    @Test
    void updatesHeader() throws Exception {
        when(service.updateHeader(eq("emi"), any())).thenReturn(profile("emi", ProfileKind.MEMBER));

        json(put("/api/profiles/emi/header"),
                "{\"displayName\":\"Emi\",\"tagline\":\"t\",\"fullName\":null,\"portraitMediaId\":5}")
                .andExpect(status().isOk());
        verify(service).updateHeader("emi", new ProfileHeaderRequest("Emi", "t", null, 5L));
    }

    @Test
    void addsMemberAndDeletesIt() throws Exception {
        when(service.addMember(any())).thenReturn(profile("any", ProfileKind.MEMBER));

        json(post("/api/profiles"), "{\"displayName\":\"Any\"}").andExpect(status().isCreated())
                .andExpect(jsonPath("$.slug").value("any"));
        mvc.perform(delete("/api/profiles/any")).andExpect(status().isNoContent());
        verify(service).deleteMember("any");
    }

    @Test
    void deletingGroupIs409() throws Exception {
        org.mockito.Mockito.doThrow(new GroupProfileException()).when(service).deleteMember("emibonnie");

        expectProblem(mvc.perform(delete("/api/profiles/emibonnie")), 409, "GROUP_PROFILE");
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
