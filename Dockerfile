# syntax=docker/dockerfile:1

# ---------- Build: backend + frontend in one Maven run ----------
# frontend-maven-plugin downloads its own Node, so the image needs no Node install.
FROM maven:3.9-eclipse-temurin-21 AS build
# The Node binary that frontend-maven-plugin downloads links against libatomic, which this image lacks.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libatomic1 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /src

# Resolve Maven dependencies first so they are cached across source changes.
COPY pom.xml .
RUN mvn -B -q dependency:go-offline -Dskip.npm

COPY frontend/package.json frontend/package-lock.json frontend/
COPY frontend frontend
COPY src src
# Runs backend tests (JUnit) and frontend tests (Vitest), then builds the jar with the SPA inside.
RUN mvn -B package

# ---------- Runtime: JRE + yt-dlp + deno ----------
FROM eclipse-temurin:21-jre-noble

# Pinned so builds are reproducible. When YouTube changes and fetches fail with YTDLP_FAILED,
# bump YTDLP_VERSION first (see README, troubleshooting).
ARG YTDLP_VERSION=2026.10.26

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-venv curl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && python3 -m venv /opt/yt-dlp \
    && /opt/yt-dlp/bin/pip install --no-cache-dir "yt-dlp[default]==${YTDLP_VERSION}" \
    && ln -s /opt/yt-dlp/bin/yt-dlp /usr/local/bin/yt-dlp

# Recent yt-dlp needs a JavaScript runtime to handle YouTube fully; deno is the recommended one.
COPY --from=denoland/deno:bin-2.9.8 /deno /usr/local/bin/deno

RUN useradd --system --uid 10001 --create-home app \
    && mkdir -p /data \
    && chown app /data

USER app
WORKDIR /app
COPY --from=build /src/target/subtitle-studio-*.jar /app/app.jar

# DB (H2 file) and downloaded .vtt files live here.
ENV SUBTITLESTUDIO_DATADIR=/data
VOLUME /data
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD curl -fsS http://localhost:8080/api/videos > /dev/null || exit 1

ENTRYPOINT ["java", "-jar", "/app/app.jar"]
