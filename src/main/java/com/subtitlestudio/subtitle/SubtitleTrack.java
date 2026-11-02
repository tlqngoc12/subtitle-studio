package com.subtitlestudio.subtitle;

/** The subtitle track chosen for download: yt-dlp language key and whether it is manual or auto-generated. */
public record SubtitleTrack(String lang, SourceType source) {}
