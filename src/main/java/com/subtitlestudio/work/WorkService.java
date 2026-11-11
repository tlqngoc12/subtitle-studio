package com.subtitlestudio.work;

import com.subtitlestudio.common.YouTubeIds;
import com.subtitlestudio.profile.FieldError;
import com.subtitlestudio.profile.Media;
import com.subtitlestudio.profile.MediaController;
import com.subtitlestudio.profile.MediaRepository;
import com.subtitlestudio.profile.MediaService;
import com.subtitlestudio.profile.Profile;
import com.subtitlestudio.profile.ProfileRepository;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Works with their links and credits. Every problem is reported together; links and credits are replaced as a whole.
 * A replaced or deleted cover is removed when nothing else shows it.
 */
@Service
@Transactional
public class WorkService {

    private final WorkRepository works;
    private final PersonRepository people;
    private final MediaRepository media;
    private final MediaService mediaService;
    private final ProfileRepository profiles;
    private final WorkValidator validator;
    private final Clock clock;

    public WorkService(WorkRepository works, PersonRepository people, MediaRepository media, MediaService mediaService,
                       ProfileRepository profiles, WorkValidator validator, Clock clock) {
        this.works = works;
        this.people = people;
        this.media = media;
        this.mediaService = mediaService;
        this.profiles = profiles;
        this.validator = validator;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<WorkSummaryDto> list() {
        return works.findAllSorted().stream().map(WorkService::toSummary).toList();
    }

    @Transactional(readOnly = true)
    public WorkDto get(long id) {
        return toDto(works.findById(id).orElseThrow(() -> new WorkNotFoundException(id)));
    }

    public WorkDto create(WorkRequest request) {
        Instant now = clock.instant();
        Work work = new Work(now);
        apply(work, request, now);
        return toDto(works.saveAndFlush(work));
    }

    public WorkDto update(long id, WorkRequest request) {
        Work work = works.findById(id).orElseThrow(() -> new WorkNotFoundException(id));
        Long before = work.getCover() == null ? null : work.getCover().getId();
        apply(work, request, clock.instant());
        works.flush();
        Long after = work.getCover() == null ? null : work.getCover().getId();
        if (before != null && !before.equals(after)) {
            mediaService.deleteIfUnreferenced(List.of(before));
        }
        return toDto(work);
    }

    public void delete(long id) {
        Work work = works.findById(id).orElseThrow(() -> new WorkNotFoundException(id));
        Long cover = work.getCover() == null ? null : work.getCover().getId();
        works.delete(work);
        works.flush();
        if (cover != null) {
            mediaService.deleteIfUnreferenced(List.of(cover));
        }
    }

    private void apply(Work work, WorkRequest raw, Instant now) {
        WorkRequest r = validator.normalise(raw);
        List<FieldError> errors = new ArrayList<>(validator.check(r));

        Media cover = null;
        if (r.coverMediaId() != null) {
            cover = media.findById(r.coverMediaId()).orElse(null);
            if (cover == null) {
                errors.add(new FieldError("coverMediaId", "The image no longer exists"));
            }
        }
        Profile profile = null;
        if (r.profile() != null) {
            profile = profiles.findBySlug(r.profile()).orElse(null);
            if (profile == null) {
                errors.add(new FieldError("profile", "Unknown profile: " + r.profile()));
            }
        }
        List<Person> credited = new ArrayList<>();
        for (int i = 0; i < r.credits().size(); i++) {
            Optional<Person> person = people.findById(r.credits().get(i).personId());
            if (person.isEmpty()) {
                errors.add(new FieldError("credits[" + i + "].personId", "This person no longer exists"));
            } else {
                credited.add(person.get());
            }
        }
        if (!errors.isEmpty()) {
            throw new InvalidWorkException(errors);
        }

        List<WorkLink> links = new ArrayList<>();
        for (int i = 0; i < r.links().size(); i++) {
            WorkLinkRequest l = r.links().get(i);
            links.add(new WorkLink(work, i + 1, l.kind(), l.label(), l.url(), l.icon()));
        }
        List<WorkCredit> credits = new ArrayList<>();
        for (int i = 0; i < r.credits().size(); i++) {
            WorkCreditRequest c = r.credits().get(i);
            credits.add(new WorkCredit(work, i + 1, credited.get(i), c.role(), c.characterName()));
        }
        work.set(r.title(), cover, r.releaseDate(), r.categories(), r.subcategory(), profile, r.description(), links,
                credits, now);
    }

    static WorkSummaryDto toSummary(Work w) {
        return new WorkSummaryDto(w.getId(), w.getTitle(), coverUrl(w), w.getReleaseDate(),
                List.copyOf(w.getCategories()), w.getSubcategory(),
                w.getProfile() == null ? null : w.getProfile().getSlug());
    }

    static WorkDto toDto(Work w) {
        List<WorkLinkDto> links = w.getLinks().stream()
                .map(l -> new WorkLinkDto(l.getKind(), l.getLabel(), l.getUrl(), l.getIcon())).toList();
        List<WorkCreditDto> credits = w.getCredits().stream()
                .map(c -> new WorkCreditDto(PersonService.toDto(c.getPerson()), c.getRole(), c.getCharacterName()))
                .toList();
        String trailer = w.getLinks().stream().filter(l -> l.getKind() == LinkKind.TRAILER).findFirst()
                .flatMap(l -> YouTubeIds.videoId(l.getUrl())).orElse(null);
        return new WorkDto(w.getId(), w.getTitle(), coverUrl(w), w.getReleaseDate(),
                List.copyOf(w.getCategories()), w.getSubcategory(), w.getProfile() == null ? null : w.getProfile().getSlug(),
                w.getCover() == null ? null : w.getCover().getId(), w.getDescription(), links, credits, trailer);
    }

    private static String coverUrl(Work w) {
        return w.getCover() == null ? null : MediaController.url(w.getCover().getId());
    }
}
