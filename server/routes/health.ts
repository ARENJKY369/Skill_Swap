import { Router } from 'express';
import { db } from '../db';

export const healthRouter = Router();

healthRouter.get('/health', (_req, res) => {
  const started = Date.now();
  let dbConnected = false;
  let dbLatencyMs = -1;
  try {
    db.prepare('SELECT 1').get();
    dbConnected = true;
    dbLatencyMs = Date.now() - started;
  } catch {
    dbConnected = false;
  }
  res.status(dbConnected ? 200 : 503).json({
    status: dbConnected ? 'ok' : 'degraded',
    dbConnected,
    dbLatencyMs,
    uptimeSec: Math.round(process.uptime()),
    version: '2.4.9',
    timestamp: new Date().toISOString(),
  });
});
