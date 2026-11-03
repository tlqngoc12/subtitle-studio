package com.subtitlestudio.web;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

/**
 * Serves the React app for its client-side routes on a full page load or refresh.
 * Only the app's own routes are listed, so unknown /api paths still get a 404.
 */
@Controller
public class SpaForwardController {

    @GetMapping({"/vietsub", "/vietsub/", "/vietsub/{id}", "/vietsub/{id}/",
        "/profiles", "/profiles/", "/profiles/{slug}", "/profiles/{slug}/"})
    public String spa() {
        return "forward:/index.html";
    }
}
