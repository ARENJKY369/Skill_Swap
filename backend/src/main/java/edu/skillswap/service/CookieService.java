package edu.skillswap.service;

import edu.skillswap.config.AppProperties;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;

@Service
public class CookieService {

    public static final String SESSION_COOKIE = "ss_session";
    public static final String CSRF_COOKIE = "ss_csrf";
    public static final String CSRF_HEADER = "x-csrf-token";
    public static final String OAUTH_STATE_COOKIE = "ss_oauth_state";
    public static final String OAUTH_PKCE_COOKIE = "ss_oauth_pkce";

    private static final SecureRandom RANDOM = new SecureRandom();

    private final AppProperties props;
    private final JdbcTemplate jdbc;

    public CookieService(AppProperties props, JdbcTemplate jdbc) {
        this.props = props;
        this.jdbc = jdbc;
    }

    public String read(HttpServletRequest request, String name) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null) {
            return null;
        }
        for (Cookie cookie : cookies) {
            if (name.equals(cookie.getName())) {
                String value = cookie.getValue();
                try {
                    return URLDecoder.decode(value, StandardCharsets.UTF_8);
                } catch (IllegalArgumentException e) {
                    return value;
                }
            }
        }
        return null;
    }

    public String issueCsrfCookie(HttpServletResponse response) {
        String token = randomToken(32);
        ResponseCookie cookie = ResponseCookie.from(CSRF_COOKIE, token)
                .httpOnly(false)
                .sameSite("Lax")
                .secure(props.isProd())
                .path("/")
                .maxAge(Duration.ofHours(12))
                .build();
        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
        return token;
    }

    public String issueOauthState(HttpServletResponse response) {
        String state = randomToken(24);
        ResponseCookie cookie = ResponseCookie.from(OAUTH_STATE_COOKIE, state)
                .httpOnly(true)
                .sameSite("Lax")
                .secure(props.isProd())
                .path("/")
                .maxAge(Duration.ofMinutes(10))
                .build();
        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
        return state;
    }

    public String issueOauthPkceVerifier(HttpServletResponse response) {
        String verifier = randomToken(32);
        ResponseCookie cookie = ResponseCookie.from(OAUTH_PKCE_COOKIE, verifier)
                .httpOnly(true)
                .sameSite("Lax")
                .secure(props.isProd())
                .path("/")
                .maxAge(Duration.ofMinutes(10))
                .build();
        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
        return verifier;
    }

    public void clearOauthCookies(HttpServletResponse response) {
        clear(response, OAUTH_STATE_COOKIE, true);
        clear(response, OAUTH_PKCE_COOKIE, true);
    }

    public void createSession(HttpServletResponse response, String userId, String ip,
                              String userAgent, boolean rememberMe) {
        String token = randomToken(32);
        Instant expires = Instant.now().plus(rememberMe ? Duration.ofDays(30) : Duration.ofHours(24));
        String agent = userAgent == null ? "" : userAgent;
        if (agent.length() > 300) {
            agent = agent.substring(0, 300);
        }
        jdbc.update(
                "INSERT INTO auth_sessions (id, user_id, token_hash, expires_at, ip, user_agent) VALUES (?,?,?,?,?,?)",
                DbSupport.uuid(), userId, hashToken(token), DbSupport.iso(expires), ip, agent);
        ResponseCookie.ResponseCookieBuilder builder = ResponseCookie.from(SESSION_COOKIE, token)
                .httpOnly(true)
                .sameSite("Lax")
                .secure(props.isProd())
                .path("/");
        if (rememberMe) {
            builder.maxAge(Duration.between(Instant.now(), expires));
        }
        response.addHeader(HttpHeaders.SET_COOKIE, builder.build().toString());
    }

    public void rotateSession(HttpServletResponse response, String oldTokenHash, String userId,
                              String ip, String userAgent, boolean rememberMe) {
        if (oldTokenHash != null && !oldTokenHash.isBlank()) {
            jdbc.update("DELETE FROM auth_sessions WHERE token_hash = ?", oldTokenHash);
        }
        createSession(response, userId, ip, userAgent, rememberMe);
    }

    public void destroyUserSessions(String userId) {
        jdbc.update("DELETE FROM auth_sessions WHERE user_id = ?", userId);
    }

    public void clearAuthCookies(HttpServletResponse response) {
        clear(response, SESSION_COOKIE, true);
        clear(response, CSRF_COOKIE, false);
    }

    private void clear(HttpServletResponse response, String name, boolean httpOnly) {
        ResponseCookie cookie = ResponseCookie.from(name, "")
                .httpOnly(httpOnly)
                .sameSite("Lax")
                .secure(props.isProd())
                .path("/")
                .maxAge(Duration.ZERO)
                .build();
        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
    }

    public String hashToken(String token) {
        return DbSupport.sha256(token);
    }

    public static String randomToken(int bytes) {
        byte[] buf = new byte[bytes];
        RANDOM.nextBytes(buf);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(buf);
    }
}
