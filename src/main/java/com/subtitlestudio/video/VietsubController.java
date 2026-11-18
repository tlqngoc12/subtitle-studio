package com.subtitlestudio.video;

import com.subtitlestudio.config.GeminiSettings;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/** REST API for user-supplied Vietnamese subtitles (Phase 2 spec section 6). */
@RestController
public class VietsubController {

    private final VietsubService service;
    private final GeminiSettings gemini;

    public VietsubController(VietsubService service, GeminiSettings gemini) {
        this.service = service;
        this.gemini = gemini;
    }

    /** Adds or replaces the Vietsub of a video; {@code url} may also be a bare video id. */
    @PostMapping(path = "/api/vietsub", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public VideoDto add(@RequestParam("url") String url, @RequestPart("file") MultipartFile file) throws IOException {
        return dto(service.add(url, file.getBytes()));
    }

    @GetMapping("/api/videos/{id}/vietsub")
    public List<ViCue> cues(@PathVariable String id) {
        return service.getCues(id);
    }

    /** The live editor's save: edited text of every line; the Vietsub becomes MANUAL. */
    @PutMapping("/api/videos/{id}/vietsub/text")
    public VideoDto saveText(@PathVariable String id, @RequestBody VietsubTextRequest request) {
        return dto(service.saveText(id, request));
    }

    /** Marks the Vietsub as DONE or back to IN_PROGRESS. */
    @PutMapping("/api/videos/{id}/edit-status")
    public VideoDto setEditStatus(@PathVariable String id, @RequestBody EditStatusRequest request) {
        return dto(service.setEditStatus(id, request.status()));
    }

    @GetMapping("/api/videos/{id}/subtitle.vi.srt")
    public ResponseEntity<byte[]> download(@PathVariable String id, @RequestParam(defaultValue = "false") boolean bom) {
        SrtExport export = service.exportSrt(id, bom);
        ContentDisposition disposition = ContentDisposition.attachment()
                .filename(export.fileName(), StandardCharsets.UTF_8)
                .build();
        return ResponseEntity.ok()
                .contentType(VideoController.SUBRIP)
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
                .body(export.body());
    }

    @DeleteMapping("/api/videos/{id}/vietsub")
    public ResponseEntity<Void> clear(@PathVariable String id) {
        service.clear(id);
        return ResponseEntity.noContent().build();
    }

    private VideoDto dto(Video v) {
        return VideoDto.from(v, null, null, gemini.current().model());
    }
}
