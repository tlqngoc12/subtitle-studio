package com.subtitlestudio.video;

import com.subtitlestudio.subtitle.Cue;
import com.subtitlestudio.subtitle.SrtWriter;
import com.subtitlestudio.translate.PromptProfileStore;
import com.subtitlestudio.translate.SkipReason;
import com.subtitlestudio.translate.TranslateRequest;
import com.subtitlestudio.translate.TranslationService;
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
    private final PromptProfileStore profiles;
    private final TranslationService translation;

    public VideoController(SubtitleService service, SrtWriter srtWriter, PromptProfileStore profiles,
                           TranslationService translation) {
        this.service = service;
        this.srtWriter = srtWriter;
        this.profiles = profiles;
        this.translation = translation;
    }

    /**
     * 201 + Location when imported now, 200 when it was already stored. With a {@code profile}, the profile
     * is checked before fetching, then a translation starts when allowed ({@code skipReason} says why not).
     */
    @PostMapping
    public ResponseEntity<FetchResponse> fetch(@RequestBody FetchRequest request) {
        String profile = request.profile() == null || request.profile().isBlank() ? null : request.profile();
        if (profile != null) {
            profiles.read(profile); // UNKNOWN_PROFILE before any yt-dlp call
        }
        FetchResult result = service.fetch(request.url());
        Video video = result.video();
        SkipReason skipReason = null;
        if (profile != null) {
            skipReason = translation.startFromFetch(video.getId(), profile);
            if (skipReason == null) {
                video = service.get(video.getId()); // now TRANSLATING
            }
        }
        FetchResponse body = new FetchResponse(dto(video), skipReason);
        return result.created()
                ? ResponseEntity.created(URI.create("/api/videos/" + video.getId())).body(body)
                : ResponseEntity.ok(body);
    }

    /** "Dịch lại bằng Gemini": 202 with the video, now TRANSLATING. */
    @PostMapping("/{id}/translate")
    public ResponseEntity<VideoDto> translate(@PathVariable String id, @RequestBody TranslateRequest request) {
        translation.retranslate(id, request.profile());
        return ResponseEntity.accepted().body(dto(service.get(id)));
    }

    @GetMapping
    public List<VideoDto> list() {
        return service.list().stream().map(this::dto).toList();
    }

    @GetMapping("/{id}")
    public VideoDto get(@PathVariable String id) {
        return dto(service.get(id));
    }

    private VideoDto dto(Video v) {
        return VideoDto.from(v, translation.activeModel(v.getId()), translation.activePart(v.getId()));
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

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
