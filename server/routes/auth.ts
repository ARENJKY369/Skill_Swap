import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import QRCode from 'qrcode';
import { generateSecret, verifySync, generateURI } from 'otplib';
import rateLimit from 'express-rate-limit';
import { db, nowIso, uuid, publicUser, getUserById, getUserByIdentifier, sha256, type UserRow } from '../db';
import { logAudit } from '../services/audit';
import { validateBody } from '../middleware/validate';
import {
  SESSION_COOKIE, CSRF_COOKIE, attachUser, requireAuth, clientIp,
  issueCsrfCookie, createSession, destroyUserSessions, hashToken, safeEqual,
} from '../middleware/auth';

export const authRouter = Router();

const isProd = () => process.env.NODE_ENV === 'production';
let ephemeralSecret: string | null = null;
const appSecret = () => {
  if (process.env.APP_SECRET) return process.env.APP_SECRET;
  if (isProd()) {
    if (!ephemeralSecret) {
      ephemeralSecret = randomBytes(32).toString('hex');
      console.warn('[security] APP_SECRET is not set — using an ephemeral secret. One-time codes will not survive restarts. Set APP_SECRET in .env.');
    }
    return ephemeralSecret;
  }
  return 'dev-only-insecure-secret';
};
const codeHash = (purpose: string, code: string) => sha256(`${appSecret()}:${purpose}:${code}`);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 12, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many attempts. Try again later.' },
});
const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many attempts. Try again later.' },
});
const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many signups from this address. Try again later.' },
});
const inviteLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many invites. Try again later.' },
});
export { inviteLimiter };

const passwordSchema = z.string().min(10, 'At least 10 characters').max(128)
  .regex(/[a-z]/, 'Needs a lowercase letter')
  .regex(/[A-Z]/, 'Needs an uppercase letter')
  .regex(/[0-9]/, 'Needs a digit');

const signupSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email().max(160),
  password: passwordSchema,
  major: z.string().trim().max(80).default(''),
}).strict();

const loginSchema = z.object({
  identifier: z.string().trim().min(3).max(160),
  password: z.string().min(1).max(128),
  rememberMe: z.boolean().default(false),
}).strict();

function issueEmailCode(user: UserRow, purpose: 'verify' | 'reset'): string {
  db.prepare('DELETE FROM email_codes WHERE user_id = ? AND purpose = ?').run(user.id, purpose);
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO email_codes (id, user_id, purpose, code_hash, expires_at) VALUES (?,?,?,?,?)')
    .run(uuid(), user.id, purpose, codeHash(purpose, code), expires);
  // No SMTP configured by default: deliver via server console (dev) or SMTP hook.
  console.log(`[email:${purpose}] to=${user.email} code=${code}`);
  return code;
}

function checkEmailCode(user: UserRow, purpose: 'verify' | 'reset', code: string): { ok: boolean; error?: string } {
  const row = db.prepare(
    'SELECT * FROM email_codes WHERE user_id = ? AND purpose = ? ORDER BY created_at DESC LIMIT 1',
  ).get(user.id, purpose) as { id: string; code_hash: string; attempts: number; expires_at: string } | undefined;
  if (!row) return { ok: false, error: 'No active code. Request a new one.' };
  if (new Date(row.expires_at).getTime() < Date.now()) {
    db.prepare('DELETE FROM email_codes WHERE id = ?').run(row.id);
    return { ok: false, error: 'Code expired. Request a new one.' };
  }
  if (row.attempts >= 5) return { ok: false, error: 'Too many attempts. Request a new code.' };
  const matches = safeEqual(row.code_hash, codeHash(purpose, code));
  if (!matches) {
    db.prepare('UPDATE email_codes SET attempts = attempts + 1 WHERE id = ?').run(row.id);
    return { ok: false, error: 'Invalid code' };
  }
  db.prepare('DELETE FROM email_codes WHERE id = ?').run(row.id);
  return { ok: true };
}

// Pre-computed hash so unknown identifiers get the same bcrypt timing treatment.
const DUMMY_HASH = bcrypt.hashSync('timing-equalization-dummy', 10);

const publicAuthUser = (u: UserRow) => publicUser(u);

