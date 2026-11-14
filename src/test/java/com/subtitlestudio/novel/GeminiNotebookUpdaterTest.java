package com.subtitlestudio.novel;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.subtitlestudio.config.SubtitleStudioProperties;
import com.subtitlestudio.novel.NotebookContent.GlossaryEntry;
import com.subtitlestudio.translate.FakeGeminiServer;
import com.subtitlestudio.translate.GeminiCaller;
import java.time.Duration;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

class GeminiNotebookUpdaterTest {

    private final FakeGeminiServer server = new FakeGeminiServer();

    @AfterEach
    void stop() {
        server.close();
    }

    private GeminiNotebookUpdater updater() {
        var gemini = new SubtitleStudioProperties.Gemini("k", "gemini-test-flash", Duration.ofSeconds(10),
                Duration.ofMinutes(60), 0.3, List.of());
        return new GeminiNotebookUpdater(new GeminiCaller(gemini, server.baseUrl()), gemini, new ObjectMapper());
    }

    @Test
    void sendsChapterAndOldNotebookAndParsesUpdate() {
        server.replyText("""
                {"glossaryUpserts":[{"source":"พี่","target":"anh","note":null}],"addressingUpserts":[],
                "characters":[{"name":"Mai","sourceName":"ใหม่","profile":"hiền","currentState":"vui"}],
                "storySoFar":"Tóm tắt","chapterSummary":"Chương 3"}""", "STOP");

        NotebookUpdate update = updater().propose("Hồ sơ Thái", "## Nhân vật\nCũ", 3, "Nội dung chương ba");

        String body = server.lastBody();
        assertThat(body).contains("systemInstruction").contains("Hồ sơ Thái").contains("## Nhân vật")
                .contains("Nội dung chương ba").contains("Chương 3").contains("responseSchema");
        assertThat(update.glossaryUpserts()).containsExactly(new GlossaryEntry("พี่", "anh", null));
        assertThat(update.characters()).singleElement().satisfies(c -> assertThat(c.currentState()).isEqualTo("vui"));
        assertThat(update.storySoFar()).isEqualTo("Tóm tắt");
        assertThat(update.chapterSummary()).isEqualTo("Chương 3");
    }

    @Test
    void asksForShortNamesInTheRulesAndTheSchema() {
        assertThat(GeminiNotebookUpdater.SYSTEM_RULES).contains("sourceName chỉ là tên nhân vật")
                .contains("tối đa 60 ký tự");
        server.replyText("{\"storySoFar\":\"x\",\"chapterSummary\":\"y\"}", "STOP");

        updater().propose("p", null, 1, "Chương");

        assertThat(server.lastBody()).containsPattern("\"maxLength\"\\s*:\\s*\"?120\"?")
                .containsPattern("\"maxLength\"\\s*:\\s*\"?80\"?");
    }

    @Test
    void firstChapterSaysNotebookIsEmpty() {
        server.replyText("{\"storySoFar\":\"x\",\"chapterSummary\":\"y\"}", "STOP");

        updater().propose("", null, 1, "Chương một");

        assertThat(server.lastBody()).contains("(chưa có)");
    }
}
