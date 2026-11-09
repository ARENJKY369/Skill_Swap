package edu.skillswap.controller;

import edu.skillswap.Api;
import edu.skillswap.security.AuthContext;
import edu.skillswap.security.AuthUser;
import edu.skillswap.service.DbSupport;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
public class NotificationController {

    private final JdbcTemplate jdbc;

    public NotificationController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @GetMapping("/api/notifications")
    public ResponseEntity<Map<String, Object>> list(HttpServletRequest request) {
        AuthUser me = AuthContext.requireAuth(request);
        Integer unread = jdbc.queryForObject(
                "SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read = 0",
                Integer.class, me.id());
        return ResponseEntity.ok(Api.map(
                "notifications", DbSupport.list(jdbc,
                        "SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50", me.id()),
                "unread", unread == null ? 0 : unread));
    }

    @PostMapping("/api/notifications/{id}/read")
    public ResponseEntity<Map<String, Object>> markRead(@PathVariable String id, HttpServletRequest request) {
        AuthUser me = AuthContext.requireAuth(request);
        jdbc.update("UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?", id, me.id());
        return ResponseEntity.ok(Api.ok());
    }

    @PostMapping("/api/notifications/read-all")
    public ResponseEntity<Map<String, Object>> readAll(HttpServletRequest request) {
        AuthUser me = AuthContext.requireAuth(request);
        jdbc.update("UPDATE notifications SET read = 1 WHERE user_id = ?", me.id());
        return ResponseEntity.ok(Api.ok());
    }
}