authRouter.get('/csrf', (_req, res) => {
  res.json({ csrfToken: issueCsrfCookie(res) });
});

authRouter.post('/signup', signupLimiter, validateBody(signupSchema), (req, res) => {
  const { name, email, password, major } = req.body as z.infer<typeof signupSchema>;
  const existing = getUserByIdentifier(email);
  if (existing) {
    // Do not reveal whether the account exists.
    res.json({ ok: true, needsVerification: true, email });
    return;
  }
  const username = email.split('@')[0].toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 30) + '-' + Math.random().toString(36).slice(2, 6);
  const id = uuid();
  const hash = bcrypt.hashSync(password, 10);
  db.prepare(`INSERT INTO users (id, name, email, username, password_hash, role, major, email_verified, status, demo)
              VALUES (?,?,?,?,?, 'student', ?, 0, 'offline', 0)`)
    .run(id, name, email, username, hash, major);
  const user = getUserById(id)!;
  const code = issueEmailCode(user, 'verify');
  logAudit(id, 'signup', clientIp(req), 'success', email);
  res.status(201).json({
    ok: true, needsVerification: true, email,
    ...(isProd() ? {} : { devVerificationCode: code }),
  });
});

const verifySchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code'),
}).strict();

authRouter.post('/verify-email', otpLimiter, validateBody(verifySchema), (req, res) => {
  const { email, code } = req.body as z.infer<typeof verifySchema>;
  const user = getUserByIdentifier(email);
  if (!user) { res.status(400).json({ error: 'Invalid code' }); return; }
  const check = checkEmailCode(user, 'verify', code);
  if (!check.ok) { res.status(400).json({ error: check.error }); return; }
  db.prepare('UPDATE users SET email_verified = 1, updated_at = ? WHERE id = ?').run(nowIso(), user.id);
  logAudit(user.id, 'email_verified', clientIp(req), 'success');
  const updated = getUserById(user.id)!;
  createSession(res, user.id, clientIp(req), String(req.headers['user-agent'] ?? ''), false);
  res.json({ ok: true, user: publicAuthUser(updated) });
});

authRouter.post('/resend-verification', otpLimiter, validateBody(z.object({ email: z.string().trim().toLowerCase().email() }).strict()), (req, res) => {
  const { email } = req.body as { email: string };
  const user = getUserByIdentifier(email);
  if (user && user.email_verified === 0) {
    const recent = db.prepare(
      `SELECT created_at FROM email_codes WHERE user_id = ? AND purpose = 'verify' ORDER BY created_at DESC LIMIT 1`,
    ).get(user.id) as { created_at: string } | undefined;
    if (recent && Date.now() - new Date(recent.created_at).getTime() < 30_000) {
      res.status(429).json({ error: 'Please wait before requesting another code', retryAfter: 30 });
      return;
    }
    const code = issueEmailCode(user, 'verify');
    logAudit(user.id, 'verification_resent', clientIp(req), 'info');
    res.json({ ok: true, ...(isProd() ? {} : { devVerificationCode: code }) });
    return;
  }
  res.json({ ok: true }); // do not reveal account existence
});

const LOCK_MINUTES = 15;
const MAX_FAILED = 5;

