package edu.skillswap.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import edu.skillswap.Api;
import edu.skillswap.ApiException;
import edu.skillswap.config.AppProperties;
import edu.skillswap.service.AuditService;
import edu.skillswap.service.CookieService;
import edu.skillswap.service.DbSupport;
import edu.skillswap.service.UserRepository;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.HexFormat;
import java.util.Locale;
import java.util.Map;

@RestController
public class OAuthController {

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final String BASE36 = "0123456789abcdefghijklmnopqrstuvwxyz";
    private static final HttpClient HTTP = HttpClient.newHttpClient();

    private record Provider(String authUrl, String tokenUrl, String userInfoUrl,
                            String clientId, String clientSecret, String scope) {}

    private final AppProperties props;
    private final JdbcTemplate jdbc;
    private final UserRepository users;
    private final PasswordEncoder passwordEncoder;
    private final CookieService cookies;
    private final AuditService audit;
    private final ObjectMapper mapper;

    public OAuthController(AppProperties props, JdbcTemplate jdbc, UserRepository users,
                           PasswordEncoder passwordEncoder, CookieService cookies,
                           AuditService audit, ObjectMapper mapper) {
        this.props = props;
        this.jdbc = jdbc;
        this.users = users;
        this.passwordEncoder = passwordEncoder;
        this.cookies = cookies;
        this.audit = audit;
        this.mapper = mapper;
    }

    @GetMapping("/api/auth/oauth/{provider}")
    public ResponseEntity<Map<String, Object>> start(@PathVariable String provider,
                                                     HttpServletResponse response) {
        Provider cfg = providerConfig(provider);
        if (cfg == null) {
            throw new ApiException(404, "Unknown provider");
        }
        if (cfg.clientId().isBlank()) {
            String envPrefix = provider.toUpperCase(Locale.ROOT);
            throw new ApiException(501, Api.map(
                    "error", "OAuth provider \"" + provider + "\" is not configured. Set "
                            + envPrefix + "_CLIENT_ID and " + envPrefix + "_CLIENT_SECRET in .env.",
                    "code", "OAUTH_NOT_CONFIGURED"));
        }
        String state = cookies.issueOauthState(response);
        String redirectUri = props.getPublicBaseUrl() + "/api/auth/oauth/" + provider + "/callback";
        String url = cfg.authUrl()
                + "?client_id=" + component(cfg.clientId())
                + "&redirect_uri=" + component(redirectUri)
                + "&response_type=code"
                + "&scope=" + component(cfg.scope())
                + "&state=" + component(state);
        return ResponseEntity.ok(Api.map("url", url));
    }

    @GetMapping("/api/auth/oauth/{provider}/callback")
    public ResponseEntity<Void> callback(@PathVariable String provider,
                                         @RequestParam(required = false) String code,
                                         @RequestParam(required = false) String state,
                                         HttpServletRequest request,
                                         HttpServletResponse response) {
        Provider cfg = providerConfig(provider);
        String stateCookie = cookies.read(request, CookieService.OAUTH_STATE_COOKIE);
        if (cfg == null || cfg.clientId().isBlank() || cfg.clientSecret().isBlank()) {
            throw new ApiException(501, "OAuth provider not configured");
        }
        if (code == null || code.isBlank() || state == null || stateCookie == null
                || !state.equals(stateCookie)) {
            throw new ApiException(400, "Invalid OAuth state");
        }
        try {
            String redirectUri = props.getPublicBaseUrl() + "/api/auth/oauth/" + provider + "/callback";
            String form = "code=" + form(code)
                    + "&client_id=" + form(cfg.clientId())
                    + "&client_secret=" + form(cfg.clientSecret())
                    + "&redirect_uri=" + form(redirectUri)
                    + "&grant_type=authorization_code";
            HttpRequest tokenRequest = HttpRequest.newBuilder(URI.create(cfg.tokenUrl()))
                    .header("Content-Type", "application/x-www-form-urlencoded")
                    .header("Accept", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(form))
                    .build();
            HttpResponse<String> tokenResponse = HTTP.send(tokenRequest, HttpResponse.BodyHandlers.ofString());
            if (tokenResponse.statusCode() < 200 || tokenResponse.statusCode() >= 300) {
                throw new IllegalStateException("token exchange failed: " + tokenResponse.statusCode());
            }
            JsonNode tokenJson = mapper.readTree(tokenResponse.body());
            String accessToken = tokenJson.path("access_token").asText(null);
            if (accessToken == null || accessToken.isBlank()) {
                throw new IllegalStateException("provider returned no access token");
            }
            HttpRequest infoRequest = HttpRequest.newBuilder(URI.create(cfg.userInfoUrl()))
                    .header("Authorization", "Bearer " + accessToken)
                    .header("Accept", "application/json")
                    .GET()
                    .build();
            HttpResponse<String> infoResponse = HTTP.send(infoRequest, HttpResponse.BodyHandlers.ofString());
            if (infoResponse.statusCode() < 200 || infoResponse.statusCode() >= 300) {
                throw new IllegalStateException("userinfo failed: " + infoResponse.statusCode());
            }
            String[] mapped = mapProfile(provider, mapper.readTree(infoResponse.body()));
            if (mapped == null) {
                throw new IllegalStateException("provider returned no email");
            }
            String email = mapped[0];
            String name = mapped[1];
            Map<String, Object> user = users.getUserByIdentifier(email);
            String userId;
            if (user == null) {
                userId = DbSupport.uuid();
                String username = usernameFrom(email, 24, 4);
                jdbc.update("""
                        INSERT INTO users (id, name, email, username, password_hash, role, email_verified, status, demo)
                        VALUES (?,?,?,?,?, 'student', 1, 'online', 0)
                        """, userId, name, email, username, passwordEncoder.encode(randomHex(24)));
                audit.log(userId, "oauth_signup", Api.clientIp(request), "success", provider);
            } else {
                userId = DbSupport.str(user, "id");
                jdbc.update("UPDATE users SET failed_attempts = 0, locked_until = NULL, status = ?, updated_at = ? WHERE id = ?",
                        "online", DbSupport.nowIso(), userId);
                audit.log(userId, "oauth_login", Api.clientIp(request), "success", provider);
            }
            cookies.createSession(response, userId, Api.clientIp(request), Api.userAgent(request), true);
            return ResponseEntity.status(302).header(HttpHeaders.LOCATION, "/app").build();
        } catch (Exception e) {
            System.err.println("[oauth] " + provider + " " + e);
            return ResponseEntity.status(302).header(HttpHeaders.LOCATION, "/login?error=oauth").build();
        }
    }

