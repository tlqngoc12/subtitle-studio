package com.subtitlestudio.novel;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class ProfileTitleLinesTest {

    @Test
    void retitlesTheOriginalHeadingAndTitleLine() {
        String text = "# Hồ sơ truyện: Unknown\n\n## Thông tin\n- Tên truyện: \"Unknown\"\n- Tác giả: X\n";

        assertThat(ProfileTitleLines.retitle(text, "Unknown", "Mua He"))
                .isEqualTo("# Hồ sơ truyện: Mua He\n\n## Thông tin\n- Tên truyện: \"Mua He\"\n- Tác giả: X\n");
    }

    @Test
    void keepsTheSuffixAfterTheClosingQuote() {
        String text = "# Hồ sơ dịch: X\n- Tên truyện: \"X\" (giữ nguyên tên, không dịch).\n";

        assertThat(ProfileTitleLines.retitle(text, "X", "Y"))
                .isEqualTo("# Hồ sơ dịch: Y\n- Tên truyện: \"Y\" (giữ nguyên tên, không dịch).\n");
    }

    @Test
    void leavesLinesWithAnotherTitleUntouched() {
        String text = "# Hồ sơ truyện: Other\n- Tên truyện: \"Other\"\nUnknown is mentioned: Unknown\n";

        assertThat(ProfileTitleLines.retitle(text, "Unknown", "New")).isEqualTo(text);
    }

    @Test
    void doesNotChangeALineThatOnlyStartsWithTheTitle() {
        String text = "# Hồ sơ truyện: Unknown 2\n- Tên truyện: \"Unknown 2\"\n";

        assertThat(ProfileTitleLines.retitle(text, "Unknown", "New")).isEqualTo(text);
    }

    @Test
    void treatsRegexCharactersLiterally() {
        String text = "# Hồ sơ truyện: A (B) | $1\n- Tên truyện: \"A (B) | $1\"\n";

        assertThat(ProfileTitleLines.retitle(text, "A (B) | $1", "C* $2 \1"))
                .isEqualTo("# Hồ sơ truyện: C* $2 \1\n- Tên truyện: \"C* $2 \1\"\n");
    }

    @Test
    void keepsWindowsLineEnds() {
        String text = "# Hồ sơ truyện: A\r\n- Tên truyện: \"A\" (x)\r\nrest\r\n";

        assertThat(ProfileTitleLines.retitle(text, "A", "B"))
                .isEqualTo("# Hồ sơ truyện: B\r\n- Tên truyện: \"B\" (x)\r\nrest\r\n");
    }
}