authRouter.post('/login', loginLimiter, validateBody(loginSchema), (req, res) => {
  const { identifier, password, rememberMe } = req.body as z.infer<typeof loginSchema>;
  const ip = clientIp(req);
  const user = getUserByIdentifier(identifier);

  const fail = (status: number, message: string, extra?: Record<string, unknown>) => {
    res.status(status).json({ error: message, ...extra });
  };

  if (user?.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
    logAudit(user.id, 'login_blocked_locked', ip, 'denied', identifier);
    fail(429, 'Too many attempts. Try again in 15 minutes.');
    return;
  }

  const passwordOk = user ? bcrypt.compareSync(password, user.password_hash) : bcrypt.compareSync(password, DUMMY_HASH);
  if (!user || !passwordOk) {
    if (user) {
      const attempts = user.failed_attempts + 1;
      const lock = attempts >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000).toISOString() : null;
      db.prepare('UPDATE users SET failed_attempts = ?, locked_until = COALESCE(?, locked_until) WHERE id = ?')
        .run(attempts, lock, user.id);
      logAudit(user.id, 'login_failed', ip, 'failure', identifier);
    } else {
      logAudit(null, 'login_failed', ip, 'failure', identifier);
    }
    fail(401, 'Invalid credentials');
    return;
  }

  db.prepare('UPDATE users SET failed_attempts = 0, locked_until = NULL, status = ?, updated_at = ? WHERE id = ?')
    .run('online', nowIso(), user.id);

  if (user.email_verified === 0) {
    logAudit(user.id, 'login_unverified', ip, 'denied');
    fail(403, 'Email not verified', { code: 'EMAIL_NOT_VERIFIED', email: user.email });
    return;
  }
  if (user.restricted === 1) {
    logAudit(user.id, 'login_restricted', ip, 'denied');
    fail(403, 'Account restricted. Contact support.');
    return;
  }

  if (user.totp_enabled === 1) {
    const mfaToken = randomBytes(24).toString('base64url');
    const expires = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    db.prepare('INSERT INTO mfa_pending (id, user_id, token_hash, expires_at) VALUES (?,?,?,?)')
      .run(uuid(), user.id, hashToken(mfaToken), expires);
    logAudit(user.id, 'login_password_ok_mfa_pending', ip, 'info');
    res.json({ ok: true, needsTotp: true, mfaToken });
    return;
  }

  createSession(res, user.id, ip, String(req.headers['user-agent'] ?? ''), rememberMe);
  logAudit(user.id, 'login', ip, 'success');
  res.json({ ok: true, user: publicAuthUser(getUserById(user.id)!) });
});

const totpSchema = z.object({
  mfaToken: z.string().min(10).max(200),
  code: z.string().trim().min(6).max(24),
}).strict();

authRouter.post('/2fa', otpLimiter, validateBody(totpSchema), (req, res) => {
  const { mfaToken, code } = req.body as z.infer<typeof totpSchema>;
  const ip = clientIp(req);
  const pending = db.prepare('SELECT * FROM mfa_pending WHERE token_hash = ? AND expires_at > ?')
    .get(hashToken(mfaToken), nowIso()) as { id: string; user_id: string } | undefined;
  if (!pending) { res.status(401).json({ error: 'Invalid or expired challenge' }); return; }
  const user = getUserById(pending.user_id);
  if (!user?.totp_secret) { res.status(401).json({ error: 'Invalid or expired challenge' }); return; }

  const isTotp = /^\d{6}$/.test(code);
  let ok = isTotp && verifySync({ token: code, secret: user.totp_secret }).valid;

  // Recovery-code fallback (hashed comparison), single use.
  if (!ok) {
    const stored = JSON.parse(user.recovery_codes || '[]') as string[];
    const idx = stored.findIndex((h) => safeEqual(h, sha256(`${appSecret()}:recovery:${code}`)));
    if (idx >= 0) {
      stored.splice(idx, 1);
      db.prepare('UPDATE users SET recovery_codes = ? WHERE id = ?').run(JSON.stringify(stored), user.id);
      ok = true;
      logAudit(user.id, 'recovery_code_used', ip, 'success');
    }
  }

  if (!ok) {
    logAudit(user.id, 'totp_failed', ip, 'failure');
    res.status(401).json({ error: 'Invalid code' });
    return;
  }
  db.prepare('DELETE FROM mfa_pending WHERE id = ?').run(pending.id);
  createSession(res, user.id, ip, String(req.headers['user-agent'] ?? ''), false);
  logAudit(user.id, 'login_totp', ip, 'success');
  res.json({ ok: true, user: publicAuthUser(getUserById(user.id)!) });
});

authRouter.post('/logout', attachUser, (req, res) => {
  if (req.sessionTokenHash) {
    db.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').run(req.sessionTokenHash);
  }
  if (req.user) {
    db.prepare('UPDATE users SET status = ?, updated_at = ? WHERE id = ?').run('offline', nowIso(), req.user.id);
    logAudit(req.user.id, 'logout', clientIp(req), 'info');
  }
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.clearCookie(CSRF_COOKIE, { path: '/' });
  res.json({ ok: true });
});

authRouter.get('/me', attachUser, (req, res) => {
  if (!req.user) { res.status(401).json({ error: 'Authentication required' }); return; }
  res.json({ user: publicAuthUser(req.user) });
});

