package com.subtitlestudio.photo;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.subtitlestudio.profile.MediaService;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.Locale;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Reads one public post from X's syndication endpoint (the one embedded posts use) and downloads its image. Called
 * only when the admin clicks "Fetch from X". Only the status and the id are logged, never the response body.
 */
@Component
public class XClient {

    static final String USER_AGENT = "SubtitleStudio";
    private static final String DIGITS = "0123456789abcdefghijklmnopqrstuvwxyz";
    private static final Logger log = LoggerFactory.getLogger(XClient.class);
    private static final DateTimeFormatter LEGACY_DATE =
            DateTimeFormatter.ofPattern("EEE MMM dd HH:mm:ss Z yyyy", Locale.ENGLISH);

    private final String baseUrl;
    private final Duration readTimeout;
    private final String imageHostSuffix;
    private final ObjectMapper mapper;
    private final HttpClient http;

    @Autowired
    public XClient(@Value("${subtitlestudio.x.base-url:https://cdn.syndication.twimg.com}") String baseUrl,
                   ObjectMapper mapper) {
        this(baseUrl, Duration.ofSeconds(5), Duration.ofSeconds(15), "twimg.com", mapper);
    }

    XClient(String baseUrl, Duration connectTimeout, Duration readTimeout, String imageHostSuffix,
            ObjectMapper mapper) {
        this.baseUrl = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
        this.readTimeout = readTimeout;
        this.imageHostSuffix = imageHostSuffix;
        this.mapper = mapper;
        this.http = HttpClient.newBuilder().connectTimeout(connectTimeout)
                .followRedirects(HttpClient.Redirect.NORMAL).build();
    }

    /**
     * The token react-tweet sends: {@code ((Number(id) / 1e15) * Math.PI).toString(36)} with every zero run and the
     * point removed. The base-36 text follows V8's {@code DoubleToRadixCString}, so it matches JavaScript digit for digit.
     */
    static String token(String id) {
        double value = Double.parseDouble(id) / 1e15 * Math.PI;
        return radix36(value).replaceAll("(0+|\\.)", "");
    }

    private static String radix36(double value) {
        double integer = Math.floor(value);
        double fraction = value - integer;
        double delta = Math.max(Double.MIN_VALUE, 0.5 * (Math.nextUp(value) - value));
        StringBuilder frac = new StringBuilder();
        if (fraction >= delta) {
            do {
                fraction *= 36;
                delta *= 36;
                int digit = (int) fraction;
                frac.append(DIGITS.charAt(digit));
                fraction -= digit;
                if ((fraction > 0.5 || (fraction == 0.5 && (digit & 1) == 1)) && fraction + delta > 1) {
                    // Round up, carrying into earlier digits (and into the integer part if every digit overflows).
                    int cursor = frac.length();
                    while (true) {
                        cursor--;
                        if (cursor < 0) {
                            integer += 1;
                            frac.setLength(0);
                            break;
                        }
                        int d = DIGITS.indexOf(frac.charAt(cursor));
                        if (d + 1 < 36) {
                            frac.setLength(cursor);
                            frac.append(DIGITS.charAt(d + 1));
                            break;
                        }
                    }
                    break;
                }
            } while (fraction >= delta);
        }
        StringBuilder out = new StringBuilder();
        long whole = (long) integer;
        if (whole == 0) {
            out.append('0');
        }
        while (whole > 0) {
            out.insert(0, DIGITS.charAt((int) (whole % 36)));
            whole /= 36;
        }
        if (frac.length() > 0) {
            out.append('.').append(frac);
        }
        return out.toString();
    }

