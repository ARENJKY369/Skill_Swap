package edu.skillswap.config;

import org.springframework.stereotype.Component;

import java.nio.file.Path;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.HexFormat;
import java.util.List;

@Component
public class AppProperties {

    private final boolean prod;
    private final int port;
    private final String dbPath;
    private final String appSecret;
    private final List<String> corsOrigins;
    private final String publicBaseUrl;
    private final String smtpUrl;
    private final String googleClientId;
    private final String googleClientSecret;
    private final String facebookClientId;
    private final String facebookClientSecret;
    private final String xClientId;
    private final String xClientSecret;
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
        if (rawCors.isBlank()) {
            this.corsOrigins = List.of();
        } else {
            this.corsOrigins = Arrays.stream(rawCors.split(","))
                    .map(String::trim)
                    .filter(s -> !s.isEmpty())
                    .toList();
        }

        String baseUrl = env("PUBLIC_BASE_URL", "http://localhost:" + this.port);
        this.publicBaseUrl = baseUrl.isBlank() ? "http://localhost:" + this.port : baseUrl.trim();
        this.smtpUrl = env("SMTP_URL", "");
        this.googleClientId = env("GOOGLE_CLIENT_ID", "");
        this.googleClientSecret = env("GOOGLE_CLIENT_SECRET", "");
        this.facebookClientId = env("FACEBOOK_CLIENT_ID", "");
        this.facebookClientSecret = env("FACEBOOK_CLIENT_SECRET", "");
        this.xClientId = env("X_CLIENT_ID", "");
        this.xClientSecret = env("X_CLIENT_SECRET", "");
        this.linkedinClientId = env("LINKEDIN_CLIENT_ID", "");
        this.linkedinClientSecret = env("LINKEDIN_CLIENT_SECRET", "");
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
    public String getSmtpUrl() { return smtpUrl; }
    public String getGoogleClientId() { return googleClientId; }
    public String getGoogleClientSecret() { return googleClientSecret; }
    public String getFacebookClientId() { return facebookClientId; }
    public String getFacebookClientSecret() { return facebookClientSecret; }
    public String getXClientId() { return xClientId; }
    public String getXClientSecret() { return xClientSecret; }
    public String getLinkedinClientId() { return linkedinClientId; }
    public String getLinkedinClientSecret() { return linkedinClientSecret; }
}
