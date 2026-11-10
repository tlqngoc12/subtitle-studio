package com.subtitlestudio.translate;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.google.genai.types.Content;
import com.google.genai.types.GenerateContentConfig;
import com.google.genai.types.Part;
import com.google.genai.types.Schema;
import com.google.genai.types.Type;
import com.subtitlestudio.config.SubtitleStudioProperties;
import com.subtitlestudio.translate.CorrectionReader.Correction;
import com.subtitlestudio.video.Video;
import com.subtitlestudio.video.VideoRepository;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;

/**
 * Proposes a better translation profile from the lines translators corrected: for a profile, the finished hand-made
 * videos made with it give (English, AI, final) triples, and one Gemini call turns the changes into a new profile
 * text. Nothing is written here; saving goes through {@link PromptProfileStore#write}.
 */
@Service
public class ProfileAnalyzer {

    /** At most this many corrected lines, and this many characters of them, go into one request. */
    static final int MAX_LINES = 300;
    static final int MAX_CHARS = 30_000;

    static final String SYSTEM_RULES = """
            Bạn giúp người dịch phụ đề cải thiện hồ sơ dịch (file Markdown hướng dẫn cho AI) của một series. \
            Bạn nhận hồ sơ hiện tại và các câu người dịch đã SỬA so với bản AI: mỗi mục có EN (tiếng Anh gốc), \
            AI (bản AI dịch) và FINAL (bản người dịch chốt).
            - Phân tích các chỗ người dịch sửa bản AI (xưng hô, tên riêng, thuật ngữ, giọng văn, lỗi lặp lại...).
            - Chỉ thêm hoặc sửa quy tắc khi có ít nhất 2 câu sửa ủng hộ. Ghi số câu ủng hộ vào count của quy tắc đó.
            - Giữ nguyên cấu trúc và các mục của hồ sơ. Không xoá quy tắc cũ, trừ khi các câu sửa mâu thuẫn rõ với nó.
            - Viết tiếng Việt, ngắn gọn, có ví dụ "sai → đúng" khi cần.
            - proposed là TOÀN BỘ nội dung hồ sơ mới (Markdown), dưới 20 KB. rules liệt kê các quy tắc bạn thêm hoặc sửa.
            - Chỉ trả về JSON theo schema, không giải thích.""";

    private static final Logger log = LoggerFactory.getLogger(ProfileAnalyzer.class);

    public record Stats(int videos, int correctedLines) {}

    public record Details(String name, String text, String sha, Stats stats) {}

    public record Rule(String text, int count) {}

    public record BasedOn(int videos, int lines) {}

    public record Analysis(String proposed, List<Rule> rules, BasedOn basedOn, String model, String sha) {}

    /** The triples chosen for one request: newest video first, and how many videos they came from. */
    record Selection(List<Correction> lines, int videos) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    private record Output(List<Rule> rules, String proposed) {}

    private final PromptProfileStore store;
    private final VideoRepository videos;
    private final CorrectionReader reader;
    private final GeminiCaller caller;
    private final SubtitleStudioProperties.Gemini settings;
    private final ObjectMapper mapper;

    @Autowired
    public ProfileAnalyzer(PromptProfileStore store, VideoRepository videos, CorrectionReader reader,
                           GeminiCaller caller, SubtitleStudioProperties properties, ObjectMapper mapper) {
        this.store = store;
        this.videos = videos;
        this.reader = reader;
        this.caller = caller;
        this.settings = properties.gemini();
        this.mapper = mapper;
    }

    /** The profile text, its SHA and how much corrected material exists for it. */
    public Details details(String name) {
        String text = store.read(name);
        int lines = 0;
        int withCorrections = 0;
        for (List<Correction> corrected : correctionsPerVideo(name)) {
            lines += corrected.size();
            withCorrections++;
        }
        return new Details(name, text, PromptProfileStore.sha256(text), new Stats(withCorrections, lines));
    }