    public XTweet fetch(String id) {
        URI uri = URI.create(baseUrl + "/tweet-result?id=" + id + "&lang=en&token=" + token(id));
        HttpResponse<byte[]> response;
        try {
            response = http.send(request(uri, "application/json"), HttpResponse.BodyHandlers.ofByteArray());
        } catch (IOException e) {
            log.warn("Could not reach X for post {}: {}", id, e.getClass().getSimpleName());
            throw new XUnavailableException("Could not reach X", e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new XUnavailableException("Interrupted while waiting for X", e);
        }
        int code = response.statusCode();
        if (code == 404) {
            log.info("X post {} not found (404)", id);
            throw new XPostNotFoundException();
        }
        if (code != 200) {
            log.warn("X answered {} for post {}", code, id);
            throw new XUnavailableException("X answered " + code);
        }
        JsonNode root;
        try {
            root = mapper.readTree(response.body());
        } catch (IOException e) {
            log.warn("X answered 200 for post {} but not with JSON", id);
            throw new XUnavailableException("X did not answer with JSON", e);
        }
        if (root == null || !root.isObject() || root.isEmpty()
                || "TweetTombstone".equals(root.path("__typename").asText())) {
            log.info("X post {} is empty or a tombstone", id);
            throw new XPostNotFoundException();
        }
        return new XTweet(imageOf(root), instantOf(root.path("created_at")), root.path("text").asText(null));
    }

    /** The first photo, otherwise the poster of the first video or GIF. */
    private static String imageOf(JsonNode root) {
        String poster = null;
        for (JsonNode m : root.path("mediaDetails")) {
            String url = m.path("media_url_https").asText(null);
            if (url == null || url.isBlank()) {
                continue;
            }
            if ("photo".equals(m.path("type").asText())) {
                return url;
            }
            if (poster == null) {
                poster = url;
            }
        }
        return poster;
    }

    private static Instant instantOf(JsonNode v) {
        if (!v.isTextual()) {
            return null;
        }
        try {
            return OffsetDateTime.parse(v.asText()).toInstant();
        } catch (DateTimeParseException ignored) {
            // X's older format is tried next.
        }
        try {
            return ZonedDateTime.parse(v.asText(), LEGACY_DATE).toInstant();
        } catch (DateTimeParseException e) {
            return null;
        }
    }

    /** Downloads the image at full size ({@code name=orig}), falling back to the plain URL; at most 10 MB. */
    public byte[] downloadImage(String imageUrl, String id) {
        URI plain = checkedImageUri(imageUrl);
        URI orig = URI.create(imageUrl + (imageUrl.contains("?") ? "&" : "?") + "name=orig");
        try {
            byte[] big = getImage(orig, id);
            if (big != null) {
                return big;
            }
        } catch (XUnavailableException ignored) {
            // The original size is optional; the standard one is tried next.
        }
        byte[] standard = getImage(plain, id);
        if (standard == null) {
            throw new XUnavailableException("X image answered with an error");
        }
        return standard;
    }

    private URI checkedImageUri(String imageUrl) {
        URI uri;
        try {
            uri = URI.create(imageUrl);
        } catch (IllegalArgumentException e) {
            throw new XUnavailableException("Bad image URL", e);
        }
        String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase(Locale.ROOT);
        boolean hostOk = host.equals(imageHostSuffix) || host.endsWith("." + imageHostSuffix);
        boolean schemeOk = "https".equals(uri.getScheme()) || "http".equals(uri.getScheme());
        if (!hostOk || !schemeOk) {
            throw new XUnavailableException("Image is not on X's image host");
        }
        return uri;
    }

    /** The bytes of a 200 answer, or null for any other status; throws when the body is over the limit. */
    private byte[] getImage(URI uri, String id) {
        try {
            HttpResponse<InputStream> r = http.send(request(uri, "image/*"),
                    HttpResponse.BodyHandlers.ofInputStream());
            try (InputStream in = r.body()) {
                if (r.statusCode() != 200) {
                    return null;
                }
                byte[] bytes = in.readNBytes((int) MediaService.MAX_BYTES + 1);
                if (bytes.length > MediaService.MAX_BYTES) {
                    log.warn("X image for post {} is over the size limit", id);
                    throw new XUnavailableException("X image is too large");
                }
                return bytes.length == 0 ? null : bytes;
            }
        } catch (IOException e) {
            log.warn("Could not download the X image for post {}: {}", id, e.getClass().getSimpleName());
            throw new XUnavailableException("Could not reach X", e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new XUnavailableException("Interrupted while waiting for X", e);
        }
    }

    private HttpRequest request(URI uri, String accept) {
        return HttpRequest.newBuilder(uri).timeout(readTimeout).header("User-Agent", USER_AGENT)
                .header("Accept", accept).GET().build();
    }
}
