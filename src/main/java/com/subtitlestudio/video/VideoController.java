package com.subtitlestudio.video;

import com.subtitlestudio.subtitle.Cue;
import com.subtitlestudio.subtitle.SrtWriter;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** REST API for fetched videos and their English subtitles (PLAN section 6). */
@RestController
@RequestMapping("/api/videos")
public class VideoController {

    static final MediaType SUBRIP = new MediaType("application", "x-subrip", StandardCharsets.UTF_8);

    private final SubtitleService service;
    private final SrtWriter srtWriter;

    public VideoController(SubtitleService service, SrtWriter srtWriter) {
        this.service = service;
        this.srtWriter = srtWriter;
    }

    /** 201 + Location when imported now, 200 when it was already stored. */
    @PostMapping
    public ResponseEntity<VideoDto> fetch(@RequestBody FetchRequest request) {
        FetchResult result = service.fetch(request.url());
        VideoDto body = VideoDto.from(result.video());
        return result.created()
                ? ResponseEntity.created(URI.create("/api/videos/" + body.id())).body(body)
                : ResponseEntity.ok(body);
    }

    @GetMapping
    public List<VideoDto> list() {
        return service.list().stream().map(VideoDto::from).toList();
    }

    @GetMapping("/{id}")
    public VideoDto get(@PathVariable String id) {
        return VideoDto.from(service.get(id));
    }

    @GetMapping("/{id}/cues")
    public List<CueDto> cues(@PathVariable String id) {
        List<Cue> cues = service.getCues(id);
        List<CueDto> dtos = new ArrayList<>(cues.size());
        for (int i = 0; i < cues.size(); i++) {
            Cue c = cues.get(i);
            dtos.add(new CueDto(i, c.startMs(), c.endMs(), c.text()));
        }
        return dtos;
    }

    @GetMapping("/{id}/subtitle.srt")
    public ResponseEntity<byte[]> downloadSrt(@PathVariable String id,
                                              @RequestParam(defaultValue = "false") boolean bom) {
        Video video = service.get(id);
        byte[] body = srtWriter.toBytes(service.getCues(id), bom);
        ContentDisposition disposition = ContentDisposition.attachment()
                .filename(srtWriter.fileName(video.getTitle(), video.getId()), StandardCharsets.UTF_8)
                .build();
        return ResponseEntity.ok()
                .contentType(SUBRIP)
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
                .body(body);
    }

    @PostMapping("/{id}/refresh")
    public VideoDto refresh(@PathVariable String id) {
        return VideoDto.from(service.refresh(id));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
