package edu.skillswap.controller;

import edu.skillswap.Api;
import edu.skillswap.ApiException;
import edu.skillswap.dto.Requests;
import edu.skillswap.security.AuthContext;
import edu.skillswap.security.AuthUser;
import edu.skillswap.service.AuditService;
import edu.skillswap.service.DbSupport;
import edu.skillswap.service.RateLimitService;
import edu.skillswap.service.SessionStateMachine;
import edu.skillswap.service.UserRepository;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;

@RestController
public class SessionController {

    private final JdbcTemplate jdbc;
    private final UserRepository users;
    private final AuditService audit;
    private final RateLimitService rateLimit;

    public SessionController(JdbcTemplate jdbc, UserRepository users, AuditService audit,
                             RateLimitService rateLimit) {
        this.jdbc = jdbc;
        this.users = users;
        this.audit = audit;
        this.rateLimit = rateLimit;
    }

    @GetMapping("/api/sessions")
    public ResponseEntity<Map<String, Object>> list(HttpServletRequest request) {
        AuthUser me = AuthContext.requireAuth(request);
        List<Map<String, Object>> rows = DbSupport.list(jdbc, """
                SELECT s.*, sk.name AS skill_name, sk.category AS skill_category
                FROM sessions s JOIN skills sk ON sk.id = s.skill_id
                WHERE s.requester_id = ? OR s.recipient_id = ?
                ORDER BY s.start DESC
                """, me.id(), me.id());
        List<Map<String, Object>> sessions = rows.stream()
                .map(row -> sessionWithPartner(row, me.id()))
                .toList();
        return ResponseEntity.ok(Api.map("sessions", sessions));
    }

    @PostMapping("/api/sessions")
    public ResponseEntity<Map<String, Object>> create(@Valid @RequestBody Requests.CreateSession body,
                                                      HttpServletRequest request,
                                                      HttpServletResponse response) {
        AuthUser me = AuthContext.requireAuth(request);
        rateLimit.check("invite", request, response, 30, 60 * 60 * 1000L, "Too many attempts");
        String recipientId = body.recipientId.trim();
        if (recipientId.equals(me.id())) {
            throw new ApiException(400, "Cannot schedule with yourself");
        }
        Map<String, Object> recipient = users.getUserById(recipientId);
        if (recipient == null || DbSupport.bool(recipient, "restricted")) {
            throw new ApiException(404, "User not found");
        }
        Map<String, Object> skill = DbSupport.one(jdbc, "SELECT id, name FROM skills WHERE id = ?", body.skillId);
        if (skill == null) {
            throw new ApiException(400, "Unknown skill");
        }
        Instant start = DbSupport.localDateTime(body.date.trim(), body.time.trim());
        if (start == null) {
            throw new ApiException(400, "Invalid date/time");
        }
        if (start.isBefore(Instant.now().minusSeconds(60))) {
            throw new ApiException(400, "Cannot schedule in the past");
        }
        String meetingUrl = body.meetingUrl == null ? null : body.meetingUrl.trim();
        if (meetingUrl != null && !meetingUrl.isEmpty() && !SessionStateMachine.isSafeMeetingUrl(meetingUrl)) {
            throw new ApiException(400, "Invalid request data");
        }
        if (meetingUrl != null && meetingUrl.isEmpty()) {
            meetingUrl = null;
        }
        assertNoConflict(null, me.id(), recipientId, start, body.durationMin);

        String id = DbSupport.uuid();
        String message = body.message == null ? "" : body.message.trim();
        jdbc.update("""
                INSERT INTO sessions (id, requester_id, recipient_id, skill_id, start, duration_min, status, message, meeting_url, proposed_by)
                VALUES (?,?,?,?,?,?, 'Pending', ?, ?, ?)
                """, id, me.id(), recipientId, DbSupport.str(skill, "id"),
                DbSupport.iso(start), body.durationMin, message, meetingUrl, me.id());
        DbSupport.notify(jdbc, recipientId, "New session invite",
                DbSupport.str(me.row(), "name") + " proposed \"" + DbSupport.str(skill, "name")
                        + "\" at " + DbSupport.pretty(start) + ".",
                "invite", id);
        audit.log(me.id(), "session_invite_sent", Api.clientIp(request), "success", id);
        return ResponseEntity.status(201).body(Api.map("id", id, "ok", true));
    }

