package edu.skillswap;

import jakarta.servlet.http.HttpServletRequest;

import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

/** Strict query parser replacing Zod's .strict() + .default()/coerce() behavior. */
public final class Query {

    private final Map<String, String> values;

    private Query(Map<String, String> values) {
        this.values = values;
    }

    public static Query of(HttpServletRequest request, String... allowed) {
        Set<String> allow = Set.copyOf(Arrays.asList(allowed));
        Map<String, String> parsed = new LinkedHashMap<>();
        for (Map.Entry<String, String[]> entry : request.getParameterMap().entrySet()) {
            if (!allow.contains(entry.getKey())) {
                throw new ApiException(400, "Invalid query parameters");
            }
            String[] raw = entry.getValue();
            if (raw == null || raw.length != 1) {
                throw new ApiException(400, "Invalid query parameters");
            }
            parsed.put(entry.getKey(), raw[0]);
        }
        return new Query(parsed);
    }

    public static Query lax(HttpServletRequest request) {
        Map<String, String> parsed = new LinkedHashMap<>();
        for (Map.Entry<String, String[]> entry : request.getParameterMap().entrySet()) {
            String[] raw = entry.getValue();
            if (raw != null && raw.length > 0) {
                parsed.put(entry.getKey(), raw[0]);
            }
        }
        return new Query(parsed);
    }

    public String string(String key, String fallback, int max) {
        String raw = values.get(key);
        String value = raw == null ? fallback : raw.trim();
        if (value.length() > max) {
            throw new ApiException(400, "Invalid query parameters");
        }
        return value;
    }

    public String exact(String key, String fallback, int max, Set<String> choices) {
        String raw = values.get(key);
        String value = raw == null ? fallback : raw;
        if (value.length() > max || !choices.contains(value)) {
            throw new ApiException(400, "Invalid query parameters");
        }
        return value;
    }

    public int integer(String key, int fallback, int min, int max) {
        String raw = values.get(key);
        if (raw == null) {
            return fallback;
        }
        int value;
        try {
            value = Integer.parseInt(raw.trim());
        } catch (NumberFormatException e) {
            throw new ApiException(400, "Invalid query parameters");
        }
        if (value < min || value > max) {
            throw new ApiException(400, "Invalid query parameters");
        }
        return value;
    }

    public String raw(String key, String fallback) {
        return values.getOrDefault(key, fallback);
    }
}
