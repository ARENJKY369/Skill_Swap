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
import org.springframework.transaction.support.TransactionTemplate;
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
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.util.Base64;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@RestController
public class OAuthController {

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final String BASE36 = "0123456789abcdefghijklmnopqrstuvwxyz";
    private static final HttpClient HTTP = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .build();

    private record Provider(
            String id,
            String label,
            String authUrl,
            String tokenUrl,
            String userInfoUrl,
            String clientId,
            String clientSecret,
            String scope,
            boolean pkce,
            boolean basicTokenAuth
    ) {
        boolean configured() {
            return clientId != null && !clientId.isBlank()
                    && clientSecret != null && !clientSecret.isBlank();
        }
    }

    private record OAuthProfile(
            String providerUserId,
            String email,
            String name,
            boolean emailVerified
    ) {}

    private final AppProperties props;
    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;
    private final UserRepository users;
    private final PasswordEncoder passwordEncoder;
    private final CookieService cookies;
    private final AuditService audit;
    private final ObjectMapper mapper;

    public OAuthController(AppProperties props, JdbcTemplate jdbc, TransactionTemplate tx,
                           UserRepository users, PasswordEncoder passwordEncoder,
                           CookieService cookies, AuditService audit, ObjectMapper mapper) {
        this.props = props;
        this.jdbc = jdbc;
        this.tx = tx;
        this.users = users;
        this.passwordEncoder = passwordEncoder;
        this.cookies = cookies;
        this.audit = audit;
        this.mapper = mapper;
    }

    /**
     * Public provider availability discovery (exposes zero client IDs or secrets).
     */
    @GetMapping("/api/auth/oauth/providers")
    public ResponseEntity<Map<String, Object>> providers() {
        Map<String, Object> out = new LinkedHashMap<>();
        for (String key : List.of("google", "facebook", "twitter", "linkedin")) {
            Provider p = providerConfig(key);
            out.put(key, Api.map(
                    "id", p.id(),
                    "label", p.label(),
                    "configured", p.configured(),
                    "authPath", "/oauth2/authorization/" + p.id()));
        }
        return ResponseEntity.ok(Api.map("providers", out));
    }

    /**
     * Full-page server-side OAuth 2.0 Authorization Code initiation
     * (Spring Security OAuth2 Client standard path `/oauth2/authorization/{provider}`,
     * with `/api/auth/oauth/{provider}` retained for compatibility).
     */
    @GetMapping({"/oauth2/authorization/{provider}", "/api/auth/oauth/{provider}"})
    public ResponseEntity<?> authorize(@PathVariable String provider,
                                       HttpServletRequest request,
                                       HttpServletResponse response) {
        Provider cfg = providerConfig(provider);
        if (cfg == null) {
            if (wantsHtmlNavigation(request)) {
                return redirectToLoginError("Unknown social sign-in provider");
            }
            throw new ApiException(404, "Unknown OAuth provider");
        }
        if (!cfg.configured()) {
            String message = cfg.label() + " sign-in is not configured on this server";
            audit.log(null, "oauth_not_configured", Api.clientIp(request), "info", cfg.id());
            if (wantsHtmlNavigation(request)) {
                return redirectToLoginError(message);
            }
            throw new ApiException(501, Api.map(
                    "error", message,
                    "code", "OAUTH_NOT_CONFIGURED",
                    "provider", cfg.id()));
        }

        String state = cookies.issueOauthState(response);
        String redirectUri = callbackUri(cfg.id());
        StringBuilder authUrl = new StringBuilder(cfg.authUrl())
                .append("?client_id=").append(component(cfg.clientId()))
                .append("&redirect_uri=").append(component(redirectUri))
                .append("&response_type=code")
                .append("&scope=").append(component(cfg.scope()))
                .append("&state=").append(component(state));

        if (cfg.pkce()) {
            String verifier = cookies.issueOauthPkceVerifier(response);
            authUrl.append("&code_challenge=").append(component(pkceChallengeS256(verifier)))
                    .append("&code_challenge_method=S256");
        }

        String targetUrl = authUrl.toString();
        if (!wantsHtmlNavigation(request) && request.getRequestURI().startsWith("/api/")) {
            return ResponseEntity.ok(Api.map("url", targetUrl));
        }
        return ResponseEntity.status(302)
                .header(HttpHeaders.LOCATION, targetUrl)
                .build();
    }

