package com.subtitlestudio.profile;

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

/** REST API of the profile pages (spec section 5). */
@RestController
public class ProfileController {

    private final ProfileService service;

    public ProfileController(ProfileService service) {
        this.service = service;
    }

    @GetMapping("/api/profiles")
    public ProfilePageDto page() {
        return service.page();
    }

    @PutMapping("/api/profiles/order")
    public List<ProfileDto> reorder(@RequestBody MemberOrderRequest request) {
        return service.reorder(request);
    }

    @PostMapping("/api/profiles")
    public ResponseEntity<ProfileDto> addMember(@RequestBody NewMemberRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.addMember(request));
    }

    @PutMapping("/api/profiles/{slug}/header")
    public ProfileDto updateHeader(@PathVariable String slug, @RequestBody ProfileHeaderRequest request) {
        return service.updateHeader(slug, request);
    }

    @DeleteMapping("/api/profiles/{slug}")
    public ResponseEntity<Void> deleteMember(@PathVariable String slug) {
        service.deleteMember(slug);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/api/profiles/{slug}")
    public ProfileDto get(@PathVariable String slug) {
        return service.get(slug);
    }

    @PostMapping("/api/profiles/{slug}/blocks")
    public ResponseEntity<BlockDto> add(@PathVariable String slug, @RequestBody BlockRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.addBlock(slug, request));
    }

    @PutMapping("/api/profiles/{slug}/blocks/{id}")
    public BlockDto update(@PathVariable String slug, @PathVariable long id, @RequestBody BlockRequest request) {
        return service.updateBlock(slug, id, request);
    }

    @DeleteMapping("/api/profiles/{slug}/blocks/{id}")
    public ResponseEntity<Void> delete(@PathVariable String slug, @PathVariable long id) {
        service.deleteBlock(slug, id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/api/profiles/{slug}/blocks/{id}/move")
    public List<BlockDto> move(@PathVariable String slug, @PathVariable long id, @RequestBody MoveRequest request) {
        if (request.direction() == null) {
            throw new InvalidBlockException(List.of(new FieldError("direction", "Direction is required")));
        }
        return service.move(slug, id, request.direction());
    }
}
