package com.subtitlestudio.novel;

import com.subtitlestudio.profile.FieldError;
import com.subtitlestudio.profile.InvalidMediaException;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/** Chapters and their pages (spec section 6). */
@RestController
public class ChapterController {

    private final ChapterService service;
    private final ChapterTranslationService translation;
    private final com.subtitlestudio.novel.wattpad.WattpadNovelService wattpadNovels;
    private final NovelExportService exports;

    public ChapterController(ChapterService service, ChapterTranslationService translation,
                             com.subtitlestudio.novel.wattpad.WattpadNovelService wattpadNovels,
                             NovelExportService exports) {
        this.exports = exports;
        this.wattpadNovels = wattpadNovels;
        this.service = service;
        this.translation = translation;
    }

    @GetMapping("/api/chapters/{id}/review")
    public ChapterReview review(@PathVariable long id) {
        return service.review(id);
    }

    @PostMapping("/api/chapters/{id}/translate")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public ChapterDetail translate(@PathVariable long id) {
        return translation.start(id);
    }

    @PostMapping("/api/chapters/{id}/reload-original")
    public ChapterDetail reloadOriginal(@PathVariable long id) {
        return wattpadNovels.reloadOriginal(id);
    }

    /** Replaces the text of a Draft chapter of an original story with a part of its linked Wattpad story. */
    @PostMapping("/api/chapters/{id}/wattpad-sync")
    public ChapterDetail wattpadSync(@PathVariable long id, @RequestBody WattpadSyncRequest request) {
        return wattpadNovels.syncOriginal(id, request.partId());
    }

    @PostMapping("/api/chapters/{id}/publish")
    public ChapterDetail publish(@PathVariable long id) {
        return translation.publish(id);
    }

    @PostMapping("/api/chapters/{id}/unpublish")
    public ChapterDetail unpublish(@PathVariable long id) {
        return translation.unpublish(id);
    }

    /** A zip with the chapter's .md and paste-ready .html. */
    @GetMapping("/api/chapters/{id}/export")
    public ResponseEntity<byte[]> export(@PathVariable long id) {
        NovelExportService.NovelExport export = exports.exportChapter(id);
        ContentDisposition disposition = ContentDisposition.attachment().filename(export.fileName()).build();
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("application/zip"))
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
                .body(export.zip());
    }

    @PostMapping("/api/novels/{novelId}/chapters")
    @ResponseStatus(HttpStatus.CREATED)
    public ChapterDetail add(@PathVariable long novelId, @RequestBody ChapterRequest request) {
        return service.add(novelId, request);
    }

    @GetMapping("/api/chapters/{id}")
    public ChapterDetail get(@PathVariable long id) {
        return service.get(id);
    }

    @PutMapping("/api/chapters/{id}")
    public ChapterDetail update(@PathVariable long id, @RequestBody ChapterUpdateRequest request) {
        return service.update(id, request);
    }

    @DeleteMapping("/api/chapters/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable long id) {
        service.delete(id);
    }

    @PostMapping(path = "/api/chapters/{id}/pages", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    public List<PageDto> addPages(@PathVariable long id,
                                  @RequestPart(value = "files", required = false) List<MultipartFile> files)
            throws IOException {
        if (files == null || files.isEmpty()) {
            throw new InvalidMediaException("Missing files");
        }
        List<NamedImage> images = new ArrayList<>();
        for (MultipartFile f : files) {
            images.add(NamedImage.of(f));
        }
        return service.addPages(id, images);
    }

    @PostMapping("/api/chapters/{id}/pages/{pageId}/rotate")
    public List<PageDto> rotatePage(@PathVariable long id, @PathVariable long pageId,
                                    @RequestBody RotateRequest request) {
        return service.rotatePage(id, pageId, direction(request));
    }

    @PostMapping("/api/chapters/{id}/pages/rotate")
    public List<PageDto> rotatePages(@PathVariable long id, @RequestBody RotateRequest request) {
        return service.rotatePages(id, direction(request));
    }

    @PutMapping("/api/chapters/{id}/pages/order")
    public List<PageDto> reorder(@PathVariable long id, @RequestBody PageOrderRequest request) {
        return service.reorder(id, request);
    }

    @DeleteMapping("/api/chapters/{id}/pages/{pageId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deletePage(@PathVariable long id, @PathVariable long pageId) {
        service.deletePage(id, pageId);
    }

    private static RotateDirection direction(RotateRequest request) {
        if (request.direction() == null) {
            throw new InvalidChapterException(List.of(new FieldError("direction", "Direction is required.")));
        }
        return request.direction();
    }
}
