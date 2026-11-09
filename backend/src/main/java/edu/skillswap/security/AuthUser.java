package edu.skillswap.security;

import java.util.Map;

public record AuthUser(Map<String, Object> row, String id, String role, String sessionTokenHash) {

    public static final String ATTR = "skillswap.authUser";
    public static final String SESSION_HASH_ATTR = "skillswap.sessionTokenHash";

    public static AuthUser from(Map<String, Object> row, String sessionTokenHash) {
        return new AuthUser(row,
                edu.skillswap.service.DbSupport.str(row, "id"),
                edu.skillswap.service.DbSupport.str(row, "role"),
                sessionTokenHash);
    }
}
