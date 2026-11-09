package edu.skillswap.controller;

import edu.skillswap.Api;
import edu.skillswap.service.DbSupport;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.lang.management.ManagementFactory;
import java.util.Map;

@RestController
public class HealthController {

    private final JdbcTemplate jdbc;

    public HealthController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @GetMapping("/api/health")
    public ResponseEntity<Map<String, Object>> health() {
        long started = System.currentTimeMillis();
        boolean connected = false;
        int latency = -1;
        try {
            jdbc.queryForObject("SELECT 1", Integer.class);
            connected = true;
            latency = (int) (System.currentTimeMillis() - started);
        } catch (Exception ignored) {
            connected = false;
        }
        Map<String, Object> body = Api.map(
                "status", connected ? "ok" : "degraded",
                "dbConnected", connected,
                "dbLatencyMs", latency,
                "uptimeSec", Math.round(ManagementFactory.getRuntimeMXBean().getUptime() / 1000.0),
                "version", "2.4.9",
                "timestamp", DbSupport.nowIso());
        return ResponseEntity.status(connected ? 200 : 503).body(body);
    }
}
