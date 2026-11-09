package com.subtitlestudio.profile;

import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/** REST API of a profile's banner (spec 2026-11-09 profile banner). Every call returns the new list. */
@RestController
public class ProfileBannerController {

    private final ProfileBannerService service;

    public ProfileBannerController(ProfileBannerService service) {
        this.service = service;
    }

    @PostMapping("/api/profiles/{slug}/banner")
    public ResponseEntity<List<BannerImageDto>> add(@PathVariable String slug,
                                                    @RequestBody BannerImageRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.add(slug, request));
    }

    @PutMapping("/api/profiles/{slug}/banner/order")
    public List<BannerImageDto> reorder(@PathVariable String slug, @RequestBody BannerOrderRequest request) {
        return service.reorder(slug, request.imageIds());
    }

    @PutMapping("/api/profiles/{slug}/banner/{imageId}")
    public List<BannerImageDto> updateAltText(@PathVariable String slug, @PathVariable long imageId,
                                              @RequestBody BannerAltTextRequest request) {
        return service.updateAltText(slug, imageId, request.altText());
    }

    @DeleteMapping("/api/profiles/{slug}/banner/{imageId}")
    public List<BannerImageDto> delete(@PathVariable String slug, @PathVariable long imageId) {
        return service.delete(slug, imageId);
    }
}
