package edu.skillswap.security;

import edu.skillswap.service.DbSupport;

import java.util.Map;

public record AuthUser(
        Map<String, Object> row,
        String id,
        String role,
        boolean mustChangePassword,
        String sessionTokenHash
) {

    public static final String ATTR = "skillswap.authUser";
    public static final String SESSION_HASH_ATTR = "skillswap.sessionTokenHash";

    public static AuthUser from(Map<String, Object> row, String sessionTokenHash) {
        return new AuthUser(
                row,
                DbSupport.str(row, "id"),
                DbSupport.str(row, "role"),
                DbSupport.bool(row, "must_change_password"),
                sessionTokenHash);
    }
}
