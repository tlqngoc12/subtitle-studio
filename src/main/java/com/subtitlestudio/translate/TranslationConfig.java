package com.subtitlestudio.translate;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
class TranslationConfig {

    /** Background translations, one virtual thread each (a request to Gemini mostly waits on the network). */
    @Bean(name = "translationExecutor", destroyMethod = "close")
    ExecutorService translationExecutor() {
        return Executors.newVirtualThreadPerTaskExecutor();
    }
}
