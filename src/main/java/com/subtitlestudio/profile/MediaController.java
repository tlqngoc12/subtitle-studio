package com.subtitlestudio.profile;

import java.io.IOException;
import java.net.URI;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/** Upload and serve profile images (spec section 4). */
@RestController
public class MediaController {

    private final MediaService service;

    public MediaController(MediaService service) {
        this.service = service;
    }

    public record MediaDto(long id, String url) {}

    public static String url(long id) {
        return "/api/media/" + id;
    }

    @PostMapping(path = "/api/media", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<MediaDto> upload(@RequestPart(value = "file", required = false) MultipartFile file)
            throws IOException {
        if (file == null) {
            throw new InvalidMediaException("Missing file");
        }
        Media saved = service.store(file.getOriginalFilename(), file.getBytes());
        return ResponseEntity.created(URI.create(url(saved.getId()))).body(new MediaDto(saved.getId(), url(saved.getId())));
    }

    /** Ids never get new content, so browsers may cache an image forever. */
    @GetMapping("/api/media/{id}")
    public ResponseEntity<Resource> get(@PathVariable long id) {
        StoredMedia stored = service.load(id);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(stored.contentType()))
                .header("Cache-Control", "public, max-age=31536000, immutable")
                .header("X-Content-Type-Options", "nosniff")
                .body(new FileSystemResource(stored.path()));
    }
}
