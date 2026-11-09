package edu.skillswap.controller;

import edu.skillswap.Api;
import edu.skillswap.ApiException;
import edu.skillswap.Query;
import edu.skillswap.dto.Requests;
import edu.skillswap.security.AuthContext;
import edu.skillswap.security.AuthUser;
import edu.skillswap.service.AuditService;
import edu.skillswap.service.CookieService;
import edu.skillswap.service.DbSupport;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

@RestController
public class AdminController {

    private static final Set<String> OUTCOMES = Set.of("all", "success", "failure", "denied", "info");

    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;
    private final AuditService audit;
    private final CookieService cookies;

    public AdminController(JdbcTemplate jdbc, TransactionTemplate tx, AuditService audit,
                           CookieService cookies) {
        this.jdbc = jdbc;
        this.tx = tx;
        this.audit = audit;
        this.cookies = cookies;
    }

    @GetMapping("/api/admin/stats")
    public ResponseEntity<Map<String, Object>> stats(HttpServletRequest request) {
        admin(request);
        int totalUsers = count("SELECT COUNT(*) AS n FROM users");
        int students = count("SELECT COUNT(*) AS n FROM users WHERE role = 'student'");
        int newThisWeek = count("SELECT COUNT(*) AS n FROM users WHERE created_at >= datetime('now', '-7 days')");
        int resolved = count("SELECT COUNT(*) AS n FROM sessions WHERE status IN ('Accepted','Completed','Declined')");
        int successful = count("SELECT COUNT(*) AS n FROM sessions WHERE status IN ('Accepted','Completed')");
        int successfulMatchRate = resolved == 0 ? 0 : (int) Math.round((successful * 100.0) / resolved);
        int completedSessions = count("SELECT COUNT(*) AS n FROM sessions WHERE status = 'Completed'");
        int reviews = count("SELECT COUNT(*) AS n FROM reviews");
        return ResponseEntity.ok(Api.map(
                "totalUsers", totalUsers,
                "students", students,
                "newThisWeek", newThisWeek,
                "successfulMatchRate", successfulMatchRate,
                "completedSessions", completedSessions,
                "reviews", reviews));
    }

    @GetMapping("/api/admin/metrics")
    public ResponseEntity<Map<String, Object>> metrics(HttpServletRequest request) {
        admin(request);
        Query query = Query.of(request, "skill");
        String skill = query.string("skill", "Java OOP", 80);

        // Compute real 30-day engagement counts from sessions and connection_requests
        Map<String, Integer> matchesByDay = new HashMap<>();
        List<Map<String, Object>> reqRows = DbSupport.list(jdbc, """
                SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS n
                FROM connection_requests
                WHERE skill = ? AND substr(created_at, 1, 10) >= ?
                GROUP BY substr(created_at, 1, 10)
                """, skill, LocalDate.now().minusDays(29).toString());
        for (Map<String, Object> r : reqRows) {
            matchesByDay.put(DbSupport.str(r, "day"), DbSupport.intVal(r, "n"));
        }

        Map<String, Integer> sessionsByDay = new HashMap<>();
        List<Map<String, Object>> sessRows = DbSupport.list(jdbc, """
                SELECT substr(s.start, 1, 10) AS day, COUNT(*) AS n
                FROM sessions s JOIN skills sk ON sk.id = s.skill_id
                WHERE sk.name = ? AND s.status IN ('Accepted','Completed') AND substr(s.start, 1, 10) >= ?
                GROUP BY substr(s.start, 1, 10)
                """, skill, LocalDate.now().minusDays(29).toString());
        for (Map<String, Object> r : sessRows) {
            sessionsByDay.put(DbSupport.str(r, "day"), DbSupport.intVal(r, "n"));
        }

        List<Map<String, Object>> points = new ArrayList<>();
        for (int i = 29; i >= 0; i--) {
            String day = LocalDate.now().minusDays(i).toString();
            points.add(Api.map(
                    "day", day,
                    "matches", matchesByDay.getOrDefault(day, 0),
                    "sessions", sessionsByDay.getOrDefault(day, 0)));
        }

        List<Map<String, Object>> catalogSkills = DbSupport.list(jdbc,
                "SELECT name FROM skills ORDER BY name LIMIT 50");
        List<String> skills = new ArrayList<>();
        for (Map<String, Object> row : catalogSkills) {
            skills.add(DbSupport.str(row, "name"));
        }
        return ResponseEntity.ok(Api.map("skill", skill, "points", points, "skills", skills));
    }

