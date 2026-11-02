package com.subtitlestudio.ytdlp;

import com.subtitlestudio.subtitle.SubtitleTrack;
import java.nio.file.Path;

/** Access to YouTube through yt-dlp. An interface so services can be unit-tested with a fake. */
public interface YtDlpClient {

    /** Runs {@code yt-dlp -J --skip-download} and returns the parsed metadata. */
    VideoInfo fetchInfo(String videoId);

    /** Downloads the given subtitle track as VTT into {@code outDir} and returns the file path. */
    Path downloadVtt(String videoId, SubtitleTrack track, Path outDir);
}
