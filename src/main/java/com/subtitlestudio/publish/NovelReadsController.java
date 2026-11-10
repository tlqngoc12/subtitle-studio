package com.subtitlestudio.publish;

import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** Read totals per novel slug for the admin Novels page; {@code {}} when unavailable. */
@RestController
public class NovelReadsController {

    private final NovelReadsService service;

    public NovelReadsController(NovelReadsService service) {
        this.service = service;
    }

    @GetMapping("/api/novels/reads")
    public Map<String, Long> reads() {
        return service.counts();
    }
}
