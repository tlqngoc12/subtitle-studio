package com.subtitlestudio.novel;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.subtitlestudio.translate.TranslationFailedException;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;
import java.util.function.Function;
import org.junit.jupiter.api.Test;

class TextChapterTranslationTest {

    /** Replies "VI(<source>)" unless the script says otherwise. */
    static class Fake implements TextChapterTranslator {
        final List<TextChapterPrompt> prompts = new ArrayList<>();
        Function<TextChapterPrompt, TextAnswer> script = p -> new TextAnswer("VI(" + p.sourceText() + ")", "m1");

        @Override
        public TextAnswer translate(TextChapterPrompt prompt, Consumer<String> onTrying) {
            prompts.add(prompt);
            return script.apply(prompt);
        }
    }

    private final Fake fake = new Fake();

    private static String paragraphs(int count) {
        List<String> ps = new ArrayList<>();
        for (int i = 1; i <= count; i++) {
            ps.add("Paragraph number " + i + " of the chapter.");
        }
        return String.join("\n\n", ps);
    }

    private static TextChapterPrompt prompt(String language, String source) {
        return new TextChapterPrompt("Warm", 3, null, "profile", "notebook", "previous", language, null, null, source);
    }

    @Test
    void aNormalChapterIsOneRequest() {
        String source = paragraphs(10);

        TextChapterTranslation.Result r = new TextChapterTranslation(fake, 60_000).translate(prompt("en", source),
                m -> {});

        assertThat(fake.prompts).hasSize(1);
        assertThat(fake.prompts.getFirst().sourceText()).isEqualTo(source);
        assertThat(fake.prompts.getFirst().carrySource()).isNull();
        assertThat(r.text()).isEqualTo("VI(" + source + ")");
        assertThat(r.model()).isEqualTo("m1");
        assertThat(r.requests()).isEqualTo(1);
    }

    @Test
    void anIncompleteAnswerSplitsAtASceneBreakAndCarriesContext() {
        String first = paragraphs(4);
        String second = paragraphs(4).replace("Paragraph", "Later paragraph");
        String source = first + "\n\n***\n\n" + second;
        fake.script = p -> {
            if (p.sourceText().equals(source)) {
                throw new TextIncompleteException("cut off");
            }
            return new TextAnswer("VI(" + p.sourceText().length() + ")", "m2");
        };

        TextChapterTranslation.Result r = new TextChapterTranslation(fake, 60_000).translate(prompt("en", source),
                m -> {});

        assertThat(fake.prompts).hasSize(3);
        assertThat(fake.prompts.get(1).sourceText()).isEqualTo(first + "\n\n***");
        assertThat(fake.prompts.get(1).carrySource()).isNull();
        assertThat(fake.prompts.get(2).sourceText()).isEqualTo(second);
        assertThat(fake.prompts.get(2).carrySource()).isEqualTo(first + "\n\n***");
        assertThat(fake.prompts.get(2).carryTranslation()).isEqualTo("VI(" + (first + "\n\n***").length() + ")");
        assertThat(r.text()).isEqualTo("VI(" + (first + "\n\n***").length() + ")\n\nVI(" + second.length() + ")");
        assertThat(r.model()).isEqualTo("m2");
    }

    @Test
    void withoutASceneBreakItSplitsAtAParagraphBoundary() {
        String source = paragraphs(6);
        fake.script = p -> {
            if (p.sourceText().equals(source)) {
                throw new TextIncompleteException("cut off");
            }
            return new TextAnswer("ok", "m");
        };

        new TextChapterTranslation(fake, 60_000).translate(prompt("en", source), m -> {});

        assertThat(fake.prompts.get(1).sourceText()).isEqualTo(paragraphs(3));
        assertThat(fake.prompts.get(2).sourceText()).startsWith("Paragraph number 4");
    }

    @Test
    void carryOverIsTheTailOfTheEarlierPartsOnly() {
        String source = String.join("\n\n", "x".repeat(2_000), "y".repeat(2_000));
        fake.script = p -> {
            if (p.sourceText().equals(source)) {
                throw new TextIncompleteException("cut off");
            }
            return new TextAnswer("z".repeat(2_500), "m");
        };

        new TextChapterTranslation(fake, 60_000).translate(prompt("en", source), m -> {});

        assertThat(fake.prompts.get(2).carrySource()).hasSize(TextChapterTranslation.CARRY_CHARS).matches("x+");
        assertThat(fake.prompts.get(2).carryTranslation()).hasSize(TextChapterTranslation.CARRY_CHARS);
    }