    @PatchMapping("/api/sessions/{id}")
    public ResponseEntity<Map<String, Object>> patch(@PathVariable String id,
                                                     @Valid @RequestBody Requests.SessionAction body,
                                                     HttpServletRequest request) {
        AuthUser me = AuthContext.requireAuth(request);
        String ip = Api.clientIp(request);
        Map<String, Object> session = DbSupport.one(jdbc, "SELECT * FROM sessions WHERE id = ?", id);
        if (session == null) {
            throw new ApiException(404, "Session not found");
        }
        boolean isRequester = me.id().equals(DbSupport.str(session, "requester_id"));
        boolean isRecipient = me.id().equals(DbSupport.str(session, "recipient_id"));
        if (!isRequester && !isRecipient) {
            audit.log(me.id(), "session_access_denied", ip, "denied", id);
            throw new ApiException(403, "Not a participant of this session");
        }
        String requesterId = DbSupport.str(session, "requester_id");
        String recipientId = DbSupport.str(session, "recipient_id");
        String otherParty = isRequester ? recipientId : requesterId;
        String status = DbSupport.str(session, "status");
        String proposedBy = DbSupport.str(session, "proposed_by");
        String myName = DbSupport.str(me.row(), "name");

        Consumer<String> transitionTo = to -> {
            SessionStateMachine.assertTransition(status, to);
            jdbc.update("UPDATE sessions SET status = ?, updated_at = ? WHERE id = ?",
                    to, DbSupport.nowIso(), id);
        };

        try {
            switch (body.action) {
                case "accept" -> {
                    if ("Pending".equals(status) && !isRecipient) {
                        throw new ApiException(403, "Only the invitee can accept");
                    }
                    if ("Rescheduled".equals(status) && proposedBy != null && proposedBy.equals(me.id())) {
                        throw new ApiException(403, "Only the other participant can accept a rescheduled time");
                    }
                    transitionTo.accept("Accepted");
                    DbSupport.notify(jdbc, otherParty, "Session accepted", myName + " accepted the session time.", "invite", id);
                    audit.log(me.id(), "session_accepted", ip, "success", id);
                }
                case "decline" -> {
                    transitionTo.accept("Declined");
                    DbSupport.notify(jdbc, otherParty, "Session declined", myName + " declined the session.", "invite", id);
                    audit.log(me.id(), "session_declined", ip, "success", id);
                }
                case "reschedule" -> {
                    if (body.date == null || body.time == null) {
                        throw new ApiException(400, "New date and time are required");
                    }
                    Instant start = DbSupport.localDateTime(body.date.trim(), body.time.trim());
                    if (start == null || start.isBefore(Instant.now())) {
                        throw new ApiException(400, "New start must be in the future");
                    }
                    int durationMin = DbSupport.intVal(session, "duration_min");
                    assertNoConflict(id, requesterId, recipientId, start, durationMin);
                    transitionTo.accept("Rescheduled");
                    jdbc.update("""
                            UPDATE sessions
                            SET start = ?, proposed_by = ?, completed_by_requester = 0, completed_by_recipient = 0, updated_at = ?
                            WHERE id = ?
                            """, DbSupport.iso(start), me.id(), DbSupport.nowIso(), id);
                    DbSupport.notify(jdbc, otherParty, "Session rescheduled",
                            myName + " proposed a new time: " + DbSupport.pretty(start) + ".",
                            "invite", id);
                    audit.log(me.id(), "session_rescheduled", ip, "success", id);
                }
                case "complete" -> {
                    Instant start = DbSupport.parseInstant(DbSupport.str(session, "start"));
                    if (start == null) {
                        throw new ApiException(400, "Session can only be completed after its end time");
                    }
                    Instant end = start.plusSeconds(DbSupport.intVal(session, "duration_min") * 60L);
                    String endIso = DbSupport.iso(end);
                    if (!SessionStateMachine.canMarkCompleted(status, endIso)) {
                        throw new ApiException(400, "Session can only be completed after its end time");
                    }
                    String flag = isRequester ? "completed_by_requester" : "completed_by_recipient";
                    jdbc.update("UPDATE sessions SET " + flag + " = 1, updated_at = ? WHERE id = ?",
                            DbSupport.nowIso(), id);
                    Map<String, Object> fresh = DbSupport.one(jdbc, "SELECT * FROM sessions WHERE id = ?", id);
                    boolean both = DbSupport.intVal(fresh, "completed_by_requester") == 1
                            && DbSupport.intVal(fresh, "completed_by_recipient") == 1;
                    if (both) {
                        transitionTo.accept("Completed");
                        DbSupport.notify(jdbc, requesterId, "Session completed", "Leave feedback for your partner.", "review", id);
                        DbSupport.notify(jdbc, recipientId, "Session completed", "Leave feedback for your partner.", "review", id);
                        audit.log(me.id(), "session_completed", ip, "success", id);
                    } else {
                        DbSupport.notify(jdbc, otherParty, "Partner marked session complete",
                                myName + " marked the session complete. Confirm to finish.", "review", id);
                        audit.log(me.id(), "session_completion_confirmed_one_side", ip, "info", id);
                    }
                }
                case "cancel" -> {
                    transitionTo.accept("Declined");
                    DbSupport.notify(jdbc, otherParty, "Session cancelled", myName + " cancelled the session.", "invite", id);
                    audit.log(me.id(), "session_cancelled", ip, "info", id);
                }
                default -> throw new ApiException(400, "Invalid request data");
            }
        } catch (IllegalArgumentException e) {
            throw new ApiException(400, e.getMessage());
        }

        Map<String, Object> fresh = DbSupport.one(jdbc, """
                SELECT s.*, sk.name AS skill_name, sk.category AS skill_category
                FROM sessions s JOIN skills sk ON sk.id = s.skill_id WHERE s.id = ?
                """, id);
        return ResponseEntity.ok(Api.map("ok", true, "session", sessionWithPartner(fresh, me.id())));
    }

