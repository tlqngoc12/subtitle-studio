package com.subtitlestudio.video;

import java.io.IOException;
import java.util.List;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/** REST API for user-supplied Vietnamese subtitles (Phase 2 spec section 6). */
@RestController
public class VietsubController {

    private final VietsubService service;

    public VietsubController(VietsubService service) {
        this.service = service;
    }

    /** Adds or replaces the Vietsub of a video; {@code url} may also be a bare video id. */
    @PostMapping(path = "/api/vietsub", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public VideoDto add(@RequestParam("url") String url, @RequestPart("file") MultipartFile file) throws IOException {
        return VideoDto.from(service.add(url, file.getBytes()));
    }

    @GetMapping("/api/videos/{id}/vietsub")
    public List<ViCue> cues(@PathVariable String id) {
        return service.getCues(id);
    }

    @DeleteMapping("/api/videos/{id}/vietsub")
    public ResponseEntity<Void> clear(@PathVariable String id) {
        service.clear(id);
        return ResponseEntity.noContent().build();
    }
}
