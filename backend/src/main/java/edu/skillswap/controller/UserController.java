package edu.skillswap.controller;

import edu.skillswap.Api;
import edu.skillswap.ApiException;
import edu.skillswap.Query;
import edu.skillswap.dto.Requests;
import edu.skillswap.security.AuthContext;
import edu.skillswap.security.AuthUser;
import edu.skillswap.service.AuditService;
import edu.skillswap.service.AvatarService;
import edu.skillswap.service.DbSupport;
import edu.skillswap.service.MatchScoreService;
import edu.skillswap.service.RateLimitService;
import edu.skillswap.service.UserRepository;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

@RestController
public class UserController {

    private static final Set<String> CATEGORIES = Set.of("Tech", "Arts", "Languages", "Business", "Design", "All");

    private final JdbcTemplate jdbc;
    private final UserRepository users;
    private final AuditService audit;
    private final RateLimitService rateLimit;
    private final MatchScoreService matchScore;
    private final AvatarService avatarService;

    public UserController(JdbcTemplate jdbc, UserRepository users, AuditService audit,
                          RateLimitService rateLimit, MatchScoreService matchScore,
                          AvatarService avatarService) {
        this.jdbc = jdbc;
        this.users = users;
        this.audit = audit;
        this.rateLimit = rateLimit;
        this.matchScore = matchScore;
        this.avatarService = avatarService;
    }

    @PatchMapping("/api/users/me")
    public ResponseEntity<Map<String, Object>> patchMe(@Valid @RequestBody Requests.ProfilePatch body,
                                                       HttpServletRequest request) {
        AuthUser me = AuthContext.requireAuth(request);
        Map<String, Object> current = users.getUserById(me.id());
        String name = body.name == null ? DbSupport.str(current, "name") : body.name.trim();
        String bio = body.bio == null ? DbSupport.str(current, "bio") : body.bio;
        String major = body.major == null ? DbSupport.str(current, "major") : body.major.trim();
        String university = body.university == null ? DbSupport.str(current, "university") : body.university.trim();
        String year = body.year == null ? DbSupport.str(current, "year") : body.year;
        String teaches = body.teaches == null ? DbSupport.str(current, "teaches") : DbSupport.toJson(trimList(body.teaches));
        String wants = body.wants == null ? DbSupport.str(current, "wants") : DbSupport.toJson(trimList(body.wants));
        String teachLevels = body.teachLevels == null ? DbSupport.str(current, "teach_levels") : DbSupport.toJson(body.teachLevels);
        String wantLevels = body.wantLevels == null ? DbSupport.str(current, "want_levels") : DbSupport.toJson(body.wantLevels);
        jdbc.update("""
                UPDATE users SET name=?, bio=?, major=?, university=?, year=?, teaches=?, wants=?,
                                teach_levels=?, want_levels=?, updated_at=? WHERE id=?
                """, name, bio, major, university, year, teaches, wants, teachLevels, wantLevels,
                DbSupport.nowIso(), me.id());
        return ResponseEntity.ok(Api.map("user", DbSupport.publicUser(users.getUserById(me.id()))));
    }

    @PostMapping("/api/users/me/avatar")
    public ResponseEntity<Map<String, Object>> uploadAvatar(@Valid @RequestBody Requests.Avatar body,
                                                            HttpServletRequest request) {
        AuthUser me = AuthContext.requireAuth(request);
        avatarService.validate(body.dataUrl);
        jdbc.update("UPDATE users SET avatar = ?, updated_at = ? WHERE id = ?",
                body.dataUrl, DbSupport.nowIso(), me.id());
        return ResponseEntity.ok(Api.map("ok", true, "avatar", body.dataUrl));
    }

    @DeleteMapping("/api/users/me/avatar")
    public ResponseEntity<Map<String, Object>> deleteAvatar(HttpServletRequest request) {
        AuthUser me = AuthContext.requireAuth(request);
        jdbc.update("UPDATE users SET avatar = NULL, updated_at = ? WHERE id = ?",
                DbSupport.nowIso(), me.id());
        return ResponseEntity.ok(Api.ok());
    }

