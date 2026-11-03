package com.subtitlestudio.profile;

import java.util.Optional;
import org.springframework.stereotype.Component;

/** Identifies an image by its first bytes; the upload's Content-Type and file name are never trusted. */
@Component
public class ImageSniffer {

    private static final byte[] JPEG = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF};
    private static final byte[] PNG = {(byte) 0x89, 'P', 'N', 'G', '\r', '\n', 0x1A, '\n'};
    private static final byte[] GIF87 = {'G', 'I', 'F', '8', '7', 'a'};
    private static final byte[] GIF89 = {'G', 'I', 'F', '8', '9', 'a'};
    private static final byte[] RIFF = {'R', 'I', 'F', 'F'};
    private static final byte[] WEBP = {'W', 'E', 'B', 'P'};

    public Optional<ImageType> sniff(byte[] bytes) {
        if (startsWith(bytes, 0, JPEG)) {
            return Optional.of(ImageType.JPEG);
        }
        if (startsWith(bytes, 0, PNG)) {
            return Optional.of(ImageType.PNG);
        }
        if (startsWith(bytes, 0, GIF87) || startsWith(bytes, 0, GIF89)) {
            return Optional.of(ImageType.GIF);
        }
        if (startsWith(bytes, 0, RIFF) && startsWith(bytes, 8, WEBP)) {
            return Optional.of(ImageType.WEBP);
        }
        return Optional.empty();
    }

    private static boolean startsWith(byte[] bytes, int offset, byte[] magic) {
        if (bytes.length < offset + magic.length) {
            return false;
        }
        for (int i = 0; i < magic.length; i++) {
            if (bytes[offset + i] != magic[i]) {
                return false;
            }
        }
        return true;
    }
}
