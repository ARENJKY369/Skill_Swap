import Database from 'better-sqlite3';
import { randomUUID, createHash } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';

const DATA_DIR = path.join(process.cwd(), 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

export const dbPath = process.env.SKILLSWAP_DB ?? path.join(DATA_DIR, 'skillswap.db');
export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export const nowIso = () => new Date().toISOString();
export const uuid = () => randomUUID();
export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student','admin')),
  major TEXT NOT NULL DEFAULT '',
  university TEXT NOT NULL DEFAULT '',
  year TEXT NOT NULL DEFAULT '',
  bio TEXT NOT NULL DEFAULT '',
  avatar TEXT,
  teaches TEXT NOT NULL DEFAULT '[]',
  wants TEXT NOT NULL DEFAULT '[]',
  teach_levels TEXT NOT NULL DEFAULT '{}',
  want_levels TEXT NOT NULL DEFAULT '{}',
  avg_rating REAL NOT NULL DEFAULT 0,
  review_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'offline' CHECK (status IN ('online','busy','offline')),
  email_verified INTEGER NOT NULL DEFAULT 0,
  totp_enabled INTEGER NOT NULL DEFAULT 0,
  totp_secret TEXT,
  recovery_codes TEXT NOT NULL DEFAULT '[]',
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  restricted INTEGER NOT NULL DEFAULT 0,
  demo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id);

CREATE TABLE IF NOT EXISTS mfa_pending (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS skills (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL CHECK (category IN ('Tech','Arts','Languages','Business','Design'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  requester_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill_id TEXT NOT NULL REFERENCES skills(id),
  start TEXT NOT NULL,
  duration_min INTEGER NOT NULL CHECK (duration_min BETWEEN 15 AND 480),
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending','Accepted','Declined','Rescheduled','Completed')),
  message TEXT NOT NULL DEFAULT '',
  meeting_url TEXT,
  completed_by_requester INTEGER NOT NULL DEFAULT 0,
  completed_by_recipient INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sessions_req ON sessions(requester_id);
CREATE INDEX IF NOT EXISTS idx_sessions_rec ON sessions(recipient_id);

CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  reviewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reviewee_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  punctuality INTEGER NOT NULL CHECK (punctuality BETWEEN 1 AND 5),
  clarity INTEGER NOT NULL CHECK (clarity BETWEEN 1 AND 5),
  engagement INTEGER NOT NULL CHECK (engagement BETWEEN 1 AND 5),
  overall INTEGER NOT NULL CHECK (overall BETWEEN 1 AND 5),
  text TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (session_id, reviewer_id)
);
CREATE INDEX IF NOT EXISTS idx_reviews_reviewee ON reviews(reviewee_id);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL DEFAULT (datetime('now')),
  actor_id TEXT,
  action TEXT NOT NULL,
  ip TEXT,
  outcome TEXT NOT NULL CHECK (outcome IN ('success','failure','denied','info')),
  detail TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log(ts);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'info',
  read INTEGER NOT NULL DEFAULT 0,
  ref_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read);

CREATE TABLE IF NOT EXISTS connection_requests (
  id TEXT PRIMARY KEY,
  from_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill TEXT,
  message TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending','Accepted','Declined')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (from_id, to_id)
);

CREATE TABLE IF NOT EXISTS email_codes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('verify','reset')),
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS resources (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  provider TEXT NOT NULL,
  url TEXT NOT NULL,
  skill TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('Tech','Arts','Languages','Business','Design')),
  kind TEXT NOT NULL DEFAULT 'guide' CHECK (kind IN ('guide','video','course','exercise'))
);

CREATE TABLE IF NOT EXISTS admin_metrics (
  day TEXT NOT NULL,
  skill TEXT NOT NULL,
  matches INTEGER NOT NULL DEFAULT 0,
  sessions INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, skill)
);
`);

export interface UserRow {
  id: string; name: string; email: string; username: string; password_hash: string;
  role: 'student' | 'admin'; major: string; university: string; year: string; bio: string;
  avatar: string | null; teaches: string; wants: string; teach_levels: string; want_levels: string;
  avg_rating: number; review_count: number; status: 'online' | 'busy' | 'offline';
  email_verified: number; totp_enabled: number; totp_secret: string | null;
  recovery_codes: string; failed_attempts: number; locked_until: string | null;
  restricted: number; demo: number; created_at: string; updated_at: string;
}

export interface PublicUser {
  id: string; name: string; username: string; email: string; role: 'student' | 'admin';
  major: string; university: string; year: string; bio: string; avatar: string | null;
  teaches: string[]; wants: string[]; teachLevels: Record<string, string>; wantLevels: Record<string, string>;
  avgRating: number; reviewCount: number; status: string; emailVerified: boolean;
  totpEnabled: boolean; restricted: boolean; demo: boolean; createdAt: string;
}

const parseJson = <T,>(raw: string | null | undefined, fallback: T): T => {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
};

export function publicUser(u: UserRow): PublicUser {
  return {
    id: u.id, name: u.name, username: u.username, email: u.email, role: u.role,
    major: u.major, university: u.university, year: u.year, bio: u.bio, avatar: u.avatar,
    teaches: parseJson(u.teaches, []), wants: parseJson(u.wants, []),
    teachLevels: parseJson(u.teach_levels, {}), wantLevels: parseJson(u.want_levels, {}),
    avgRating: Math.round(u.avg_rating * 10) / 10, reviewCount: u.review_count,
    status: u.status, emailVerified: u.email_verified === 1, totpEnabled: u.totp_enabled === 1,
    restricted: u.restricted === 1, demo: u.demo === 1, createdAt: u.created_at,
  };
}

export function getUserById(id: string): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
}

export function getUserByIdentifier(identifier: string): UserRow | undefined {
  const q = identifier.trim().toLowerCase();
  return db.prepare('SELECT * FROM users WHERE email = ? OR username = ?').get(q, q) as UserRow | undefined;
}

export function notify(userId: string, title: string, body: string, kind = 'info', refId?: string) {
  db.prepare('INSERT INTO notifications (id, user_id, title, body, kind, ref_id) VALUES (?,?,?,?,?,?)')
    .run(uuid(), userId, title, body, kind, refId ?? null);
}
