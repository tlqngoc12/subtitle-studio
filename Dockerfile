# syntax=docker/dockerfile:1

# ---------- Build: backend + frontend in one Maven run ----------
# frontend-maven-plugin downloads its own Node, so the image needs no Node install.
FROM maven:3.9-eclipse-temurin-21 AS build
# The Node binary that frontend-maven-plugin downloads links against libatomic, which this image lacks.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libatomic1 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /src

COPY pom.xml .
COPY frontend frontend
COPY src src
# Tests do not run here (-DskipTests skips both JUnit and Vitest): run `mvn test` and `npm test` before committing.
# BuildKit cache mounts keep the Maven repository (which also holds the Node download of frontend-maven-plugin)
# and the npm cache between builds, so a source change does not download dependencies again.
RUN --mount=type=cache,target=/root/.m2 \
    --mount=type=cache,target=/root/.npm \
    mvn -B package -DskipTests

# ---------- wrangler: Cloudflare Pages deploys for the Publish button ----------
FROM node:22.23.4-bookworm-slim AS wrangler
RUN npm install --prefix /opt/wrangler --omit=dev --no-audit --no-fund wrangler@4.151.3

# ---------- Runtime: JRE + yt-dlp + deno + node/wrangler ----------
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

# Publish runs wrangler (a Node CLI) to upload the public site; only the node binary is needed to run it.
COPY --from=wrangler /usr/local/bin/node /usr/local/bin/node
COPY --from=wrangler /opt/wrangler /opt/wrangler
ENV SUBTITLESTUDIO_PUBLISH_WRANGLER_PATH=/opt/wrangler/node_modules/.bin/wrangler     WRANGLER_SEND_METRICS=false

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