authRouter.post('/forgot-password', otpLimiter, validateBody(z.object({ email: z.string().trim().toLowerCase().email() }).strict()), (req, res) => {
  const { email } = req.body as { email: string };
  const user = getUserByIdentifier(email);
  if (user) {
    const code = issueEmailCode(user, 'reset');
    logAudit(user.id, 'password_reset_requested', clientIp(req), 'info');
    res.json({ ok: true, ...(isProd() ? {} : { devResetCode: code }) });
    return;
  }
  res.json({ ok: true }); // no enumeration
});

const resetSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  code: z.string().trim().regex(/^\d{6}$/),
  password: passwordSchema,
}).strict();

authRouter.post('/reset-password', otpLimiter, validateBody(resetSchema), (req, res) => {
  const { email, code, password } = req.body as z.infer<typeof resetSchema>;
  const user = getUserByIdentifier(email);
  if (!user) { res.status(400).json({ error: 'Invalid code' }); return; }
  const check = checkEmailCode(user, 'reset', code);
  if (!check.ok) { res.status(400).json({ error: check.error }); return; }
  db.prepare('UPDATE users SET password_hash = ?, failed_attempts = 0, locked_until = NULL, updated_at = ? WHERE id = ?')
    .run(bcrypt.hashSync(password, 10), nowIso(), user.id);
  destroyUserSessions(user.id); // rotate sessions on credential change
  logAudit(user.id, 'password_reset', clientIp(req), 'success');
  res.json({ ok: true });
});

/* ------- 2FA setup / lifecycle ------- */

authRouter.post('/2fa/setup', attachUser, requireAuth, async (req, res) => {
  const secret = generateSecret();
  db.prepare('UPDATE users SET totp_secret = ?, totp_enabled = 0, updated_at = ? WHERE id = ?')
    .run(secret, nowIso(), req.user!.id);
  const uri = generateURI({ issuer: 'SkillSwap', label: req.user!.email, secret });
  const qrDataUrl = await QRCode.toDataURL(uri, { margin: 1, width: 200, color: { dark: '#F8FAFC', light: '#1E293B' } });
  logAudit(req.user!.id, 'totp_setup_started', clientIp(req), 'info');
  res.json({ secret, qrDataUrl });
});

authRouter.post('/2fa/enable', attachUser, requireAuth, otpLimiter, validateBody(z.object({ code: z.string().trim().regex(/^\d{6}$/) }).strict()), (req, res) => {
  const { code } = req.body as { code: string };
  const user = getUserById(req.user!.id)!;
  if (!user.totp_secret) { res.status(400).json({ error: 'Run setup first' }); return; }
  if (!verifySync({ token: code, secret: user.totp_secret }).valid) {
    logAudit(user.id, 'totp_enable_failed', clientIp(req), 'failure');
    res.status(400).json({ error: 'Invalid code' });
    return;
  }
  const recoveryCodes = Array.from({ length: 8 }, () =>
    `${randomBytes(2).toString('hex')}-${randomBytes(2).toString('hex')}-${randomBytes(2).toString('hex')}`,
  );
  const hashed = recoveryCodes.map((c) => sha256(`${appSecret()}:recovery:${c}`));
  db.prepare('UPDATE users SET totp_enabled = 1, recovery_codes = ?, updated_at = ? WHERE id = ?')
    .run(JSON.stringify(hashed), nowIso(), user.id);
  logAudit(user.id, 'totp_enabled', clientIp(req), 'success');
  res.json({ ok: true, recoveryCodes });
});

authRouter.post('/2fa/disable', attachUser, requireAuth, validateBody(z.object({ password: z.string().min(1).max(128) }).strict()), (req, res) => {
  const { password } = req.body as { password: string };
  const user = getUserById(req.user!.id)!;
  if (!bcrypt.compareSync(password, user.password_hash)) {
    logAudit(user.id, 'totp_disable_failed', clientIp(req), 'failure');
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }
  db.prepare('UPDATE users SET totp_enabled = 0, totp_secret = NULL, recovery_codes = ?, updated_at = ? WHERE id = ?')
    .run('[]', nowIso(), user.id);
  logAudit(user.id, 'totp_disabled', clientIp(req), 'success');
  res.json({ ok: true });
});