    /**
     * OAuth 2.0 Authorization Code callback
     * (standard path `/login/oauth2/code/{provider}`, plus `/api/auth/oauth/{provider}/callback`).
     */
    @GetMapping({"/login/oauth2/code/{provider}", "/api/auth/oauth/{provider}/callback"})
    public ResponseEntity<Void> callback(@PathVariable String provider,
                                         @RequestParam(required = false) String code,
                                         @RequestParam(required = false) String state,
                                         @RequestParam(required = false) String error,
                                         @RequestParam(name = "error_description", required = false) String errorDescription,
                                         HttpServletRequest request,
                                         HttpServletResponse response) {
        Provider cfg = providerConfig(provider);
        String stateCookie = cookies.read(request, CookieService.OAUTH_STATE_COOKIE);
        String pkceVerifier = cookies.read(request, CookieService.OAUTH_PKCE_COOKIE);
        cookies.clearOauthCookies(response);

        if (cfg == null) {
            return redirectToLoginError("Unknown social sign-in provider");
        }
        if (!cfg.configured()) {
            return redirectToLoginError(cfg.label() + " sign-in is not configured on this server");
        }

        String ip = Api.clientIp(request);

        // Handle user cancelling or provider returning an OAuth error parameter
        if (error != null && !error.isBlank()) {
            boolean cancelled = "access_denied".equalsIgnoreCase(error)
                    || "user_cancelled_login".equalsIgnoreCase(error)
                    || "user_cancelled_authorize".equalsIgnoreCase(error);
            audit.log(null, cancelled ? "oauth_cancelled" : "oauth_provider_error",
                    ip, "info", cfg.id() + ":" + error);
            if (cancelled) {
                return redirectToLoginError(cfg.label() + " sign-in was cancelled.");
            }
            return redirectToLoginError(cfg.label() + " sign-in failed at provider.");
        }

        if (code == null || code.isBlank() || state == null || stateCookie == null
                || !DbSupport.safeEqual(state, stateCookie)) {
            audit.log(null, "oauth_invalid_state", ip, "denied", cfg.id());
            return redirectToLoginError("Invalid or expired OAuth state. Please try signing in again.");
        }

        try {
            String redirectUri = callbackUri(cfg.id());
            StringBuilder form = new StringBuilder()
                    .append("code=").append(form(code))
                    .append("&redirect_uri=").append(form(redirectUri))
                    .append("&grant_type=authorization_code");

            if (!cfg.basicTokenAuth()) {
                form.append("&client_id=").append(form(cfg.clientId()))
                        .append("&client_secret=").append(form(cfg.clientSecret()));
            }
            if (cfg.pkce() && pkceVerifier != null && !pkceVerifier.isBlank()) {
                form.append("&code_verifier=").append(form(pkceVerifier));
            }

            HttpRequest.Builder tokenReqBuilder = HttpRequest.newBuilder(URI.create(cfg.tokenUrl()))
                    .timeout(Duration.ofSeconds(15))
                    .header("Content-Type", "application/x-www-form-urlencoded")
                    .header("Accept", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(form.toString()));

            if (cfg.basicTokenAuth()) {
                String basic = Base64.getEncoder().encodeToString(
                        (cfg.clientId() + ":" + cfg.clientSecret()).getBytes(StandardCharsets.UTF_8));
                tokenReqBuilder.header("Authorization", "Basic " + basic);
            }

            HttpResponse<String> tokenResponse = HTTP.send(tokenReqBuilder.build(), HttpResponse.BodyHandlers.ofString());
            if (tokenResponse.statusCode() < 200 || tokenResponse.statusCode() >= 300) {
                throw new IllegalStateException("token exchange failed with HTTP " + tokenResponse.statusCode());
            }
            JsonNode tokenJson = mapper.readTree(tokenResponse.body());
            String accessToken = tokenJson.path("access_token").asText(null);
            if (accessToken == null || accessToken.isBlank()) {
                throw new IllegalStateException("provider returned no access token");
            }

            HttpRequest infoRequest = HttpRequest.newBuilder(URI.create(cfg.userInfoUrl()))
                    .timeout(Duration.ofSeconds(15))
                    .header("Authorization", "Bearer " + accessToken)
                    .header("Accept", "application/json")
                    .GET()
                    .build();
            HttpResponse<String> infoResponse = HTTP.send(infoRequest, HttpResponse.BodyHandlers.ofString());
            if (infoResponse.statusCode() < 200 || infoResponse.statusCode() >= 300) {
                throw new IllegalStateException("userinfo failed with HTTP " + infoResponse.statusCode());
            }

            OAuthProfile profile = mapProfile(cfg.id(), mapper.readTree(infoResponse.body()));
            if (profile == null || profile.providerUserId() == null || profile.providerUserId().isBlank()) {
                throw new IllegalStateException("provider returned incomplete identity");
            }

            return resolveAndSignIn(cfg, profile, request, response);
        } catch (Exception ex) {
            String correlationId = Api.correlationId(request);
            System.err.println("[oauth:" + correlationId + "] " + cfg.id() + " callback failed: " + ex.getMessage());
            ex.printStackTrace(System.err);
            audit.log(null, "oauth_error", ip, "failure", cfg.id() + ":" + correlationId);
            return redirectToLoginError("Could not complete " + cfg.label() + " sign-in (Ref: " + correlationId + ").");
        }
    }

