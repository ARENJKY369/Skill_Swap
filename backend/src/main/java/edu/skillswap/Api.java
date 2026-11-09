package edu.skillswap;

import jakarta.servlet.http.HttpServletRequest;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/** Small helpers keeping response construction terse and key-ordered. */
public final class Api {

    public static final String CORRELATION_ID_ATTR = "skillswap.correlationId";
    public static final String CORRELATION_HEADER = "X-Correlation-Id";

    private Api() {}

    public static Map<String, Object> map(Object... keyValues) {
        Map<String, Object> out = new LinkedHashMap<>();
        for (int i = 0; i + 1 < keyValues.length; i += 2) {
            out.put((String) keyValues[i], keyValues[i + 1]);
        }
        return out;
    }

    public static Map<String, Object> ok() {
        return map("ok", true);
    }

    public static String correlationId(HttpServletRequest req) {
        if (req != null) {
            Object existing = req.getAttribute(CORRELATION_ID_ATTR);
            if (existing instanceof String id && !id.isBlank()) {
                return id;
            }
        }
        String generated = UUID.randomUUID().toString().substring(0, 8);
        if (req != null) {
            req.setAttribute(CORRELATION_ID_ATTR, generated);
        }
        return generated;
    }

    public static String clientIp(HttpServletRequest req) {
        if (req == null) {
            return "unknown";
        }
        String forwarded = req.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            return forwarded.split(",")[0].trim();
        }
        String remote = req.getRemoteAddr();
        return remote == null || remote.isBlank() ? "unknown" : remote;
    }

    public static String userAgent(HttpServletRequest req) {
        if (req == null) {
            return "";
        }
        String value = req.getHeader("User-Agent");
        if (value == null) {
            return "";
        }
        return value.length() > 300 ? value.substring(0, 300) : value;
    }
}
