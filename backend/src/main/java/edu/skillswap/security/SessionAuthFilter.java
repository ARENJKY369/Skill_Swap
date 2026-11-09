package edu.skillswap.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import edu.skillswap.Api;
import edu.skillswap.service.CookieService;
import edu.skillswap.service.DbSupport;
import edu.skillswap.service.UserRepository;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Attaches the current user (from the opaque session cookie) to the request and SecurityContext. */
public class SessionAuthFilter extends OncePerRequestFilter {

    private static final Set<String> PASSWORD_CHANGE_ALLOWED_PATHS = Set.of(
            "/api/health",
            "/api/auth/csrf",
            "/api/auth/me",
            "/api/auth/change-password",
            "/api/auth/logout",
            "/api/auth/login",
            "/api/auth/oauth/providers"
    );

    private final JdbcTemplate jdbc;
    private final UserRepository users;
    private final CookieService cookies;
    private final ObjectMapper mapper;

    public SessionAuthFilter(JdbcTemplate jdbc, UserRepository users, CookieService cookies, ObjectMapper mapper) {
        this.jdbc = jdbc;
        this.users = users;
        this.cookies = cookies;
        this.mapper = mapper;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        String path = request.getRequestURI();
        if (!path.startsWith("/api")) {
            chain.doFilter(request, response);
            return;
        }
        SecurityContextHolder.clearContext();
        String token = cookies.read(request, CookieService.SESSION_COOKIE);
        AuthUser attached = null;
        if (token != null && !token.isBlank()) {
            String tokenHash = cookies.hashToken(token);
            Map<String, Object> session = DbSupport.one(jdbc,
                    "SELECT s.id AS session_id, s.user_id FROM auth_sessions s WHERE s.token_hash = ? AND s.expires_at > ?",
                    tokenHash, DbSupport.nowIso());
            if (session != null) {
                Map<String, Object> row = users.getUserById(DbSupport.str(session, "user_id"));
                if (row != null && !DbSupport.bool(row, "restricted")) {
                    AuthUser user = AuthUser.from(row, tokenHash);
                    attached = user;
                    request.setAttribute(AuthUser.ATTR, user);
                    request.setAttribute(AuthUser.SESSION_HASH_ATTR, tokenHash);
                    String authority = "ROLE_" + String.valueOf(user.role()).toUpperCase();
                    SecurityContextHolder.getContext().setAuthentication(
                            new UsernamePasswordAuthenticationToken(user, null,
                                    List.of(new SimpleGrantedAuthority(authority))));
                } else if (row != null && DbSupport.bool(row, "restricted")) {
                    jdbc.update("DELETE FROM auth_sessions WHERE token_hash = ?", tokenHash);
                }
            }
        }

        if (attached != null && attached.mustChangePassword() && !PASSWORD_CHANGE_ALLOWED_PATHS.contains(path)) {
            response.setStatus(403);
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            mapper.writeValue(response.getOutputStream(), Api.map(
                    "error", "Password change required before continuing",
                    "code", "PASSWORD_CHANGE_REQUIRED",
                    "correlationId", Api.correlationId(request)));
            return;
        }

        chain.doFilter(request, response);
    }
}
