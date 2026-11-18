package com.subtitlestudio.backup;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(BackupController.class)
class BackupControllerTest {

    @Autowired
    private MockMvc mvc;

    @MockitoBean
    private BackupService service;

    @Test
    void postReturns202() throws Exception {
        when(service.start()).thenReturn(true);

        mvc.perform(post("/api/backups")).andExpect(status().isAccepted());
    }

    @Test
    void postWhileRunningReturns409() throws Exception {
        when(service.start()).thenReturn(false);

        mvc.perform(post("/api/backups")).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("BACKUP_RUNNING"))
                .andExpect(jsonPath("$.detail").value("A backup is already running."));
    }

    @Test
    void getReturnsStatus() throws Exception {
        when(service.status()).thenReturn(new BackupService.Status(true,
                new BackupLog.LastRun(Instant.parse("2026-11-18T05:00:00Z"), false, "Database backup needs Oracle"),
                List.of(new BackupService.Item("ss-20261118-120000.dmp", BackupService.Kind.DATABASE, 1234,
                        Instant.parse("2026-11-18T05:00:00Z")))));

        mvc.perform(get("/api/backups")).andExpect(status().isOk())
                .andExpect(jsonPath("$.running").value(true))
                .andExpect(jsonPath("$.last.ok").value(false))
                .andExpect(jsonPath("$.last.message").value("Database backup needs Oracle"))
                .andExpect(jsonPath("$.items[0].name").value("ss-20261118-120000.dmp"))
                .andExpect(jsonPath("$.items[0].kind").value("DATABASE"))
                .andExpect(jsonPath("$.items[0].sizeBytes").value(1234))
                .andExpect(jsonPath("$.items[0].createdAt").value("2026-11-18T05:00:00Z"));
    }
}
