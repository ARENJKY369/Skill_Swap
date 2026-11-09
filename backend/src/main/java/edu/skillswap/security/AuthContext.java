package edu.skillswap.security;

import edu.skillswap.Api;
import edu.skillswap.ApiException;
import edu.skillswap.service.AuditService;
import edu.skillswap.service.RbacService;
import jakarta.servlet.http.HttpServletRequest;

import java.util.Map;

public final class AuthContext {

    private AuthContext() {}

    public static AuthUser current(HttpServletRequest request) {
        Object value = request.getAttribute(AuthUser.ATTR);
        return value instanceof AuthUser auth ? auth : null;
    }

    public static AuthUser requireAuth(HttpServletRequest request) {
        AuthUser user = current(request);
        if (user == null) {
            throw new ApiException(401, "Authentication required");
        }
        return user;
    }

    public static AuthUser requireAdmin(HttpServletRequest request, AuditService audit) {
        AuthUser user = current(request);
        if (user == null) {
            throw new ApiException(401, "Authentication required");
        }
        if (!RbacService.canAccessAdminPanel(user.role())) {
            audit.log(user.id(), "admin_access_denied", Api.clientIp(request), "denied",
                    request.getMethod() + " " + request.getRequestURI());
            throw new ApiException(403, "Insufficient permissions");
        }
        return user;
    }

    public static Map<String, Object> publicUser(AuthUser user) {
        return edu.skillswap.service.DbSupport.publicUser(user.row());
    }
}