    private ResponseEntity<Void> resolveAndSignIn(Provider cfg, OAuthProfile profile,
                                                  HttpServletRequest request,
                                                  HttpServletResponse response) {
        String ip = Api.clientIp(request);

        // 1. Check existing explicit provider link
        Map<String, Object> existingLink = DbSupport.one(jdbc,
                "SELECT user_id FROM oauth_accounts WHERE provider = ? AND provider_user_id = ?",
                cfg.id(), profile.providerUserId());
        if (existingLink != null) {
            String linkedUserId = DbSupport.str(existingLink, "user_id");
            Map<String, Object> linkedUser = users.getUserById(linkedUserId);
            if (linkedUser != null) {
                if (DbSupport.bool(linkedUser, "restricted")) {
                    audit.log(linkedUserId, "login_restricted", ip, "denied", cfg.id());
                    return redirectToLoginError("Account restricted. Contact support.");
                }
                jdbc.update("UPDATE users SET failed_attempts = 0, locked_until = NULL, status = 'online', updated_at = ? WHERE id = ?",
                        DbSupport.nowIso(), linkedUserId);
                audit.log(linkedUserId, "oauth_login", ip, "success", cfg.id());
                cookies.createSession(response, linkedUserId, ip, Api.userAgent(request), true);
                cookies.issueCsrfCookie(response);
                return ResponseEntity.status(302)
                        .header(HttpHeaders.LOCATION, props.getFrontendUrl() + "/#/app")
                        .build();
            }
        }

        // 2. Require a verified email address from the provider to create or link by email
        if (profile.email() == null || profile.email().isBlank() || !profile.emailVerified()) {
            audit.log(null, "oauth_unverified_email_rejected", ip, "denied", cfg.id());
            return redirectToLoginError(cfg.label()
                    + " did not provide a verified email address. Verify your email with "
                    + cfg.label() + " or sign in with your password.");
        }

        String normalizedEmail = profile.email().trim().toLowerCase(Locale.ROOT);
        Map<String, Object> existingLocal = users.getUserByIdentifier(normalizedEmail);

        if (existingLocal != null) {
            String localUserId = DbSupport.str(existingLocal, "id");
            if (DbSupport.bool(existingLocal, "restricted")) {
                audit.log(localUserId, "login_restricted", ip, "denied", cfg.id());
                return redirectToLoginError("Account restricted. Contact support.");
            }
            boolean wasEmailVerified = DbSupport.bool(existingLocal, "email_verified");
            tx.executeWithoutResult(status -> {
                if (!wasEmailVerified) {
                    // Prevent pre-account takeover: invalidate any password set on an unverified pre-registered email
                    jdbc.update("""
                            UPDATE users
                            SET password_hash = ?, email_verified = 1, failed_attempts = 0,
                                locked_until = NULL, status = 'online', updated_at = ?
                            WHERE id = ?
                            """, passwordEncoder.encode(randomHex(24)), DbSupport.nowIso(), localUserId);
                    cookies.destroyUserSessions(localUserId);
                } else {
                    jdbc.update("UPDATE users SET failed_attempts = 0, locked_until = NULL, status = 'online', updated_at = ? WHERE id = ?",
                            DbSupport.nowIso(), localUserId);
                }
                jdbc.update("""
                        INSERT OR IGNORE INTO oauth_accounts (id, user_id, provider, provider_user_id, email)
                        VALUES (?,?,?,?,?)
                        """, DbSupport.uuid(), localUserId, cfg.id(), profile.providerUserId(), normalizedEmail);
            });
            audit.log(localUserId, "oauth_linked", ip, "success", cfg.id());
            cookies.createSession(response, localUserId, ip, Api.userAgent(request), true);
            cookies.issueCsrfCookie(response);
            return ResponseEntity.status(302)
                    .header(HttpHeaders.LOCATION, props.getFrontendUrl() + "/#/app")
                    .build();
        }

        // 3. Create new verified student account bound to this OAuth identity
        String newUserId = DbSupport.uuid();
        String username = usernameFrom(normalizedEmail, 24, 4);
        tx.executeWithoutResult(status -> {
            jdbc.update("""
                    INSERT INTO users (id, name, email, username, password_hash, role, email_verified, must_change_password, status, demo)
                    VALUES (?,?,?,?,?, 'student', 1, 0, 'online', 0)
                    """, newUserId, profile.name(), normalizedEmail, username, passwordEncoder.encode(randomHex(24)));
            jdbc.update("""
                    INSERT INTO oauth_accounts (id, user_id, provider, provider_user_id, email)
                    VALUES (?,?,?,?,?)
                    """, DbSupport.uuid(), newUserId, cfg.id(), profile.providerUserId(), normalizedEmail);
        });
        audit.log(newUserId, "oauth_signup", ip, "success", cfg.id());
        cookies.createSession(response, newUserId, ip, Api.userAgent(request), true);
        cookies.issueCsrfCookie(response);
        return ResponseEntity.status(302)
                .header(HttpHeaders.LOCATION, props.getFrontendUrl() + "/#/app")
                .build();
    }