    @Test
    void aHalfThatIsStillCutOffIsSplitAgain() {
        String source = paragraphs(8);
        fake.script = p -> {
            if (TextSplitter.paragraphs(p.sourceText()).size() > 2) {
                throw new TextIncompleteException("cut off");
            }
            return new TextAnswer("ok", "m");
        };

        TextChapterTranslation.Result r = new TextChapterTranslation(fake, 60_000).translate(prompt("en", source),
                m -> {});

        assertThat(r.text()).isEqualTo(String.join("\n\n", "ok", "ok", "ok", "ok"));
        assertThat(fake.prompts).hasSize(1 + 2 + 4);
    }

    @Test
    void givesUpAfterThreeLevelsOfSplitting() {
        String source = paragraphs(16);
        fake.script = p -> {
            throw new TextIncompleteException("cut off");
        };

        assertThatThrownBy(() -> new TextChapterTranslation(fake, 60_000).translate(prompt("en", source), m -> {}))
                .isInstanceOf(TranslationFailedException.class).hasMessageContaining("too long");
        // the first half is split down to depth 3, where the next failure ends the run
        assertThat(fake.prompts).hasSize(4);
    }

    @Test
    void aSingleParagraphThatIsCutOffFails() {
        fake.script = p -> {
            throw new TextIncompleteException("cut off");
        };

        assertThatThrownBy(() -> new TextChapterTranslation(fake, 60_000).translate(prompt("en", "One long paragraph"),
                m -> {})).isInstanceOf(TranslationFailedException.class).hasMessageContaining("cannot be split");
    }

    @Test
    void aTextOverTheLimitIsSplitBeforeAskingGemini() {
        String source = paragraphs(10);

        TextChapterTranslation.Result r = new TextChapterTranslation(fake, source.length() - 1).translate(
                prompt("en", source), m -> {});

        assertThat(fake.prompts).hasSize(2);
        assertThat(fake.prompts.get(0).sourceText()).isEqualTo(paragraphs(5));
        assertThat(fake.prompts.get(1).carrySource()).isEqualTo(paragraphs(5));
        assertThat(r.requests()).isEqualTo(2);
    }

    @Test
    void aTextOverTheLimitThatCannotBeSplitIsStillTriedWhole() {
        String source = "One long paragraph " + "word ".repeat(100);

        new TextChapterTranslation(fake, 50).translate(prompt("en", source), m -> {});

        assertThat(fake.prompts).hasSize(1);
    }

    @Test
    void thaiSourceAnsweredInThaiIsAskedOnceMore() {
        int[] calls = {0};
        fake.script = p -> new TextAnswer(++calls[0] == 1 ? "\u0E2A\u0E27\u0E31\u0E2A\u0E14\u0E35\u0E04\u0E23\u0E31\u0E1A" : "Xin chào", "m");

        TextChapterTranslation.Result r = new TextChapterTranslation(fake, 60_000).translate(
                prompt("th", "\u0E2A\u0E27\u0E31\u0E2A\u0E14\u0E35"), m -> {});

        assertThat(r.text()).isEqualTo("Xin chào");
        assertThat(r.requests()).isEqualTo(2);
    }

    @Test
    void thaiSourceStillInThaiAfterTheRetryFails() {
        fake.script = p -> new TextAnswer("\u0E2A\u0E27\u0E31\u0E2A\u0E14\u0E35\u0E04\u0E23\u0E31\u0E1A", "m");

        assertThatThrownBy(() -> new TextChapterTranslation(fake, 60_000).translate(
                prompt("th", "\u0E2A\u0E27\u0E31\u0E2A\u0E14\u0E35"), m -> {}))
                .isInstanceOf(TranslationFailedException.class).hasMessageContaining("without translating");
        assertThat(fake.prompts).hasSize(2);
    }

    @Test
    void englishSourceIsNotCheckedForThai() {
        fake.script = p -> new TextAnswer("\u0E2A\u0E27\u0E31\u0E2A\u0E14\u0E35", "m");

        new TextChapterTranslation(fake, 60_000).translate(prompt("en", "Hello"), m -> {});

        assertThat(fake.prompts).hasSize(1);
    }

    @Test
    void aFailureFromGeminiPassesThroughAndSavesNothing() {
        fake.script = p -> {
            throw new TranslationFailedException("Gemini is busy right now (high demand), try again in a few minutes.");
        };

        assertThatThrownBy(() -> new TextChapterTranslation(fake, 60_000).translate(prompt("en", paragraphs(3)),
                m -> {})).isInstanceOf(TranslationFailedException.class).hasMessageContaining("busy");
    }