/** Re-authenticate after inactivity timeout. Rotates the session on success. */
authRouter.post('/reauth', attachUser, requireAuth, otpLimiter, validateBody(z.object({ password: z.string().min(1).max(128) }).strict()), (req, res) => {
  const { password } = req.body as { password: string };
  const user = getUserById(req.user!.id)!;
  if (!bcrypt.compareSync(password, user.password_hash)) {
    logAudit(user.id, 'reauth_failed', clientIp(req), 'failure');
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }
  createSession(res, user.id, clientIp(req), String(req.headers['user-agent'] ?? ''), false); // rotates token
  logAudit(user.id, 'reauth', clientIp(req), 'success');
  res.json({ ok: true });
});

/** Permanent account deletion: re-auth + typed confirmation, purges all user data. */
authRouter.delete('/account', attachUser, requireAuth, validateBody(z.object({
  password: z.string().min(1).max(128),
  confirmText: z.literal('DELETE'),
}).strict()), (req, res) => {
  const { password } = req.body as { password: string; confirmText: 'DELETE' };
  const user = getUserById(req.user!.id)!;
  if (!bcrypt.compareSync(password, user.password_hash)) {
    logAudit(user.id, 'account_delete_failed', clientIp(req), 'failure');
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }
  const id = user.id;
  const wipe = db.transaction(() => {
    db.prepare('DELETE FROM auth_sessions WHERE user_id = ?').run(id);
    db.prepare('DELETE FROM mfa_pending WHERE user_id = ?').run(id);
    db.prepare('DELETE FROM email_codes WHERE user_id = ?').run(id);
    db.prepare('DELETE FROM notifications WHERE user_id = ?').run(id);
    db.prepare('DELETE FROM connection_requests WHERE from_id = ? OR to_id = ?').run(id, id);
    db.prepare('DELETE FROM reviews WHERE reviewer_id = ? OR reviewee_id = ?').run(id, id);
    db.prepare('DELETE FROM sessions WHERE requester_id = ? OR recipient_id = ?').run(id, id);
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
  });
  wipe();
  logAudit(null, 'account_deleted', clientIp(req), 'success', `user:${id}`);
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.clearCookie(CSRF_COOKIE, { path: '/' });
  res.json({ ok: true });
});

/* ------- OAuth (env-configured; honest fallback when unconfigured) ------- */

const OAUTH_PROVIDERS: Record<string, {
  authUrl: string; tokenUrl: string; userInfoUrl: string;
  clientId?: string; clientSecret?: string; scope: string;
  mapUser: (p: Record<string, unknown>) => { email: string; name: string } | null;
}> = {
  google: {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userInfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    scope: 'openid email profile',
    mapUser: (p) => (p.email ? { email: String(p.email).toLowerCase(), name: String(p.name ?? 'Google User') } : null),
  },
  facebook: {
    authUrl: 'https://www.facebook.com/v19.0/dialog/oauth',
    tokenUrl: 'https://graph.facebook.com/v19.0/oauth/access_token',
    userInfoUrl: 'https://graph.facebook.com/v19.0/me?fields=id,name,email',
    clientId: process.env.FACEBOOK_CLIENT_ID,
    clientSecret: process.env.FACEBOOK_CLIENT_SECRET,
    scope: 'email public_profile',
    mapUser: (p) => (p.email ? { email: String(p.email).toLowerCase(), name: String(p.name ?? 'Facebook User') } : null),
  },
  x: {
    authUrl: 'https://twitter.com/i/oauth2/authorize',
    tokenUrl: 'https://api.x.com/2/oauth2/token',
    userInfoUrl: 'https://api.x.com/2/users/me?user.fields=name,username',
    clientId: process.env.X_CLIENT_ID,
    clientSecret: process.env.X_CLIENT_SECRET,
    scope: 'tweet.read users.read offline.access',
    mapUser: (p) => {
      const data = (p.data ?? p) as Record<string, unknown>;
      return data.username ? { email: `${data.username}@x.oauth.local`, name: String(data.name ?? data.username) } : null;
    },
  },
  linkedin: {
    authUrl: 'https://www.linkedin.com/oauth/v2/authorization',
    tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
    userInfoUrl: 'https://api.linkedin.com/v2/userinfo',
    clientId: process.env.LINKEDIN_CLIENT_ID,
    clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
    scope: 'openid profile email',
    mapUser: (p) => (p.email ? { email: String(p.email).toLowerCase(), name: String(p.name ?? 'LinkedIn User') } : null),
  },
};

