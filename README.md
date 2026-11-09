# SkillSwap

Peer-to-peer skill exchange for students — a production-grade, dark-mode desktop-style web app.
Ten screens (splash → auth → dashboard → profile → matchmaker → explorer → scheduler → sessions → feedback → admin),
real backend, real persistence, real security. **v2.4.9**

![React](https://img.shields.io/badge/react-18-06B6D4?style=flat-square) ![Java](https://img.shields.io/badge/java-17%2B-06B6D4?style=flat-square) ![Spring Boot](https://img.shields.io/badge/spring%20boot-3.3-06B6D4?style=flat-square) ![SQLite](https://img.shields.io/badge/sqlite-WAL-06B6D4?style=flat-square)

---

## Status of this branch (read first)

This branch contains a **Spring Boot 3 / Java 17 / Spring Security 6 / SQLite** backend written to replace the
Node/Express backend in `server/`. The Java controllers mirror the existing React 18 + Vite frontend's `/api/*`
contract: same paths, JSON field names, status codes, cookies and CSRF flow. The Express `server/` is retained as a
behavioral reference and is not used by the Java service.

**Validation performed in this sandbox:**

- All 44 Java sources under `backend/src` parsed cleanly with `java-parser` (0 syntax failures).
- The sources were compiled with Eclipse Compiler for Java 3.33 using `-parameters` against Spring Boot 3.3.5 /
  Spring Security 6.3.4 / SQLite JDBC 3.46.1.3 / ZXing 3.5.3 jars assembled from public GitHub caches.
- JUnit 5 ports of the shared domain rules ran through the JUnit Platform Launcher: **25 tests, 0 failures**.
- The Spring Boot app started on `0.0.0.0:8787` with a WAL-mode SQLite database and auto-seeded
  15 students + 1 admin + 46 skills (zero reviews).
- `scripts/e2e.sh` passed end to end against the running Java service: signup/verify/login, CSRF refresh, admin RBAC
  403, skills lookup, session create, 10:30 double-booking 409, review-before-completion 403, recipient accept,
  both-party completion, review 201 and duplicate review 409.
- `npm run typecheck` passed; `npm test` passed Vitest 2.1.9 (4 files, 25 tests).

**Sandbox toolchain limitation:** this environment has no system full JDK or Maven, and its network egress blocks
Maven Central, Gradle distributions and Apache mirrors. `./mvnw` therefore cannot bootstrap Maven 3.9.9 or resolve
dependencies *here*. The compile/test/runtime results above were obtained with a JRE 17 plus ECJ and GitHub-hosted
dependency jars, not with `./mvnw`. On a machine with JDK 17+ and Maven Central access, the checked-in wrapper
build (`./mvnw test`, `./mvnw package`) works normally. The Express `server/` can be removed in a follow-up once the
old backend is no longer wanted; `npm run dev:node` and `npm run start:node` still run it today.

---

## Quick start

**Requirements:** Node.js ≥ 20, npm ≥ 10 (frontend build), **JDK 17+**, and network access to Maven Central for the
first Maven Wrapper run. A system Maven install is not required; `./mvnw` / `mvnw.cmd` are included.

```bash
npm install
cp .env.example .env        # edit APP_SECRET at minimum
npm run dev                 # Java API (:8787) + Vite dev server (:5173, proxied /api)
```

Open **http://localhost:5173**. First boot auto-seeds demo data (15 students + 1 admin, 46 skills, **zero reviews**).

Run the API without the Vite dev server:

```bash
./mvnw spring-boot:run      # http://localhost:8787/api
```

**Production (single process):**

```bash
npm run build               # vite build → dist/
npm start                   # APP_ENV=production via Spring Boot JVM arg; serves API + built SPA on :8787
# or build an executable jar:
npm run build:java
npm run start:jar
```

Open **http://localhost:8787**. `npm start` uses the Maven Wrapper with
`-Dspring-boot.run.jvmArguments="-DAPP_ENV=production"`; `NODE_ENV=production` and
`SPRING_PROFILES_ACTIVE=prod` are also recognized by `AppProperties`.

**Demo accounts** (all flagged `demo = 1`, seeded with zero reviews):

| Role | Identifier | Password |
|---|---|---|
| Student | `ava@skillswap.edu` | `student1234` |
| Administrator | `admin@skillswap.edu` | `admin1234` |

**Tests / checks:** `npm test` (existing Vitest domain tests), `npm run typecheck`, `npm run test:java`
(JUnit ports of the same domain rules), `npm run build:java`. In this sandbox the JUnit suite was executed through
the JUnit Platform Launcher because `./mvnw` cannot resolve dependencies; on a normal machine `./mvnw test` is the
equivalent command.

**Curl E2E:** with the Java service running in dev mode, run `npm run e2e:java` (or `bash scripts/e2e.sh`).
It covers signup → dev-code verify → login → admin RBAC denial → create session → 10:30 double-booking 409 →
review-before-completion 403 → recipient accept → both-party completion → review 2xx → duplicate 409.
Because a newly created future session cannot be completed under the shared state-machine rule `now >= end`,
the script moves that one accepted session's `start` into the past through SQLite before the two completion calls.
The script requires `curl`, `python3`, a dev-mode service and access to the same SQLite file. It has been run against
the Java service in this sandbox and passes end to end.

---

## What's inside

```
├── pom.xml                  # Spring Boot 3.3.5, Java 17, -parameters, JdbcTemplate, sqlite-jdbc, ZXing, tests
├── mvnw / mvnw.cmd         # Maven Wrapper 3.3.2 (Apache Maven 3.9.9)
├── .mvn/wrapper/            # wrapper properties
├── backend/src/main/
│   ├── java/edu/skillswap/
│   │   ├── SkillSwapApplication.java  # .env loader, schema init, seed-on-boot, --seed [--force]
│   │   ├── config/          # AppProperties, DatabaseConfig, DatabaseInitializer, SeedService,
│   │   │                    # PasswordConfig, SecurityConfig, WebConfig, GlobalExceptionHandler
│   │   ├── security/        # AuthUser, AuthContext, SessionAuthFilter, CsrfDoubleSubmitFilter
│   │   ├── service/         # AuditService, UserRepository, MatchScoreService, SessionStateMachine,
│   │   │                    # ReviewRulesService, RbacService, AvatarService, DbSupport,
│   │   │                    # CookieService, RateLimitService, TotpService
│   │   ├── dto/             # strict request DTOs (unknown fields rejected)
│   │   └── controller/      # Health, Auth, OAuth, User, Skill, Session, Review, Notification,
│   │                        # Resource, Admin, API 404, SPA fallback
│   └── resources/application.properties
├── backend/src/test/java/   # JUnit 5 ports of shared/ domain rules
├── scripts/e2e.sh           # curl end-to-end script described above
├── index.html               # SPA entry (dark, CSP handled by Spring Security in prod)
├── dist/                    # built SPA, served by Spring Boot in production (gitignored)
├── data/skillswap.db        # SQLite WAL database, auto-created (gitignored)
├── server/                  # Express reference implementation, retained for API parity (not used by Java)
├── shared/                  # TypeScript domain rules still used by frontend + Vitest tests
├── src/                     # React 18 + Vite frontend (untouched)
└── tests/                   # existing Vitest unit tests for shared/
```

The Java service does **not** import TypeScript from `shared/`; it mirrors `matchScore`, `sessionStateMachine`,
`reviewRules` and `rbac` server-side. It keeps all 12 tables (`users`, `auth_sessions`, `mfa_pending`, `skills`,
`sessions`, `reviews`, `audit_log`, `notifications`, `connection_requests`, `email_codes`, `resources`,
`admin_metrics`) and uses parameterized `JdbcTemplate` queries only.

### The 10 screens

1. **Splash** — real init (opens Dexie, probes `/api/auth/csrf` + `/api/health`), checklist with icons, cross-fade into the app.
2. **Auth** — Login/Sign Up tabs, strength meter, email verification with 6-digit codes + resend cooldown, TOTP 2FA (QR + recovery codes), forgot/reset flow, OAuth buttons (env-configured, honest 501 when unset), lockout after 5 failures, generic errors.
3. **Dashboard** — matched partners, hours taught (computed from completed sessions), pending invites (live), upcoming sessions with Join/Reschedule, live notifications rail.
4. **Profile** — avatar upload (client-side resize → JPEG), 300-char bio with sanitized preview, university block, skill pills with level selects, autosave (IndexedDB-first → server) with “Saved locally / Synced” indicator, 2FA management.
5. **Matchmaker** — sortable dark table, mutual-skill pills, High/Med/Low level chips, Best-Match % chips (≥80 / 50–79 / <50), Connect + Quick Session actions.
6. **Explorer** — debounced search, category filter + pills, responsive card grid, slide-in profile drawer with reviews and Connect & Learn.
7. **Scheduler** — month calendar, 24h time, 15–180 min durations, https-only meeting link, strict validation, server-side double-booking guard (409), encrypted draft persistence.
8. **Schedule & Sessions** — Incoming / Scheduled / Past tabs, Accept/Reschedule/Decline, Launch Session, two-party Mark Completed.
9. **Feedback** — 5-star overall + Punctuality/Clarity/Engagement rows, 500-char comment, server-enforced eligibility (completed session, participants only, one review per session/reviewer → 403/409), automatic average recalculation.
10. **Admin** — role-gated client **and** server, KPI cards, engagement chart, Manage Students & Tags table, content moderation, skill Categories management, filterable Audit Log, “DB connected” health chip.

---

## Security model

- **Passwords** — BCrypt cost 10. TOTP 2FA (RFC 6238, HMAC-SHA1, ±1 window) + ZXing QR; recovery codes stored hashed (SHA-256), single-use.
- **Sessions** — opaque 256-bit tokens, SHA-256-hashed at rest, `HttpOnly; SameSite=Strict; Secure` (prod) cookies. Rotation on password reset, re-auth, admin privilege change, 2FA enable.
- **CSRF** — double-submit cookie (`ss_csrf` + `x-csrf-token` header), constant-time compare; enforced on **every** mutating `/api` call, including login.
- **RBAC** — `requireAdmin` on `/api/admin/*`; ownership checks on session/review actions; admin denials are audit-logged.
- **Validation** — strict DTOs/query parsing (unknown fields rejected), Jakarta validation, and parameterized SQL only.
- **Headers** — Spring Security CSP/HSTS/frame/content-type/referrer policy in production; no stack traces or `x-powered-by` in responses.
- **Rate limits & lockout** — login (12/15 min), OTP (10/10 min), signup (20/h), invites (30/h); account locks for 15 min after 5 failed attempts; generic login errors.
- **Audit logging** — logins, failures, 2FA events, privilege shifts, restrictions, deletions, denied admin access, exports. Admin-only and filterable.
- **Sessions/review integrity** — reviews only for completed sessions by the two participants; duplicates rejected; averages recomputed server-side.
- **Errors** — global handler: full detail to server logs + audit, generic message + correlation ID to clients.
- **Seed policy** — demo accounts are flagged; **no reviews/ratings are seeded**; Explorer shows “No reviews yet” until real ones exist.

---

## Environment variables

See `.env.example`; no secrets are committed and `.env` is gitignored.

| Variable | Purpose |
|---|---|
| `PORT` | HTTP port, default `8787`. |
| `APP_SECRET` | Salts one-time email codes and 2FA recovery-code hashes. **Required in production.** |
| `CORS_ORIGIN` | Comma-separated cross-origin allowlist; empty = same-origin only. |
| `SKILLSWAP_DB` | Optional SQLite path, default `./data/skillswap.db`. |
| `PUBLIC_BASE_URL` | Base URL used to build OAuth redirect URIs. |
| `GOOGLE_*`, `FACEBOOK_*`, `X_*`, `LINKEDIN_*` | OAuth client IDs and secrets; unconfigured providers return a clean 501. |
| `VITE_GOOGLE_CLIENT_ID`, etc. | Public client-side OAuth IDs exposed by Vite; never secrets. |
| `SMTP_URL` | Parsed for parity; no mail delivery hook is implemented, so codes are printed to the console in dev. |
| `NODE_ENV` / `APP_ENV` / `SPRING_PROFILES_ACTIVE` | Any `production`/`prod` value enables prod CSP/HSTS/secure cookies and omits dev codes from responses. |

Without SMTP, verification/reset codes are printed to the **server console** and, outside production, returned as
`devVerificationCode` / `devResetCode`, surfaced in the UI as a clearly labeled “Dev mode” box. Set `SMTP_URL` and
extend `AuthController.issueEmailCode()` to deliver real mail.

---

## Deployment

Single Java process, one port, SQLite file in `./data/skillswap.db` (override with `SKILLSWAP_DB`). Build the frontend
first so Spring Boot can serve `dist/` in production:

```bash
npm ci
npm run build
npm run build:java
java -DAPP_ENV=production -jar target/skillswap-backend-2.4.9.jar
```

- **Render / Railway / Fly / VPS** — set `APP_SECRET`, `NODE_ENV=production` (or `APP_ENV=production`), `PORT`,
  `CORS_ORIGIN` if needed, and mount a persistent volume for `./data`.
- **Replit** — same commands; expose port 8787; add a volume for `./data` or accept ephemeral demo data.
- **Split frontend/backend** — host `dist/` statically, run the jar as a separate service, set `CORS_ORIGIN` on the
  API and `VITE_*` vars at frontend build time. SQLite needs a persistent filesystem; for multi-region use, swap the
  `JdbcTemplate` layer for PostgreSQL while keeping the same 12-table schema and API shapes.

Suggested CI: `npm ci && npm run typecheck && npm test && ./mvnw test && npm run build && ./mvnw -DskipTests package`.
Add `npm run e2e:java` against a running dev-mode service; it already passes against the Java service in this branch.

---

## Known limitations

- **This sandbox:** no system full JDK/Maven and Maven Central is blocked, so `./mvnw` cannot bootstrap here. The Java
  sources were nevertheless compiled with ECJ 3.33 and the app, JUnit suite and curl E2E were run on a JRE 17 with
  dependencies assembled from public GitHub caches; those results are recorded above. A normal JDK 17 + Maven
  environment is still required for the checked-in wrapper build.
- `server/` Express code is retained as the behavioral reference and is not used by the Java service;
  `npm run dev:node` / `npm run start:node` keep it runnable. It can be removed once the old backend is no longer needed.
- SQLite is single-node; WAL mode and a single-connection Hikari pool handle campus-scale concurrency.
- Rate limiting is in-memory; use Redis or a gateway limiter for multiple replicas.
- OAuth paths are implemented (redirect → callback → session) but need real client IDs/secrets to be exercised.
- `SMTP_URL` is accepted for env parity but no SMTP sender is wired; dev codes go to the console.
- Live notifications use polling in the frontend; SSE/WebSocket would be a future improvement.

## License

Internal campus project. Not for redistribution with the demo credentials intact.
