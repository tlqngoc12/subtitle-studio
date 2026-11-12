package com.subtitlestudio.profile;

import com.subtitlestudio.fanfic.Fanfic;
import com.subtitlestudio.novel.ChapterPage;
import com.subtitlestudio.novel.Novel;
import com.subtitlestudio.photo.PhotoPost;
import com.subtitlestudio.work.Person;
import com.subtitlestudio.work.Work;
import jakarta.persistence.PostPersist;
import jakarta.persistence.PostUpdate;
import java.util.List;
import java.util.Objects;
import java.util.stream.Stream;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Component;

/**
 * JPA entity listener on every entity that points at {@code t_media}: when such a row is inserted or changed, the image
 * is filed into its folder after the transaction commits ({@link MediaFiler#fileAfterCommit}). One hook here instead of
 * one per service save method. New entities that reference {@code Media} must add {@code @EntityListeners} and a
 * branch in {@link #mediaOf}; a test compares the list with the JPA metamodel.
 */
@Component
public class MediaReferenceListener {

    private final ObjectProvider<MediaFiler> filer;

    public MediaReferenceListener(ObjectProvider<MediaFiler> filer) {
        this.filer = filer;
    }

    @PostPersist
    @PostUpdate
    void referenced(Object entity) {
        List<Long> ids = mediaOf(entity).filter(Objects::nonNull).map(Media::getId).filter(Objects::nonNull).toList();
        if (ids.isEmpty()) {
            return;
        }
        MediaFiler f = filer.getIfAvailable();
        if (f != null) {
            f.fileAfterCommit(ids);
        }
    }

    static Stream<Media> mediaOf(Object entity) {
        return switch (entity) {
            case Profile e -> Stream.ofNullable(e.getPortrait());
            case ProfileBannerImage e -> Stream.ofNullable(e.getMedia());
            case ProfileBlock e -> Stream.ofNullable(e.getMedia());
            case ProfileBlockItem e -> Stream.ofNullable(e.getMedia());
            case PhotoPost e -> Stream.ofNullable(e.getMedia());
            case Work e -> Stream.ofNullable(e.getCover());
            case Person e -> Stream.ofNullable(e.getAvatar());
            case Novel e -> Stream.ofNullable(e.getCover());
            case ChapterPage e -> Stream.ofNullable(e.getMedia());
            case Fanfic e -> Stream.ofNullable(e.getCover());
            default -> Stream.empty();
        };
    }
}
