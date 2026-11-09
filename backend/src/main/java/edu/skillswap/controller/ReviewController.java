package edu.skillswap.controller;

import edu.skillswap.Api;
import edu.skillswap.ApiException;
import edu.skillswap.Query;
import edu.skillswap.dto.Requests;
import edu.skillswap.security.AuthContext;
import edu.skillswap.security.AuthUser;
import edu.skillswap.service.AuditService;
import edu.skillswap.service.DbSupport;
import edu.skillswap.service.ReviewRulesService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
public class ReviewController {

    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;
    private final AuditService audit;

    public ReviewController(JdbcTemplate jdbc, TransactionTemplate tx, AuditService audit) {
        this.jdbc = jdbc;
        this.tx = tx;
        this.audit = audit;
    }

    @PostMapping("/api/reviews")
    public ResponseEntity<Map<String, Object>> create(@Valid @RequestBody Requests.CreateReview body,
                                                      HttpServletRequest request) {
        AuthUser me = AuthContext.requireAuth(request);
        String ip = Api.clientIp(request);
        Map<String, Object> session = DbSupport.one(jdbc, "SELECT * FROM sessions WHERE id = ?", body.sessionId.trim());
        if (session == null) {
            throw new ApiException(404, "Session not found");
        }
        String requester = DbSupport.str(session, "requester_id");
        String recipient = DbSupport.str(session, "recipient_id");
        String revieweeId;
        if (me.id().equals(requester)) {
            revieweeId = recipient;
        } else if (me.id().equals(recipient)) {
            revieweeId = requester;
        } else {
            revieweeId = null;
        }
        if (revieweeId == null) {
            audit.log(me.id(), "review_denied_not_participant", ip, "denied", DbSupport.str(session, "id"));
            throw new ApiException(403, "Only session participants can review");
        }
        Map<String, Object> existing = DbSupport.one(jdbc,
                "SELECT id FROM reviews WHERE session_id = ? AND reviewer_id = ?",
                body.sessionId.trim(), me.id());
        ReviewRulesService.Verdict verdict = ReviewRulesService.check(
                DbSupport.str(session, "status"), requester, recipient, me.id(), revieweeId, existing != null);
        if (!verdict.ok()) {
            audit.log(me.id(), "review_rejected", ip, "denied",
                    DbSupport.str(session, "id") + ": " + verdict.reason());
            throw new ApiException(verdict.code(), verdict.reason());
        }

        String id = DbSupport.uuid();
        String sessionId = DbSupport.str(session, "id");
        String text = body.text == null ? "" : body.text.trim();
        tx.executeWithoutResult(status -> {
            jdbc.update("""
                    INSERT INTO reviews (id, session_id, reviewer_id, reviewee_id, punctuality, clarity, engagement, overall, text)
                    VALUES (?,?,?,?,?,?,?,?,?)
                    """, id, sessionId, me.id(), revieweeId, body.punctuality, body.clarity,
                    body.engagement, body.overall, text);
            Map<String, Object> agg = DbSupport.one(jdbc,
                    "SELECT AVG(overall) AS avg, COUNT(*) AS n FROM reviews WHERE reviewee_id = ?", revieweeId);
            double avg = DbSupport.doubleVal(agg, "avg");
            int count = DbSupport.intVal(agg, "n");
            jdbc.update("UPDATE users SET avg_rating = ?, review_count = ?, updated_at = ? WHERE id = ?",
                    Math.round(avg * 10.0) / 10.0, count, DbSupport.nowIso(), revieweeId);
        });
        Map<String, Object> reviewer = DbSupport.one(jdbc, "SELECT name FROM users WHERE id = ?", me.id());
        DbSupport.notify(jdbc, revieweeId, "New review received",
                DbSupport.str(reviewer, "name") + " left you a " + body.overall + "-star review.",
                "review", id);
        audit.log(me.id(), "review_submitted", ip, "success", id);
        return ResponseEntity.status(201).body(Api.map("id", id, "ok", true));
    }

    @GetMapping("/api/reviews/mine")
    public ResponseEntity<Map<String, Object>> mine(HttpServletRequest request) {
        AuthUser me = AuthContext.requireAuth(request);
        return ResponseEntity.ok(Api.map("reviews", DbSupport.list(jdbc,
                "SELECT id, session_id FROM reviews WHERE reviewer_id = ?", me.id())));
    }

    @GetMapping("/api/reviews")
    public ResponseEntity<Map<String, Object>> list(HttpServletRequest request) {
        AuthUser me = AuthContext.requireAuth(request);
        String userId = Query.lax(request).raw("userId", me.id());
        return ResponseEntity.ok(Api.map("reviews", DbSupport.list(jdbc, """
                SELECT r.id, r.punctuality, r.clarity, r.engagement, r.overall, r.text, r.created_at,
                       ru.name AS reviewer_name, ru.username AS reviewer_username, ru.avatar AS reviewer_avatar
                FROM reviews r JOIN users ru ON ru.id = r.reviewer_id
                WHERE r.reviewee_id = ? ORDER BY r.created_at DESC LIMIT 50
                """, userId)));
    }
}
