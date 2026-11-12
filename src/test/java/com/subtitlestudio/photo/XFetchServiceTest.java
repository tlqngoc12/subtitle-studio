package com.subtitlestudio.photo;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.subtitlestudio.profile.FieldError;
import com.subtitlestudio.profile.InvalidBlockException;
import com.subtitlestudio.profile.Media;
import com.subtitlestudio.profile.MediaService;
import java.time.Instant;
import java.time.LocalDate;
import org.junit.jupiter.api.Test;

class XFetchServiceTest {

    private final XClient x = mock(XClient.class);
    private final MediaService media = mock(MediaService.class);
    private final XFetchService service = new XFetchService(x, media);

    private void stored() {
        Media m = mock(Media.class);
        when(m.getId()).thenReturn(7L);
        when(m.getWidth()).thenReturn(1600);
        when(m.getHeight()).thenReturn(900);
        when(media.storeResized(any(), any(), eq(1600))).thenReturn(m);
    }

    @Test
    void storesTheImageAndMapsDateAndCaption() {
        stored();
        // 18:30 UTC on the 10th is already the 11th in Ho Chi Minh City.
        when(x.fetch("123")).thenReturn(new XTweet("https://pbs.twimg.com/media/A.jpg",
                Instant.parse("2026-11-10T18:30:00Z"),
                "Emi at the fan meeting https://t.co/AbCd1234 https://t.co/EfGh5678"));
        when(x.downloadImage("https://pbs.twimg.com/media/A.jpg", "123")).thenReturn(new byte[] {1});

        XFetchResult r = service.fetch("https://x.com/emi/status/123?s=20");

        assertThat(r).isEqualTo(new XFetchResult(7, "/api/media/7", 1600, 900, LocalDate.parse("2026-11-11"),
                "Emi at the fan meeting"));
        verify(media).storeResized("x-123", new byte[] {1}, 1600);
    }

    @Test
    void anInvalidLinkIsAPostUrlFieldError() {
        assertThatThrownBy(() -> service.fetch("https://example.com/a/status/1"))
                .isInstanceOfSatisfying(InvalidBlockException.class,
                        e -> assertThat(e.errors()).extracting(FieldError::field).containsExactly("postUrl"));
        verify(x, never()).fetch(any());
    }

    @Test
    void aPostWithoutAnImageIsRejectedBeforeDownloading() {
        when(x.fetch("5")).thenReturn(new XTweet(null, Instant.now(), "words"));

        assertThatThrownBy(() -> service.fetch("x.com/a/status/5")).isInstanceOf(XPostHasNoImageException.class);
        verify(x, never()).downloadImage(any(), any());
    }

    @Test
    void captionDropsTrailingLinksAndIsCutToTheTitleLimit() {
        assertThat(XFetchService.caption("https://t.co/OnlyLink")).isNull();
        assertThat(XFetchService.caption(null)).isNull();
        assertThat(XFetchService.caption("see https://example.com/x https://t.co/a1"))
                .isEqualTo("see https://example.com/x");
        assertThat(XFetchService.caption("a".repeat(500))).hasSize(PhotoService.MAX_TITLE).endsWith("…");
    }

    @Test
    void statusUrlsOfEveryVariantGiveTheId() {
        for (String u : new String[] {"https://x.com/a/status/99", "http://www.twitter.com/a/status/99/photo/1",
                "https://mobile.twitter.com/a/status/99", "https://fxtwitter.com/a/status/99",
                "https://vxtwitter.com/a/status/99?s=1", "https://x.com/i/status/99", "twitter.com/a/status/99"}) {
            assertThat(XStatusUrl.statusId(u)).as(u).contains("99");
        }
        for (String u : new String[] {"https://x.com/a", "https://instagram.com/p/AAA/", "nope", "", null,
                "https://x.com/a/status/abc"}) {
            assertThat(XStatusUrl.statusId(u)).as(String.valueOf(u)).isEmpty();
        }
    }
}
