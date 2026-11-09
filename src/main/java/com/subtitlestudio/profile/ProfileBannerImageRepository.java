package com.subtitlestudio.profile;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ProfileBannerImageRepository extends JpaRepository<ProfileBannerImage, Long> {

    List<ProfileBannerImage> findByProfileOrderByPositionAscIdAsc(Profile profile);

    Optional<ProfileBannerImage> findByIdAndProfile(Long id, Profile profile);
}
