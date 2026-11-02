package com.subtitlestudio.video;

/** A subtitle file ready to download. */
public record SrtExport(String fileName, byte[] body) {}
