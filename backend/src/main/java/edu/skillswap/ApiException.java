package edu.skillswap;

import java.util.LinkedHashMap;
import java.util.Map;

/** Error with an already-finalized JSON body. */
public class ApiException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    private final int status;
    private final Map<String, Object> body;

    public ApiException(int status, String error) {
        this(status, Api.map("error", error));
    }

    public ApiException(int status, Map<String, Object> body) {
        super(body == null ? "API error" : String.valueOf(body.getOrDefault("error", "API error")));
        this.status = status;
        this.body = body == null ? new LinkedHashMap<>() : new LinkedHashMap<>(body);
    }

    public static ApiException of(int status, String error) {
        return new ApiException(status, error);
    }

    public ApiException with(String key, Object value) {
        body.put(key, value);
        return this;
    }

    public int status() {
        return status;
    }

    public Map<String, Object> body() {
        return body;
    }
}