authRouter.get('/oauth/:provider', (req, res) => {
  const { provider } = req.params;
  const cfg = OAUTH_PROVIDERS[provider];
  if (!cfg) { res.status(404).json({ error: 'Unknown provider' }); return; }
  if (!cfg.clientId) {
    res.status(501).json({
      error: `OAuth provider "${provider}" is not configured. Set ${provider.toUpperCase()}_CLIENT_ID and ${provider.toUpperCase()}_CLIENT_SECRET in .env.`,
      code: 'OAUTH_NOT_CONFIGURED',
    });
    return;
  }
  const state = randomBytes(16).toString('base64url');
  res.cookie('ss_oauth_state', state, { httpOnly: true, sameSite: 'lax', secure: isProd(), path: '/', maxAge: 10 * 60 * 1000 });
  const redirectUri = `${process.env.PUBLIC_BASE_URL ?? 'http://localhost:8787'}/api/auth/oauth/${provider}/callback`;
  const url = `${cfg.authUrl}?client_id=${encodeURIComponent(cfg.clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(cfg.scope)}&state=${state}`;
  res.json({ url });
});

authRouter.get('/oauth/:provider/callback', async (req, res) => {
  const { provider } = req.params;
  const cfg = OAUTH_PROVIDERS[provider];
  const { code, state } = req.query as { code?: string; state?: string };
  const stateCookie = req.cookies?.ss_oauth_state as string | undefined;
  if (!cfg?.clientId || !cfg.clientSecret) { res.status(501).json({ error: 'OAuth provider not configured' }); return; }
  if (!code || !state || !stateCookie || state !== stateCookie) { res.status(400).json({ error: 'Invalid OAuth state' }); return; }
  try {
    const redirectUri = `${process.env.PUBLIC_BASE_URL ?? 'http://localhost:8787'}/api/auth/oauth/${provider}/callback`;
    const tokenRes = await fetch(cfg.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({
        code, client_id: cfg.clientId, client_secret: cfg.clientSecret,
        redirect_uri: redirectUri, grant_type: 'authorization_code',
      }),
    });
    if (!tokenRes.ok) throw new Error(`token exchange failed: ${tokenRes.status}`);
    const tokenJson = (await tokenRes.json()) as { access_token?: string };
    const infoRes = await fetch(cfg.userInfoUrl, { headers: { Authorization: `Bearer ${tokenJson.access_token}`, Accept: 'application/json' } });
    if (!infoRes.ok) throw new Error(`userinfo failed: ${infoRes.status}`);
    const profile = cfg.mapUser((await infoRes.json()) as Record<string, unknown>);
    if (!profile?.email) throw new Error('provider returned no email');

    let user = getUserByIdentifier(profile.email);
    if (!user) {
      const id = uuid();
      const username = `${profile.email.split('@')[0].toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 24)}-${Math.random().toString(36).slice(2, 6)}`;
      db.prepare(`INSERT INTO users (id, name, email, username, password_hash, role, email_verified, status, demo)
                  VALUES (?,?,?,?,?, 'student', 1, 'online', 0)`)
        .run(id, profile.name, profile.email, username, bcrypt.hashSync(randomBytes(24).toString('hex'), 10));
      user = getUserById(id)!;
      logAudit(id, 'oauth_signup', clientIp(req), 'success', provider);
    } else {
      db.prepare('UPDATE users SET failed_attempts = 0, locked_until = NULL, status = ?, updated_at = ? WHERE id = ?')
        .run('online', nowIso(), user.id);
      logAudit(user.id, 'oauth_login', clientIp(req), 'success', provider);
    }
    createSession(res, user.id, clientIp(req), String(req.headers['user-agent'] ?? ''), true);
    res.redirect('/app');
  } catch (err) {
    console.error('[oauth]', provider, err);
    res.redirect('/login?error=oauth');
  }
});
