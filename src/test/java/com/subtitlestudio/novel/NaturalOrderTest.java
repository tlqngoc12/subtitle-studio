package com.subtitlestudio.novel;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

class NaturalOrderTest {

    @Test
    void sortsScreenshotNames() {
        List<String> names = new ArrayList<>(List.of("Screenshot (10).png", "Screenshot (2).png",
                "screenshot (1).PNG", "Screenshot_20261105_101530.png", "Screenshot_20261105_095959.png"));

        names.sort(NaturalOrder.COMPARATOR);

        assertThat(names).containsExactly("screenshot (1).PNG", "Screenshot (2).png", "Screenshot (10).png",
                "Screenshot_20261105_095959.png", "Screenshot_20261105_101530.png");
    }

    @Test
    void handlesNullAndLeadingZeros() {
        List<String> names = new ArrayList<>(List.of("p010.png", "p9.png", "p0002.png"));
        names.add(null);

        names.sort(NaturalOrder.COMPARATOR);

        assertThat(names).containsExactly(null, "p0002.png", "p9.png", "p010.png");
    }
}