    private String callbackUri(String canonicalProviderId) {
        return props.getPublicBaseUrl() + "/login/oauth2/code/" + canonicalProviderId;
    }

    private ResponseEntity<Void> redirectToLoginError(String message) {
        String target = props.getFrontendUrl() + "/#/login?oauthError=" + component(message);
        return ResponseEntity.status(302)
                .header(HttpHeaders.LOCATION, target)
                .build();
    }

    private static boolean wantsHtmlNavigation(HttpServletRequest request) {
        String accept = request.getHeader(HttpHeaders.ACCEPT);
        if (accept == null || accept.isBlank()) {
            return !request.getRequestURI().startsWith("/api/");
        }
        String lower = accept.toLowerCase(Locale.ROOT);
        if (lower.contains("text/html")) {
            return true;
        }
        return !lower.contains("application/json");
    }

    private Provider providerConfig(String rawProvider) {
        if (rawProvider == null) {
            return null;
        }
        return switch (rawProvider.trim().toLowerCase(Locale.ROOT)) {
            case "google" -> new Provider(
                    "google", "Google",
                    "https://accounts.google.com/o/oauth2/v2/auth",
                    "https://oauth2.googleapis.com/token",
                    "https://openidconnect.googleapis.com/v1/userinfo",
                    props.getGoogleClientId(), props.getGoogleClientSecret(),
                    "openid email profile", true, false);
            case "facebook" -> new Provider(
                    "facebook", "Facebook",
                    "https://www.facebook.com/v19.0/dialog/oauth",
                    "https://graph.facebook.com/v19.0/oauth/access_token",
                    "https://graph.facebook.com/v19.0/me?fields=id,name,email",
                    props.getFacebookClientId(), props.getFacebookClientSecret(),
                    "email public_profile", false, false);
            case "twitter", "x" -> new Provider(
                    "twitter", "X",
                    "https://twitter.com/i/oauth2/authorize",
                    "https://api.x.com/2/oauth2/token",
                    "https://api.x.com/2/users/me?user.fields=id,name,username,confirmed_email",
                    props.getTwitterClientId(), props.getTwitterClientSecret(),
                    "users.read tweet.read users.email", true, true);
            case "linkedin" -> new Provider(
                    "linkedin", "LinkedIn",
                    "https://www.linkedin.com/oauth/v2/authorization",
                    "https://www.linkedin.com/oauth/v2/accessToken",
                    "https://api.linkedin.com/v2/userinfo",
                    props.getLinkedinClientId(), props.getLinkedinClientSecret(),
                    "openid profile email", false, false);
            default -> null;
        };
    }

