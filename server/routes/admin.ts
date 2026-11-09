import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { db, nowIso, notify } from '../db.js';
import { logAudit } from '../services/audit.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { attachUser, requireAdmin, clientIp, destroyUserSessions } from '../middleware/auth.js';

export const adminRouter = Router();
adminRouter.use(attachUser, requireAdmin);

adminRouter.get('/stats', (_req, res) => {
  const totalUsers = (db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n;
  const students = (db.prepare(`SELECT COUNT(*) AS n FROM users WHERE role = 'student'`).get() as { n: number }).n;
  const newThisWeek = (db.prepare(`SELECT COUNT(*) AS n FROM users WHERE created_at >= datetime('now', '-7 days')`).get() as { n: number }).n;
  const resolved = (db.prepare(`SELECT COUNT(*) AS n FROM sessions WHERE status IN ('Accepted','Completed','Declined')`).get() as { n: number }).n;
  const successful = (db.prepare(`SELECT COUNT(*) AS n FROM sessions WHERE status IN ('Accepted','Completed')`).get() as { n: number }).n;
  const successfulMatchRate = resolved === 0 ? 0 : Math.round((successful / resolved) * 100);
  const completedSessions = (db.prepare(`SELECT COUNT(*) AS n FROM sessions WHERE status = 'Completed'`).get() as { n: number }).n;
  const reviews = (db.prepare('SELECT COUNT(*) AS n FROM reviews').get() as { n: number }).n;
  res.json({ totalUsers, students, newThisWeek, successfulMatchRate, completedSessions, reviews });
});

const metricsQuery = z.object({ skill: z.string().trim().min(1).max(80).default('Java OOP') }).strict();
adminRouter.get('/metrics', validateQuery(metricsQuery), (_req, res) => {
  const { skill } = res.locals.query as z.infer<typeof metricsQuery>;
  const rows = db.prepare('SELECT day, matches, sessions FROM admin_metrics WHERE skill = ? ORDER BY day ASC').all(skill);
  const skills = db.prepare('SELECT DISTINCT skill FROM admin_metrics ORDER BY skill').all() as { skill: string }[];
  res.json({ skill, points: rows, skills: skills.map((s) => s.skill) });
});

const usersQuery = z.object({
  q: z.string().trim().max(80).default(''),
  page: z.coerce.number().int().min(1).default(1),
}).strict();
adminRouter.get('/users', validateQuery(usersQuery), (_req, res) => {
  const { q, page } = res.locals.query as z.infer<typeof usersQuery>;
  const like = `%${q.toLowerCase()}%`;
  const pageSize = 12;
  const total = (db.prepare(
    `SELECT COUNT(*) AS n FROM users WHERE (? = '' OR lower(name) LIKE ? OR lower(email) LIKE ? OR lower(username) LIKE ?)`,
  ).get(q.toLowerCase(), like, like, like) as { n: number }).n;
  const rows = db.prepare(
    `SELECT id, name, email, username, role, major, university, status, restricted, demo, avg_rating, review_count, created_at
     FROM users
     WHERE (? = '' OR lower(name) LIKE ? OR lower(email) LIKE ? OR lower(username) LIKE ?)
     ORDER BY created_at DESC LIMIT ? OFFSET ?`,
  ).all(q.toLowerCase(), like, like, like, pageSize, (page - 1) * pageSize);
  res.json({ users: rows, total, page, pageSize });
});

const modifySchema = z.object({
  action: z.enum(['setRole', 'restrict', 'unrestrict']),
  role: z.enum(['student', 'admin']).optional(),
  reason: z.string().trim().max(200).optional(),
}).strict().superRefine((v, ctx) => {
  if (v.action === 'setRole' && !v.role) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'role required' });
});

adminRouter.patch('/users/:id', validateBody(modifySchema), (req, res) => {
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id) as { id: string; role: string; restricted: number; name: string } | undefined;
  if (!target) { res.status(404).json({ error: 'User not found' }); return; }
  if (target.id === req.user!.id) { res.status(400).json({ error: 'Cannot modify your own account here' }); return; }
  const { action, role } = req.body as z.infer<typeof modifySchema>;

  if (action === 'setRole') {
    db.prepare('UPDATE users SET role = ?, updated_at = ? WHERE id = ?').run(role, nowIso(), target.id);
    destroyUserSessions(target.id); // rotate sessions on privilege change
    logAudit(req.user!.id, 'privilege_shift', clientIp(req), 'success', `${target.name}: ${target.role} -> ${role}`);
    res.json({ ok: true });
    return;
  }
  if (action === 'restrict') {
    db.prepare('UPDATE users SET restricted = 1, updated_at = ? WHERE id = ?').run(nowIso(), target.id);
    destroyUserSessions(target.id);
    logAudit(req.user!.id, 'account_restricted', clientIp(req), 'success', target.name);
    notify(target.id, 'Account restricted', 'Your account was restricted by an administrator. Contact support for details.', 'moderation');
    res.json({ ok: true });
    return;
  }
  db.prepare('UPDATE users SET restricted = 0, updated_at = ? WHERE id = ?').run(nowIso(), target.id);
  logAudit(req.user!.id, 'account_unrestricted', clientIp(req), 'success', target.name);
  res.json({ ok: true });
});

