package com.subtitlestudio.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

@SpringBootTest
@ActiveProfiles("test")
class PublishPropertiesTest {

    private static SubtitleStudioProperties.Publish publish(String token, String account, String project) {
        return new SubtitleStudioProperties.Publish(token, account, project, false, "wrangler", Duration.ofMinutes(5));
    }

    @Autowired
    private SubtitleStudioProperties properties;

    @Test
    void configuredNeedsTokenAccountAndProject() {
        assertThat(publish("cf-secret-123", "acc", "fans").configured()).isTrue();
        assertThat(publish("", "acc", "fans").configured()).isFalse();
        assertThat(publish("cf-secret-123", " ", "fans").configured()).isFalse();
        assertThat(publish("cf-secret-123", "acc", null).configured()).isFalse();
    }

    @Test
    void readCountsNeedAConfiguredSiteAndAD1Id() {
        var ok = new SubtitleStudioProperties.Publish("t", "a", "fans", false, "wrangler", Duration.ofMinutes(5), "d1-id");
        var noId = new SubtitleStudioProperties.Publish("t", "a", "fans", false, "wrangler", Duration.ofMinutes(5), " ");
        var noSite = new SubtitleStudioProperties.Publish("", "a", "fans", false, "wrangler", Duration.ofMinutes(5), "d1-id");

        assertThat(ok.readCountsEnabled()).isTrue();
        assertThat(noId.readCountsEnabled()).isFalse();
        assertThat(noSite.readCountsEnabled()).isFalse();
        assertThat(publish("t", "a", "fans").readCountsEnabled()).isFalse();
    }

    @Test
    void urlIsThePagesDevAddress() {
        assertThat(publish("t", "a", "fans").url()).isEqualTo("https://fans.pages.dev");
    }

    @Test
    void toStringHidesTheToken() {
        assertThat(publish("cf-secret-123", "acc", "fans").toString()).doesNotContain("cf-secret-123").contains("fans");
    }

    @Test
    void defaultsFromApplicationYml() {
        SubtitleStudioProperties.Publish p = properties.publish();

        assertThat(p.indexable()).isFalse();
        assertThat(p.timeout()).isEqualTo(Duration.ofMinutes(5));
        assertThat(p.wranglerPath()).isEqualTo("wrangler");
        assertThat(p.configured()).isFalse();
    }
}
