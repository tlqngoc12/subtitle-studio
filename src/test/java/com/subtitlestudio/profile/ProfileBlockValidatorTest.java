package com.subtitlestudio.profile;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowableOfType;

import com.subtitlestudio.url.UrlParser;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.function.LongPredicate;
import org.junit.jupiter.api.Test;

class ProfileBlockValidatorTest {

    private static final LongPredicate MEDIA = id -> id == 7;

    private final ProfileBlockValidator validator = new ProfileBlockValidator(new EmbedUrlResolver(new UrlParser()));

    private static BlockRequest req(BlockType type, String title, String body, Long mediaId, String caption,
                                    String embedUrl, List<ItemRequest> items) {
        return new BlockRequest(type, title, body, mediaId, caption, embedUrl, items);
    }

    private static BlockRequest withItems(BlockType type, ItemRequest... items) {
        return req(type, null, null, null, null, null, List.of(items));
    }

    private ValidBlock valid(BlockRequest r) {
        return validator.validate(r, MEDIA);
    }

    private List<String> errorFields(BlockRequest r) {
        InvalidBlockException e = catchThrowableOfType(InvalidBlockException.class, () -> validator.validate(r, MEDIA));
        assertThat(e).as("expected InvalidBlockException").isNotNull();
        return e.errors().stream().map(FieldError::field).toList();
    }

    @Test
    void acceptsText() {
        ValidBlock b = valid(req(BlockType.TEXT, "  ", "  **Tiểu sử**\n", null, null, null, null));

        assertThat(b.type()).isEqualTo(BlockType.TEXT);
        assertThat(b.title()).isNull();
        assertThat(b.body()).isEqualTo("  **Tiểu sử**\n");
        assertThat(b.items()).isEmpty();
    }

    @Test
    void acceptsImage() {
        ValidBlock b = valid(req(BlockType.IMAGE, " Fan meeting ", null, 7L, "", null, null));

        assertThat(b.title()).isEqualTo("Fan meeting");
        assertThat(b.mediaId()).isEqualTo(7L);
        assertThat(b.caption()).isNull();
    }

    @Test
    void acceptsGallery() {
        ValidBlock b = valid(withItems(BlockType.GALLERY, new ItemRequest("Ảnh 1", null, 7L),
                new ItemRequest(null, "ignored", 7L)));

        assertThat(b.items()).containsExactly(new ValidItem("Ảnh 1", null, 7L), new ValidItem(null, null, 7L));
    }

    @Test
    void acceptsEmbedAndNormalisesIt() {
        ValidBlock b = valid(req(BlockType.EMBED, null, null, null, null, "https://youtu.be/dQw4w9WgXcQ", null));

        assertThat(b.embedUrl()).isEqualTo("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    }

    @Test
    void acceptsLinksAndFacts() {
        assertThat(valid(withItems(BlockType.LINKS, new ItemRequest(" Instagram ", " https://instagram.com/x ", 7L)))
                .items()).containsExactly(new ValidItem("Instagram", "https://instagram.com/x", null));
        assertThat(valid(withItems(BlockType.FACTS, new ItemRequest("Ngày sinh", "13/05/1999", null))).items())
                .containsExactly(new ValidItem("Ngày sinh", "13/05/1999", null));
    }

    @Test
    void dropsFieldsNotOfType() {
        ValidBlock b = valid(req(BlockType.TEXT, null, "x", 7L, "cap", "https://youtu.be/dQw4w9WgXcQ",
                List.of(new ItemRequest("a", "b", null))));

        assertThat(b.mediaId()).isNull();
        assertThat(b.caption()).isNull();
        assertThat(b.embedUrl()).isNull();
        assertThat(b.items()).isEmpty();
    }

    @Test
    void reportsMissingRequiredFields() {
        assertThat(errorFields(req(null, null, "x", null, null, null, null))).containsExactly("type");
        assertThat(errorFields(req(BlockType.TEXT, null, "   ", null, null, null, null))).containsExactly("body");
        assertThat(errorFields(req(BlockType.IMAGE, null, null, null, null, null, null))).containsExactly("mediaId");
        assertThat(errorFields(req(BlockType.IMAGE, null, null, 8L, null, null, null))).containsExactly("mediaId");
        assertThat(errorFields(withItems(BlockType.GALLERY))).containsExactly("items");
        assertThat(errorFields(req(BlockType.LINKS, null, null, null, null, null, null))).containsExactly("items");
        assertThat(errorFields(withItems(BlockType.GALLERY, new ItemRequest("x", null, null))))
                .containsExactly("items[0].mediaId");
        assertThat(errorFields(withItems(BlockType.FACTS, new ItemRequest("Ngày sinh", " ", null))))
                .containsExactly("items[0].value");
    }

    @Test
    void rejectsUnsupportedEmbed() {
        assertThat(errorFields(req(BlockType.EMBED, null, null, null, null, "https://vimeo.com/1", null)))
                .containsExactly("embedUrl");
        assertThat(errorFields(req(BlockType.EMBED, null, null, null, null, null, null))).containsExactly("embedUrl");
    }

    @Test
    void rejectsUnsafeLinks() {
        assertThat(errorFields(withItems(BlockType.LINKS, new ItemRequest("x", "javascript:alert(1)", null))))
                .containsExactly("items[0].value");
        assertThat(errorFields(withItems(BlockType.LINKS, new ItemRequest("x", "ftp://x.example", null))))
                .containsExactly("items[0].value");
        assertThat(errorFields(withItems(BlockType.LINKS, new ItemRequest("x", "https://", null))))
                .containsExactly("items[0].value");
        assertThat(errorFields(withItems(BlockType.LINKS, new ItemRequest("x", "data:text/html,hi", null))))
                .containsExactly("items[0].value");
        assertThat(errorFields(withItems(BlockType.LINKS,
                new ItemRequest("ok", "https://a.example", null), new ItemRequest(" ", "https://b.example", null))))
                .containsExactly("items[1].label");
    }

    @Test
    void enforcesLengths() {
        assertThat(errorFields(req(BlockType.TEXT, "a".repeat(201), "x", null, null, null, null)))
                .containsExactly("title");
        assertThat(errorFields(req(BlockType.IMAGE, null, null, 7L, "a".repeat(501), null, null)))
                .containsExactly("caption");
        assertThat(errorFields(req(BlockType.TEXT, null, "a".repeat(100_001), null, null, null, null)))
                .containsExactly("body");
        assertThat(errorFields(withItems(BlockType.FACTS, new ItemRequest("a".repeat(201), "v", null))))
                .containsExactly("items[0].label");
        assertThat(errorFields(withItems(BlockType.FACTS, new ItemRequest("l", "a".repeat(1001), null))))
                .containsExactly("items[0].value");

        List<ItemRequest> many = new ArrayList<>(Collections.nCopies(51, new ItemRequest("l", "v", null)));
        assertThat(errorFields(req(BlockType.FACTS, null, null, null, null, null, many))).containsExactly("items");
    }

    @Test
    void acceptsLimitsExactly() {
        valid(req(BlockType.TEXT, "a".repeat(200), "a".repeat(100_000), null, null, null, null));
        valid(req(BlockType.FACTS, null, null, null, null, null,
                Collections.nCopies(50, new ItemRequest("a".repeat(200), "a".repeat(1000), null))));
    }

    @Test
    void collectsAllErrors() {
        assertThat(errorFields(withItems(BlockType.LINKS,
                new ItemRequest("a", "javascript:x", null), new ItemRequest("b", "nope", null))))
                .containsExactly("items[0].value", "items[1].value");
    }
}
