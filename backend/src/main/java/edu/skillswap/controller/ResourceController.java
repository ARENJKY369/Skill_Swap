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
import java.util.Set;

@RestController
public class ResourceController {

    private static final Set<String> CATEGORIES = Set.of("Tech", "Arts", "Languages", "Business", "Design", "All");

    private final JdbcTemplate jdbc;

    public ResourceController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @GetMapping("/api/resources")
    public ResponseEntity<Map<String, Object>> resources(HttpServletRequest request) {
        AuthContext.requireAuth(request);
        Query query = Query.of(request, "q", "category");
        String q = query.string("q", "", 80).toLowerCase(Locale.ROOT);
        String category = query.exact("category", "All", 20, CATEGORIES);
        String like = "%" + q + "%";
        return ResponseEntity.ok(Api.map("resources", DbSupport.list(jdbc, """
                SELECT * FROM resources
                WHERE (? = '' OR lower(title) LIKE ? OR lower(skill) LIKE ? OR lower(provider) LIKE ?)
                  AND (? = 'All' OR category = ?)
                ORDER BY category, title
                """, q, like, like, like, category, category)));
    }
}
