package edu.skillswap.controller;

import edu.skillswap.Api;
import edu.skillswap.ApiException;
import edu.skillswap.config.AppProperties;
import edu.skillswap.dto.Requests;
import edu.skillswap.security.AuthContext;
import edu.skillswap.security.AuthUser;
import edu.skillswap.service.AuditService;
import edu.skillswap.service.CookieService;
import edu.skillswap.service.DbSupport;
import edu.skillswap.service.RateLimitService;
import edu.skillswap.service.TotpService;
import edu.skillswap.service.UserRepository;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final String BASE36 = "0123456789abcdefghijklmnopqrstuvwxyz";
    private static final int MAX_FAILED_ATTEMPTS = 5;
    private static final int LOCK_MINUTES = 15;

    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;
    private final UserRepository users;
    private final PasswordEncoder passwordEncoder;
    private final CookieService cookies;
    private final TotpService totp;
    private final RateLimitService rateLimit;
    private final AuditService audit;
    private final AppProperties props;
    private final String dummyHash;

    public AuthController(JdbcTemplate jdbc, TransactionTemplate tx, UserRepository users,
                          PasswordEncoder passwordEncoder, CookieService cookies, TotpService totp,
                          RateLimitService rateLimit, AuditService audit, AppProperties props) {
        this.jdbc = jdbc;
        this.tx = tx;
        this.users = users;
        this.passwordEncoder = passwordEncoder;
        this.cookies = cookies;
        this.totp = totp;
        this.rateLimit = rateLimit;
        this.audit = audit;
        this.props = props;
        this.dummyHash = passwordEncoder.encode("timing-equalization-dummy");
    }

    @GetMapping("/csrf")
    public ResponseEntity<Map<String, Object>> csrf(@RequestParam(required = false) String rotate,
                                                    HttpServletRequest request,
                                                    HttpServletResponse response) {
        boolean forceRotate = "1".equals(rotate) || "true".equalsIgnoreCase(rotate);
        String existing = cookies.read(request, CookieService.CSRF_COOKIE);
        if (!forceRotate && existing != null && existing.length() >= 32) {
            return ResponseEntity.ok(Api.map("csrfToken", existing));
        }
        return ResponseEntity.ok(Api.map("csrfToken", cookies.issueCsrfCookie(response)));
    }

    @PostMapping("/signup")
    public ResponseEntity<Map<String, Object>> signup(@Valid @RequestBody Requests.Signup body,
                                                      HttpServletRequest request,
                                                      HttpServletResponse response) {
        rateLimit.check("signup", request, response, 20, 60 * 60 * 1000L, "Too many attempts");
        String name = body.name.trim();
        String email = body.email.trim().toLowerCase(Locale.ROOT);
        String major = body.major == null ? "" : body.major.trim();
        Map<String, Object> existing = users.getUserByIdentifier(email);
        if (existing != null) {
            Map<String, Object> payload = Api.map("ok", true, "needsVerification", true, "email", email);
            if (!DbSupport.bool(existing, "email_verified") && canIssueFreshCode(DbSupport.str(existing, "id"), "verify")) {
                IssuedCode issued = issueEmailCode(existing, "verify");
                if (!props.isProd()) {
                    payload.put("devVerificationCode", issued.code());
                    payload.put("devVerificationLink", issued.link());
                }
            }
            return ResponseEntity.ok(payload);
        }
        String username = usernameFrom(email, 30, 4);
        String id = DbSupport.uuid();
        jdbc.update("""
                INSERT INTO users (id, name, email, username, password_hash, role, major, email_verified, must_change_password, status, demo)
                VALUES (?,?,?,?,?, 'student', ?, 0, 0, 'offline', 0)
                """, id, name, email, username, passwordEncoder.encode(body.password), major);
        Map<String, Object> user = users.getUserById(id);
        IssuedCode issued = issueEmailCode(user, "verify");
        audit.log(id, "signup", Api.clientIp(request), "success", email);
        Map<String, Object> payload = Api.map("ok", true, "needsVerification", true, "email", email);
        if (!props.isProd()) {
            payload.put("devVerificationCode", issued.code());
            payload.put("devVerificationLink", issued.link());
        }
        return ResponseEntity.status(201).body(payload);
    }

    /**
     * Direct GET verification link handler (supports clicking the verification link
     * printed to the server console in dev mode or sent in an email).
     */
    @GetMapping("/verify-email")
    public ResponseEntity<Void> verifyViaLink(@RequestParam(required = false) String email,
                                              @RequestParam(required = false) String code,
                                              HttpServletRequest request,
                                              HttpServletResponse response) {
        String frontend = props.getFrontendUrl();
        if (email == null || email.isBlank() || code == null || !code.trim().matches("\\d{6}")) {
            return redirectTo(frontend + "/#/login?verifyError=" + urlEncode("Invalid verification link"));
        }
        try {
            rateLimit.check("otp", request, response, 10, 10 * 60 * 1000L, "Too many attempts");
            String normalizedEmail = email.trim().toLowerCase(Locale.ROOT);
            Map<String, Object> user = users.getUserByIdentifier(normalizedEmail);
            if (user == null) {
                return redirectTo(frontend + "/#/login?verifyError=" + urlEncode("Invalid or expired verification link"));
            }
            if (!DbSupport.bool(user, "email_verified")) {
                Check check = checkEmailCode(user, "verify", code.trim());
                if (!check.ok()) {
                    return redirectTo(frontend + "/#/login?verifyError=" + urlEncode(check.error()));
                }
                jdbc.update("UPDATE users SET email_verified = 1, status = 'online', updated_at = ? WHERE id = ?",
                        DbSupport.nowIso(), DbSupport.str(user, "id"));
                audit.log(DbSupport.str(user, "id"), "email_verified", Api.clientIp(request), "success", "link");
            }
            cookies.createSession(response, DbSupport.str(user, "id"), Api.clientIp(request),
                    Api.userAgent(request), false);
            cookies.issueCsrfCookie(response);
            return redirectTo(frontend + "/#/app");
        } catch (ApiException ex) {
            return redirectTo(frontend + "/#/login?verifyError=" + urlEncode(ex.getMessage()));
        }
    }

    @PostMapping("/verify-email")
    public ResponseEntity<Map<String, Object>> verify(@Valid @RequestBody Requests.VerifyEmail body,
                                                      HttpServletRequest request,
                                                      HttpServletResponse response) {
        rateLimit.check("otp", request, response, 10, 10 * 60 * 1000L, "Too many attempts");
        String email = body.email.trim().toLowerCase(Locale.ROOT);
        String code = body.code.trim();
        Map<String, Object> user = users.getUserByIdentifier(email);
        if (user == null) {
            throw new ApiException(400, "Invalid code");
        }
        if (!DbSupport.bool(user, "email_verified")) {
            Check check = checkEmailCode(user, "verify", code);
            if (!check.ok()) {
                throw new ApiException(400, check.error());
            }
            jdbc.update("UPDATE users SET email_verified = 1, status = 'online', updated_at = ? WHERE id = ?",
                    DbSupport.nowIso(), DbSupport.str(user, "id"));
            audit.log(DbSupport.str(user, "id"), "email_verified", Api.clientIp(request), "success");
        }
        Map<String, Object> updated = users.getUserById(DbSupport.str(user, "id"));
        cookies.createSession(response, DbSupport.str(user, "id"), Api.clientIp(request),
                Api.userAgent(request), false);
        return ResponseEntity.ok(Api.map("ok", true, "user", DbSupport.publicUser(updated)));
    }

    @PostMapping("/resend-verification")
    public ResponseEntity<Map<String, Object>> resend(@Valid @RequestBody Requests.EmailBody body,
                                                      HttpServletRequest request,
                                                      HttpServletResponse response) {
        rateLimit.check("otp", request, response, 10, 10 * 60 * 1000L, "Too many attempts");
        String email = body.email.trim().toLowerCase(Locale.ROOT);
        Map<String, Object> user = users.getUserByIdentifier(email);
        if (user != null && !DbSupport.bool(user, "email_verified")) {
            if (!canIssueFreshCode(DbSupport.str(user, "id"), "verify")) {
                throw new ApiException(429, Api.map(
                        "error", "Too many attempts",
                        "detail", "Please wait 30 seconds before requesting another code",
                        "retryAfter", 30));
            }
            IssuedCode issued = issueEmailCode(user, "verify");
            audit.log(DbSupport.str(user, "id"), "verification_resent", Api.clientIp(request), "info");
            Map<String, Object> payload = Api.ok();
            if (!props.isProd()) {
                payload.put("devVerificationCode", issued.code());
                payload.put("devVerificationLink", issued.link());
            }
            return ResponseEntity.ok(payload);
        }
        return ResponseEntity.ok(Api.ok());
    }

    @PostMapping("/login")
    public ResponseEntity<Map<String, Object>> login(@Valid @RequestBody Requests.Login body,
                                                     HttpServletRequest request,
                                                     HttpServletResponse response) {
        rateLimit.check("login", request, response, 12, 15 * 60 * 1000L, "Too many attempts");
        String identifier = body.identifier.trim();
        String ip = Api.clientIp(request);
        Map<String, Object> user = users.getUserByIdentifier(identifier);

        Instant now = Instant.now();
        String lockedUntil = user == null ? null : DbSupport.str(user, "locked_until");
        Instant locked = lockedUntil == null ? null : DbSupport.parseInstant(lockedUntil);
        if (locked != null && locked.isAfter(now)) {
            long remainingMin = Math.max(1L, (Duration.between(now, locked).toSeconds() + 59) / 60);
            String msg = "Account locked, try again in " + remainingMin + (remainingMin == 1 ? " minute" : " minutes");
            audit.log(DbSupport.str(user, "id"), "login_blocked_locked", ip, "denied", identifier);
            throw new ApiException(423, Api.map(
                    "error", msg,
                    "code", "ACCOUNT_LOCKED",
                    "retryAfterMinutes", remainingMin));
        }

        boolean passwordOk = passwordEncoder.matches(body.password,
                user == null ? dummyHash : DbSupport.str(user, "password_hash"));
        if (user == null || !passwordOk) {
            if (user != null) {
                int priorAttempts = (locked != null) ? 0 : DbSupport.intVal(user, "failed_attempts");
                int attempts = priorAttempts + 1;
                if (attempts >= MAX_FAILED_ATTEMPTS) {
                    String lockIso = DbSupport.iso(now.plus(Duration.ofMinutes(LOCK_MINUTES)));
                    jdbc.update("UPDATE users SET failed_attempts = ?, locked_until = ?, updated_at = ? WHERE id = ?",
                            attempts, lockIso, DbSupport.nowIso(), DbSupport.str(user, "id"));
                    audit.log(DbSupport.str(user, "id"), "account_locked", ip, "denied", identifier);
                    throw new ApiException(423, Api.map(
                            "error", "Account locked, try again in " + LOCK_MINUTES + " minutes",
                            "code", "ACCOUNT_LOCKED",
                            "retryAfterMinutes", LOCK_MINUTES));
                }
                jdbc.update("UPDATE users SET failed_attempts = ?, locked_until = NULL, updated_at = ? WHERE id = ?",
                        attempts, DbSupport.nowIso(), DbSupport.str(user, "id"));
                audit.log(DbSupport.str(user, "id"), "login_failed", ip, "failure", identifier);
            } else {
                audit.log(null, "login_failed", ip, "failure", identifier);
            }
            throw new ApiException(401, "Invalid credentials");
        }

        String userId = DbSupport.str(user, "id");
        if (!DbSupport.bool(user, "email_verified")) {
            jdbc.update("UPDATE users SET failed_attempts = 0, locked_until = NULL, updated_at = ? WHERE id = ?",
                    DbSupport.nowIso(), userId);
            audit.log(userId, "login_unverified", ip, "denied");
            throw new ApiException(403, Api.map(
                    "error", "Email not verified",
                    "code", "EMAIL_NOT_VERIFIED",
                    "email", DbSupport.str(user, "email")));
        }
        if (DbSupport.bool(user, "restricted")) {
            audit.log(userId, "login_restricted", ip, "denied");
            throw new ApiException(403, "Account restricted. Contact support.");
        }

        jdbc.update("UPDATE users SET failed_attempts = 0, locked_until = NULL, status = ?, updated_at = ? WHERE id = ?",
                "online", DbSupport.nowIso(), userId);

        if (DbSupport.bool(user, "totp_enabled")) {
            String mfaToken = CookieService.randomToken(24);
            jdbc.update("INSERT INTO mfa_pending (id, user_id, token_hash, remember_me, expires_at) VALUES (?,?,?,?,?)",
                    DbSupport.uuid(), userId, cookies.hashToken(mfaToken),
                    body.rememberMe ? 1 : 0,
                    DbSupport.iso(Instant.now().plus(Duration.ofMinutes(5))));
            audit.log(userId, "login_password_ok_mfa_pending", ip, "info");
            return ResponseEntity.ok(Api.map("ok", true, "needsTotp", true, "mfaToken", mfaToken));
        }

        boolean mustChange = DbSupport.bool(user, "must_change_password");
        cookies.createSession(response, userId, ip, Api.userAgent(request), body.rememberMe && !mustChange);
        audit.log(userId, mustChange ? "login_password_change_required" : "login", ip, "success");
        return ResponseEntity.ok(Api.map(
                "ok", true,
                "mustChangePassword", mustChange,
                "user", DbSupport.publicUser(users.getUserById(userId))));
    }

    @PostMapping("/change-password")
    public ResponseEntity<Map<String, Object>> changePassword(@Valid @RequestBody Requests.ChangePassword body,
                                                              HttpServletRequest request,
                                                              HttpServletResponse response) {
        AuthUser me = AuthContext.requireAuth(request);
        rateLimit.check("otp", request, response, 10, 10 * 60 * 1000L, "Too many attempts");
        String ip = Api.clientIp(request);
        Map<String, Object> user = users.getUserById(me.id());
        if (user == null || !passwordEncoder.matches(body.currentPassword, DbSupport.str(user, "password_hash"))) {
            audit.log(me.id(), "password_change_failed", ip, "failure");
            throw new ApiException(401, "Invalid credentials");
        }
        if (body.currentPassword.equals(body.newPassword)) {
            throw new ApiException(400, "New password must be different from your current password");
        }
        jdbc.update("""
                UPDATE users
                SET password_hash = ?, must_change_password = 0, failed_attempts = 0, locked_until = NULL, updated_at = ?
                WHERE id = ?
                """, passwordEncoder.encode(body.newPassword), DbSupport.nowIso(), me.id());
        cookies.destroyUserSessions(me.id());
        cookies.createSession(response, me.id(), ip, Api.userAgent(request), false);
        audit.log(me.id(), "password_changed", ip, "success");
        return ResponseEntity.ok(Api.map("ok", true, "user", DbSupport.publicUser(users.getUserById(me.id()))));
    }

    @PostMapping("/2fa")
    public ResponseEntity<Map<String, Object>> twoFactor(@Valid @RequestBody Requests.TwoFactor body,
                                                         HttpServletRequest request,
                                                         HttpServletResponse response) {
        rateLimit.check("otp", request, response, 10, 10 * 60 * 1000L, "Too many attempts");
        String ip = Api.clientIp(request);
        Map<String, Object> pending = DbSupport.one(jdbc,
                "SELECT * FROM mfa_pending WHERE token_hash = ? AND expires_at > ?",
                cookies.hashToken(body.mfaToken), DbSupport.nowIso());
        if (pending == null) {
            throw new ApiException(401, "Invalid or expired challenge");
        }
        Map<String, Object> user = users.getUserById(DbSupport.str(pending, "user_id"));
        String secret = user == null ? null : DbSupport.str(user, "totp_secret");
        if (secret == null) {
            throw new ApiException(401, "Invalid or expired challenge");
        }
        String submittedCode = body.code.trim();
        boolean ok = submittedCode.matches("\\d{6}") && totp.verify(secret, submittedCode);
        if (!ok) {
            List<String> stored = new ArrayList<>(DbSupport.stringArray(DbSupport.str(user, "recovery_codes")));
            String candidateHash = totp.recoveryHash(submittedCode);
            int index = -1;
            for (int i = 0; i < stored.size(); i++) {
                if (DbSupport.safeEqual(stored.get(i), candidateHash)) {
                    index = i;
                    break;
                }
            }
            if (index >= 0) {
                stored.remove(index);
                jdbc.update("UPDATE users SET recovery_codes = ? WHERE id = ?",
                        DbSupport.toJson(stored), DbSupport.str(user, "id"));
                ok = true;
                audit.log(DbSupport.str(user, "id"), "recovery_code_used", ip, "success");
            }
        }
        if (!ok) {
            audit.log(DbSupport.str(user, "id"), "totp_failed", ip, "failure");
            throw new ApiException(401, "Invalid code");
        }
        boolean rememberMe = DbSupport.bool(pending, "remember_me");
        jdbc.update("DELETE FROM mfa_pending WHERE id = ?", DbSupport.str(pending, "id"));
        String userId = DbSupport.str(user, "id");
        boolean mustChange = DbSupport.bool(user, "must_change_password");
        cookies.createSession(response, userId, ip, Api.userAgent(request), rememberMe && !mustChange);
        audit.log(userId, "login_totp", ip, "success");
        return ResponseEntity.ok(Api.map(
                "ok", true,
                "mustChangePassword", mustChange,
                "user", DbSupport.publicUser(users.getUserById(userId))));
    }

    @PostMapping("/logout")
    public ResponseEntity<Map<String, Object>> logout(HttpServletRequest request, HttpServletResponse response) {
        AuthUser user = AuthContext.current(request);
        Object hash = request.getAttribute(AuthUser.SESSION_HASH_ATTR);
        if (hash instanceof String tokenHash) {
            jdbc.update("DELETE FROM auth_sessions WHERE token_hash = ?", tokenHash);
        }
        if (user != null) {
            jdbc.update("UPDATE users SET status = ?, updated_at = ? WHERE id = ?",
                    "offline", DbSupport.nowIso(), user.id());
            audit.log(user.id(), "logout", Api.clientIp(request), "info");
        }
        cookies.clearAuthCookies(response);
        return ResponseEntity.ok(Api.ok());
    }

    @GetMapping("/me")
    public ResponseEntity<Map<String, Object>> me(HttpServletRequest request) {
        AuthUser user = AuthContext.requireAuth(request);
        return ResponseEntity.ok(Api.map("user", DbSupport.publicUser(user.row())));
    }

    @PostMapping("/forgot-password")
    public ResponseEntity<Map<String, Object>> forgot(@Valid @RequestBody Requests.EmailBody body,
                                                      HttpServletRequest request,
                                                      HttpServletResponse response) {
        rateLimit.check("otp", request, response, 10, 10 * 60 * 1000L, "Too many attempts");
        Map<String, Object> user = users.getUserByIdentifier(body.email.trim().toLowerCase(Locale.ROOT));
        if (user != null) {
            IssuedCode issued = issueEmailCode(user, "reset");
            audit.log(DbSupport.str(user, "id"), "password_reset_requested", Api.clientIp(request), "info");
            Map<String, Object> payload = Api.ok();
            if (!props.isProd()) {
                payload.put("devResetCode", issued.code());
                payload.put("devResetLink", issued.link());
            }
            return ResponseEntity.ok(payload);
        }
        return ResponseEntity.ok(Api.ok());
    }

    @PostMapping("/reset-password")
    public ResponseEntity<Map<String, Object>> reset(@Valid @RequestBody Requests.ResetPassword body,
                                                     HttpServletRequest request,
                                                     HttpServletResponse response) {
        rateLimit.check("otp", request, response, 10, 10 * 60 * 1000L, "Too many attempts");
        Map<String, Object> user = users.getUserByIdentifier(body.email.trim().toLowerCase(Locale.ROOT));
        if (user == null) {
            throw new ApiException(400, "Invalid code");
        }
        Check check = checkEmailCode(user, "reset", body.code.trim());
        if (!check.ok()) {
            throw new ApiException(400, check.error());
        }
        String userId = DbSupport.str(user, "id");
        jdbc.update("""
                UPDATE users
                SET password_hash = ?, email_verified = 1, must_change_password = 0,
                    failed_attempts = 0, locked_until = NULL, updated_at = ?
                WHERE id = ?
                """, passwordEncoder.encode(body.password), DbSupport.nowIso(), userId);
        cookies.destroyUserSessions(userId);
        audit.log(userId, "password_reset", Api.clientIp(request), "success");
        return ResponseEntity.ok(Api.ok());
    }

    @PostMapping("/2fa/setup")
    public ResponseEntity<Map<String, Object>> setup2fa(HttpServletRequest request) {
        AuthUser me = AuthContext.requireAuth(request);
        if (DbSupport.bool(me.row(), "totp_enabled")) {
            throw new ApiException(409, "Two-factor authentication is already enabled. Disable it first to reconfigure.");
        }
        String secret = totp.generateSecret();
        jdbc.update("UPDATE users SET totp_secret = ?, totp_enabled = 0, updated_at = ? WHERE id = ?",
                secret, DbSupport.nowIso(), me.id());
        String uri = totp.otpauthUri(secret, DbSupport.str(me.row(), "email"));
        String qr = totp.qrDataUrl(uri);
        audit.log(me.id(), "totp_setup_started", Api.clientIp(request), "info");
        return ResponseEntity.ok(Api.map("secret", secret, "qrDataUrl", qr));
    }

    @PostMapping("/2fa/enable")
    public ResponseEntity<Map<String, Object>> enable2fa(@Valid @RequestBody Requests.TwoFactorEnable body,
                                                         HttpServletRequest request,
                                                         HttpServletResponse response) {
        AuthUser me = AuthContext.requireAuth(request);
        rateLimit.check("otp", request, response, 10, 10 * 60 * 1000L, "Too many attempts");
        Map<String, Object> user = users.getUserById(me.id());
        String secret = DbSupport.str(user, "totp_secret");
        if (secret == null || !totp.verify(secret, body.code.trim())) {
            audit.log(me.id(), "totp_enable_failed", Api.clientIp(request), "failure");
            throw new ApiException(400, "Invalid code");
        }
        List<String> recoveryCodes = new ArrayList<>();
        List<String> hashed = new ArrayList<>();
        for (int i = 0; i < 8; i++) {
            String code = randomRecoveryCode();
            recoveryCodes.add(code);
            hashed.add(totp.recoveryHash(code));
        }
        jdbc.update("UPDATE users SET totp_enabled = 1, recovery_codes = ?, updated_at = ? WHERE id = ?",
                DbSupport.toJson(hashed), DbSupport.nowIso(), me.id());
        // Rotate sessions on 2FA activation
        cookies.destroyUserSessions(me.id());
        cookies.createSession(response, me.id(), Api.clientIp(request), Api.userAgent(request), false);
        audit.log(me.id(), "totp_enabled", Api.clientIp(request), "success");
        return ResponseEntity.ok(Api.map("ok", true, "recoveryCodes", recoveryCodes));
    }

    @PostMapping("/2fa/disable")
    public ResponseEntity<Map<String, Object>> disable2fa(@Valid @RequestBody Requests.PasswordBody body,
                                                          HttpServletRequest request) {
        AuthUser me = AuthContext.requireAuth(request);
        Map<String, Object> user = users.getUserById(me.id());
        if (!passwordEncoder.matches(body.password, DbSupport.str(user, "password_hash"))) {
            audit.log(me.id(), "totp_disable_failed", Api.clientIp(request), "failure");
            throw new ApiException(401, "Invalid credentials");
        }
        jdbc.update("UPDATE users SET totp_enabled = 0, totp_secret = NULL, recovery_codes = ?, updated_at = ? WHERE id = ?",
                "[]", DbSupport.nowIso(), me.id());
        audit.log(me.id(), "totp_disabled", Api.clientIp(request), "success");
        return ResponseEntity.ok(Api.ok());
    }

    @PostMapping("/reauth")
    public ResponseEntity<Map<String, Object>> reauth(@Valid @RequestBody Requests.PasswordBody body,
                                                      HttpServletRequest request,
                                                      HttpServletResponse response) {
        AuthUser me = AuthContext.requireAuth(request);
        rateLimit.check("otp", request, response, 10, 10 * 60 * 1000L, "Too many attempts");
        Map<String, Object> user = users.getUserById(me.id());
        if (!passwordEncoder.matches(body.password, DbSupport.str(user, "password_hash"))) {
            audit.log(me.id(), "reauth_failed", Api.clientIp(request), "failure");
            throw new ApiException(401, "Invalid credentials");
        }
        cookies.rotateSession(response, me.sessionTokenHash(), me.id(),
                Api.clientIp(request), Api.userAgent(request), false);
        audit.log(me.id(), "reauth", Api.clientIp(request), "success");
        return ResponseEntity.ok(Api.ok());
    }

    @DeleteMapping("/account")
    public ResponseEntity<Map<String, Object>> deleteAccount(@Valid @RequestBody Requests.AccountDelete body,
                                                             HttpServletRequest request,
                                                             HttpServletResponse response) {
        AuthUser me = AuthContext.requireAuth(request);
        Map<String, Object> user = users.getUserById(me.id());
        if (!passwordEncoder.matches(body.password, DbSupport.str(user, "password_hash"))) {
            audit.log(me.id(), "account_delete_failed", Api.clientIp(request), "failure");
            throw new ApiException(401, "Invalid credentials");
        }
        tx.executeWithoutResult(status -> wipeUser(me.id()));
        audit.log(null, "account_deleted", Api.clientIp(request), "success", "user:" + me.id());
        cookies.clearAuthCookies(response);
        return ResponseEntity.ok(Api.ok());
    }

    private boolean canIssueFreshCode(String userId, String purpose) {
        Map<String, Object> recent = DbSupport.one(jdbc, """
                SELECT created_at FROM email_codes
                WHERE user_id = ? AND purpose = ? ORDER BY created_at DESC LIMIT 1
                """, userId, purpose);
        if (recent == null) {
            return true;
        }
        Instant created = DbSupport.parseInstant(DbSupport.str(recent, "created_at"));
        return created == null || System.currentTimeMillis() - created.toEpochMilli() >= 30_000L;
    }

    private IssuedCode issueEmailCode(Map<String, Object> user, String purpose) {
        String userId = DbSupport.str(user, "id");
        String email = DbSupport.str(user, "email");
        jdbc.update("DELETE FROM email_codes WHERE user_id = ? AND purpose = ?", userId, purpose);
        String code = String.valueOf(100000 + RANDOM.nextInt(900000));
        String expires = DbSupport.iso(Instant.now().plus(Duration.ofMinutes(10)));
        jdbc.update("INSERT INTO email_codes (id, user_id, purpose, code_hash, expires_at) VALUES (?,?,?,?,?)",
                DbSupport.uuid(), userId, purpose, totp.codeHash(purpose, code), expires);

        String paramName = "verify".equals(purpose) ? "verifyEmail" : "resetEmail";
        String link = props.getFrontendUrl() + "/#/login?" + paramName + "=" + urlEncode(email) + "&code=" + urlEncode(code);

        if (props.getSmtpUrl() == null || props.getSmtpUrl().isBlank()) {
            String label = "verify".equals(purpose) ? "Email Verification" : "Password Reset";
            System.out.printf("""
                    ============================================================
                    [DEV MODE - EMAIL SENDING NOT CONFIGURED (SMTP_URL unset)]
                    Recipient : %s
                    Purpose   : %s
                    Code      : %s (valid for 10 minutes)
                    Link      : %s
                    ============================================================%n""",
                    email, label, code, link);
        } else {
            System.out.printf("[email:%s] queued for %s%n", purpose, email);
        }
        return new IssuedCode(code, link);
    }

    private Check checkEmailCode(Map<String, Object> user, String purpose, String code) {
        Map<String, Object> row = DbSupport.one(jdbc, """
                SELECT * FROM email_codes
                WHERE user_id = ? AND purpose = ? ORDER BY created_at DESC LIMIT 1
                """, DbSupport.str(user, "id"), purpose);
        if (row == null) {
            return Check.failure("No active code. Request a new one.");
        }
        Instant expires = DbSupport.parseInstant(DbSupport.str(row, "expires_at"));
        if (expires == null || expires.isBefore(Instant.now())) {
            jdbc.update("DELETE FROM email_codes WHERE id = ?", DbSupport.str(row, "id"));
            return Check.failure("Code expired. Request a new one.");
        }
        if (DbSupport.intVal(row, "attempts") >= 5) {
            return Check.failure("Too many attempts. Request a new code.");
        }
        if (!DbSupport.safeEqual(DbSupport.str(row, "code_hash"), totp.codeHash(purpose, code))) {
            jdbc.update("UPDATE email_codes SET attempts = attempts + 1 WHERE id = ?",
                    DbSupport.str(row, "id"));
            return Check.failure("Invalid code");
        }
        jdbc.update("DELETE FROM email_codes WHERE id = ?", DbSupport.str(row, "id"));
        return Check.success();
    }

    private String usernameFrom(String email, int maxPrefix, int suffixLength) {
        String local = email.split("@")[0].toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9._-]", "");
        if (local.isBlank()) {
            local = "student";
        }
        if (local.length() > maxPrefix) {
            local = local.substring(0, maxPrefix);
        }
        return local + "-" + randomSuffix(suffixLength);
    }

    private static String randomSuffix(int length) {
        StringBuilder out = new StringBuilder();
        for (int i = 0; i < length; i++) {
            out.append(BASE36.charAt(RANDOM.nextInt(BASE36.length())));
        }
        return out.toString();
    }

    private static String randomRecoveryCode() {
        byte[] first = new byte[2];
        byte[] second = new byte[2];
        byte[] third = new byte[2];
        RANDOM.nextBytes(first);
        RANDOM.nextBytes(second);
        RANDOM.nextBytes(third);
        HexFormat hex = HexFormat.of();
        return hex.formatHex(first) + "-" + hex.formatHex(second) + "-" + hex.formatHex(third);
    }

    private static ResponseEntity<Void> redirectTo(String location) {
        return ResponseEntity.status(302).header(HttpHeaders.LOCATION, location).build();
    }

    private static String urlEncode(String value) {
        return URLEncoder.encode(value == null ? "" : value, StandardCharsets.UTF_8);
    }

    private void wipeUser(String id) {
        jdbc.update("DELETE FROM oauth_accounts WHERE user_id = ?", id);
        jdbc.update("DELETE FROM auth_sessions WHERE user_id = ?", id);
        jdbc.update("DELETE FROM mfa_pending WHERE user_id = ?", id);
        jdbc.update("DELETE FROM email_codes WHERE user_id = ?", id);
        jdbc.update("DELETE FROM notifications WHERE user_id = ?", id);
        jdbc.update("DELETE FROM connection_requests WHERE from_id = ? OR to_id = ?", id, id);
        jdbc.update("DELETE FROM reviews WHERE reviewer_id = ? OR reviewee_id = ?", id, id);
        jdbc.update("DELETE FROM sessions WHERE requester_id = ? OR recipient_id = ?", id, id);
        jdbc.update("DELETE FROM users WHERE id = ?", id);
    }

    private record IssuedCode(String code, String link) {}

    private record Check(boolean ok, String error) {
        static Check success() {
            return new Check(true, null);
        }
        static Check failure(String error) {
            return new Check(false, error);
        }
    }
}
