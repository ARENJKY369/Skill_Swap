import './env';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { db } from './db';
import { attachUser, csrfGuard } from './middleware/auth';
import { logAudit } from './services/audit';
import { authRouter } from './routes/auth';
import { usersRouter } from './routes/users';
import { sessionsRouter } from './routes/sessions';
import { reviewsRouter } from './routes/reviews';
import { notificationsRouter } from './routes/notifications';
import { adminRouter } from './routes/admin';
import { skillsRouter } from './routes/skills';
import { healthRouter } from './routes/health';
import { resourcesRouter } from './routes/resources';
import { seedIfEmpty } from './seed';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const isProd = process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT ?? 8787);

// Seed demo content on first boot (idempotent; skipped when data exists).
seedIfEmpty(false);

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(helmet({
  contentSecurityPolicy: isProd ? {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", 'data:'],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
    },
  } : false,
  hsts: isProd ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
  crossOriginEmbedderPolicy: false,
}));

const rawCors = process.env.CORS_ORIGIN?.split(',').map((s) => s.trim()).filter(Boolean) ?? [];
const corsOrigins = Array.from(new Set([
  ...rawCors,
  ...(isProd ? [] : ['http://localhost:5173', 'http://127.0.0.1:5173']),
]));
if (corsOrigins.length > 0) {
  app.use(cors({ origin: corsOrigins, credentials: true }));
}

app.use(express.json({ limit: '4mb' }));
app.use(cookieParser());

// CSRF double-submit on every mutating /api call (login included).
app.use('/api', csrfGuard);
app.use('/api', attachUser);

app.use('/api', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/sessions', sessionsRouter);
app.use('/api/reviews', reviewsRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/skills', skillsRouter);
app.use('/api/resources', resourcesRouter);

app.use('/api', (_req, res) => { res.status(404).json({ error: 'Not found' }); });

// In production, serve the built SPA from dist/.
if (isProd) {
  const dist = path.join(ROOT, 'dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist, { maxAge: '1h', index: false }));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      res.sendFile(path.join(dist, 'index.html'));
    });
  }
}

// Global error handler: full detail to server logs, generic message + correlation id to clients.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const correlationId = randomUUID().slice(0, 8);
  console.error(`[error:${correlationId}]`, req.method, req.path, err);
  try { logAudit(req.user?.id ?? null, 'unhandled_error', req.ip, 'failure', `${correlationId}`); } catch { /* noop */ }
  if (res.headersSent) return;
  res.status(500).json({ error: 'Something went wrong. Please try again.', correlationId });
});

// Touch the DB so a broken file is caught at boot, not at first request.
db.prepare('SELECT 1').get();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[skillswap] listening on 0.0.0.0:${PORT} (${isProd ? 'production' : 'development'})`);
});