    @GetMapping("/api/users/explorer")
    public ResponseEntity<Map<String, Object>> explorer(HttpServletRequest request) {
        AuthUser me = AuthContext.requireAuth(request);
        Query query = Query.of(request, "q", "category", "limit");
        String q = query.string("q", "", 80).toLowerCase(Locale.ROOT);
        String category = query.exact("category", "All", 20, CATEGORIES);
        int limit = query.integer("limit", 40, 1, 60);
        String like = "%" + q + "%";
        List<Map<String, Object>> rows = DbSupport.list(jdbc, """
                SELECT DISTINCT u.* FROM users u
                WHERE u.id != ? AND u.restricted = 0 AND u.role = 'student'
                  AND (? = '' OR lower(u.name) LIKE ? OR lower(u.username) LIKE ? OR lower(u.teaches) LIKE ? OR lower(u.wants) LIKE ?)
                  AND (? = 'All' OR EXISTS (
                    SELECT 1 FROM skills sk
                    WHERE sk.category = ? AND (u.teaches LIKE '%' || sk.name || '%' OR u.wants LIKE '%' || sk.name || '%')
                  ))
                ORDER BY u.status = 'online' DESC, u.name COLLATE NOCASE
                LIMIT ?
                """, me.id(), q, like, like, like, like, category, category, limit);
        List<Map<String, Object>> publicUsers = rows.stream().map(DbSupport::publicUser).toList();
        return ResponseEntity.ok(Api.map("users", publicUsers));
    }

    @GetMapping("/api/users/me/export")
    public ResponseEntity<Map<String, Object>> export(HttpServletRequest request) {
        AuthUser me = AuthContext.requireAuth(request);
        Map<String, Object> body = Api.map(
                "exportedAt", DbSupport.nowIso(),
                "format", "skillswap-gdpr-export/v1",
                "user", DbSupport.publicUser(me.row()),
                "sessions", DbSupport.list(jdbc,
                        "SELECT * FROM sessions WHERE requester_id = ? OR recipient_id = ? ORDER BY start DESC",
                        me.id(), me.id()),
                "reviews", DbSupport.list(jdbc,
                        "SELECT * FROM reviews WHERE reviewer_id = ? OR reviewee_id = ? ORDER BY created_at DESC",
                        me.id(), me.id()),
                "notifications", DbSupport.list(jdbc,
                        "SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC", me.id()),
                "connectionRequests", DbSupport.list(jdbc,
                        "SELECT * FROM connection_requests WHERE from_id = ? OR to_id = ? ORDER BY created_at DESC",
                        me.id(), me.id()));
        audit.log(me.id(), "data_exported", Api.clientIp(request), "info");
        return ResponseEntity.ok(body);
    }

    @GetMapping("/api/users/{id}")
    public ResponseEntity<Map<String, Object>> profile(@PathVariable String id, HttpServletRequest request) {
        AuthUser me = AuthContext.requireAuth(request);
        Map<String, Object> target = users.getUserById(id);
        if (target == null || (DbSupport.bool(target, "restricted") && !"admin".equals(me.role()))) {
            throw new ApiException(404, "User not found");
        }
        List<Map<String, Object>> reviews = DbSupport.list(jdbc, """
                SELECT r.id, r.punctuality, r.clarity, r.engagement, r.overall, r.text, r.created_at,
                       ru.name AS reviewer_name, ru.username AS reviewer_username
                FROM reviews r JOIN users ru ON ru.id = r.reviewer_id
                WHERE r.reviewee_id = ? ORDER BY r.created_at DESC LIMIT 20
                """, DbSupport.str(target, "id"));
        return ResponseEntity.ok(Api.map("user", DbSupport.publicUser(target), "reviews", reviews));
    }

    @PostMapping("/api/users/{id}/connect")
    public ResponseEntity<Map<String, Object>> connect(@PathVariable String id,
                                                       @Valid @RequestBody Requests.Connect body,
                                                       HttpServletRequest request,
                                                       HttpServletResponse response) {
        AuthUser me = AuthContext.requireAuth(request);
        rateLimit.check("invite", request, response, 30, 60 * 60 * 1000L, "Too many invites. Try again later.");
        Map<String, Object> target = users.getUserById(id);
        if (target == null || DbSupport.bool(target, "restricted") || DbSupport.str(target, "id").equals(me.id())) {
            throw new ApiException(404, "User not found");
        }
        String skill = body.skill == null ? null : body.skill.trim();
        String message = body.message == null ? "" : body.message.trim();
        Map<String, Object> existing = DbSupport.one(jdbc,
                "SELECT status FROM connection_requests WHERE from_id = ? AND to_id = ?",
                me.id(), DbSupport.str(target, "id"));
        if (existing != null) {
            String status = DbSupport.str(existing, "status");
            String error = "Pending".equals(status) ? "Request already pending"
                    : "Request already " + status.toLowerCase(Locale.ROOT);
            throw new ApiException(409, error);
        }
        jdbc.update("INSERT INTO connection_requests (id, from_id, to_id, skill, message) VALUES (?,?,?,?,?)",
                DbSupport.uuid(), me.id(), DbSupport.str(target, "id"), skill, message);
        String suffix = skill == null || skill.isEmpty() ? "" : " over " + skill;
        DbSupport.notify(jdbc, DbSupport.str(target, "id"), "New connection request",
                DbSupport.str(me.row(), "name") + " wants to connect" + suffix + ".", "request", me.id());
        audit.log(me.id(), "connection_request_sent", Api.clientIp(request), "success",
                DbSupport.str(target, "id"));
        return ResponseEntity.status(201).body(Api.ok());
    }

