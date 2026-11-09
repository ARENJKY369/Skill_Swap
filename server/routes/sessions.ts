import { Router } from 'express';
import { z } from 'zod';
import { db, nowIso, uuid, getUserById } from '../db';
import { logAudit } from '../services/audit';
import { validateBody } from '../middleware/validate';
import { attachUser, requireAuth, clientIp } from '../middleware/auth';
import { isSafeMeetingUrl, assertTransition, canMarkCompleted, type SessionStatus } from '../../shared/sessionStateMachine';
import { inviteLimiter } from './auth';
import { notify } from '../db';

export const sessionsRouter = Router();
sessionsRouter.use(attachUser, requireAuth);

const createSchema = z.object({
  recipientId: z.string().uuid(),
  skillId: z.string().min(1).max(80),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24h HH:MM'),
  durationMin: z.coerce.number().int().min(15).max(180),
  message: z.string().trim().max(500).default(''),
  meetingUrl: z.string().trim().max(300).optional().refine((v) => !v || isSafeMeetingUrl(v), 'Meeting link must be a valid https URL'),
}).strict();

function sessionWithPartner(row: Record<string, unknown>, meId: string) {
  const partnerId = row.requester_id === meId ? row.recipient_id : row.requester_id;
  const partner = getUserById(partnerId as string);
  return {
    ...row,
    durationMin: row.duration_min,
    partner: partner ? {
      id: partner.id, name: partner.name, username: partner.username,
      avatar: partner.avatar, status: partner.status, major: partner.major,
    } : null,
  };
}

sessionsRouter.get('/', (req, res) => {
  const me = req.user!.id;
  const rows = db.prepare(`
    SELECT s.*, sk.name AS skill_name, sk.category AS skill_category
    FROM sessions s JOIN skills sk ON sk.id = s.skill_id
    WHERE s.requester_id = ? OR s.recipient_id = ?
    ORDER BY s.start DESC
  `).all(me, me) as Record<string, unknown>[];
  res.json({ sessions: rows.map((r) => sessionWithPartner(r, me)) });
});

sessionsRouter.post('/', inviteLimiter, validateBody(createSchema), (req, res) => {
  const b = req.body as z.infer<typeof createSchema>;
  const me = req.user!;
  if (b.recipientId === me.id) { res.status(400).json({ error: 'Cannot schedule with yourself' }); return; }
  const recipient = getUserById(b.recipientId);
  if (!recipient || recipient.restricted === 1) { res.status(404).json({ error: 'User not found' }); return; }
  const skill = db.prepare('SELECT id, name FROM skills WHERE id = ?').get(b.skillId) as { id: string; name: string } | undefined;
  if (!skill) { res.status(400).json({ error: 'Unknown skill' }); return; }

  const startIso = new Date(`${b.date}T${b.time}:00`).toISOString();
  if (Number.isNaN(Date.parse(startIso))) { res.status(400).json({ error: 'Invalid date/time' }); return; }
  if (Date.parse(startIso) < Date.now() - 60_000) { res.status(400).json({ error: 'Cannot schedule in the past' }); return; }
  const endIso = new Date(Date.parse(startIso) + b.durationMin * 60_000).toISOString();

  // Double-booking guard for both participants (JS-side overlap; ISO strings).
  const active = db.prepare(`
    SELECT id, start, duration_min FROM sessions
    WHERE status IN ('Pending','Accepted','Rescheduled')
      AND (requester_id IN (?,?) OR recipient_id IN (?,?))
  `).all(me.id, recipient.id, me.id, recipient.id) as Array<{ id: string; start: string; duration_min: number }>;
  const newStart = Date.parse(startIso);
  const newEnd = newStart + b.durationMin * 60_000;
  const clash = active.find((row) => {
    const st = Date.parse(row.start);
    const en = st + row.duration_min * 60_000;
    return st < newEnd && en > newStart;
  });
  if (clash) { res.status(409).json({ error: 'Time conflict with an existing session' }); return; }

  const id = uuid();
  db.prepare(`INSERT INTO sessions (id, requester_id, recipient_id, skill_id, start, duration_min, status, message, meeting_url)
              VALUES (?,?,?,?,?,?, 'Pending', ?, ?)`)
    .run(id, me.id, recipient.id, skill.id, startIso, b.durationMin, b.message, b.meetingUrl ?? null);
  notify(recipient.id, 'New session invite', `${me.name} proposed "${skill.name}" at ${new Date(startIso).toLocaleString()}.`, 'invite', id);
  logAudit(me.id, 'session_invite_sent', clientIp(req), 'success', id);
  res.status(201).json({ id, ok: true });
});

