package com.subtitlestudio.profile;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ProfileBlockRepository extends JpaRepository<ProfileBlock, Long> {

    List<ProfileBlock> findByProfileOrderByPositionAscIdAsc(Profile profile);

    Optional<ProfileBlock> findByIdAndProfile(Long id, Profile profile);

    @Query("select coalesce(max(b.position), 0) from ProfileBlock b where b.profile = :p")
    int maxPosition(@Param("p") Profile p);
}
