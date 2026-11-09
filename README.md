# SkillSwap

Peer-to-peer skill exchange for students — a production-grade, dark-mode desktop-style web app.
Ten screens (splash → auth → dashboard → profile → matchmaker → explorer → scheduler → sessions → feedback → admin),
real backend, real persistence, real security. **v2.4.9**

![React](https://img.shields.io/badge/react-18-06B6D4?style=flat-square) ![Java](https://img.shields.io/badge/java-21-06B6D4?style=flat-square) ![Spring Boot](https://img.shields.io/badge/spring%20boot-3.3-06B6D4?style=flat-square) ![SQLite](https://img.shields.io/badge/sqlite-WAL-06B6D4?style=flat-square)

---

## Quick start (Windows PowerShell / macOS / Linux)

**Requirements:** Node.js ≥ 20, npm ≥ 10, **Java 21**, and internet access to Maven Central on the first Maven Wrapper run. A global Maven install is not required (`mvnw.cmd` and `./mvnw` are included).

```powershell
npm install
Copy-Item .env.example .env   # (or `cp .env.example .env` on macOS/Linux)
npm run dev                   # starts Spring Boot API (:8787) + Vite (:5173) together via concurrently & mvnw.cmd
```

Open **http://localhost:5173**.

- **Zero demo accounts:** Fresh installs start with **0 users**, **0 sessions**, and **0 reviews** — only the 46-skill catalog and static learning resources are seeded. Any legacy demo rows in an existing `data/skillswap.db` file are automatically purged on startup.
- **Student registration:** Use the **Sign Up** tab to create an account. In local development (when `SMTP_URL` is unset), the 6-digit verification code and clickable verification link are printed directly to the backend console.
- **First Administrator Bootstrap:** Set `ADMIN_EMAIL` and `ADMIN_INITIAL_PASSWORD` in `.env` before first startup. If zero admins exist, the server creates that initial admin (`bcrypt`-hashed, `mustChangePassword = true`) and forces a password change upon first sign-in. If unset, no admin is created and the server logs instructions (never logging any password).
- **Social Sign-In (Google, Facebook, X, LinkedIn):** Full-page OAuth 2.0 Authorization Code flows (`/oauth2/authorization/{provider}` → `/login/oauth2/code/{provider}`). See [`docs/OAUTH_SETUP.md`](docs/OAUTH_SETUP.md) for provider console instructions, callback URIs, and scopes.

Run the backend standalone in Windows PowerShell:

```powershell
.\mvnw.cmd spring-boot:run    # http://localhost:8787/api/health
```

**Production (single process):**

```powershell
npm run build                 # vite build → dist/
npm run build:java            # mvnw.cmd -DskipTests package
npm run start:jar             # serves API + built SPA on :8787
```

---

## Commands & tests

| Command | Description |
|---|---|
| `npm run dev` | Starts Spring Boot backend (`mvnw.cmd` / `./mvnw`) + Vite frontend concurrently |
| `npm run typecheck` | TypeScript strict check (`tsc --noEmit`) |
| `npm test` | Vitest suite (state machine, review rules, RBAC, match score, credential-leak guard) |
| `npm run test:java` | JUnit 5 suite (`mvnw.cmd test` / `./mvnw test`) |
| `npm run build` | Production Vite bundle (`dist/`) |
| `npm run build:java` | Spring Boot fat JAR (`target/skillswap-backend-2.4.9.jar`) |
| `npm run e2e:java` | End-to-end API verification (`scripts/e2e.sh`) |

---

## Architecture

```
├── pom.xml                  # Spring Boot 3.3.5, Java 21, -parameters, JdbcTemplate, sqlite-jdbc, ZXing, JUnit 5
├── mvnw / mvnw.cmd          # Maven Wrapper 3.3.2 (Apache Maven 3.9.9) — PowerShell & POSIX ready
├── scripts/mvnw.mjs         # Cross-platform launcher delegating to mvnw.cmd on Windows and ./mvnw on Unix
├── docs/OAUTH_SETUP.md      # Step-by-step Google, Facebook, X & LinkedIn OAuth2 setup guide
├── backend/src/main/
│   ├── java/edu/skillswap/
│   │   ├── SkillSwapApplication.java  # .env loader, schema + migration init, catalog seed, admin bootstrap
│   │   ├── config/          # AppProperties, DatabaseConfig, DatabaseInitializer, SeedService,
│   │   │                    # PasswordConfig, SecurityConfig, WebConfig, GlobalExceptionHandler
│   │   ├── security/        # CorrelationIdFilter, AuthUser, AuthContext, SessionAuthFilter, CsrfDoubleSubmitFilter
│   │   ├── service/         # AuditService, UserRepository, MatchScoreService, SessionStateMachine,
│   │   │                    # ReviewRulesService, RbacService, AvatarService, DbSupport,
│   │   │                    # CookieService, RateLimitService, TotpService
│   │   ├── dto/             # strict Jakarta Bean Validation request DTOs (unknown fields rejected)
│   │   └── controller/      # Health, Auth, OAuth, User, Skill, Session, Review, Notification,
│   │                        # Resource, Admin, API 404, SPA fallback
│   └── resources/application.properties
├── backend/src/test/java/   # JUnit 5 tests for domain rules & credential-free codebase check
├── data/skillswap.db        # SQLite WAL database, auto-created & migrated on boot (gitignored)
├── shared/                  # Shared TypeScript domain logic mirrored by Java services
├── src/                     # React 18 + Vite + Tailwind dark desktop-style frontend
└── tests/                   # Vitest unit & security guard tests
```

---

## Security model

- **Passwords & 2FA** — BCrypt (strength 10); mandatory first-login password change for bootstrapped admins; RFC 6238 TOTP 2FA with ZXing QR codes and SHA-256 hashed single-use recovery codes.
- **Sessions & Cookies** — Opaque 256-bit tokens (SHA-256 hashed in SQLite), `HttpOnly`, `SameSite=Lax` (preserving cookies across OAuth2 provider redirects while blocking cross-site POSTs), `Secure` in production (`HTTPS`), 30-day persistent cookie when *Remember Me* is checked or browser-session cookie otherwise.
- **CSRF** — Double-submit cookie (`ss_csrf` + `x-csrf-token` header) with constant-time verification on every mutating `/api/*` endpoint.
- **CORS** — Explicit origin allowlist (`http://localhost:5173`, `http://127.0.0.1:5173` in dev, configurable via `CORS_ORIGIN`) with `allowCredentials(true)` and exposed `X-Correlation-Id`.
- **OAuth 2.0** — Server-side Authorization Code + `state` cookie + `S256` PKCE (`oauth_accounts` identity binding). Prevents account takeover by refusing to link or create accounts from unverified provider emails. Client secrets live strictly in server environment variables and are never bundled into frontend assets.
- **Structured Error Handling** — Every request receives an 8-character correlation ID (`X-Correlation-Id`). Full exceptions log server-side only; clients receive safe, specific messages (`Invalid credentials`, `Account locked, try again in N minutes`, `Email not verified`, `Too many attempts`, `Server unreachable`) plus the correlation ID, with zero stack traces exposed.
- **RBAC & Audit Logging** — Server-enforced `requireAdmin` on all `/api/admin/*` routes (`403` + audit log on student access); full security audit trail in `audit_log`.

---

## Environment variables

Copy `.env.example` to `.env` (gitignored).

| Variable | Purpose |
|---|---|
| `PORT` | Backend HTTP port (default `8787`) |
| `FRONTEND_URL` | Frontend base URL for OAuth & verification redirects (default `http://localhost:5173` in dev) |
| `PUBLIC_BASE_URL` | Backend public URL used to build OAuth callback URIs (default `http://localhost:8787`) |
| `CORS_ORIGIN` | Additional comma-separated allowed CORS origins |
| `APP_SECRET` | Server secret salting one-time codes and recovery hashes (**set in production**) |
| `SKILLSWAP_DB` | SQLite file path (default `./data/skillswap.db`) |
| `ADMIN_EMAIL` | Optional initial admin email (used only when zero admins exist in DB) |
| `ADMIN_INITIAL_PASSWORD` | Optional one-time initial password for `ADMIN_EMAIL` (forced change on first login) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth 2.0 credentials (server-only) |
| `FACEBOOK_CLIENT_ID` / `FACEBOOK_CLIENT_SECRET` | Facebook OAuth 2.0 credentials (server-only) |
| `TWITTER_CLIENT_ID` / `TWITTER_CLIENT_SECRET` | X (Twitter) OAuth 2.0 credentials (server-only) |
| `LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET` | LinkedIn OIDC credentials (server-only) |
| `SMTP_URL` | Optional SMTP connection string; when unset, verification/reset links & codes print to the console |

## License

Internal campus project.
