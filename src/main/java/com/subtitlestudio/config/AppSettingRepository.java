package com.subtitlestudio.config;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AppSettingRepository extends JpaRepository<AppSetting, String> {

    List<AppSetting> findByKeyStartingWith(String prefix);
}
