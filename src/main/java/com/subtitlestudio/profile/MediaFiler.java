package com.subtitlestudio.profile;

import jakarta.persistence.EntityManager;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.function.Function;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Files an image into the folder of the feature that shows it (spec
 * docs/superpowers/specs/2026-11-12-media-folders-design.md). The first reference found, in the order of {@link #RULES},
 * decides the folder; an unreferenced image goes to {@code _inbox/}. Moving is idempotent and tolerant of a file the
 * other database sharing the directory already moved.
 */
@Component
public class MediaFiler {

    public static final String INBOX = "_inbox";

    /** What happened to one image. */
    public enum Outcome { MOVED, IN_PLACE, MISSING }

    /**
     * One place that points at {@code t_media}. {@code point} is {@code Entity.attribute} (a test guards the list against
     * the JPA metamodel); the query returns a scalar (1, or the novel slug) when the image is used there.
     */
    record Rule(String point, String jpql, String category, Function<Object, String> folder) {
        Rule(String point, String jpql, String category, String folder) {
            this(point, jpql, category, ignored -> folder);
        }
    }

    static final List<Rule> RULES = List.of(
            new Rule("Profile.portrait", "select 1 from Profile e where e.portrait.id = :id", "portrait",
                    "profiles/portraits"),
            new Rule("ProfileBannerImage.media", "select 1 from ProfileBannerImage e where e.media.id = :id", "banner",
                    "profiles/banners"),
            new Rule("ProfileBlock.media", "select 1 from ProfileBlock e where e.media.id = :id", "block",
                    "profiles/blocks"),
            new Rule("ProfileBlockItem.media", "select 1 from ProfileBlockItem e where e.media.id = :id", "block",
                    "profiles/blocks"),
            new Rule("PhotoPost.media", "select 1 from PhotoPost e where e.media.id = :id", "photo", "photos"),
            new Rule("Work.cover", "select 1 from Work e where e.cover.id = :id", "cover", "works/covers"),
            new Rule("Person.avatar", "select 1 from Person e where e.avatar.id = :id", "avatar", "works/people"),
            new Rule("Novel.cover", "select 1 from Novel e where e.cover.id = :id", "cover", "novels/covers"),
            new Rule("ChapterPage.media",
                    "select n.slug from ChapterPage e join e.chapter c join c.novel n where e.media.id = :id", "page",
                    slug -> "novels/" + MediaNames.folder((String) slug, "novel")),
            new Rule("Fanfic.cover", "select 1 from Fanfic e where e.cover.id = :id", "cover", "fanfics/covers"));

    private static final Object PENDING = MediaFiler.class.getName() + ".pending";
    private static final Logger log = LoggerFactory.getLogger(MediaFiler.class);

    private final MediaRepository media;
    private final MediaStorage storage;
    private final EntityManager em;
    private final TransactionTemplate readTx;
    private final TransactionTemplate writeTx;

    public MediaFiler(MediaRepository media, MediaStorage storage, EntityManager em, PlatformTransactionManager tm) {
        this.media = media;
        this.storage = storage;
        this.em = em;
        this.readTx = new TransactionTemplate(tm);
        this.readTx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        this.readTx.setReadOnly(true);
        this.writeTx = new TransactionTemplate(tm);
        this.writeTx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    /** Files these images once the running transaction commits (nothing happens if it rolls back). */
    public void fileAfterCommit(Collection<Long> mediaIds) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            return;
        }
        @SuppressWarnings("unchecked")
        Set<Long> pending = (Set<Long>) TransactionSynchronizationManager.getResource(PENDING);
        if (pending == null) {
            Set<Long> ids = new LinkedHashSet<>();
            TransactionSynchronizationManager.bindResource(PENDING, ids);
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    ids.forEach(MediaFiler.this::fileQuietly);
                }

                @Override
                public void afterCompletion(int status) {
                    TransactionSynchronizationManager.unbindResourceIfPossible(PENDING);
                }
            });
            pending = ids;
        }
        pending.addAll(mediaIds);
    }

    /** Files every page image of a novel (its slug names the folder) once the transaction commits. */
    public void fileNovelPagesAfterCommit(long novelId) {
        List<Long> ids = em.createQuery("select p.media.id from ChapterPage p where p.chapter.novel.id = :id", Long.class)
                .setParameter("id", novelId).getResultList();
        fileAfterCommit(ids);
    }

    private void fileQuietly(long id) {
        try {
            file(id);
        } catch (RuntimeException e) {
            log.warn("Could not file media {}", id, e);
        }
    }

    /** Moves the image into the folder its first reference asks for; safe to repeat. */
    public synchronized Outcome file(long mediaId) {
        Media m = readTx.execute(status -> media.findById(mediaId).orElse(null));
        if (m == null) {
            return Outcome.MISSING;
        }
        Path actual = storage.locate(m).orElse(null);
        if (actual == null) {
            return Outcome.MISSING;
        }
        String desired = readTx.execute(status -> desiredPath(m));
        Path desiredFile = storage.root().resolve(desired).normalize();
        if (actual.normalize().equals(desiredFile)) {
            if (!desired.equals(m.getStoragePath())) {
                writeTx.executeWithoutResult(status -> media.updateStoragePath(mediaId, desired));
            }
            return Outcome.IN_PLACE;
        }
        Path target = uniqueTarget(desiredFile);
        move(actual, target);
        storage.remember(m, target);
        try {
            writeTx.executeWithoutResult(status -> media.updateStoragePath(mediaId, relative(target)));
        } catch (RuntimeException e) {
            move(target, actual);
            storage.remember(m, actual);
            throw e;
        }
        return Outcome.MOVED;
    }

    /** {@code folder/yyyy-MM-dd_slug_key8.ext} for the first reference found, else {@code _inbox/...}. */
    String desiredPath(Media m) {
        for (Rule rule : RULES) {
            List<?> hit = em.createQuery(rule.jpql(), Object.class).setParameter("id", m.getId()).setMaxResults(1)
                    .getResultList();
            if (!hit.isEmpty()) {
                return rule.folder().apply(hit.getFirst()) + "/" + MediaNames.fileName(m, rule.category());
            }
        }
        return INBOX + "/" + MediaNames.fileName(m, "upload");
    }

    private Path uniqueTarget(Path wanted) {
        Path file = wanted;
        String name = wanted.getFileName().toString();
        for (int n = 2; Files.exists(file); n++) {
            file = wanted.resolveSibling(MediaNames.withSuffix(name, n));
        }
        return file;
    }

    private String relative(Path file) {
        return storage.root().normalize().relativize(file.normalize()).toString().replace('\\', '/');
    }

    private static void move(Path from, Path to) {
        try {
            Files.createDirectories(to.getParent());
            Files.move(from, to);
        } catch (IOException e) {
            throw new UncheckedIOException("Could not move " + from + " to " + to, e);
        }
    }

    /** After the abandoned-upload cleanup: files every image (migrates the legacy flat files). */
    @EventListener(ApplicationReadyEvent.class)
    @Order(10)
    public void reconcileOnStartup() {
        try {
            reconcile();
        } catch (RuntimeException e) {
            log.warn("Could not file images into folders", e);
        }
    }

    /** Files every image once and logs the summary line. */
    public void reconcile() {
        List<Long> ids = readTx.execute(status -> media.findAllIds());
        int moved = 0;
        int inPlace = 0;
        int missing = 0;
        for (Long id : ids) {
            try {
                switch (file(id)) {
                    case MOVED -> moved++;
                    case IN_PLACE -> inPlace++;
                    case MISSING -> {
                        missing++;
                        log.warn("Media {} has no file on disk", id);
                    }
                }
            } catch (RuntimeException e) {
                missing++;
                log.warn("Could not file media {}", id, e);
            }
        }
        log.info("Filed {} image(s) into folders, {} already in place, {} missing", moved, inPlace, missing);
    }
}
