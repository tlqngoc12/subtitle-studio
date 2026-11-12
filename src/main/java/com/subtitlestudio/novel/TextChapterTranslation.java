package com.subtitlestudio.novel;

import com.subtitlestudio.config.SubtitleStudioProperties;
import com.subtitlestudio.translate.TranslationFailedException;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.function.Consumer;
import org.springframework.stereotype.Component;

/**
 * Translates the whole original text of a Wattpad chapter. Normally that is one Gemini request. Only when the text is
 * longer than the configured limit, or Gemini's answer comes back cut off or implausibly short, is the text split
 * in two (at a scene break, else a paragraph boundary), each half translated, and a half that still fails split
 * again, up to {@value #MAX_DEPTH} levels (8 parts). Later parts carry the end of the previous part's original and
 * translation so the story reads on seamlessly.
 */
@Component
public class TextChapterTranslation {

    static final int MAX_DEPTH = 3;
    static final int CARRY_CHARS = 1_500;

    /** The finished Vietnamese chapter and the models that answered, in order of use. */
    public record Result(String text, String model, int requests) {}

    private final TextChapterTranslator translator;
    private final int maxSourceChars;

    @org.springframework.beans.factory.annotation.Autowired
    public TextChapterTranslation(TextChapterTranslator translator, SubtitleStudioProperties properties) {
        this(translator, properties.novel().maxSourceChars());
    }

    TextChapterTranslation(TextChapterTranslator translator, int maxSourceChars) {
        this.translator = translator;
        this.maxSourceChars = maxSourceChars;
    }

    /** Nothing partial is returned: either the whole chapter, or a {@link TranslationFailedException}. */
    public Result translate(TextChapterPrompt prompt, Consumer<String> onTrying) {
        Run run = new Run(prompt, onTrying);
        run.piece(prompt.sourceText(), 0);
        return new Result(String.join("\n\n", run.translated), String.join(", ", run.models), run.requests);
    }

    private final class Run {
        private final TextChapterPrompt base;
        private final Consumer<String> onTrying;
        private final List<String> translated = new ArrayList<>();
        private final Set<String> models = new LinkedHashSet<>();
        private String sourceSoFar = "";
        private int requests;

        Run(TextChapterPrompt base, Consumer<String> onTrying) {
            this.base = base;
            this.onTrying = onTrying;
        }

        void piece(String text, int depth) {
            if (text.length() > maxSourceChars && depth < MAX_DEPTH) {
                List<String> halves = TextSplitter.split(text);
                if (!halves.isEmpty()) {
                    halves.forEach(h -> piece(h, depth + 1));
                    return;
                }
            }
            String out;
            try {
                out = ask(text);
            } catch (TextIncompleteException e) {
                List<String> halves = depth >= MAX_DEPTH ? List.of() : TextSplitter.split(text);
                if (halves.isEmpty()) {
                    throw new TranslationFailedException(depth >= MAX_DEPTH
                            ? "This chapter is too long for Gemini to translate, even in parts."
                            : "Gemini could not translate this chapter in one piece and it cannot be split further.");
                }
                halves.forEach(h -> piece(h, depth + 1));
                return;
            }
            translated.add(out);
            sourceSoFar = sourceSoFar.isEmpty() ? text : sourceSoFar + "\n\n" + text;
        }

        private String ask(String text) {
            boolean later = !translated.isEmpty();
            TextChapterPrompt prompt = base.withText(text, later ? tail(sourceSoFar) : null,
                    later ? tail(String.join("\n\n", translated)) : null);
            TextAnswer answer = send(prompt);
            if ("th".equals(base.sourceLanguage()) && PageTextOutput.thaiShare(answer.text()) > PageTextOutput.MAX_THAI_SHARE) {
                answer = send(prompt);
                if (PageTextOutput.thaiShare(answer.text()) > PageTextOutput.MAX_THAI_SHARE) {
                    throw new TranslationFailedException("Gemini returned the text without translating it.");
                }
            }
            return answer.text();
        }

        private TextAnswer send(TextChapterPrompt prompt) {
            requests++;
            TextAnswer answer = translator.translate(prompt, onTrying);
            if (answer.model() != null) {
                models.add(answer.model());
            }
            return answer;
        }
    }

    private static String tail(String text) {
        return text.length() <= CARRY_CHARS ? text : text.substring(text.length() - CARRY_CHARS);
    }
}