    @GetMapping("/api/users/me/requests/list")
    public ResponseEntity<Map<String, Object>> requests(HttpServletRequest request) {
        AuthUser me = AuthContext.requireAuth(request);
        List<Map<String, Object>> incoming = DbSupport.list(jdbc, """
                SELECT cr.*, u.name AS from_name, u.username AS from_username, u.avatar AS from_avatar, u.major AS from_major
                FROM connection_requests cr JOIN users u ON u.id = cr.from_id
                WHERE cr.to_id = ? ORDER BY cr.created_at DESC
                """, me.id());
        List<Map<String, Object>> outgoing = DbSupport.list(jdbc, """
                SELECT cr.*, u.name AS to_name, u.username AS to_username, u.avatar AS to_avatar, u.major AS to_major
                FROM connection_requests cr JOIN users u ON u.id = cr.to_id
                WHERE cr.from_id = ? ORDER BY cr.created_at DESC
                """, me.id());
        return ResponseEntity.ok(Api.map("incoming", incoming, "outgoing", outgoing));
    }

    @GetMapping("/api/users/matches/list")
    public ResponseEntity<Map<String, Object>> matches(HttpServletRequest request) {
        AuthUser me = AuthContext.requireAuth(request);
        List<String> myTeaches = DbSupport.stringArray(DbSupport.str(me.row(), "teaches"));
        List<String> myWants = DbSupport.stringArray(DbSupport.str(me.row(), "wants"));
        Map<String, String> myLevels = DbSupport.stringMap(DbSupport.str(me.row(), "teach_levels"));
        List<Map<String, Object>> matches = new ArrayList<>();
        for (Map<String, Object> candidate : users.candidatesExcept(me.id())) {
            List<String> theirTeaches = DbSupport.stringArray(DbSupport.str(candidate, "teaches"));
            List<String> theirWants = DbSupport.stringArray(DbSupport.str(candidate, "wants"));
            Map<String, String> theirLevels = DbSupport.stringMap(DbSupport.str(candidate, "teach_levels"));
            MatchScoreService.Result result = matchScore.score(myTeaches, myWants, theirTeaches, theirWants,
                    myLevels, theirLevels, "online".equals(DbSupport.str(candidate, "status")));
            if (result.score() <= 0) {
                continue;
            }
            List<String> mutual = new ArrayList<>(result.iCanTeachThem());
            mutual.addAll(result.theyCanTeachMe());
            List<String> mutualSkills = DbSupport.distinct(mutual);
            String skillLevel = dominantLevel(theirLevels);
            Map<String, Object> match = new LinkedHashMap<>();
            match.put("user", DbSupport.publicUser(candidate));
            match.put("score", result.score());
            match.put("mutualSkills", mutualSkills);
            match.put("teachesMe", result.theyCanTeachMe());
            match.put("learnFromMe", result.iCanTeachThem());
            match.put("skillLevel", skillLevel);
            match.put("bidirectional", result.bidirectional());
            matches.add(match);
        }
        matches.sort((a, b) -> Integer.compare((Integer) b.get("score"), (Integer) a.get("score")));
        if (matches.size() > 40) {
            matches = new ArrayList<>(matches.subList(0, 40));
        }
        return ResponseEntity.ok(Api.map("matches", matches, "myTeaches", myTeaches, "myWants", myWants));
    }

    private static String dominantLevel(Map<String, String> levels) {
        int size = levels.size();
        if (size == 0) {
            return "Med";
        }
        long high = levels.values().stream().filter("high"::equals).count();
        long low = levels.values().stream().filter("low"::equals).count();
        if (high >= size / 2.0) {
            return "High";
        }
        if (low > size / 2.0) {
            return "Low";
        }
        return "Med";
    }

    private static List<String> trimList(List<String> values) {
        List<String> out = new ArrayList<>();
        for (String value : values) {
            out.add(value == null ? "" : value.trim());
        }
        return out;
    }
}
