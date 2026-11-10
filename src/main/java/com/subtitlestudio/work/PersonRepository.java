package com.subtitlestudio.work;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PersonRepository extends JpaRepository<Person, Long> {

    List<Person> findAllByOrderByNameAsc();

    Optional<Person> findByNameIgnoreCase(String name);
}
