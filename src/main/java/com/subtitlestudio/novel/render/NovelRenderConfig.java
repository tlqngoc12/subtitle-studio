package com.subtitlestudio.novel.render;

import com.subtitlestudio.config.SubtitleStudioProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** Renderer, image format (picked once at startup) and cache for public chapter images. */
@Configuration(proxyBeanMethods = false)
public class NovelRenderConfig {

    private static final Logger log = LoggerFactory.getLogger(NovelRenderConfig.class);

    @Bean
    ImageEncoder imageEncoder() {
        ImageEncoder encoder = ImageEncoder.best();
        log.info("Public chapter images are written as {}", encoder.extension());
        return encoder;
    }

    @Bean
    NovelRenderer novelRenderer(SubtitleStudioProperties properties) {
        return new NovelRenderer(properties.novel().render());
    }

    @Bean
    RenderCache renderCache(SubtitleStudioProperties properties, NovelRenderer renderer, ImageEncoder encoder) {
        return new RenderCache(properties.novelRenderDir(), renderer, encoder);
    }
}
