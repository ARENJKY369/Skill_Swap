import { db, nowIso } from '../db';

export type AuditOutcome = 'success' | 'failure' | 'denied' | 'info';

export function logAudit(
  actorId: string | null,
  action: string,
  ip: string | null | undefined,
  outcome: AuditOutcome,
  detail = '',
) {
  try {
    db.prepare('INSERT INTO audit_log (ts, actor_id, action, ip, outcome, detail) VALUES (?,?,?,?,?,?)')
      .run(nowIso(), actorId, action, ip ?? 'unknown', outcome, detail.slice(0, 500));
  } catch (err) {
    // Auditing must never take the app down; fall back to stderr.
    console.error('[audit-failure]', action, err);
  }
}
