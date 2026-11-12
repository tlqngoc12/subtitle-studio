package com.subtitlestudio.photo;

import com.subtitlestudio.profile.FieldError;
import com.subtitlestudio.profile.InvalidBlockException;
import com.subtitlestudio.profile.Media;
import com.subtitlestudio.profile.MediaController;
import com.subtitlestudio.profile.MediaService;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;

/**
 * "Fetch from X" in the Add post dialog: reads the post, downloads its first image and stores it like a manual upload
 * (1600 px WebP). Runs outside any transaction so a slow X never holds a database connection.
 */
@Service
public class XFetchService {

    static final ZoneId ZONE = ZoneId.of("Asia/Ho_Chi_Minh");
    static final int IMAGE_SIDE = 1600;
    private static final Pattern TRAILING_LINKS = Pattern.compile("(\\s*https?://t\\.co/\\w+)+\\s*$");

    private final XClient x;
    private final MediaService mediaService;

    public XFetchService(XClient x, MediaService mediaService) {
        this.x = x;
        this.mediaService = mediaService;
    }

    public XFetchResult fetch(String link) {
        String id = XStatusUrl.statusId(link).orElseThrow(() -> new InvalidBlockException(
                List.of(new FieldError("postUrl", "Paste the link of an X post (…/status/123)"))));
        XTweet tweet = x.fetch(id);
        if (tweet.imageUrl() == null) {
            throw new XPostHasNoImageException();
        }
        byte[] bytes = x.downloadImage(tweet.imageUrl(), id);
        Media media = mediaService.storeResized("x-" + id, bytes, IMAGE_SIDE);
        LocalDate takenOn = tweet.createdAt() == null ? null : tweet.createdAt().atZone(ZONE).toLocalDate();
        return new XFetchResult(media.getId(), MediaController.url(media.getId()), media.getWidth(), media.getHeight(),
                takenOn, caption(tweet.text()));
    }

    /** The post text without its trailing t.co media links, cut to the title limit; null when nothing is left. */
    static String caption(String text) {
        if (text == null) {
            return null;
        }
        String clean = TRAILING_LINKS.matcher(text.strip()).replaceFirst("").strip();
        if (clean.isEmpty()) {
            return null;
        }
        if (clean.codePointCount(0, clean.length()) > PhotoService.MAX_TITLE) {
            int end = clean.offsetByCodePoints(0, PhotoService.MAX_TITLE - 1);
            clean = clean.substring(0, end).stripTrailing() + "…";
        }
        return clean;
    }
}
