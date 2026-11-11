package com.subtitlestudio.profile;

import java.io.IOException;
import java.net.URI;
import java.util.List;
import java.util.Set;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/** Upload and serve profile images (spec section 4). */
@RestController
public class MediaController {

    private static final Set<Integer> ALLOWED_MAX_SIDES = Set.of(400, 1600);

    private final MediaService service;

    public MediaController(MediaService service) {
        this.service = service;
    }

    public record MediaDto(long id, String url, Integer width, Integer height) {}

    public static String url(long id) {
        return "/api/media/" + id;
    }

    @PostMapping(path = "/api/media", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<MediaDto> upload(@RequestPart(value = "file", required = false) MultipartFile file,
                                           @RequestParam(value = "maxSide", required = false) Integer maxSide)
            throws IOException {
        if (maxSide != null && !ALLOWED_MAX_SIDES.contains(maxSide)) {
            throw new InvalidBlockException(List.of(new FieldError("maxSide", "maxSide must be 400 or 1600")));
        }
        if (file == null) {
            throw new InvalidMediaException("Missing file");
        }
        Media saved = maxSide == null
                ? service.store(file.getOriginalFilename(), file.getBytes())
                : service.storeResized(file.getOriginalFilename(), file.getBytes(), maxSide);
        return ResponseEntity.created(URI.create(url(saved.getId())))
                .body(new MediaDto(saved.getId(), url(saved.getId()), saved.getWidth(), saved.getHeight()));
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
