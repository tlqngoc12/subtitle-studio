package com.subtitlestudio.novel;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.google.genai.types.Content;
import com.google.genai.types.GenerateContentConfig;
import com.google.genai.types.Part;
import com.google.genai.types.Schema;
import com.google.genai.types.Type;
import com.subtitlestudio.config.GeminiSettings;
import com.subtitlestudio.config.SubtitleStudioProperties;
import com.subtitlestudio.novel.NovelCorrections.Edit;
import com.subtitlestudio.translate.AnalysisInvalidException;
import com.subtitlestudio.translate.GeminiCaller;
import com.subtitlestudio.translate.GeminiNotConfiguredException;
import com.subtitlestudio.translate.NoCorrectionsException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeSet;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * Proposes a better translation profile for a novel from the paragraphs the translator corrected in its published
 * chapters (AI translation against final text). One Gemini call turns the corrections into a new profile text, a list
 * of rules and term/addressing suggestions. Nothing is written by {@link #analyze}; {@link #save} writes through
 * {@link NovelProfileStore}.
 */
@Service
public class NovelProfileAnalyzer {

    /** At most this many edits, and this many characters of them, go into one request. */
    static final int MAX_EDITS = 300;
    static final int MAX_CHARS = 30_000;
    /** A side longer than this is cut and ends with an ellipsis. */
    static final int MAX_SIDE = 2_000;
    /** Same limit as the profile store (20 KB). */
    private static final int MAX_PROFILE_BYTES = 20 * 1024;

    static final String SYSTEM_RULES = """
            Bạn giúp người dịch truyện cải thiện hồ sơ dịch (file Markdown hướng dẫn cho AI) của một truyện. \
            Bạn nhận hồ sơ hiện tại và các ĐOẠN VĂN người dịch đã SỬA so với bản AI: mỗi mục có GỐC (văn bản gốc, \
            có thể không có), AI (bản AI dịch) và FINAL (bản người dịch chốt). "(trống)" nghĩa là phía đó không có đoạn nào.
            - Phân tích các chỗ người dịch sửa bản AI (xưng hô, tên riêng, thuật ngữ, giọng văn, lỗi lặp lại...).
            - Chỉ thêm hoặc sửa quy tắc khi có ít nhất 2 đoạn sửa ủng hộ. Ghi số đoạn ủng hộ vào count của quy tắc đó.
            - Giữ nguyên cấu trúc và các mục của hồ sơ. Không xoá quy tắc cũ, trừ khi các đoạn sửa mâu thuẫn rõ với nó.
            - Luôn giữ quy tắc "Giữ nguyên cấu trúc đoạn văn của bản gốc..." trong mục Văn phong; không xoá, không làm yếu, không thêm quy tắc cho phép tách đoạn hay xuống dòng mỗi lời thoại.
            - Tên riêng và thuật ngữ viết vào mục "## Tên riêng và thuật ngữ"; cách xưng hô viết vào mục "## Xưng hô". \
            Nếu mục chưa có thì tạo mới.
            - Cụm từ mà người dịch sửa GIỐNG NHAU ở ít nhất 2 đoạn và luôn sai trong truyện này (không phụ thuộc ai nói hay ngữ cảnh) thì thêm vào mục "## Kiểm tra" (tạo mới trước "## Tóm tắt nội dung chính" nếu chưa có), mỗi dòng đúng dạng: - "cụm sai" → "cụm đúng" (lý do). Không thêm cụm phụ thuộc ngữ cảnh; giữ nguyên các dòng đã có trong mục này.
            - terms liệt kê các gợi ý tên riêng/thuật ngữ (kind = "term") và xưng hô (kind = "addressing") mà bạn đã viết \
            vào proposed, kèm số đoạn ủng hộ.
            - Viết tiếng Việt, ngắn gọn, có ví dụ "sai → đúng" khi cần.
            - proposed là TOÀN BỘ nội dung hồ sơ mới (Markdown), dưới 20 KB. rules liệt kê các quy tắc bạn thêm hoặc sửa.
            - Chỉ trả về JSON theo schema, không giải thích.""";

    private static final Logger log = LoggerFactory.getLogger(NovelProfileAnalyzer.class);

    /** {@code chapters} and {@code edits} count every qualifying chapter; {@code otherNovels} share the profile name. */
    public record Stats(int chapters, int edits, List<String> otherNovels) {}

    public record Details(String name, String text, String sha, Stats stats, boolean geminiConfigured) {}

    public record Rule(String text, int count) {}

    /** {@code kind} is "term" or "addressing". */
    public record Term(String kind, String text, int count) {}

    public record BasedOn(int chapters, int edits) {}

    public record Analysis(String proposed, List<Rule> rules, List<Term> terms, BasedOn basedOn, String model,
                           String sha) {}

    /** The edits chosen for one request (newest chapter first) and how many chapters they came from. */
    record Selection(List<Edit> edits, int chapters) {}

    /** One chapter's edits, tied to the novel it belongs to. */
    private record ChapterEdits(long novelId, String novelTitle, List<Edit> edits) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    private record Output(String proposed, List<Rule> rules, List<Term> terms) {}

    private final NovelRepository novels;
    private final ChapterRepository chapters;
    private final ChapterPageRepository pages;
    private final NovelProfileStore store;
    private final GeminiCaller caller;
    private final GeminiSettings settings;
    private final ObjectMapper mapper;

    @Autowired
    public NovelProfileAnalyzer(NovelRepository novels, ChapterRepository chapters, ChapterPageRepository pages,
                                NovelProfileStore store, GeminiCaller caller, GeminiSettings settings,
                                ObjectMapper mapper) {
        this.novels = novels;
        this.chapters = chapters;
        this.pages = pages;
        this.store = store;
        this.caller = caller;
        this.settings = settings;
        this.mapper = mapper;
    }

    NovelProfileAnalyzer(NovelRepository novels, ChapterRepository chapters, ChapterPageRepository pages,
                         NovelProfileStore store, GeminiCaller caller, SubtitleStudioProperties.Gemini settings,
                         ObjectMapper mapper) {
        this(novels, chapters, pages, store, caller, GeminiSettings.fixed(settings), mapper);
    }

    /** The profile text, its SHA and how much corrected material exists for it. */
    public Details details(long novelId) {
        String name = profileName(novelId);
        List<ChapterEdits> all = collect(name);
        int edits = all.stream().mapToInt(c -> c.edits().size()).sum();
        TreeSet<String> others = new TreeSet<>(String.CASE_INSENSITIVE_ORDER);
        all.stream().filter(c -> c.novelId() != novelId).forEach(c -> others.add(c.novelTitle()));
        String text = store.read(name);
        return new Details(name, text, store.sha(name), new Stats(all.size(), edits, List.copyOf(others)),
                settings.current().configured());
    }

    /** One Gemini call; throws {@link NoCorrectionsException} before calling when no paragraph was corrected. */
    public Analysis analyze(long novelId) {
        String name = profileName(novelId);
        chapters.findFirstByNovelIdAndTranslationStatusOrderByChapterNo(novelId, ChapterTranslationStatus.TRANSLATING)
                .ifPresent(c -> {
                    throw new NovelTranslationBusyException(novelId, NovelTranslationBusyException.Reason.CHAPTER_TRANSLATING,
                            c.getChapterNo());
                });
        String profile = store.read(name);
        Selection selection = select(collect(name).stream().map(ChapterEdits::edits).toList(), MAX_CHARS);
        if (selection.edits().isEmpty()) {
            throw new NoCorrectionsException("No corrected paragraphs yet for novel " + novelId);
        }
        if (!settings.current().configured()) {
            throw new GeminiNotConfiguredException("novel " + novelId);
        }
        GeminiCaller.Answer answer = caller.generate(
                List.of(Part.fromText(userText(profile, selection.edits()))), config());
        Output output = parse(answer);
        log.info("analyze novel {} profile {}: {} edits from {} chapters, model {}", novelId, name,
                selection.edits().size(), selection.chapters(), answer.model());
        return new Analysis(output.proposed(), output.rules() == null ? List.of() : output.rules(),
                output.terms() == null ? List.of() : output.terms(),
                new BasedOn(selection.chapters(), selection.edits().size()), answer.model(), store.sha(name));
    }

    /** Writes the profile (old file kept in .history); returns the new SHA. */
    public String save(long novelId, String text, String baseSha) {
        return store.write(profileName(novelId), text, baseSha);
    }

    private String profileName(long novelId) {
        Novel novel = novels.findById(novelId).orElseThrow(() -> new NovelNotFoundException(novelId));
        String name = novel.getPromptProfile();
        if (name == null || name.isBlank() || !store.exists(name)) {
            throw new NoNovelProfileException(novelId);
        }
        return name;
    }

    /** Every qualifying chapter that has at least one edit, newest published first. */
    private List<ChapterEdits> collect(String profile) {
        List<ChapterEdits> out = new ArrayList<>();
        for (Chapter c : chapters.findAnalysisChapters(profile)) {
            String ai = aiText(c);
            if (ai == null || c.getTextVi() == null || c.getTextVi().isBlank()) {
                continue;
            }
            // Image markers are not text a translator corrects, and they would only make the paragraph counts differ.
            List<Edit> edits = NovelCorrections.edits(ImageMarkers.strip(ai), ImageMarkers.strip(c.getTextVi()),
                    ImageMarkers.strip(c.getSourceText()));
            if (!edits.isEmpty()) {
                out.add(new ChapterEdits(c.getNovel().getId(), c.getNovel().getTitle(), edits));
            }
        }
        return out;
    }

    /** The stored AI text; screenshot chapters without one use their page texts; text chapters without one are skipped. */
    private String aiText(Chapter c) {
        if (c.getAiText() != null && !c.getAiText().isBlank()) {
            return c.getAiText();
        }
        if (c.hasSourceText()) {
            return null;
        }
        String joined = String.join("\n\n", pages.findByChapterIdOrderByPosition(c.getId()).stream()
                .map(ChapterPage::getTextVi).filter(t -> t != null && !t.isBlank()).toList());
        return joined.isBlank() ? null : joined;
    }

    /** Takes edits chapter by chapter (newest first) until {@link #MAX_EDITS} or {@code maxChars} would be passed. */
    static Selection select(List<List<Edit>> perChapter, int maxChars) {
        List<Edit> chosen = new ArrayList<>();
        int chars = 0;
        int used = 0;
        outer:
        for (List<Edit> edits : perChapter) {
            boolean any = false;
            for (Edit e : edits) {
                Edit cut = new Edit(e.source() == null ? null : cut(e.source()), cut(e.ai()), cut(e.fin()));
                int size = (cut.source() == null ? 0 : cut.source().length()) + cut.ai().length() + cut.fin().length();
                if (chosen.size() >= MAX_EDITS || chars + size > maxChars) {
                    if (any) {
                        used++;
                    }
                    break outer;
                }
                chosen.add(cut);
                chars += size;
                any = true;
            }
            if (any) {
                used++;
            }
        }
        return new Selection(chosen, used);
    }

    private static String cut(String side) {
        return side.length() > MAX_SIDE ? side.substring(0, MAX_SIDE) + "…" : side;
    }

    private static String userText(String profile, List<Edit> edits) {
        StringBuilder text = new StringBuilder("# Hồ sơ hiện tại\n").append(profile)
                .append("\n\n# Các đoạn người dịch đã sửa (").append(edits.size()).append(")\n");
        int n = 1;
        for (Edit e : edits) {
            text.append('\n').append(n++).append(".\n");
            if (e.source() != null) {
                text.append("GỐC: ").append(oneLine(e.source())).append('\n');
            }
            text.append("AI: ").append(oneLine(e.ai())).append("\nFINAL: ").append(oneLine(e.fin())).append('\n');
        }
        return text.toString();
    }

    private static String oneLine(String s) {
        String line = s.strip().replaceAll("\\s*\\R\\s*", " / ");
        return line.isEmpty() ? "(trống)" : line;
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
        if (proposed.getBytes(StandardCharsets.UTF_8).length > MAX_PROFILE_BYTES) {
            throw new AnalysisInvalidException("Gemini proposed a profile larger than 20 KB");
        }
        return output;
    }

    private GenerateContentConfig config() {
        Schema string = Schema.builder().type(Type.Known.STRING).build();
        Schema integer = Schema.builder().type(Type.Known.INTEGER).build();
        Schema rule = Schema.builder().type(Type.Known.OBJECT).properties(Map.of("text", string, "count", integer))
                .required("text", "count").build();
        Schema kind = Schema.builder().type(Type.Known.STRING).enum_(List.of("term", "addressing")).build();
        Schema term = Schema.builder().type(Type.Known.OBJECT)
                .properties(Map.of("kind", kind, "text", string, "count", integer))
                .required("kind", "text", "count").build();
        Schema root = Schema.builder().type(Type.Known.OBJECT)
                .properties(Map.of("proposed", string,
                        "rules", Schema.builder().type(Type.Known.ARRAY).items(rule).build(),
                        "terms", Schema.builder().type(Type.Known.ARRAY).items(term).build()))
                .required("proposed", "rules", "terms").build();
        return GenerateContentConfig.builder()
                .systemInstruction(Content.fromParts(Part.fromText(SYSTEM_RULES)))
                .responseMimeType("application/json")
                .responseSchema(root)
                .temperature((float) settings.current().temperature())
                .build();
    }
}
