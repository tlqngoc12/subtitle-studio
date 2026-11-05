package com.subtitlestudio.novel;

import static org.assertj.core.api.Assertions.assertThat;

import com.subtitlestudio.novel.NotebookContent.AddressingRule;
import com.subtitlestudio.novel.NotebookContent.ChapterNote;
import com.subtitlestudio.novel.NotebookContent.GlossaryEntry;
import com.subtitlestudio.novel.NotebookContent.NotebookCharacter;
import java.util.List;
import org.junit.jupiter.api.Test;

class NotebookTextTest {

    private static final NotebookContent CONTENT = new NotebookContent(
            List.of(new GlossaryEntry("พี่ชาย", "anh trai", null)),
            List.of(new AddressingRule("Mai", "Nam", "Mai gọi Nam là anh, xưng em")),
            List.of(new NotebookCharacter("Mai", "ใหม่", "hiền, nhút nhát", "đang buồn", 1),
                    new NotebookCharacter("Nam", "น้ำ", "lạnh lùng", "bối rối", 5)),
            "Mai gặp Nam ở trường.",
            List.of(new ChapterNote(5, "Nam cứu Mai.")));

    @Test
    void hasEverySection() {
        String text = NotebookText.render(CONTENT, 12_000);

        assertThat(text).contains("## Xưng hô").contains("Mai → Nam: Mai gọi Nam là anh, xưng em")
                .contains("## Thuật ngữ và tên riêng").contains("พี่ชาย → anh trai")
                .contains("## Nhân vật").contains("Mai (ใหม่)").contains("đang buồn")
                .contains("## Tóm tắt").contains("Mai gặp Nam ở trường.")
                .contains("## Các chương gần đây").contains("Chương 5: Nam cứu Mai.");
    }

    @Test
    void cutsOldestCharactersToFit() {
        int full = NotebookText.render(CONTENT, 12_000).length();

        String text = NotebookText.render(CONTENT, full - 10);

        assertThat(text.length()).isLessThanOrEqualTo(full - 10);
        assertThat(text).doesNotContain("nhút nhát").contains("lạnh lùng")
                .contains("พี่ชาย → anh trai").contains("Mai → Nam");
    }
}
