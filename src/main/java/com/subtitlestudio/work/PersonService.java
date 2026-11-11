package com.subtitlestudio.work;

import com.subtitlestudio.profile.FieldError;
import com.subtitlestudio.profile.Media;
import com.subtitlestudio.profile.MediaController;
import com.subtitlestudio.profile.MediaRepository;
import com.subtitlestudio.profile.MediaService;
import java.time.Clock;
import java.util.List;
import java.util.Optional;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** The people directory: a name (unique ignoring case) and an optional avatar, reused across works. */
@Service
@Transactional
public class PersonService {

    static final int MAX_NAME = 100;

    private final PersonRepository people;
    private final WorkRepository works;
    private final MediaRepository media;
    private final MediaService mediaService;
    private final Clock clock;

    public PersonService(PersonRepository people, WorkRepository works, MediaRepository media,
                         MediaService mediaService, Clock clock) {
        this.people = people;
        this.works = works;
        this.media = media;
        this.mediaService = mediaService;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<PersonDto> list() {
        return people.findAllByOrderByNameAsc().stream().map(PersonService::toDto).toList();
    }

    public PersonDto create(PersonRequest request) {
        Person person = new Person("", null, clock.instant());
        apply(person, request, null);
        return toDto(people.saveAndFlush(person));
    }

    public PersonDto update(long id, PersonRequest request) {
        Person person = people.findById(id).orElseThrow(() -> new PersonNotFoundException(id));
        Long before = person.getAvatar() == null ? null : person.getAvatar().getId();
        apply(person, request, id);
        people.flush();
        Long after = person.getAvatar() == null ? null : person.getAvatar().getId();
        if (before != null && !before.equals(after)) {
            mediaService.deleteIfUnreferenced(List.of(before));
        }
        return toDto(person);
    }

    public void delete(long id) {
        Person person = people.findById(id).orElseThrow(() -> new PersonNotFoundException(id));
        List<String> titles = works.titlesCrediting(person);
        if (!titles.isEmpty()) {
            throw new PersonInUseException(titles);
        }
        Long avatar = person.getAvatar() == null ? null : person.getAvatar().getId();
        people.delete(person);
        people.flush();
        if (avatar != null) {
            mediaService.deleteIfUnreferenced(List.of(avatar));
        }
    }

    private void apply(Person person, PersonRequest r, Long ownId) {
        List<FieldError> errors = new java.util.ArrayList<>();
        String name = r.name() == null ? "" : r.name().strip();
        if (name.isEmpty() || name.length() > MAX_NAME) {
            errors.add(new FieldError("name", "Name must be 1-" + MAX_NAME + " characters"));
        } else {
            Optional<Person> same = people.findByNameIgnoreCase(name);
            if (same.isPresent() && !same.get().getId().equals(ownId)) {
                errors.add(new FieldError("name", "A person with this name already exists."));
            }
        }
        Media avatar = null;
        if (r.avatarMediaId() != null) {
            avatar = media.findById(r.avatarMediaId()).orElse(null);
            if (avatar == null) {
                errors.add(new FieldError("avatarMediaId", "The image no longer exists"));
            }
        }
        if (!errors.isEmpty()) {
            throw new InvalidWorkException(errors);
        }
        person.set(name, avatar);
    }

    static PersonDto toDto(Person p) {
        Long avatar = p.getAvatar() == null ? null : p.getAvatar().getId();
        return new PersonDto(p.getId(), p.getName(), avatar, avatar == null ? null : MediaController.url(avatar));
    }
}
