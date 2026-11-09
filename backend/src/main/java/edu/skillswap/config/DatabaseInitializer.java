package edu.skillswap.config;

import edu.skillswap.service.DbSupport;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Component
public class DatabaseInitializer {

    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;

    public DatabaseInitializer(JdbcTemplate jdbc, TransactionTemplate tx) {
        this.jdbc = jdbc;
        this.tx = tx;
    }

    public void initSchemaAndVerify() {
        jdbc.execute("PRAGMA journal_mode = WAL");
        jdbc.execute("PRAGMA foreign_keys = ON");

        List<String> statements = List.of(
                """
                CREATE TABLE IF NOT EXISTS schema_migrations (
                  version TEXT PRIMARY KEY,
                  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
                )
                """,
                """
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
                  must_change_password INTEGER NOT NULL DEFAULT 0,
                  demo INTEGER NOT NULL DEFAULT 0,
                  created_at TEXT NOT NULL DEFAULT (datetime('now')),
                  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
                )
                """,
                """
                CREATE TABLE IF NOT EXISTS oauth_accounts (
                  id TEXT PRIMARY KEY,
                  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                  provider TEXT NOT NULL,
                  provider_user_id TEXT NOT NULL,
                  email TEXT,
                  created_at TEXT NOT NULL DEFAULT (datetime('now')),
                  UNIQUE (provider, provider_user_id)
                )
                """,
                "CREATE INDEX IF NOT EXISTS idx_oauth_accounts_user ON oauth_accounts(user_id)",
                """
                CREATE TABLE IF NOT EXISTS auth_sessions (
                  id TEXT PRIMARY KEY,
                  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                  token_hash TEXT NOT NULL UNIQUE,
                  created_at TEXT NOT NULL DEFAULT (datetime('now')),
                  expires_at TEXT NOT NULL,
                  ip TEXT,
                  user_agent TEXT
                )
                """,
                "CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id)",
                """
                CREATE TABLE IF NOT EXISTS mfa_pending (
                  id TEXT PRIMARY KEY,
                  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                  token_hash TEXT NOT NULL UNIQUE,
                  remember_me INTEGER NOT NULL DEFAULT 0,
                  created_at TEXT NOT NULL DEFAULT (datetime('now')),
                  expires_at TEXT NOT NULL
                )
                """,
                """
                CREATE TABLE IF NOT EXISTS skills (
                  id TEXT PRIMARY KEY,
                  name TEXT NOT NULL UNIQUE,
                  category TEXT NOT NULL CHECK (category IN ('Tech','Arts','Languages','Business','Design'))
                )
                """,
                """
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
                  proposed_by TEXT,
                  completed_by_requester INTEGER NOT NULL DEFAULT 0,
                  completed_by_recipient INTEGER NOT NULL DEFAULT 0,
                  created_at TEXT NOT NULL DEFAULT (datetime('now')),
                  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
                )
                """,
                "CREATE INDEX IF NOT EXISTS idx_sessions_req ON sessions(requester_id)",
                "CREATE INDEX IF NOT EXISTS idx_sessions_rec ON sessions(recipient_id)",
                """
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
                )
                """,
                "CREATE INDEX IF NOT EXISTS idx_reviews_reviewee ON reviews(reviewee_id)",
                """
                CREATE TABLE IF NOT EXISTS audit_log (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  ts TEXT NOT NULL DEFAULT (datetime('now')),
                  actor_id TEXT,
                  action TEXT NOT NULL,
                  ip TEXT,
                  outcome TEXT NOT NULL CHECK (outcome IN ('success','failure','denied','info')),
                  detail TEXT NOT NULL DEFAULT ''
                )
                """,
                "CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log(ts)",
                """
                CREATE TABLE IF NOT EXISTS notifications (
                  id TEXT PRIMARY KEY,
                  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                  title TEXT NOT NULL,
                  body TEXT NOT NULL DEFAULT '',
                  kind TEXT NOT NULL DEFAULT 'info',
                  read INTEGER NOT NULL DEFAULT 0,
                  ref_id TEXT,
                  created_at TEXT NOT NULL DEFAULT (datetime('now'))
                )
                """,
                "CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read)",
                """
                CREATE TABLE IF NOT EXISTS connection_requests (
                  id TEXT PRIMARY KEY,
                  from_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                  to_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                  skill TEXT,
                  message TEXT NOT NULL DEFAULT '',
                  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending','Accepted','Declined')),
                  created_at TEXT NOT NULL DEFAULT (datetime('now')),
                  UNIQUE (from_id, to_id)
                )
                """,
                """
                CREATE TABLE IF NOT EXISTS email_codes (
                  id TEXT PRIMARY KEY,
                  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                  purpose TEXT NOT NULL CHECK (purpose IN ('verify','reset')),
                  code_hash TEXT NOT NULL,
                  attempts INTEGER NOT NULL DEFAULT 0,
                  created_at TEXT NOT NULL DEFAULT (datetime('now')),
                  expires_at TEXT NOT NULL
                )
                """,
                """
                CREATE TABLE IF NOT EXISTS resources (
                  id TEXT PRIMARY KEY,
                  title TEXT NOT NULL,
                  provider TEXT NOT NULL,
                  url TEXT NOT NULL,
                  skill TEXT NOT NULL,
                  category TEXT NOT NULL CHECK (category IN ('Tech','Arts','Languages','Business','Design')),
                  kind TEXT NOT NULL DEFAULT 'guide' CHECK (kind IN ('guide','video','course','exercise'))
                )
                """,
                """
                CREATE TABLE IF NOT EXISTS admin_metrics (
                  day TEXT NOT NULL,
                  skill TEXT NOT NULL,
                  matches INTEGER NOT NULL DEFAULT 0,
                  sessions INTEGER NOT NULL DEFAULT 0,
                  PRIMARY KEY (day, skill)
                )
                """
        );

        for (String sql : statements) {
            jdbc.execute(sql);
        }

        runMigrations();

        // Touch the DB at boot
        jdbc.queryForObject("SELECT 1", Integer.class);
    }

