package com.subtitlestudio.work;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface WorkRepository extends JpaRepository<Work, Long> {

    /** Coming Soon (no release date) first, then the newest release, then the newest id. */
    @Query("select w from Work w order by case when w.releaseDate is null then 0 else 1 end, w.releaseDate desc, w.id desc")
    List<Work> findAllSorted();

    /** Titles of the works that credit this person, alphabetically. */
    @Query("select distinct w.title from Work w join w.credits c where c.person = :person order by w.title")
    List<String> titlesCrediting(@Param("person") Person person);
}
