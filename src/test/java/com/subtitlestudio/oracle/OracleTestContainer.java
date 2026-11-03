package com.subtitlestudio.oracle;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.testcontainers.oracle.OracleContainer;
import org.testcontainers.utility.DockerImageName;

/** Oracle Free for *OracleIT tests. Same image as docker-compose.yml so tests and the app see the same database. */
public final class OracleTestContainer {

    public static final String IMAGE = "gvenzl/oracle-free:23.26.3-slim-faststart";

    private OracleTestContainer() {
    }

    @TestConfiguration(proxyBeanMethods = false)
    public static class Config {

        @Bean
        @ServiceConnection
        OracleContainer oracle() {
            return new OracleContainer(DockerImageName.parse(IMAGE));
        }
    }
}
