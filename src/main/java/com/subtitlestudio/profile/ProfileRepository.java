package com.subtitlestudio.profile;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ProfileRepository extends JpaRepository<Profile, Long> {

    Optional<Profile> findBySlug(String slug);

    List<Profile> findAllByOrderByIdAsc();
}
