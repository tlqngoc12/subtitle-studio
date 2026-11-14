package com.subtitlestudio.novel;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.subtitlestudio.config.SubtitleStudioProperties;
import com.subtitlestudio.translate.GeminiCaller;
import com.subtitlestudio.translate.TranslationFailedException;
import com.google.genai.types.Content;
import com.google.genai.types.GenerateContentConfig;
import com.google.genai.types.Part;
import com.google.genai.types.Schema;
import com.google.genai.types.Type;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/** Asks Gemini what a published chapter changes in the story notebook (spec section 5). */
@Component
public class GeminiNotebookUpdater implements NotebookUpdater {

    static final String SYSTEM_RULES = """
            Bạn giữ sổ tay cho người dịch một bộ tiểu thuyết (gốc tiếng Thái) sang tiếng Việt. Sổ tay giúp các chương \
            sau dịch nhất quán. Đọc sổ tay hiện tại và bản dịch tiếng Việt của chương vừa đăng, rồi trả về phần thay đổi.
            - Chỉ giữ thông tin quan trọng cho việc dịch: tên riêng, thuật ngữ, cách xưng hô, tính cách, quan hệ, \
            trạng thái tâm lý hiện tại, diễn biến chính. Bỏ chi tiết vụn.
            - glossaryUpserts: chỉ các tên riêng/thuật ngữ MỚI hoặc cần SỬA (source là chữ gốc tiếng Thái nếu biết, \
            target là cách viết tiếng Việt đã dùng). Không lặp lại mục không đổi.
            - addressingUpserts: chỉ các cặp xưng hô MỚI hoặc ĐỔI (from gọi to thế nào, xưng gì).
            - characters: các nhân vật có mặt hoặc thay đổi trong chương; profile (tính cách, quan hệ) và \
            currentState (tâm lý hiện tại) mỗi mục tối đa 300 ký tự. Nhân vật không nhắc tới thì đừng liệt kê.
            - name là tên nhân vật (tối đa 80 ký tự); sourceName chỉ là tên nhân vật bằng ngôn ngữ gốc, tối đa 60 ký tự, \
            tuyệt đối không phải mô tả; mô tả để trong profile.
            - storySoFar: VIẾT LẠI tóm tắt toàn truyện tới hết chương này, tối đa 2500 ký tự; nén các chương cũ.
            - chapterSummary: tóm tắt chương này, tối đa 800 ký tự.
            - Chỉ trả về JSON theo schema, không giải thích.""";

    private static final Logger log = LoggerFactory.getLogger(GeminiNotebookUpdater.class);

    private final GeminiCaller caller;
    private final SubtitleStudioProperties.Gemini settings;
    private final ObjectMapper mapper;

    @Autowired
    public GeminiNotebookUpdater(GeminiCaller caller, SubtitleStudioProperties properties, ObjectMapper mapper) {
        this(caller, properties.gemini(), mapper);
    }

    GeminiNotebookUpdater(GeminiCaller caller, SubtitleStudioProperties.Gemini settings, ObjectMapper mapper) {
        this.caller = caller;
        this.settings = settings;
        this.mapper = mapper;
    }

    @Override
    public NotebookUpdate propose(String profile, String notebookText, int chapterNo, String chapterText) {
        String text = "# Hồ sơ dịch\n" + (profile == null || profile.isBlank() ? "(không có)" : profile)
                + "\n\n# Sổ tay hiện tại\n" + (notebookText == null ? "(chưa có)" : notebookText)
                + "\n\n# Chương " + chapterNo + " vừa đăng (bản dịch tiếng Việt)\n" + chapterText;
        GeminiCaller.Answer answer = caller.generate(List.of(Part.fromText(text)), config());
        try {
            NotebookUpdate update = mapper.readValue(answer.text(), NotebookUpdate.class);
            log.info("Gemini {} proposed a notebook update after chapter {}", answer.model(), chapterNo);
            return update;
        } catch (JsonProcessingException e) {
            log.warn("Gemini {} notebook answer is not the expected JSON ({} chars)", answer.model(),
                    answer.text().length());
            throw new TranslationFailedException("Gemini returned a notebook update that is not valid JSON.");
        }
    }

    /** A string that Gemini is asked to keep within {@code max} characters (the merger still checks it). */
    private static Schema limited(int max) {
        return Schema.builder().type(Type.Known.STRING).maxLength((long) max).build();
    }

    private GenerateContentConfig config() {
        Schema string = Schema.builder().type(Type.Known.STRING).build();
        Schema term = limited(NotebookMerger.MAX_TERM);
        Schema note = limited(NotebookMerger.MAX_NOTE);
        Schema person = limited(NotebookMerger.MAX_PERSON);
        Schema glossary = Schema.builder().type(Type.Known.OBJECT)
                .properties(Map.of("source", term, "target", term, "note", note))
                .required("source", "target").build();
        Schema addressing = Schema.builder().type(Type.Known.OBJECT)
                .properties(Map.of("from", person, "to", person, "rule", note))
                .required("from", "to", "rule").build();
        Schema character = Schema.builder().type(Type.Known.OBJECT)
                .properties(Map.of("name", person, "sourceName", limited(NotebookMerger.MAX_SOURCE_NAME),
                        "profile", string, "currentState", string))
                .required("name").build();
        Schema root = Schema.builder().type(Type.Known.OBJECT)
                .properties(Map.of(
                        "glossaryUpserts", Schema.builder().type(Type.Known.ARRAY).items(glossary).build(),
                        "addressingUpserts", Schema.builder().type(Type.Known.ARRAY).items(addressing).build(),
                        "characters", Schema.builder().type(Type.Known.ARRAY).items(character).build(),
                        "storySoFar", string,
                        "chapterSummary", string))
                .required("storySoFar", "chapterSummary").build();
        return GenerateContentConfig.builder()
                .systemInstruction(Content.fromParts(Part.fromText(SYSTEM_RULES)))
                .responseMimeType("application/json")
                .responseSchema(root)
                .temperature((float) settings.temperature())
                .build();
    }
}