    private void runMigrations() {
        ensureColumn("users", "must_change_password", "INTEGER NOT NULL DEFAULT 0");
        ensureColumn("mfa_pending", "remember_me", "INTEGER NOT NULL DEFAULT 0");
        ensureColumn("sessions", "proposed_by", "TEXT");

        applyMigrationOnce("V1__purge_demo_accounts_and_synthetic_metrics", () -> {
            jdbc.execute("DELETE FROM admin_metrics");
            purgeDemoUsersInternal();
        });

        // Idempotent safety net: if an older DB file still carries demo=1 rows, purge them and all linked rows.
        Integer remainingDemo = jdbc.queryForObject("SELECT COUNT(*) FROM users WHERE demo = 1", Integer.class);
        if (remainingDemo != null && remainingDemo > 0) {
            tx.executeWithoutResult(status -> purgeDemoUsersInternal());
        }
    }

    private void purgeDemoUsersInternal() {
        List<Map<String, Object>> demoUsers = DbSupport.list(jdbc, "SELECT id FROM users WHERE demo = 1");
        if (demoUsers.isEmpty()) {
            return;
        }
        for (Map<String, Object> row : demoUsers) {
            String userId = DbSupport.str(row, "id");
            jdbc.update("DELETE FROM oauth_accounts WHERE user_id = ?", userId);
            jdbc.update("DELETE FROM auth_sessions WHERE user_id = ?", userId);
            jdbc.update("DELETE FROM mfa_pending WHERE user_id = ?", userId);
            jdbc.update("DELETE FROM email_codes WHERE user_id = ?", userId);
            jdbc.update("DELETE FROM notifications WHERE user_id = ?", userId);
            jdbc.update("DELETE FROM connection_requests WHERE from_id = ? OR to_id = ?", userId, userId);
            jdbc.update("DELETE FROM reviews WHERE reviewer_id = ? OR reviewee_id = ?", userId, userId);
            jdbc.update("DELETE FROM sessions WHERE requester_id = ? OR recipient_id = ?", userId, userId);
            jdbc.update("DELETE FROM audit_log WHERE actor_id = ?", userId);
            jdbc.update("DELETE FROM users WHERE id = ?", userId);
        }
        // Recalculate ratings for any real users who may have interacted with purged demo accounts
        List<Map<String, Object>> realUsers = DbSupport.list(jdbc, "SELECT id FROM users");
        for (Map<String, Object> u : realUsers) {
            String uid = DbSupport.str(u, "id");
            Map<String, Object> agg = DbSupport.one(jdbc,
                    "SELECT AVG(overall) AS avg, COUNT(*) AS n FROM reviews WHERE reviewee_id = ?", uid);
            double avg = DbSupport.doubleVal(agg, "avg");
            int count = DbSupport.intVal(agg, "n");
            jdbc.update("UPDATE users SET avg_rating = ?, review_count = ? WHERE id = ?",
                    Math.round(avg * 10.0) / 10.0, count, uid);
        }
        System.out.printf("[migration] Purged %d legacy demo account(s) and all linked records%n", demoUsers.size());
    }

    private void applyMigrationOnce(String version, Runnable action) {
        Map<String, Object> applied = DbSupport.one(jdbc,
                "SELECT version FROM schema_migrations WHERE version = ?", version);
        if (applied != null) {
            return;
        }
        tx.executeWithoutResult(status -> {
            action.run();
            jdbc.update("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)",
                    version, DbSupport.nowIso());
        });
    }

    private void ensureColumn(String table, String column, String definition) {
        Set<String> columns = new HashSet<>();
        jdbc.query("PRAGMA table_info(" + table + ")", rs -> {
            columns.add(rs.getString("name"));
        });
        if (!columns.contains(column)) {
            jdbc.execute("ALTER TABLE " + table + " ADD COLUMN " + column + " " + definition);
        }
    }
}
