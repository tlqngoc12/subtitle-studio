package com.subtitlestudio.profile;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.subtitlestudio.web.ApiExceptionHandler;
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

@WebMvcTest(ProfileBannerController.class)
@Import(ApiExceptionHandler.class)
class ProfileBannerControllerTest {

    private static final List<BannerImageDto> LIST = List.of(new BannerImageDto(5, null, "/api/media/9", "Alt"),
            new BannerImageDto(6, null, "/api/media/10", null));

    @Autowired
    private MockMvc mvc;

    @MockitoBean
    private ProfileBannerService service;

    private ResultActions json(MockHttpServletRequestBuilder request, String body) throws Exception {
        return mvc.perform(request.contentType(MediaType.APPLICATION_JSON).content(body));
    }

    @Test
    void addsAnImageAndReturnsTheList() throws Exception {
        when(service.add(eq("emi"), any())).thenReturn(LIST);

        json(post("/api/profiles/emi/banner"), "{\"mediaId\":9,\"altText\":\"Alt\"}")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$[0].id").value(5))
                .andExpect(jsonPath("$[0].mediaUrl").value("/api/media/9"))
                .andExpect(jsonPath("$[0].altText").value("Alt"))
                .andExpect(jsonPath("$[1].altText").isEmpty())
                .andExpect(jsonPath("$[0].mediaId").doesNotExist());
        verify(service).add("emi", new BannerImageRequest(9L, "Alt"));
    }

    @Test
    void editsTheAltText() throws Exception {
        when(service.updateAltText("emi", 5, "New")).thenReturn(LIST);

        json(put("/api/profiles/emi/banner/5"), "{\"altText\":\"New\"}").andExpect(status().isOk())
                .andExpect(jsonPath("$[1].id").value(6));
    }

    @Test
    void deletesAnImageAndReturnsTheList() throws Exception {
        when(service.delete("emi", 5)).thenReturn(LIST);

        mvc.perform(delete("/api/profiles/emi/banner/5")).andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2));
    }

    @Test
    void reordersWithTheOrderPathNotTreatedAsAnId() throws Exception {
        when(service.reorder("emi", List.of(6L, 5L))).thenReturn(LIST);

        json(put("/api/profiles/emi/banner/order"), "{\"imageIds\":[6,5]}").andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(5));
        verify(service).reorder("emi", List.of(6L, 5L));
    }

    @Test
    void invalidRequestReturns400WithFieldErrors() throws Exception {
        when(service.add(eq("emi"), any())).thenThrow(new InvalidBlockException(
                List.of(new FieldError("altText", "Use at most 200 characters."))));

        json(post("/api/profiles/emi/banner"), "{\"mediaId\":9}").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_BLOCK"))
                .andExpect(jsonPath("$.errors[0].field").value("altText"));
    }

    @Test
    void foreignImageReturns404() throws Exception {
        when(service.delete("bonnie", 5)).thenThrow(new BannerImageNotFoundException(5));

        mvc.perform(delete("/api/profiles/bonnie/banner/5")).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("BANNER_IMAGE_NOT_FOUND"));
    }

    @Test
    void unknownProfileReturns404() throws Exception {
        when(service.add(eq("x"), any())).thenThrow(new ProfileNotFoundException("x"));

        json(post("/api/profiles/x/banner"), "{\"mediaId\":9}").andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("PROFILE_NOT_FOUND"));
    }
}