adminRouter.delete('/users/:id', (req, res) => {
  const target = db.prepare('SELECT id, name, role FROM users WHERE id = ?').get(req.params.id) as { id: string; name: string; role: string } | undefined;
  if (!target) { res.status(404).json({ error: 'User not found' }); return; }
  if (target.id === req.user!.id) { res.status(400).json({ error: 'Cannot delete your own admin account' }); return; }
  const wipe = db.transaction(() => {
    db.prepare('DELETE FROM auth_sessions WHERE user_id = ?').run(target.id);
    db.prepare('DELETE FROM mfa_pending WHERE user_id = ?').run(target.id);
    db.prepare('DELETE FROM email_codes WHERE user_id = ?').run(target.id);
    db.prepare('DELETE FROM notifications WHERE user_id = ?').run(target.id);
    db.prepare('DELETE FROM connection_requests WHERE from_id = ? OR to_id = ?').run(target.id, target.id);
    db.prepare('DELETE FROM reviews WHERE reviewer_id = ? OR reviewee_id = ?').run(target.id, target.id);
    db.prepare('DELETE FROM sessions WHERE requester_id = ? OR recipient_id = ?').run(target.id, target.id);
    db.prepare('DELETE FROM users WHERE id = ?').run(target.id);
  });
  wipe();
  logAudit(req.user!.id, 'account_deleted', clientIp(req), 'success', target.name);
  res.json({ ok: true });
});

const auditQuery = z.object({
  q: z.string().trim().max(80).default(''),
  outcome: z.enum(['all', 'success', 'failure', 'denied', 'info']).default('all'),
  limit: z.coerce.number().int().min(1).max(500).default(150),
}).strict();

adminRouter.get('/audit', validateQuery(auditQuery), (_req, res) => {
  const { q, outcome, limit } = res.locals.query as z.infer<typeof auditQuery>;
  const like = `%${q.toLowerCase()}%`;
  const rows = db.prepare(`
    SELECT a.*, u.name AS actor_name
    FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id
    WHERE (? = 'all' OR a.outcome = ?)
      AND (? = '' OR lower(a.action) LIKE ? OR lower(COALESCE(u.name,'')) LIKE ? OR lower(a.detail) LIKE ? OR lower(COALESCE(a.ip,'')) LIKE ?)
    ORDER BY a.id DESC LIMIT ?
  `).all(outcome, outcome, q.toLowerCase(), like, like, like, like, limit);
  res.json({ entries: rows });
});

/* ------- content moderation: reviews ------- */
adminRouter.get('/reviews', (_req, res) => {
  const rows = db.prepare(`
    SELECT r.id, r.overall, r.text, r.created_at,
           rv.name AS reviewer_name, ve.name AS reviewee_name, r.session_id
    FROM reviews r
    JOIN users rv ON rv.id = r.reviewer_id
    JOIN users ve ON ve.id = r.reviewee_id
    ORDER BY r.created_at DESC LIMIT 100
  `).all();
  res.json({ reviews: rows });
});

adminRouter.delete('/reviews/:id', (req, res) => {
  const review = db.prepare('SELECT * FROM reviews WHERE id = ?').get(req.params.id) as { id: string; reviewee_id: string } | undefined;
  if (!review) { res.status(404).json({ error: 'Review not found' }); return; }
  const wipe = db.transaction(() => {
    db.prepare('DELETE FROM reviews WHERE id = ?').run(review.id);
    const agg = db.prepare('SELECT AVG(overall) AS avg, COUNT(*) AS n FROM reviews WHERE reviewee_id = ?').get(review.reviewee_id) as { avg: number | null; n: number };
    db.prepare('UPDATE users SET avg_rating = ?, review_count = ?, updated_at = ? WHERE id = ?')
      .run(agg.avg ? Math.round(agg.avg * 10) / 10 : 0, agg.n, nowIso(), review.reviewee_id);
  });
  wipe();
  logAudit(req.user!.id, 'review_removed', clientIp(req), 'success', review.id);
  res.json({ ok: true });
});

/* ------- categories: skill catalog management ------- */
const addSkillSchema = z.object({
  name: z.string().trim().min(2).max(60),
  category: z.enum(['Tech', 'Arts', 'Languages', 'Business', 'Design']),
}).strict();

adminRouter.get('/skills', (_req, res) => {
  const rows = db.prepare(`
    SELECT sk.id, sk.name, sk.category,
           (SELECT COUNT(*) FROM users WHERE teaches LIKE '%' || sk.name || '%') AS teach_count
    FROM skills sk ORDER BY sk.category, sk.name
  `).all();
  res.json({ skills: rows });
});

adminRouter.post('/skills', validateBody(addSkillSchema), (req, res) => {
  const { name, category } = req.body as z.infer<typeof addSkillSchema>;
  const exists = db.prepare('SELECT id FROM skills WHERE lower(name) = lower(?)').get(name);
  if (exists) { res.status(409).json({ error: 'Skill already exists' }); return; }
  const id = randomUUID();
  db.prepare('INSERT INTO skills (id, name, category) VALUES (?,?,?)').run(id, name, category);
  logAudit(req.user!.id, 'skill_added', clientIp(req), 'success', `${category}: ${name}`);
  res.status(201).json({ id, ok: true });
});
