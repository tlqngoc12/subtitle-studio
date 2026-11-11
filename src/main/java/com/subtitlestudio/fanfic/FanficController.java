package com.subtitlestudio.fanfic;

import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/** REST API of the Fanfics tab (admin). */
@RestController
public class FanficController {

    private final FanficService service;

    public FanficController(FanficService service) {
        this.service = service;
    }

    @GetMapping("/api/fanfics")
    public List<FanficDto> list() {
        return service.list();
    }

    @PostMapping("/api/fanfics/preview")
    public FanficDto preview(@RequestBody FanficUrlRequest request) {
        return service.preview(request.url());
    }

    @PostMapping("/api/fanfics")
    public ResponseEntity<FanficDto> add(@RequestBody FanficUrlRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.add(request.url()));
    }

    @PostMapping("/api/fanfics/refresh")
    public RefreshAllResult refreshAll() {
        return service.refreshAll();
    }

    @PostMapping("/api/fanfics/{id}/refresh")
    public FanficDto refresh(@PathVariable long id) {
        return service.refresh(id);
    }

    @DeleteMapping("/api/fanfics/{id}")
    public ResponseEntity<Void> delete(@PathVariable long id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
