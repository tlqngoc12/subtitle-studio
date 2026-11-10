package com.subtitlestudio.web;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

/**
 * Serves the React app for its client-side routes on a full page load or refresh.
 * Only the app's own routes are listed, so unknown /api paths still get a 404.
 */
@Controller
public class SpaForwardController {

    @GetMapping({"/vietsub", "/vietsub/", "/vietsub/{id}", "/vietsub/{id}/", "/vietsub/{id}/edit", "/vietsub/{id}/edit/",
        "/vietsub/playlists/{id}", "/vietsub/playlists/{id}/", "/vietsub/profiles", "/vietsub/profiles/",
        "/profiles", "/profiles/", "/profiles/{slug}", "/profiles/{slug}/",
        "/novels", "/novels/", "/novels/{id}", "/novels/{id}/",
        "/novels/{id}/chapters/{chapterId}", "/novels/{id}/chapters/{chapterId}/"})
    public String spa() {
        return "forward:/index.html";
    }
}
