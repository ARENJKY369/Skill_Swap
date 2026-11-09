package edu.skillswap.service;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class AuditService {

    private final JdbcTemplate jdbc;

    public AuditService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void log(String actorId, String action, String ip, String outcome, String detail) {
        try {
            jdbc.update(
                    "INSERT INTO audit_log (ts, actor_id, action, ip, outcome, detail) VALUES (?,?,?,?,?,?)",
                    DbSupport.nowIso(), actorId, action, ip == null ? "unknown" : ip,
                    outcome, detail == null ? "" : detail.substring(0, Math.min(detail.length(), 500)));
        } catch (Exception e) {
            System.err.println("[audit-failure] " + action + " " + e);
        }
    }

    public void log(String actorId, String action, String ip, String outcome) {
        log(actorId, action, ip, outcome, "");
    }
}
