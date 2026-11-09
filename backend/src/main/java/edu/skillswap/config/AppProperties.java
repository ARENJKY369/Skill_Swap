package edu.skillswap.config;

import org.springframework.stereotype.Component;

import java.nio.file.Path;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HexFormat;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

@Component
public class AppProperties {

    private final boolean prod;
    private final int port;
    private final String dbPath;
    private final String appSecret;
    private final List<String> corsOrigins;
    private final String publicBaseUrl;
    private final String frontendUrl;
    private final String smtpUrl;
    private final String adminEmail;
    private final String adminInitialPassword;
    private final String googleClientId;
    private final String googleClientSecret;
    private final String facebookClientId;
    private final String facebookClientSecret;
    private final String twitterClientId;
    private final String twitterClientSecret;
    private final String linkedinClientId;
    private final String linkedinClientSecret;

    public AppProperties() {
        String nodeEnv = env("NODE_ENV", "");
        String appEnv = env("APP_ENV", "");
        String profiles = env("SPRING_PROFILES_ACTIVE", "");
        this.prod = "production".equalsIgnoreCase(nodeEnv)
                || "production".equalsIgnoreCase(appEnv)
                || profiles.toLowerCase().contains("prod");

        int parsedPort = 8787;
        try {
            String p = env("PORT", "8787");
            if (!p.isBlank()) {
                parsedPort = Integer.parseInt(p.trim());
            }
        } catch (NumberFormatException ignored) {
            parsedPort = 8787;
        }
        this.port = parsedPort;

        String rawDb = env("SKILLSWAP_DB", "");
        this.dbPath = rawDb.isBlank() ? Path.of("data", "skillswap.db").toString() : rawDb;

        String configuredSecret = env("APP_SECRET", "");
        if (!configuredSecret.isBlank()) {
            this.appSecret = configuredSecret;
        } else if (this.prod) {
            byte[] buf = new byte[32];
            new SecureRandom().nextBytes(buf);
            this.appSecret = HexFormat.of().formatHex(buf);
            System.err.println("[security] APP_SECRET is not set — using an ephemeral secret. One-time codes will not survive restarts. Set APP_SECRET in .env.");
        } else {
            this.appSecret = "dev-only-insecure-secret";
        }

        String rawCors = env("CORS_ORIGIN", "");
        Set<String> origins = new LinkedHashSet<>();
        if (!rawCors.isBlank()) {
            Arrays.stream(rawCors.split(","))
                    .map(String::trim)
                    .filter(s -> !s.isEmpty())
                    .forEach(origins::add);
        }
        if (!this.prod) {
            origins.add("http://localhost:5173");
            origins.add("http://127.0.0.1:5173");
        }
        this.corsOrigins = List.copyOf(new ArrayList<>(origins));

        String baseUrl = env("PUBLIC_BASE_URL", "http://localhost:" + this.port);
        this.publicBaseUrl = stripTrailingSlash(baseUrl.isBlank() ? "http://localhost:" + this.port : baseUrl.trim());

        String defaultFrontend = this.prod ? this.publicBaseUrl : "http://localhost:5173";
        String rawFrontend = env("FRONTEND_URL", defaultFrontend);
        this.frontendUrl = stripTrailingSlash(rawFrontend.isBlank() ? defaultFrontend : rawFrontend.trim());

        this.smtpUrl = env("SMTP_URL", "");
        this.adminEmail = env("ADMIN_EMAIL", "").trim();
        this.adminInitialPassword = env("ADMIN_INITIAL_PASSWORD", "");

        this.googleClientId = env("GOOGLE_CLIENT_ID", "").trim();
        this.googleClientSecret = env("GOOGLE_CLIENT_SECRET", "").trim();
        this.facebookClientId = env("FACEBOOK_CLIENT_ID", "").trim();
        this.facebookClientSecret = env("FACEBOOK_CLIENT_SECRET", "").trim();

        String twId = env("TWITTER_CLIENT_ID", "").trim();
        String twSecret = env("TWITTER_CLIENT_SECRET", "").trim();
        this.twitterClientId = !twId.isBlank() ? twId : env("X_CLIENT_ID", "").trim();
        this.twitterClientSecret = !twSecret.isBlank() ? twSecret : env("X_CLIENT_SECRET", "").trim();

        this.linkedinClientId = env("LINKEDIN_CLIENT_ID", "").trim();
        this.linkedinClientSecret = env("LINKEDIN_CLIENT_SECRET", "").trim();
    }

    private static String stripTrailingSlash(String url) {
        if (url != null && url.endsWith("/") && url.length() > 1) {
            return url.substring(0, url.length() - 1);
        }
        return url;
    }

    private static String env(String key, String fallback) {
        String v = System.getenv(key);
        if (v == null) {
            v = System.getProperty(key);
        }
        return v == null ? fallback : v;
    }

    public boolean isProd() { return prod; }
    public int getPort() { return port; }
    public String getDbPath() { return dbPath; }
    public String getAppSecret() { return appSecret; }
    public List<String> getCorsOrigins() { return corsOrigins; }
    public String getPublicBaseUrl() { return publicBaseUrl; }
    public String getFrontendUrl() { return frontendUrl; }
    public String getSmtpUrl() { return smtpUrl; }
    public String getAdminEmail() { return adminEmail; }
    public String getAdminInitialPassword() { return adminInitialPassword; }
    public String getGoogleClientId() { return googleClientId; }
    public String getGoogleClientSecret() { return googleClientSecret; }
    public String getFacebookClientId() { return facebookClientId; }
    public String getFacebookClientSecret() { return facebookClientSecret; }
    public String getTwitterClientId() { return twitterClientId; }
    public String getTwitterClientSecret() { return twitterClientSecret; }
    public String getXClientId() { return twitterClientId; }
    public String getXClientSecret() { return twitterClientSecret; }
    public String getLinkedinClientId() { return linkedinClientId; }
    public String getLinkedinClientSecret() { return linkedinClientSecret; }
}
