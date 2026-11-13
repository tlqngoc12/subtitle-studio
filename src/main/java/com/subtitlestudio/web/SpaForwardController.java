package com.subtitlestudio.web;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

/**
 * Serves the React app for its client-side routes on a full page load or refresh, and for any unknown path, so
 * the app shows its own "Page not found" instead of a JSON error. There is no list of routes to keep up to date.
 *
 * <p>A path is forwarded to {@code index.html} when it has one to four segments, none of them contains a dot (so
 * real files such as {@code /logo.webp} or {@code /assets/app.js} are served as files, or are 404 when missing) and
 * the first segment is not {@code api} (so unknown API paths still get the JSON 404). Each shape also has a
 * trailing-slash form because trailing-slash matching is off.
 */
@Controller
public class SpaForwardController {

    /** One path segment without a dot. */
    private static final String SEG = "[^.]+";
    /** The first segment: no dot, and not exactly {@code api}. */
    private static final String FIRST = "(?!api$)[^.]+";

    @GetMapping({
        "/{a:" + FIRST + "}", "/{a:" + FIRST + "}/",
        "/{a:" + FIRST + "}/{b:" + SEG + "}", "/{a:" + FIRST + "}/{b:" + SEG + "}/",
        "/{a:" + FIRST + "}/{b:" + SEG + "}/{c:" + SEG + "}", "/{a:" + FIRST + "}/{b:" + SEG + "}/{c:" + SEG + "}/",
        "/{a:" + FIRST + "}/{b:" + SEG + "}/{c:" + SEG + "}/{d:" + SEG + "}",
        "/{a:" + FIRST + "}/{b:" + SEG + "}/{c:" + SEG + "}/{d:" + SEG + "}/"})
    public String spa() {
        return "forward:/index.html";
    }
}
