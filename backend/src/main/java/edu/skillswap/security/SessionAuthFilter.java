package edu.skillswap.security;

import edu.skillswap.service.CookieService;
import edu.skillswap.service.DbSupport;
import edu.skillswap.service.UserRepository;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;
import java.util.Map;

/** Attaches the current user (from the opaque session cookie) to the request and SecurityContext. */
public class SessionAuthFilter extends OncePerRequestFilter {

    private final JdbcTemplate jdbc;
    private final UserRepository users;
    private final CookieService cookies;

    public SessionAuthFilter(JdbcTemplate jdbc, UserRepository users, CookieService cookies) {
        this.jdbc = jdbc;
        this.users = users;
        this.cookies = cookies;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        if (!request.getRequestURI().startsWith("/api")) {
            chain.doFilter(request, response);
            return;
        }
        SecurityContextHolder.clearContext();
        String token = cookies.read(request, CookieService.SESSION_COOKIE);
        if (token != null && !token.isBlank()) {
            String tokenHash = cookies.hashToken(token);
            Map<String, Object> session = DbSupport.one(jdbc,
                    "SELECT s.id AS session_id, s.user_id FROM auth_sessions s WHERE s.token_hash = ? AND s.expires_at > ?",
                    tokenHash, DbSupport.nowIso());
            if (session != null) {
                Map<String, Object> row = users.getUserById(DbSupport.str(session, "user_id"));
                if (row != null) {
                    AuthUser user = AuthUser.from(row, tokenHash);
                    request.setAttribute(AuthUser.ATTR, user);
                    request.setAttribute(AuthUser.SESSION_HASH_ATTR, tokenHash);
                    String authority = "ROLE_" + String.valueOf(user.role()).toUpperCase();
                    SecurityContextHolder.getContext().setAuthentication(
                            new UsernamePasswordAuthenticationToken(user, null,
                                    List.of(new SimpleGrantedAuthority(authority))));
                }
            }
        }
        chain.doFilter(request, response);
    }
}
