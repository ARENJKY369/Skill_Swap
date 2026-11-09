package edu.skillswap.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.ResultSetMetaData;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

/** Shared DB and serialization helpers; all SQL supplied by callers is parameterized. */
public final class DbSupport {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final DateTimeFormatter ISO_MS = DateTimeFormatter
            .ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'")
            .withZone(ZoneOffset.UTC);

    private DbSupport() {}

    public static String uuid() {
        return UUID.randomUUID().toString();
    }

    public static String nowIso() {
        return ISO_MS.format(Instant.now());
    }

    public static String iso(Instant instant) {
        return ISO_MS.format(instant);
    }

    public static Instant plusMinutes(Instant instant, long minutes) {
        return instant.plusSeconds(minutes * 60L);
    }

    public static String sha256(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }

    /** Constant-time string compare that tolerates different lengths, like server/middleware/auth.ts. */
    public static boolean safeEqual(String a, String b) {
        byte[] left = a == null ? new byte[0] : a.getBytes(StandardCharsets.UTF_8);
        byte[] right = b == null ? new byte[0] : b.getBytes(StandardCharsets.UTF_8);
        if (left.length != right.length) {
            MessageDigest.isEqual(sha256Bytes(left), sha256Bytes(right));
            return false;
        }
        return MessageDigest.isEqual(left, right);
    }

    private static byte[] sha256Bytes(byte[] input) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(input);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }

    public static String clientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            return forwarded.split(",")[0].trim();
        }
        String remote = request.getRemoteAddr();
        return remote == null || remote.isBlank() ? "unknown" : remote;
    }

    public static Instant parseInstant(String value) {
        if (value == null) {
            return null;
        }
        try {
            return Instant.parse(value);
        } catch (DateTimeParseException ignored) {
            // continue with other accepted server-side timestamp shapes
        }
        try {
            return OffsetDateTime.parse(value).toInstant();
        } catch (DateTimeParseException ignored) {
            // continue
        }
        try {
            String normalized = value.replace(' ', 'T');
            return LocalDateTime.parse(normalized).atZone(ZoneId.systemDefault()).toInstant();
        } catch (DateTimeParseException e) {
            return null;
        }
    }

    /** Node's new Date(`${date}T${time}:00`) uses the server's local timezone. */
    public static Instant localDateTime(String date, String time) {
        try {
            return LocalDateTime.parse(date + "T" + time + ":00")
                    .atZone(ZoneId.systemDefault())
                    .toInstant();
        } catch (DateTimeParseException e) {
            return null;
        }
    }

    public static String pretty(Instant instant) {
        ZonedDateTime local = instant.atZone(ZoneId.systemDefault());
        return DateTimeFormatter.ofLocalizedDateTime(java.time.format.FormatStyle.MEDIUM)
                .withLocale(Locale.getDefault())
                .format(local);
    }

    public static RowMapper<Map<String, Object>> rowMapper() {
        return (rs, rowNum) -> {
            ResultSetMetaData md = rs.getMetaData();
            Map<String, Object> row = new LinkedHashMap<>();
            for (int i = 1; i <= md.getColumnCount(); i++) {
                row.put(md.getColumnLabel(i), normalized(rs.getObject(i)));
            }
            return row;
        };
    }

    private static Object normalized(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof BigDecimal decimal) {
            return decimal.doubleValue();
        }
        if (value instanceof Float || value instanceof Double) {
            return ((Number) value).doubleValue();
        }
        if (value instanceof Number number) {
            long asLong = number.longValue();
            if (asLong >= Integer.MIN_VALUE && asLong <= Integer.MAX_VALUE) {
                return (int) asLong;
            }
            return asLong;
        }
        return value;
    }

    public static Map<String, Object> one(JdbcTemplate jdbc, String sql, Object... args) {
        try {
            return jdbc.queryForObject(sql, rowMapper(), args);
        } catch (EmptyResultDataAccessException e) {
            return null;
        }
    }

    public static List<Map<String, Object>> list(JdbcTemplate jdbc, String sql, Object... args) {
        return jdbc.query(sql, rowMapper(), args);
    }

    public static String str(Map<String, Object> row, String key) {
        Object value = row == null ? null : row.get(key);
        return value == null ? null : String.valueOf(value);
    }

    public static int intVal(Map<String, Object> row, String key) {
        Object value = row == null ? null : row.get(key);
        if (value instanceof Number number) {
            return number.intValue();
        }
        try {
            return value == null ? 0 : Integer.parseInt(String.valueOf(value));
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    public static double doubleVal(Map<String, Object> row, String key) {
        Object value = row == null ? null : row.get(key);
        if (value instanceof Number number) {
            return number.doubleValue();
        }
        try {
            return value == null ? 0 : Double.parseDouble(String.valueOf(value));
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    public static boolean bool(Map<String, Object> row, String key) {
        return intVal(row, key) == 1;
    }

    public static List<String> stringArray(String raw) {
        try {
            List<String> value = MAPPER.readValue(raw == null ? "[]" : raw, new TypeReference<List<String>>() {});
            return value == null ? List.of() : value;
        } catch (JsonProcessingException e) {
            return List.of();
        }
    }

    public static Map<String, String> stringMap(String raw) {
        try {
            Map<String, String> value = MAPPER.readValue(raw == null ? "{}" : raw, new TypeReference<Map<String, String>>() {});
            return value == null ? Map.of() : new LinkedHashMap<>(value);
        } catch (JsonProcessingException e) {
            return Map.of();
        }
    }

    public static String toJson(Object value) {
        try {
            return MAPPER.writeValueAsString(value);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("JSON serialization failure", e);
        }
    }

    public static Map<String, Object> publicUser(Map<String, Object> row) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", str(row, "id"));
        out.put("name", str(row, "name"));
        out.put("username", str(row, "username"));
        out.put("email", str(row, "email"));
        out.put("role", str(row, "role"));
        out.put("major", str(row, "major"));
        out.put("university", str(row, "university"));
        out.put("year", str(row, "year"));
        out.put("bio", str(row, "bio"));
        out.put("avatar", row == null ? null : row.get("avatar"));
        out.put("teaches", stringArray(str(row, "teaches")));
        out.put("wants", stringArray(str(row, "wants")));
        out.put("teachLevels", stringMap(str(row, "teach_levels")));
        out.put("wantLevels", stringMap(str(row, "want_levels")));
        out.put("avgRating", Math.round(doubleVal(row, "avg_rating") * 10.0) / 10.0);
        out.put("reviewCount", intVal(row, "review_count"));
        out.put("status", str(row, "status"));
        out.put("emailVerified", bool(row, "email_verified"));
        out.put("totpEnabled", bool(row, "totp_enabled"));
        out.put("restricted", bool(row, "restricted"));
        out.put("mustChangePassword", bool(row, "must_change_password"));
        out.put("demo", bool(row, "demo"));
        out.put("createdAt", str(row, "created_at"));
        return out;
    }

    public static void notify(JdbcTemplate jdbc, String userId, String title, String body, String kind, String refId) {
        jdbc.update("INSERT INTO notifications (id, user_id, title, body, kind, ref_id) VALUES (?,?,?,?,?,?)",
                uuid(), userId, title, body, kind, refId);
    }

    public static List<String> distinct(List<String> values) {
        List<String> out = new ArrayList<>();
        for (String value : values) {
            if (value != null && !out.contains(value)) {
                out.add(value);
            }
        }
        return out;
    }
}
