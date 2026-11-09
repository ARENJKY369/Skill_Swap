# SkillSwap

Peer-to-peer skill exchange for students — a production-grade, dark-mode desktop-style web app.
Ten screens (splash → auth → dashboard → profile → matchmaker → explorer → scheduler → sessions → feedback → admin),
real backend, real persistence, real security. **v2.4.9**

![Stack](https://img.shields.io/badge/react-18-06B6D4?style=flat-square) ![Node](https://img.shields.io/badge/node-%E2%89%A520-06B6D4?style=flat-square) ![SQLite](https://img.shields.io/badge/sqlite-WAL-06B6D4?style=flat-square)

---

## Quick start

**Requirements:** Node.js ≥ 20, npm ≥ 10.

```bash
npm install
cp .env.example .env        # edit APP_SECRET at minimum
npm run dev                 # starts API (:8787) + Vite dev server (:5173, proxied /api)
```

Open **http://localhost:5173**. First boot auto-seeds demo data (15 students + 1 admin, 46 skills, **zero reviews**).

**Production (single process):**

```bash
npm run build               # vite build → dist/
npm start                   # NODE_ENV=production, serves API + built SPA on :8787
```

Open **http://localhost:8787**.

**Demo accounts** (all flagged `demo = 1`, seeded with zero reviews):

| Role | Identifier | Password |
|---|---|---|
| Student | `ava@skillswap.edu` | `student1234` |
| Administrator | `admin@skillswap.edu` | `admin1234` |

**Tests / checks:** `npm test` (25 unit tests — matching, session state machine, review eligibility, RBAC) · `npm run typecheck` · `npm audit`.

---

## What's inside

```
├── index.html               # SPA entry (dark, CSP handled by helmet in prod)
├── server/                  # Express + better-sqlite3 (parameterized only)
│   ├── index.ts             # app bootstrap: helmet, CSRF, static SPA, error handler
│   ├── db.ts                # schema, connection, public-user serializer
│   ├── env.ts               # native .env loader (no dependency)
│   ├── seed.ts              # deterministic demo seed (--force to wipe & reseed)
│   ├── middleware/          # attachUser / requireAuth / requireAdmin / csrfGuard / validate (zod)
│   ├── services/audit.ts    # structured audit log writer
│   └── routes/              # auth, users, sessions, reviews, notifications, skills, resources, admin, health
├── shared/                  # pure domain logic shared by server + client + tests
│   ├── matchScore.ts        # the matchmaking algorithm (unit-tested)
│   ├── sessionStateMachine.ts
│   ├── reviewRules.ts
│   └── rbac.ts
├── src/
│   ├── api/client.ts        # fetch wrapper: cookies, CSRF double-submit w/ silent retry, ApiError
│   ├── db/                  # dexie.ts (schema) · crypto.ts (AES-GCM) · sync.ts (outbox, LWW)
│   ├── store/               # zustand: appStore (session/online/db/sync), toast
│   ├── lib/                 # sanitize (DOMPurify), format, toastHook
│   ├── components/          # TitleBar, StatusBar, Sidebar, AppShell, Dialog (focus-trapped), …
│   └── screens/             # Splash, Auth, Dashboard, Profile, Matchmaker, Explorer,
│                            # Resources, Sessions, AdminPanel, LegalPage
└── tests/                   # vitest unit tests for shared/
```

### The 10 screens

1. **Splash** — real init (opens Dexie, probes `/api/auth/csrf` + `/api/health`), checklist with icons, cross-fade into the app.
2. **Auth** — Login/Sign Up tabs (teal underline), strength meter, email verification with 6-digit codes + resend cooldown, TOTP 2FA (QR + recovery codes), forgot/reset flow, OAuth buttons (env-configured, honest 501 when unset), lockout after 5 failures, generic errors.
3. **Dashboard** — matched partners, hours taught (computed from completed sessions), pending invites (live), upcoming sessions with Join/Reschedule, live notifications rail.
4. **Profile** — avatar upload (client-side resize → JPEG), 300-char bio with sanitized preview, university block, teal/gray skill pills with level selects, autocomplete add dialog, autosave (IndexedDB-first → server) with “Saved locally / Synced” indicator, 2FA management.
5. **Matchmaker** — sortable dark table, mutual-skill pills, High/Med/Low level chips, teal/amber/gray Best-Match % chips (≥80 / 50–79 / <50), Connect + Quick Session actions.
6. **Explorer** — debounced (150 ms) search, category filter + pills, responsive card grid, slide-in profile drawer with reviews and Connect & Learn.
7. **Scheduler** — month calendar (past disabled, today highlighted, teal selection), 24h time, 0.5–3 hr durations, https-only meeting link, Zod validation, server-side double-booking guard (409), encrypted draft persistence in IndexedDB.
8. **Schedule & Sessions** — Incoming / Scheduled / Past tabs with counts, date badges, Confirmed/Pending/Declined/Completed chips, Accept/Reschedule/Decline, Launch Session, two-party Mark Completed.
9. **Feedback** — 5-star overall + Punctuality/Clarity/Engagement rows, 500-char comment, server-enforced eligibility (completed session, participants only, one review per session/reviewer → 403/409), automatic average recalculation, “Verified session” badge.
10. **Admin** — role-gated (client **and** server), KPI cards, “Engagement Over Time” line chart with skill selector, Manage Students & Tags table (Modify / Restrict / Delete with confirm dialogs, session rotation on privilege change), Content moderation, skill Categories management, live monospace Audit Log with filters + CSV export, “DB connected” health chip.

Plus a persistent footer/status-bar (Privacy · Terms · Cookie Settings · v2.4.9) and a tabbed legal modal with GDPR actions: export-my-data (JSON), clear local data, delete account (re-auth + typed `DELETE`), cookie toggles.

---

## Security model

- **Passwords** — bcrypt (cost 10). TOTP 2FA via otplib + QR via `qrcode`; recovery codes stored hashed (SHA-256), single-use.
- **Sessions** — opaque 256-bit tokens, SHA-256-hashed at rest, `HttpOnly; SameSite=Strict; Secure` (prod) cookies. Rotation on password reset, re-auth, admin privilege change, 2FA enable.
- **CSRF** — double-submit cookie (`ss_csrf` + `x-csrf-token` header), constant-time compare; enforced on **every** mutating `/api` call.
- **RBAC** — `requireAdmin` middleware on `/api/admin/*`; ownership checks on session/review actions (IDOR-safe); admin denials are audit-logged.
- **Validation** — Zod schemas `.strict()` on every body/query (unknown fields rejected). Parameterized queries only (better-sqlite3 prepared statements).
- **Headers** — Helmet with a strict CSP in production, HSTS (preload), `X-Content-Type-Options`, no `x-powered-by`.
- **Rate limits & lockout** — login (12/15 min), OTP (10/10 min), signup (20/h), invites (30/h); account locks for 15 min after 5 failed attempts; login errors are generic (“Invalid credentials”).
- **Audit logging** — logins, failures, 2FA events, privilege shifts, restrictions, deletions, denied admin access, exports. Admin-only, filterable, CSV-exportable.
- **Local data** — IndexedDB records (drafts, pending profile edits) are AES-GCM sealed with a **non-extractable** WebCrypto key; raw tokens/passwords are never persisted. Clearable via Settings → Privacy or “Clear local data”.
- **Sessions/review integrity** — reviews only for completed sessions by the two participants; duplicates rejected; averages recomputed server-side from the reviews table.
- **Offline** — Dexie tables (`session`, `drafts`, `profileEdits`, `preferences`, `outbox`); writes go local-first and flush through an outbox with exponential backoff. Last-write-wins on conflict.
- **Errors** — global handler: full detail to server logs + audit, generic message + correlation ID to clients. Stack traces never cross the wire.
- **Seed policy** — demo accounts are flagged; **no reviews/ratings are seeded**; the Explorer shows “No reviews yet” until real ones exist.

## Environment variables

See `.env.example`. Notables: `APP_SECRET` (signs one-time codes/CSRF material — set a long random string in prod), `PORT` (default 8787), `CORS_ORIGIN` (empty = same-origin only), OAuth client IDs/secrets (`GOOGLE_*`, `FACEBOOK_*`, `X_*`, `LINKEDIN_*`, mirrored client-side as `VITE_*` — public only).

Without SMTP, verification/reset codes are printed to the **server console** and (outside production) returned in the response as `devVerificationCode` / `devResetCode`, surfaced in the UI as a clearly-labeled “Dev mode” box. Set `SMTP_URL` and extend `issueEmailCode()` to deliver real mail.

## Deployment

Single Node process, one port, SQLite file in `./data/skillswap.db` (override with `SKILLSWAP_DB`).

- **Render/Railway/Fly/VPS** — `npm install && npm run build && npm start`, env: `NODE_ENV=production`, `APP_SECRET`, persistent volume for `./data`.
- **Replit** — same commands; expose port 8787; add a volume for `./data` or accept ephemeral demo data.
- **Vercel** — frontend on Vercel (static `dist/`), `server/` as a separate Node service (SQLite needs a persistent FS; on serverless use an external volume or switch `db.ts` to Postgres via the same parameterized layer). Set `CORS_ORIGIN=https://<your-app>.vercel.app` on the API and `VITE_*` vars in the Vercel project.

CI suggestion: `npm ci && npm run typecheck && npm test && npm audit --audit-level=high`.

## Known limitations (honest list)

- SQLite is single-node; WAL mode handles concurrency for campus-scale use. Swap `server/db.ts` for Postgres for multi-region.
- Live notifications use 6 s polling (sufficient at this scale); swap for SSE/WebSocket if needed.
- OAuth paths are implemented (redirect → callback → session) but exercised only with real client IDs; unconfigured providers return a clean 501 with the missing variable name.
- `/api` rate limiting is in-memory; use Redis (or your gateway’s limiter) when running multiple replicas.

## License

Internal campus project. Not for redistribution with the demo credentials intact.