    private void assertNoConflict(String excludeSessionId, String userA, String userB, Instant newStart, int durationMin) {
        List<Map<String, Object>> active = DbSupport.list(jdbc, """
                SELECT id, start, duration_min FROM sessions
                WHERE status IN ('Pending','Accepted','Rescheduled')
                  AND (requester_id IN (?,?) OR recipient_id IN (?,?))
                """, userA, userB, userA, userB);
        Instant newEnd = newStart.plusSeconds(durationMin * 60L);
        for (Map<String, Object> row : active) {
            if (excludeSessionId != null && excludeSessionId.equals(DbSupport.str(row, "id"))) {
                continue;
            }
            Instant existingStart = DbSupport.parseInstant(DbSupport.str(row, "start"));
            if (existingStart == null) {
                continue;
            }
            Instant existingEnd = existingStart.plusSeconds(DbSupport.intVal(row, "duration_min") * 60L);
            if (existingStart.isBefore(newEnd) && existingEnd.isAfter(newStart)) {
                throw new ApiException(409, "Time conflict with an existing session");
            }
        }
    }

    private Map<String, Object> sessionWithPartner(Map<String, Object> row, String meId) {
        Map<String, Object> out = new LinkedHashMap<>();
        if (row == null) {
            return out;
        }
        out.putAll(row);
        String partnerId = meId.equals(DbSupport.str(row, "requester_id"))
                ? DbSupport.str(row, "recipient_id")
                : DbSupport.str(row, "requester_id");
        Map<String, Object> partnerRow = users.getUserById(partnerId);
        out.put("durationMin", row.get("duration_min"));
        if (partnerRow == null) {
            out.put("partner", null);
        } else {
            Map<String, Object> partner = new LinkedHashMap<>();
            partner.put("id", DbSupport.str(partnerRow, "id"));
            partner.put("name", DbSupport.str(partnerRow, "name"));
            partner.put("username", DbSupport.str(partnerRow, "username"));
            partner.put("avatar", partnerRow.get("avatar"));
            partner.put("status", DbSupport.str(partnerRow, "status"));
            partner.put("major", DbSupport.str(partnerRow, "major"));
            out.put("partner", partner);
        }
        return out;
    }
}
