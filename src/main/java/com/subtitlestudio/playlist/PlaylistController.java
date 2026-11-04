package com.subtitlestudio.playlist;

import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Playlist API (spec section 4). */
@RestController
@RequestMapping("/api/playlists")
public class PlaylistController {

    private final PlaylistService service;

    public PlaylistController(PlaylistService service) {
        this.service = service;
    }

    @GetMapping
    public List<PlaylistSummary> list(@RequestParam(required = false) String videoId) {
        return service.list(videoId);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public PlaylistDetail create(@RequestBody PlaylistRequest request) {
        return service.create(request.name(), request.description());
    }

    @GetMapping("/{id}")
    public PlaylistDetail get(@PathVariable long id) {
        return service.get(id);
    }

    @PatchMapping("/{id}")
    public PlaylistDetail update(@PathVariable long id, @RequestBody PlaylistRequest request) {
        return service.update(id, request.name(), request.description());
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable long id) {
        service.delete(id);
    }

    @PostMapping("/{id}/videos")
    public PlaylistDetail addVideo(@PathVariable long id, @RequestBody AddVideoRequest request) {
        return service.addVideo(id, request.videoId());
    }

    @DeleteMapping("/{id}/videos/{videoId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void removeVideo(@PathVariable long id, @PathVariable String videoId) {
        service.removeVideo(id, videoId);
    }

    @PutMapping("/{id}/order")
    public PlaylistDetail reorder(@PathVariable long id, @RequestBody OrderRequest request) {
        return service.reorder(id, request.videoIds());
    }
}