    @GetMapping("/api/admin/users")
    public ResponseEntity<Map<String, Object>> users(HttpServletRequest request) {
        admin(request);
        Query query = Query.of(request, "q", "page");
        String q = query.string("q", "", 80).toLowerCase(Locale.ROOT);
        int page = query.integer("page", 1, 1, Integer.MAX_VALUE);
        int pageSize = 12;
        String like = "%" + q + "%";
        int total = count("""
                SELECT COUNT(*) AS n FROM users
                WHERE (? = '' OR lower(name) LIKE ? OR lower(email) LIKE ? OR lower(username) LIKE ?)
                """, q, like, like, like);
        List<Map<String, Object>> rows = DbSupport.list(jdbc, """
                SELECT id, name, email, username, role, major, university, status, restricted, demo, avg_rating, review_count, created_at
                FROM users
                WHERE (? = '' OR lower(name) LIKE ? OR lower(email) LIKE ? OR lower(username) LIKE ?)
                ORDER BY created_at DESC LIMIT ? OFFSET ?
                """, q, like, like, like, pageSize, (page - 1) * pageSize);
        return ResponseEntity.ok(Api.map("users", rows, "total", total, "page", page, "pageSize", pageSize));
    }

    @PatchMapping("/api/admin/users/{id}")
    public ResponseEntity<Map<String, Object>> modify(@PathVariable String id,
                                                      @Valid @RequestBody Requests.AdminModify body,
                                                      HttpServletRequest request) {
        AuthUser actor = admin(request);
        if ("setRole".equals(body.action) && body.role == null) {
            throw new ApiException(400, Api.map("error", "Invalid request data",
                    "issues", List.of(Api.map("path", "role", "message", "role required"))));
        }
        Map<String, Object> target = DbSupport.one(jdbc, "SELECT * FROM users WHERE id = ?", id);
        if (target == null) {
            throw new ApiException(404, "User not found");
        }
        String targetId = DbSupport.str(target, "id");
        if (targetId.equals(actor.id())) {
            throw new ApiException(400, "Cannot modify your own account here");
        }
        String targetName = DbSupport.str(target, "name");
        String oldRole = DbSupport.str(target, "role");
        String ip = Api.clientIp(request);
        if ("setRole".equals(body.action)) {
            jdbc.update("UPDATE users SET role = ?, updated_at = ? WHERE id = ?",
                    body.role, DbSupport.nowIso(), targetId);
            cookies.destroyUserSessions(targetId);
            audit.log(actor.id(), "privilege_shift", ip, "success",
                    targetName + ": " + oldRole + " -> " + body.role);
            return ResponseEntity.ok(Api.ok());
        }
        if ("restrict".equals(body.action)) {
            jdbc.update("UPDATE users SET restricted = 1, updated_at = ? WHERE id = ?",
                    DbSupport.nowIso(), targetId);
            cookies.destroyUserSessions(targetId);
            audit.log(actor.id(), "account_restricted", ip, "success", targetName);
            DbSupport.notify(jdbc, targetId, "Account restricted",
                    "Your account was restricted by an administrator. Contact support for details.",
                    "moderation", null);
            return ResponseEntity.ok(Api.ok());
        }
        jdbc.update("UPDATE users SET restricted = 0, updated_at = ? WHERE id = ?",
                DbSupport.nowIso(), targetId);
        audit.log(actor.id(), "account_unrestricted", ip, "success", targetName);
        return ResponseEntity.ok(Api.ok());
    }

    @DeleteMapping("/api/admin/users/{id}")
    public ResponseEntity<Map<String, Object>> deleteUser(@PathVariable String id, HttpServletRequest request) {
        AuthUser actor = admin(request);
        Map<String, Object> target = DbSupport.one(jdbc, "SELECT id, name, role FROM users WHERE id = ?", id);
        if (target == null) {
            throw new ApiException(404, "User not found");
        }
        String targetId = DbSupport.str(target, "id");
        if (targetId.equals(actor.id())) {
            throw new ApiException(400, "Cannot delete your own admin account");
        }
        tx.executeWithoutResult(status -> wipeUser(targetId));
        audit.log(actor.id(), "account_deleted", Api.clientIp(request), "success",
                DbSupport.str(target, "name"));
        return ResponseEntity.ok(Api.ok());
    }

    @GetMapping("/api/admin/audit")
    public ResponseEntity<Map<String, Object>> auditLog(HttpServletRequest request) {
        admin(request);
        Query query = Query.of(request, "q", "outcome", "limit");
        String q = query.string("q", "", 80).toLowerCase(Locale.ROOT);
        String outcome = query.exact("outcome", "all", 20, OUTCOMES);
        int limit = query.integer("limit", 150, 1, 500);
        String like = "%" + q + "%";
        List<Map<String, Object>> entries = DbSupport.list(jdbc, """
                SELECT a.*, u.name AS actor_name
                FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id
                WHERE (? = 'all' OR a.outcome = ?)
                  AND (? = '' OR lower(a.action) LIKE ? OR lower(COALESCE(u.name,'')) LIKE ? OR lower(a.detail) LIKE ? OR lower(COALESCE(a.ip,'')) LIKE ?)
                ORDER BY a.id DESC LIMIT ?
                """, outcome, outcome, q, like, like, like, like, limit);
        return ResponseEntity.ok(Api.map("entries", entries));
    }

