package edu.skillswap.service;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

@Service
public class UserRepository {

    private final JdbcTemplate jdbc;

    public UserRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Map<String, Object> getUserById(String id) {
        return DbSupport.one(jdbc, "SELECT * FROM users WHERE id = ?", id);
    }

    public Map<String, Object> getUserByIdentifier(String identifier) {
        String q = identifier == null ? "" : identifier.trim().toLowerCase();
        return DbSupport.one(jdbc, "SELECT * FROM users WHERE lower(email) = ? OR lower(username) = ?", q, q);
    }

    public Map<String, Object> publicUser(String id) {
        return DbSupport.publicUser(getUserById(id));
    }

    public List<Map<String, Object>> candidatesExcept(String id) {
        return DbSupport.list(jdbc,
                "SELECT * FROM users WHERE id != ? AND role = 'student' AND restricted = 0 AND email_verified = 1", id);
    }
}
