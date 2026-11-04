package com.subtitlestudio.publish;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
class PublishConfig {

    /** Background publishes (at most one at a time, enforced by PublishService). */
    @Bean(name = "publishExecutor", destroyMethod = "close")
    ExecutorService publishExecutor() {
        return Executors.newVirtualThreadPerTaskExecutor();
    }
}
