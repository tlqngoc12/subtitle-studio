package com.subtitlestudio.fanfic;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FanficRepository extends JpaRepository<Fanfic, Long> {

    List<Fanfic> findAllByOrderByStoryUpdatedAtDescIdDesc();

    Optional<Fanfic> findByWattpadId(String wattpadId);
}
