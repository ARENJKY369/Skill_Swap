package edu.skillswap.controller;

import edu.skillswap.Api;
import edu.skillswap.Query;
import edu.skillswap.security.AuthContext;
import edu.skillswap.service.DbSupport;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Locale;
import java.util.Map;

@RestController
public class SkillController {

    private final JdbcTemplate jdbc;

    public SkillController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @GetMapping("/api/skills")
    public ResponseEntity<Map<String, Object>> skills(HttpServletRequest request) {
        AuthContext.requireAuth(request);
        Query query = Query.of(request, "q");
        String q = query.string("q", "", 60).toLowerCase(Locale.ROOT);
        String like = "%" + q + "%";
        return ResponseEntity.ok(Api.map("skills", DbSupport.list(jdbc,
                "SELECT id, name, category FROM skills WHERE (? = '' OR lower(name) LIKE ?) ORDER BY category, name",
                q, like)));
    }
}
