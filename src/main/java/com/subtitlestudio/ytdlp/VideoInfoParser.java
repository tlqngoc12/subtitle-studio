package com.subtitlestudio.ytdlp;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.HashSet;
import java.util.Iterator;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Component;

/** Parses the JSON printed by {@code yt-dlp -J --skip-download} into a {@link VideoInfo}. */
@Component
public class VideoInfoParser {

    /** yt-dlp lists live chat replay under "subtitles"; it is not a caption track. */
    private static final String LIVE_CHAT = "live_chat";

    private final ObjectMapper mapper = new ObjectMapper();

    public VideoInfo parse(String json) {
        JsonNode root;
        try {
            root = mapper.readTree(json);
        } catch (JsonProcessingException e) {
            throw new YtDlpFailedException("Could not parse yt-dlp JSON output", e);
        }
        if (root == null || !root.isObject() || !hasText(root, "id")) {
            throw new YtDlpFailedException("yt-dlp JSON output has no video id");
        }

        String channel = hasText(root, "channel") ? root.get("channel").asText()
                : hasText(root, "uploader") ? root.get("uploader").asText()
                : null;

        String id = root.get("id").asText();
        return new VideoInfo(
                id,
                // Never blank: Oracle stores '' as NULL and video.title is NOT NULL.
                hasText(root, "title") ? root.get("title").asText() : id,
                channel,
                durationSec(root.get("duration")),
                languagesWithTracks(root.get("subtitles")),
                languagesWithTracks(root.get("automatic_captions")),
                hasText(root, "description") ? root.get("description").asText() : null);
    }

    private static Integer durationSec(JsonNode node) {
        if (node == null || !node.isNumber()) {
            return null;
        }
        return (int) Math.round(node.asDouble());
    }

    private static Set<String> languagesWithTracks(JsonNode node) {
        Set<String> langs = new HashSet<>();
        if (node == null || !node.isObject()) {
            return langs;
        }
        for (Iterator<Map.Entry<String, JsonNode>> it = node.fields(); it.hasNext(); ) {
            Map.Entry<String, JsonNode> entry = it.next();
            JsonNode tracks = entry.getValue();
            if (!entry.getKey().equals(LIVE_CHAT) && tracks.isArray() && !tracks.isEmpty()) {
                langs.add(entry.getKey());
            }
        }
        return langs;
    }

    private static boolean hasText(JsonNode root, String field) {
        JsonNode node = root.get(field);
        return node != null && node.isTextual() && !node.asText().isBlank();
    }
}
