import type { Request, Response, NextFunction } from 'express';
import { createHash, timingSafeEqual, randomBytes, randomUUID } from 'node:crypto';
import { db, sha256, getUserById, type UserRow } from '../db';
import { logAudit } from '../services/audit';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: UserRow;
      sessionTokenHash?: string;
    }
  }
}

export const SESSION_COOKIE = 'ss_session';
export const CSRF_COOKIE = 'ss_csrf';
export const CSRF_HEADER = 'x-csrf-token';

export function clientIp(req: Request): string {
  return (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim()
    ?? req.socket.remoteAddress
    ?? 'unknown';
}

export function hashToken(token: string): string {
  return sha256(token);
}

/** Constant-time string compare that tolerates different lengths. */
export function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) {
    timingSafeEqual(createHash('sha256').update(aBuf).digest(), createHash('sha256').update(bBuf).digest());
    return false;
  }
  return timingSafeEqual(aBuf, bBuf);
}

export function attachUser(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
  if (!token) return next();
  const tokenHash = hashToken(token);
  const row = db.prepare(
    `SELECT s.id AS session_id, s.user_id FROM auth_sessions s WHERE s.token_hash = ? AND s.expires_at > ?`,
  ).get(tokenHash, new Date().toISOString()) as { session_id: string; user_id: string } | undefined;
  if (!row) return next();
  const user = getUserById(row.user_id);
  if (!user) return next();
  req.user = user;
  req.sessionTokenHash = tokenHash;
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  if (req.user.role !== 'admin') {
    logAudit(req.user.id, 'admin_access_denied', clientIp(req), 'denied', `${req.method} ${req.path}`);
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }
  next();
}

/**
 * CSRF: double-submit cookie. Mutating /api requests must present a header
 * matching the ss_csrf cookie (issued by GET /api/auth/csrf).
 */
export function csrfGuard(req: Request, res: Response, next: NextFunction) {
  const mutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
  if (!mutating) return next();
  const cookieToken = req.cookies?.[CSRF_COOKIE] as string | undefined;
  const headerToken = req.headers[CSRF_HEADER] as string | undefined;
  if (!cookieToken || !headerToken || !safeEqual(cookieToken, headerToken)) {
    logAudit(req.user?.id ?? null, 'csrf_rejected', clientIp(req), 'denied', `${req.method} ${req.path}`);
    res.status(403).json({ error: 'Invalid CSRF token' });
    return;
  }
  next();
}

export function issueCsrfCookie(res: Response): string {
  const token = randomBytes(32).toString('base64url');
  res.cookie(CSRF_COOKIE, token, {
    httpOnly: false,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 2 * 60 * 60 * 1000,
  });
  return token;
}

export function createSession(res: Response, userId: string, ip: string, userAgent: string, rememberMe: boolean) {
  const token = randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + (rememberMe ? 30 : 7) * 24 * 3600 * 1000).toISOString();
  db.prepare('INSERT INTO auth_sessions (id, user_id, token_hash, expires_at, ip, user_agent) VALUES (?,?,?,?,?,?)')
    .run(randomUUID(), userId, hashToken(token), expires, ip, userAgent.slice(0, 300));
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: new Date(expires),
  });
}

/** Destroy every session for a user (used on privilege change / password reset). */
export function destroyUserSessions(userId: string) {
  db.prepare('DELETE FROM auth_sessions WHERE user_id = ?').run(userId);
}