    /** One Gemini call; throws {@link NoCorrectionsException} before calling when no line was corrected. */
    public Analysis analyze(String name) {
        String profile = store.read(name);
        Selection selection = select(correctionsPerVideo(name));
        if (selection.lines().isEmpty()) {
            throw new NoCorrectionsException("No corrected lines yet for " + name);
        }
        if (!settings.configured()) {
            throw new GeminiNotConfiguredException(name);
        }
        GeminiCaller.Answer answer = caller.generate(
                List.of(Part.fromText(userText(profile, selection.lines()))), config());
        Output output = parse(answer);
        log.info("analyze {}: {} lines from {} videos, model {}", name, selection.lines().size(),
                selection.videos(), answer.model());
        return new Analysis(output.proposed(), output.rules() == null ? List.of() : output.rules(),
                new BasedOn(selection.videos(), selection.lines().size()), answer.model(),
                PromptProfileStore.sha256(profile));
    }

    /** Takes lines video by video (newest first) until {@link #MAX_LINES} or {@link #MAX_CHARS} would be passed. */
    static Selection select(List<List<Correction>> perVideo) {
        List<Correction> chosen = new ArrayList<>();
        int chars = 0;
        int used = 0;
        outer:
        for (List<Correction> corrected : perVideo) {
            boolean any = false;
            for (Correction c : corrected) {
                int size = c.en().length() + c.ai().length() + c.vi().length();
                if (chosen.size() >= MAX_LINES || chars + size > MAX_CHARS) {
                    if (any) {
                        used++;
                    }
                    break outer;
                }
                chosen.add(c);
                chars += size;
                any = true;
            }
            if (any) {
                used++;
            }
        }
        return new Selection(chosen, used);
    }

    private List<List<Correction>> correctionsPerVideo(String name) {
        List<List<Correction>> out = new ArrayList<>();
        for (Video video : videos.findExampleVideos(name, "", Pageable.unpaged())) {
            List<Correction> corrected = reader.readCorrected(video.getId());
            if (!corrected.isEmpty()) {
                out.add(corrected);
            }
        }
        return out;
    }

    private static String userText(String profile, List<Correction> lines) {
        StringBuilder text = new StringBuilder("# Hồ sơ hiện tại\n").append(profile)
                .append("\n\n# Các câu người dịch đã sửa (").append(lines.size()).append(")\n");
        int n = 1;
        for (Correction c : lines) {
            text.append('\n').append(n++).append(".\nEN: ").append(oneLine(c.en()))
                    .append("\nAI: ").append(oneLine(c.ai()))
                    .append("\nFINAL: ").append(oneLine(c.vi())).append('\n');
        }
        return text.toString();
    }

    private static String oneLine(String s) {
        return s.strip().replaceAll("\\s*\\R\\s*", " / ");
    }

    private Output parse(GeminiCaller.Answer answer) {
        Output output;
        try {
            output = mapper.readValue(answer.text(), Output.class);
        } catch (JsonProcessingException e) {
            log.warn("Gemini {} analysis answer is not the expected JSON ({} chars)", answer.model(),
                    answer.text().length());
            throw new AnalysisInvalidException("Gemini returned an answer that is not valid JSON");
        }
        String proposed = output == null ? null : output.proposed();
        if (proposed == null || proposed.isBlank()) {
            throw new AnalysisInvalidException("Gemini proposed an empty profile");
        }
        if (proposed.getBytes(StandardCharsets.UTF_8).length > PromptProfileStore.MAX_BYTES) {
            throw new AnalysisInvalidException("Gemini proposed a profile larger than 20 KB");
        }
        return output;
    }

    private GenerateContentConfig config() {
        Schema string = Schema.builder().type(Type.Known.STRING).build();
        Schema rule = Schema.builder().type(Type.Known.OBJECT)
                .properties(Map.of("text", string, "count", Schema.builder().type(Type.Known.INTEGER).build()))
                .required("text", "count").build();
        Schema root = Schema.builder().type(Type.Known.OBJECT)
                .properties(Map.of("rules", Schema.builder().type(Type.Known.ARRAY).items(rule).build(),
                        "proposed", string))
                .required("rules", "proposed").build();
        return GenerateContentConfig.builder()
                .systemInstruction(Content.fromParts(Part.fromText(SYSTEM_RULES)))
                .responseMimeType("application/json")
                .responseSchema(root)
                .temperature((float) settings.temperature())
                .build();
    }
}