    @Test
    void modelsOfAllPartsAreListedInOrderOfUse() {
        String source = paragraphs(4);
        int[] calls = {0};
        fake.script = p -> {
            if (p.sourceText().equals(source)) {
                throw new TextIncompleteException("cut off");
            }
            return new TextAnswer("ok", ++calls[0] == 1 ? "model-a" : "model-b");
        };

        assertThat(new TextChapterTranslation(fake, 60_000).translate(prompt("en", source), m -> {}).model())
                .isEqualTo("model-a, model-b");
    }

    private static TextChapterPrompt withImages(String source, int imageCount) {
        List<PromptImage> images = new ArrayList<>();
        for (int i = 1; i <= imageCount; i++) {
            images.add(new PromptImage(i, "image/jpeg", new byte[] {(byte) i}));
        }
        return new TextChapterPrompt("Warm", 3, null, "profile", "notebook", "previous", "en", null, null, source,
                images);
    }

    private static String textAndImages(int imageCount) {
        List<String> ps = new ArrayList<>();
        for (int i = 1; i <= imageCount; i++) {
            ps.add("Paragraph " + i + ".");
            ps.add(ImageMarkers.marker(i));
        }
        return String.join("\n\n", ps);
    }

    @Test
    void aChapterWithImagesSendsThemWithTheRequest() {
        String source = textAndImages(3);

        new TextChapterTranslation(fake, 60_000).translate(withImages(source, 3), m -> {});

        assertThat(fake.prompts).hasSize(1);
        assertThat(fake.prompts.getFirst().images()).extracting(PromptImage::mediaId).containsExactly(1L, 2L, 3L);
    }

    @Test
    void aSplitPartOnlyGetsTheImagesItsMarkersName() {
        String source = textAndImages(4);
        fake.script = p -> {
            if (p.sourceText().equals(source)) {
                throw new TextIncompleteException("cut off");
            }
            return new TextAnswer("ok", "m");
        };

        new TextChapterTranslation(fake, 60_000).translate(withImages(source, 4), m -> {});

        assertThat(fake.prompts).hasSize(3);
        for (TextChapterPrompt p : fake.prompts.subList(1, 3)) {
            assertThat(p.images()).extracting(PromptImage::mediaId).containsExactlyElementsOf(
                    ImageMarkers.ids(p.sourceText()));
        }
        assertThat(fake.prompts.get(1).images().size() + fake.prompts.get(2).images().size()).isEqualTo(4);
    }

    @Test
    void aPartWithMoreThanTwentyImagesIsSplitBeforeItIsSent() {
        String source = textAndImages(25);

        new TextChapterTranslation(fake, 600_000).translate(withImages(source, 25), m -> {});

        assertThat(fake.prompts).hasSize(2);
        assertThat(fake.prompts).allSatisfy(p -> assertThat(p.images().size()).isLessThanOrEqualTo(20));
        assertThat(fake.prompts.stream().mapToInt(p -> p.images().size()).sum()).isEqualTo(25);
    }

    @Test
    void aChapterThatCannotBeSplitIntoPartsOfTwentyImagesFailsClearly() {
        String source = textAndImages(200);

        assertThatThrownBy(() -> new TextChapterTranslation(fake, 600_000).translate(withImages(source, 200), m -> {}))
                .isInstanceOf(TranslationFailedException.class).hasMessageContaining("more than 20 images");
        assertThat(fake.prompts).isEmpty();
    }

    @Test
    void theCarriedContextOfALaterPartHasNoMarkers() {
        String first = textAndImages(2);
        String second = "Later paragraph.\n\n" + ImageMarkers.marker(3);
        String source = first + "\n\n***\n\n" + second;
        fake.script = p -> {
            if (p.sourceText().equals(source)) {
                throw new TextIncompleteException("cut off");
            }
            return new TextAnswer(p.sourceText().contains("Later") ? "Sau." + "\n\n" + ImageMarkers.marker(3)
                    : "Một.\n\n" + ImageMarkers.marker(1), "m");
        };

        new TextChapterTranslation(fake, 60_000).translate(withImages(source, 3), m -> {});

        TextChapterPrompt later = fake.prompts.get(2);
        assertThat(later.carrySource()).doesNotContain("[[image:").contains("Paragraph 1.");
        assertThat(later.carryTranslation()).doesNotContain("[[image:").contains("Một.");
    }
}
