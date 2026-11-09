import { Router } from 'express';
import { z } from 'zod';
import { db, nowIso, uuid, notify } from '../db';
import { logAudit } from '../services/audit';
import { validateBody } from '../middleware/validate';
import { attachUser, requireAuth, clientIp } from '../middleware/auth';
import { checkReviewEligibility } from '../../shared/reviewRules';

export const reviewsRouter = Router();
reviewsRouter.use(attachUser, requireAuth);

const createSchema = z.object({
  sessionId: z.string().uuid(),
  punctuality: z.number().int().min(1).max(5),
  clarity: z.number().int().min(1).max(5),
  engagement: z.number().int().min(1).max(5),
  overall: z.number().int().min(1).max(5),
  text: z.string().trim().max(500).default(''),
}).strict();

reviewsRouter.post('/', validateBody(createSchema), (req, res) => {
  const me = req.user!;
  const b = req.body as z.infer<typeof createSchema>;
  const s = db.prepare('SELECT * FROM sessions WHERE id = ?').get(b.sessionId) as
    { id: string; requester_id: string; recipient_id: string; status: string } | undefined;
  if (!s) { res.status(404).json({ error: 'Session not found' }); return; }

  const revieweeId = s.requester_id === me.id ? s.recipient_id : s.recipient_id === me.id ? s.requester_id : null;
  if (!revieweeId) {
    logAudit(me.id, 'review_denied_not_participant', clientIp(req), 'denied', s.id);
    res.status(403).json({ error: 'Only session participants can review' });
    return;
  }
  const existing = db.prepare('SELECT id FROM reviews WHERE session_id = ? AND reviewer_id = ?')
    .get(s.id, me.id) as { id: string } | undefined;

  const verdict = checkReviewEligibility({
    sessionStatus: s.status,
    requesterId: s.requester_id,
    recipientId: s.recipient_id,
    reviewerId: me.id,
    revieweeId,
    existingReview: !!existing,
  });
  if (!verdict.ok) {
    logAudit(me.id, 'review_rejected', clientIp(req), 'denied', `${s.id}: ${verdict.reason}`);
    res.status(verdict.code).json({ error: verdict.reason });
    return;
  }

  const id = uuid();
  const insert = db.transaction(() => {
    db.prepare(`INSERT INTO reviews (id, session_id, reviewer_id, reviewee_id, punctuality, clarity, engagement, overall, text)
                VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(id, s.id, me.id, revieweeId, b.punctuality, b.clarity, b.engagement, b.overall, b.text);
    // Recalculate the reviewee's public average from scratch (source of truth = reviews table).
    const agg = db.prepare('SELECT AVG(overall) AS avg, COUNT(*) AS n FROM reviews WHERE reviewee_id = ?')
      .get(revieweeId) as { avg: number; n: number };
    db.prepare('UPDATE users SET avg_rating = ?, review_count = ?, updated_at = ? WHERE id = ?')
      .run(Math.round(agg.avg * 10) / 10, agg.n, nowIso(), revieweeId);
  });
  insert();
  notify(revieweeId, 'New review received', `${me.name} left you a ${b.overall}-star review.`, 'review', id);
  logAudit(me.id, 'review_submitted', clientIp(req), 'success', id);
  res.status(201).json({ id, ok: true });
});

reviewsRouter.get('/mine', (req, res) => {
  const rows = db.prepare('SELECT id, session_id FROM reviews WHERE reviewer_id = ?').all(req.user!.id);
  res.json({ reviews: rows });
});

reviewsRouter.get('/', (req, res) => {
  const userId = String(req.query.userId ?? req.user!.id);
  const reviews = db.prepare(`
    SELECT r.id, r.punctuality, r.clarity, r.engagement, r.overall, r.text, r.created_at,
           ru.name AS reviewer_name, ru.username AS reviewer_username, ru.avatar AS reviewer_avatar
    FROM reviews r JOIN users ru ON ru.id = r.reviewer_id
    WHERE r.reviewee_id = ? ORDER BY r.created_at DESC LIMIT 50
  `).all(userId);
  res.json({ reviews });
});
