package com.subtitlestudio.photo;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PhotoPostRepository extends JpaRepository<PhotoPost, Long> {

    List<PhotoPost> findAllByOrderByTakenOnDescIdDesc();

    Optional<PhotoPost> findByPostUrl(String postUrl);
}