    @GetMapping("/api/admin/reviews")
    public ResponseEntity<Map<String, Object>> reviews(HttpServletRequest request) {
        admin(request);
        return ResponseEntity.ok(Api.map("reviews", DbSupport.list(jdbc, """
                SELECT r.id, r.overall, r.text, r.created_at,
                       rv.name AS reviewer_name, ve.name AS reviewee_name, r.session_id
                FROM reviews r
                JOIN users rv ON rv.id = r.reviewer_id
                JOIN users ve ON ve.id = r.reviewee_id
                ORDER BY r.created_at DESC LIMIT 100
                """)));
    }

    @DeleteMapping("/api/admin/reviews/{id}")
    public ResponseEntity<Map<String, Object>> deleteReview(@PathVariable String id, HttpServletRequest request) {
        AuthUser actor = admin(request);
        Map<String, Object> review = DbSupport.one(jdbc, "SELECT * FROM reviews WHERE id = ?", id);
        if (review == null) {
            throw new ApiException(404, "Review not found");
        }
        String revieweeId = DbSupport.str(review, "reviewee_id");
        tx.executeWithoutResult(status -> {
            jdbc.update("DELETE FROM reviews WHERE id = ?", id);
            Map<String, Object> agg = DbSupport.one(jdbc,
                    "SELECT AVG(overall) AS avg, COUNT(*) AS n FROM reviews WHERE reviewee_id = ?", revieweeId);
            double avg = DbSupport.doubleVal(agg, "avg");
            int count = DbSupport.intVal(agg, "n");
            jdbc.update("UPDATE users SET avg_rating = ?, review_count = ?, updated_at = ? WHERE id = ?",
                    Math.round(avg * 10.0) / 10.0, count, DbSupport.nowIso(), revieweeId);
        });
        audit.log(actor.id(), "review_removed", Api.clientIp(request), "success", id);
        return ResponseEntity.ok(Api.ok());
    }

    @GetMapping("/api/admin/skills")
    public ResponseEntity<Map<String, Object>> skills(HttpServletRequest request) {
        admin(request);
        return ResponseEntity.ok(Api.map("skills", DbSupport.list(jdbc, """
                SELECT sk.id, sk.name, sk.category,
                       (SELECT COUNT(*) FROM users WHERE teaches LIKE '%"' || sk.name || '"%') AS teach_count
                FROM skills sk ORDER BY sk.category, sk.name
                """)));
    }

    @PostMapping("/api/admin/skills")
    public ResponseEntity<Map<String, Object>> addSkill(@Valid @RequestBody Requests.AddSkill body,
                                                        HttpServletRequest request) {
        AuthUser actor = admin(request);
        String name = body.name.trim();
        if (DbSupport.one(jdbc, "SELECT id FROM skills WHERE lower(name) = lower(?)", name) != null) {
            throw new ApiException(409, "Skill already exists");
        }
        String id = DbSupport.uuid();
        jdbc.update("INSERT INTO skills (id, name, category) VALUES (?,?,?)", id, name, body.category);
        audit.log(actor.id(), "skill_added", Api.clientIp(request), "success",
                body.category + ": " + name);
        return ResponseEntity.status(201).body(Api.map("id", id, "ok", true));
    }

    private AuthUser admin(HttpServletRequest request) {
        return AuthContext.requireAdmin(request, audit);
    }

    private int count(String sql, Object... args) {
        Integer value = jdbc.queryForObject(sql, Integer.class, args);
        return value == null ? 0 : value;
    }

    private void wipeUser(String id) {
        jdbc.update("DELETE FROM oauth_accounts WHERE user_id = ?", id);
        jdbc.update("DELETE FROM auth_sessions WHERE user_id = ?", id);
        jdbc.update("DELETE FROM mfa_pending WHERE user_id = ?", id);
        jdbc.update("DELETE FROM email_codes WHERE user_id = ?", id);
        jdbc.update("DELETE FROM notifications WHERE user_id = ?", id);
        jdbc.update("DELETE FROM connection_requests WHERE from_id = ? OR to_id = ?", id, id);
        jdbc.update("DELETE FROM reviews WHERE reviewer_id = ? OR reviewee_id = ?", id, id);
        jdbc.update("DELETE FROM sessions WHERE requester_id = ? OR recipient_id = ?", id, id);
        jdbc.update("DELETE FROM users WHERE id = ?", id);
    }
}