const actionSchema = z.object({
  action: z.enum(['accept', 'decline', 'reschedule', 'complete', 'cancel']),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  reason: z.string().trim().max(200).optional(),
}).strict();

sessionsRouter.patch('/:id', validateBody(actionSchema), (req, res) => {
  const me = req.user!;
  const b = req.body as z.infer<typeof actionSchema>;
  const s = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
  if (!s) { res.status(404).json({ error: 'Session not found' }); return; }
  const isRequester = s.requester_id === me.id;
  const isRecipient = s.recipient_id === me.id;
  if (!isRequester && !isRecipient) {
    logAudit(me.id, 'session_access_denied', clientIp(req), 'denied', String(s.id));
    res.status(403).json({ error: 'Not a participant of this session' });
    return;
  }
  const otherParty = isRequester ? s.recipient_id : s.requester_id;
  const status = s.status as SessionStatus;

  const transitionTo = (to: SessionStatus) => {
    assertTransition(status, to);
    db.prepare('UPDATE sessions SET status = ?, updated_at = ? WHERE id = ?').run(to, nowIso(), s.id);
  };

  try {
    switch (b.action) {
      case 'accept': {
        if (!isRecipient) { res.status(403).json({ error: 'Only the invitee can accept' }); return; }
        transitionTo('Accepted');
        notify(s.requester_id as string, 'Session accepted', `${me.name} accepted your invite.`, 'invite', String(s.id));
        logAudit(me.id, 'session_accepted', clientIp(req), 'success', String(s.id));
        break;
      }
      case 'decline': {
        transitionTo('Declined');
        notify(otherParty as string, 'Session declined', `${me.name} declined the session.`, 'invite', String(s.id));
        logAudit(me.id, 'session_declined', clientIp(req), 'success', String(s.id));
        break;
      }
      case 'reschedule': {
        if (!b.date || !b.time) { res.status(400).json({ error: 'New date and time are required' }); return; }
        const startIso = new Date(`${b.date}T${b.time}:00`).toISOString();
        if (Number.isNaN(Date.parse(startIso)) || Date.parse(startIso) < Date.now()) {
          res.status(400).json({ error: 'New start must be in the future' });
          return;
        }
        transitionTo('Rescheduled');
        db.prepare('UPDATE sessions SET start = ?, updated_at = ? WHERE id = ?').run(startIso, nowIso(), s.id);
        notify(otherParty as string, 'Session rescheduled', `${me.name} proposed a new time: ${new Date(startIso).toLocaleString()}.`, 'invite', String(s.id));
        logAudit(me.id, 'session_rescheduled', clientIp(req), 'success', String(s.id));
        break;
      }
      case 'complete': {
        const endIso = new Date(Date.parse(s.start as string) + Number(s.duration_min) * 60_000).toISOString();
        if (!canMarkCompleted(status, endIso)) {
          res.status(400).json({ error: 'Session can only be completed after its end time' });
          return;
        }
        const flag = isRequester ? 'completed_by_requester' : 'completed_by_recipient';
        db.prepare(`UPDATE sessions SET ${flag} = 1, updated_at = ? WHERE id = ?`).run(nowIso(), s.id);
        const fresh = db.prepare('SELECT * FROM sessions WHERE id = ?').get(s.id) as Record<string, unknown>;
        const both = Number(fresh.completed_by_requester) === 1 && Number(fresh.completed_by_recipient) === 1;
        if (both) {
          transitionTo('Completed');
          notify(s.requester_id as string, 'Session completed', 'Leave feedback for your partner.', 'review', String(s.id));
          notify(s.recipient_id as string, 'Session completed', 'Leave feedback for your partner.', 'review', String(s.id));
          logAudit(me.id, 'session_completed', clientIp(req), 'success', String(s.id));
        } else {
          notify(otherParty as string, 'Partner marked session complete', `${me.name} marked the session complete. Confirm to finish.`, 'review', String(s.id));
          logAudit(me.id, 'session_completion_confirmed_one_side', clientIp(req), 'info', String(s.id));
        }
        break;
      }
      case 'cancel': {
        transitionTo('Declined');
        notify(otherParty as string, 'Session cancelled', `${me.name} cancelled the session.`, 'invite', String(s.id));
        logAudit(me.id, 'session_cancelled', clientIp(req), 'info', String(s.id));
        break;
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed';
    res.status(400).json({ error: msg });
    return;
  }
  const fresh = db.prepare(`
    SELECT s.*, sk.name AS skill_name, sk.category AS skill_category
    FROM sessions s JOIN skills sk ON sk.id = s.skill_id WHERE s.id = ?
  `).get(s.id) as Record<string, unknown>;
  res.json({ ok: true, session: sessionWithPartner(fresh, me.id) });
});
