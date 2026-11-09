import { Router } from 'express';
import { db } from '../db';
import { attachUser, requireAuth } from '../middleware/auth';

export const notificationsRouter = Router();
notificationsRouter.use(attachUser, requireAuth);

notificationsRouter.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50')
    .all(req.user!.id);
  const unread = db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read = 0')
    .get(req.user!.id) as { n: number };
  res.json({ notifications: rows, unread: unread.n });
});

notificationsRouter.post('/:id/read', (req, res) => {
  db.prepare('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?').run(req.params.id, req.user!.id);
  res.json({ ok: true });
});

notificationsRouter.post('/read-all', (req, res) => {
  db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ?').run(req.user!.id);
  res.json({ ok: true });
});
