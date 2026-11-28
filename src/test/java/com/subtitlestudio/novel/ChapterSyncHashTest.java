package com.subtitlestudio.novel;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class ChapterSyncHashTest {

    @Test
    void isLowerCaseSha256Hex() {
        assertThat(ChapterSyncHash.of("abc"))
                .isEqualTo("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
        assertThat(ChapterSyncHash.of("abc")).hasSize(64);
    }

    @Test
    void nullCountsAsEmpty() {
        assertThat(ChapterSyncHash.of(null)).isEqualTo(ChapterSyncHash.of(""))
                .isEqualTo("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    }

    @Test
    void differentTextGivesADifferentMark() {
        assertThat(ChapterSyncHash.of("a")).isNotEqualTo(ChapterSyncHash.of("b"));
    }
}
