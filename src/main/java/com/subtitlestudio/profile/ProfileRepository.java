package com.subtitlestudio.profile;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface ProfileRepository extends JpaRepository<Profile, Long> {

    Optional<Profile> findBySlug(String slug);

    List<Profile> findAllByOrderByIdAsc();

    List<Profile> findAllByOrderBySortOrderAscIdAsc();

    List<Profile> findByKind(ProfileKind kind);

    boolean existsBySlug(String slug);

    @Query("select coalesce(max(p.sortOrder), 0) from Profile p")
    int maxSortOrder();
}