    private Provider providerConfig(String provider) {
        return switch (provider) {
            case "google" -> new Provider(
                    "https://accounts.google.com/o/oauth2/v2/auth",
                    "https://oauth2.googleapis.com/token",
                    "https://www.googleapis.com/oauth2/v2/userinfo",
                    props.getGoogleClientId(), props.getGoogleClientSecret(), "openid email profile");
            case "facebook" -> new Provider(
                    "https://www.facebook.com/v19.0/dialog/oauth",
                    "https://graph.facebook.com/v19.0/oauth/access_token",
                    "https://graph.facebook.com/v19.0/me?fields=id,name,email",
                    props.getFacebookClientId(), props.getFacebookClientSecret(), "email public_profile");
            case "x" -> new Provider(
                    "https://twitter.com/i/oauth2/authorize",
                    "https://api.x.com/2/oauth2/token",
                    "https://api.x.com/2/users/me?user.fields=name,username",
                    props.getXClientId(), props.getXClientSecret(),
                    "tweet.read users.read offline.access");
            case "linkedin" -> new Provider(
                    "https://www.linkedin.com/oauth/v2/authorization",
                    "https://www.linkedin.com/oauth/v2/accessToken",
                    "https://api.linkedin.com/v2/userinfo",
                    props.getLinkedinClientId(), props.getLinkedinClientSecret(), "openid profile email");
            default -> null;
        };
    }

    private static String[] mapProfile(String provider, JsonNode profile) {
        if ("x".equals(provider)) {
            JsonNode data = profile.path("data").isObject() ? profile.get("data") : profile;
            String username = data.path("username").asText(null);
            if (username == null || username.isBlank()) {
                return null;
            }
            String name = data.path("name").asText(username);
            return new String[]{username + "@x.oauth.local", name};
        }
        String email = profile.path("email").asText(null);
        if (email == null || email.isBlank()) {
            return null;
        }
        String fallback = switch (provider) {
            case "google" -> "Google User";
            case "facebook" -> "Facebook User";
            case "linkedin" -> "LinkedIn User";
            default -> "OAuth User";
        };
        String name = profile.path("name").asText(fallback);
        return new String[]{email.toLowerCase(Locale.ROOT), name};
    }

    private static String usernameFrom(String email, int maxPrefix, int suffixLength) {
        String local = email.split("@")[0].toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9._-]", "");
        if (local.length() > maxPrefix) {
            local = local.substring(0, maxPrefix);
        }
        StringBuilder suffix = new StringBuilder();
        for (int i = 0; i < suffixLength; i++) {
            suffix.append(BASE36.charAt(RANDOM.nextInt(BASE36.length())));
        }
        return local + "-" + suffix;
    }

    private static String randomHex(int bytes) {
        byte[] buf = new byte[bytes];
        RANDOM.nextBytes(buf);
        return HexFormat.of().formatHex(buf);
    }

    private static String component(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20");
    }

    private static String form(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }
}
