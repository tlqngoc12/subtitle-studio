package com.subtitlestudio.video;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class SubtitleFileStoreTest {

    private static final String ID = "dQw4w9WgXcQ";

    @TempDir
    private Path subs;

    private SubtitleFileStore store() {
        return new SubtitleFileStore(subs);
    }

    private static byte[] bytes(String s) {
        return s.getBytes(StandardCharsets.UTF_8);
    }

    @Test
    void writesThreeKindsSideBySide() throws IOException {
        SubtitleFileStore store = store();

        store.writeEnglish(ID, bytes("en"));
        store.writeViAuto(ID, bytes("auto"));
        store.writeViManual(ID, bytes("manual"));

        assertThat(Files.readString(subs.resolve(ID + ".en.srt"))).isEqualTo("en");
        assertThat(Files.readString(subs.resolve(ID + ".vi_auto.srt"))).isEqualTo("auto");
        assertThat(Files.readString(subs.resolve(ID + ".vi_manual.srt"))).isEqualTo("manual");
        assertThat(store.hasEnglish(ID)).isTrue();
        assertThat(store.hasViManual(ID)).isTrue();
    }

    @Test
    void overwritesSameKind() throws IOException {
        SubtitleFileStore store = store();

        store.writeViAuto(ID, bytes("first"));
        store.writeViAuto(ID, bytes("second"));

        assertThat(Files.readString(subs.resolve(ID + ".vi_auto.srt"))).isEqualTo("second");
    }

    @Test
    void deleteViRemovesOnlyThatSource() {
        SubtitleFileStore store = store();
        store.writeViAuto(ID, bytes("auto"));
        store.writeViManual(ID, bytes("manual"));

        store.deleteVi(ID, ViSource.AUTO);

        assertThat(subs.resolve(ID + ".vi_auto.srt")).doesNotExist();
        assertThat(subs.resolve(ID + ".vi_manual.srt")).exists();

        store.writeViAuto(ID, bytes("auto"));
        store.deleteVi(ID, ViSource.MANUAL);

        assertThat(subs.resolve(ID + ".vi_manual.srt")).doesNotExist();
        assertThat(subs.resolve(ID + ".vi_auto.srt")).exists();
    }

    @Test
    void deleteAllRemovesSrtAndVtt() throws IOException {
        SubtitleFileStore store = store();
        store.writeEnglish(ID, bytes("en"));
        store.writeViAuto(ID, bytes("auto"));
        store.writeViManual(ID, bytes("manual"));
        Files.writeString(subs.resolve(ID + ".en-US.vtt"), "WEBVTT");
        Files.writeString(subs.resolve("OTHERVIDEO1.en.srt"), "keep");

        store.deleteAll(ID);

        try (var files = Files.list(subs)) {
            assertThat(files.map(p -> p.getFileName().toString())).containsExactly("OTHERVIDEO1.en.srt");
        }
    }

    @Test
    void writeFailureIsSwallowed() throws IOException {
        Path notADirectory = Files.writeString(subs.resolve("file"), "x");
        SubtitleFileStore store = new SubtitleFileStore(notADirectory);

        assertThatCode(() -> store.writeEnglish(ID, bytes("en"))).doesNotThrowAnyException();
        assertThatCode(() -> store.deleteAll(ID)).doesNotThrowAnyException();
    }
}