    private static OAuthProfile mapProfile(String providerId, JsonNode profile) {
        if ("twitter".equals(providerId)) {
            JsonNode data = profile.path("data").isObject() ? profile.get("data") : profile;
            String id = data.path("id").asText(null);
            String confirmedEmail = data.path("confirmed_email").asText(null);
            String username = data.path("username").asText("X User");
            String name = data.path("name").asText(username);
            boolean verified = confirmedEmail != null && !confirmedEmail.isBlank();
            return new OAuthProfile(id, confirmedEmail, name, verified);
        }

        String id = profile.hasNonNull("sub")
                ? profile.path("sub").asText(null)
                : profile.path("id").asText(null);
        String email = profile.path("email").asText(null);
        String fallback = switch (providerId) {
            case "google" -> "Google User";
            case "facebook" -> "Facebook User";
            case "linkedin" -> "LinkedIn User";
            default -> "OAuth User";
        };
        String name = profile.path("name").asText(fallback);
        boolean verified = switch (providerId) {
            case "google" -> profile.path("email_verified").asBoolean(false)
                    || profile.path("verified_email").asBoolean(false);
            case "linkedin" -> profile.path("email_verified").asBoolean(false);
            case "facebook" -> email != null && !email.isBlank();
            default -> false;
        };
        return new OAuthProfile(id, email, name, verified);
    }

    private static String pkceChallengeS256(String verifier) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(verifier.getBytes(StandardCharsets.US_ASCII));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }

    private static String usernameFrom(String email, int maxPrefix, int suffixLength) {
        String local = email.split("@")[0].toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9._-]", "");
        if (local.isBlank()) {
            local = "student";
        }
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
        return URLEncoder.encode(value == null ? "" : value, StandardCharsets.UTF_8).replace("+", "%20");
    }

    private static String form(String value) {
        return URLEncoder.encode(value == null ? "" : value, StandardCharsets.UTF_8);
    }
}
