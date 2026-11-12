package com.subtitlestudio.photo;

import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/** REST API of the Photos menu. */
@RestController
public class PhotoController {

    private final PhotoService service;
    private final XFetchService xFetch;

    public PhotoController(PhotoService service, XFetchService xFetch) {
        this.service = service;
        this.xFetch = xFetch;
    }

    @GetMapping("/api/photos")
    public List<PhotoPostDto> list() {
        return service.list();
    }

    @PostMapping("/api/photos")
    public ResponseEntity<PhotoPostDto> create(@RequestBody PhotoPostRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.create(request));
    }

    /** Reads the image, date and caption of an X post; the image is stored as an uploaded image. */
    @PostMapping("/api/photos/x-fetch")
    public XFetchResult xFetch(@RequestBody XFetchRequest request) {
        return xFetch.fetch(request.url());
    }

    @PutMapping("/api/photos/{id}")
    public PhotoPostDto update(@PathVariable long id, @RequestBody PhotoPostRequest request) {
        return service.update(id, request);
    }

    @DeleteMapping("/api/photos/{id}")
    public ResponseEntity<Void> delete(@PathVariable long id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
