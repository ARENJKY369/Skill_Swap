import { Router } from 'express';
import { z } from 'zod';
import { db, nowIso, uuid, publicUser, getUserById, type UserRow } from '../db';
import { logAudit } from '../services/audit';
import { validateBody, validateQuery } from '../middleware/validate';
import { attachUser, requireAuth, clientIp } from '../middleware/auth';
import { scoreMatch, type SkillLevel } from '../../shared/matchScore';
import { inviteLimiter } from './auth';

export const usersRouter = Router();

usersRouter.use(attachUser, requireAuth);

const levelsSchema = z.record(z.enum(['low', 'med', 'high'])).default({});

const profilePatchSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  bio: z.string().max(300).optional(),
  major: z.string().trim().max(80).optional(),
  university: z.string().trim().max(120).optional(),
  year: z.enum(['1st year', '2nd year', '3rd year', '4th year', 'Graduate']).optional(),
  teaches: z.array(z.string().trim().min(1).max(60)).max(30).optional(),
  wants: z.array(z.string().trim().min(1).max(60)).max(30).optional(),
  teachLevels: levelsSchema.optional(),
  wantLevels: levelsSchema.optional(),
  clientUpdatedAt: z.string().optional(),
}).strict();

usersRouter.patch('/me', validateBody(profilePatchSchema), (req, res) => {
  const b = req.body as z.infer<typeof profilePatchSchema>;
  const u = getUserById(req.user!.id)!;
  const next = {
    name: b.name ?? u.name,
    bio: b.bio ?? u.bio,
    major: b.major ?? u.major,
    university: b.university ?? u.university,
    year: b.year ?? u.year,
    teaches: b.teaches ? JSON.stringify(b.teaches) : u.teaches,
    wants: b.wants ? JSON.stringify(b.wants) : u.wants,
    teach_levels: b.teachLevels ? JSON.stringify(b.teachLevels) : u.teach_levels,
    want_levels: b.wantLevels ? JSON.stringify(b.wantLevels) : u.want_levels,
  };
  db.prepare(`UPDATE users SET name=?, bio=?, major=?, university=?, year=?, teaches=?, wants=?, teach_levels=?, want_levels=?, updated_at=? WHERE id=?`)
    .run(next.name, next.bio, next.major, next.university, next.year, next.teaches, next.wants, next.teach_levels, next.want_levels, nowIso(), u.id);
  res.json({ user: publicUser(getUserById(u.id)!) });
});

const avatarSchema = z.object({
  dataUrl: z.string().regex(/^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/, 'Unsupported image format').max(2_800_000),
}).strict();

usersRouter.post('/me/avatar', validateBody(avatarSchema), (req, res) => {
  // Client-side resize keeps uploads small; enforce a hard server-side cap too.
  const { dataUrl } = req.body as z.infer<typeof avatarSchema>;
  db.prepare('UPDATE users SET avatar = ?, updated_at = ? WHERE id = ?').run(dataUrl, nowIso(), req.user!.id);
  res.json({ ok: true, avatar: dataUrl });
});

usersRouter.delete('/me/avatar', (req, res) => {
  db.prepare('UPDATE users SET avatar = NULL, updated_at = ? WHERE id = ?').run(nowIso(), req.user!.id);
  res.json({ ok: true });
});

/* ------- Explorer directory ------- */

const explorerQuery = z.object({
  q: z.string().trim().max(80).default(''),
  category: z.enum(['Tech', 'Arts', 'Languages', 'Business', 'Design', 'All']).default('All'),
  limit: z.coerce.number().int().min(1).max(60).default(40),
}).strict();

usersRouter.get('/explorer', validateQuery(explorerQuery), (req, res) => {
  const { q, category, limit } = res.locals.query as z.infer<typeof explorerQuery>;
  const like = `%${q.toLowerCase()}%`;
  const rows = db.prepare(`
    SELECT DISTINCT u.* FROM users u
    WHERE u.id != ? AND u.restricted = 0 AND u.role = 'student'
      AND (? = '' OR lower(u.name) LIKE ? OR lower(u.username) LIKE ? OR lower(u.teaches) LIKE ? OR lower(u.wants) LIKE ?)
      AND (? = 'All' OR EXISTS (
        SELECT 1 FROM skills sk
        WHERE sk.category = ? AND (u.teaches LIKE '%' || sk.name || '%' OR u.wants LIKE '%' || sk.name || '%')
      ))
    ORDER BY u.status = 'online' DESC, u.name COLLATE NOCASE
    LIMIT ?
  `).all(req.user!.id, q.toLowerCase(), like, like, like, like, category, category, limit) as UserRow[];
  res.json({ users: rows.map(publicUser) });
});

usersRouter.get('/me/export', (req, res) => {
  const me = req.user!;
  const sessions = db.prepare('SELECT * FROM sessions WHERE requester_id = ? OR recipient_id = ? ORDER BY start DESC').all(me.id, me.id);
  const reviews = db.prepare('SELECT * FROM reviews WHERE reviewer_id = ? OR reviewee_id = ? ORDER BY created_at DESC').all(me.id, me.id);
  const notifications = db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC').all(me.id);
  const requests = db.prepare('SELECT * FROM connection_requests WHERE from_id = ? OR to_id = ? ORDER BY created_at DESC').all(me.id, me.id);
  logAudit(me.id, 'data_exported', clientIp(req), 'info');
  res.json({
    exportedAt: new Date().toISOString(),
    format: 'skillswap-gdpr-export/v1',
    user: publicUser(me),
    sessions,
    reviews,
    notifications,
    connectionRequests: requests,
  });
});

usersRouter.get('/:id', (req, res) => {
  const u = getUserById(req.params.id);
  if (!u || (u.restricted === 1 && req.user!.role !== 'admin')) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  const reviews = db.prepare(`
    SELECT r.id, r.punctuality, r.clarity, r.engagement, r.overall, r.text, r.created_at,
           ru.name AS reviewer_name, ru.username AS reviewer_username
    FROM reviews r JOIN users ru ON ru.id = r.reviewer_id
    WHERE r.reviewee_id = ? ORDER BY r.created_at DESC LIMIT 20
  `).all(u.id);
  res.json({ user: publicUser(u), reviews });
});

/* ------- Connect requests ------- */

const connectSchema = z.object({
  skill: z.string().trim().max(60).optional(),
  message: z.string().trim().max(280).default(''),
}).strict();

usersRouter.post('/:id/connect', inviteLimiter, validateBody(connectSchema), (req, res) => {
  const target = getUserById(req.params.id);
  if (!target || target.restricted === 1 || target.id === req.user!.id) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  const { skill, message } = req.body as z.infer<typeof connectSchema>;
  const existing = db.prepare('SELECT status FROM connection_requests WHERE from_id = ? AND to_id = ?')
    .get(req.user!.id, target.id) as { status: string } | undefined;
  if (existing) {
    res.status(409).json({ error: existing.status === 'Pending' ? 'Request already pending' : `Request already ${existing.status.toLowerCase()}` });
    return;
  }
  db.prepare('INSERT INTO connection_requests (id, from_id, to_id, skill, message) VALUES (?,?,?,?,?)')
    .run(uuid(), req.user!.id, target.id, skill ?? null, message);
  db.prepare(`INSERT INTO notifications (id, user_id, title, body, kind, ref_id) VALUES (?,?,?,?,?,?)`)
    .run(uuid(), target.id, 'New connection request', `${req.user!.name} wants to connect${skill ? ` over ${skill}` : ''}.`, 'request', req.user!.id);
  logAudit(req.user!.id, 'connection_request_sent', clientIp(req), 'success', target.id);
  res.status(201).json({ ok: true });
});

usersRouter.get('/me/requests/list', (req, res) => {
  const incoming = db.prepare(`
    SELECT cr.*, u.name AS from_name, u.username AS from_username, u.avatar AS from_avatar, u.major AS from_major
    FROM connection_requests cr JOIN users u ON u.id = cr.from_id
    WHERE cr.to_id = ? ORDER BY cr.created_at DESC
  `).all(req.user!.id);
  const outgoing = db.prepare(`
    SELECT cr.*, u.name AS to_name, u.username AS to_username, u.avatar AS to_avatar, u.major AS to_major
    FROM connection_requests cr JOIN users u ON u.id = cr.to_id
    WHERE cr.from_id = ? ORDER BY cr.created_at DESC
  `).all(req.user!.id);
  res.json({ incoming, outgoing });
});

/* ------- Matchmaker ------- */

usersRouter.get('/matches/list', (req, res) => {
  const me = req.user!;
  const myTeaches: string[] = JSON.parse(me.teaches);
  const myWants: string[] = JSON.parse(me.wants);
  const myLevels = JSON.parse(me.teach_levels) as Record<string, SkillLevel>;
  const candidates = db.prepare(
    `SELECT * FROM users WHERE id != ? AND role = 'student' AND restricted = 0`,
  ).all(me.id) as UserRow[];

  const matches = candidates.map((c) => {
    const theirTeaches: string[] = JSON.parse(c.teaches);
    const theirWants: string[] = JSON.parse(c.wants);
    const theirLevels = JSON.parse(c.teach_levels) as Record<string, SkillLevel>;
    const result = scoreMatch({
      myTeaches, myWants, theirTeaches, theirWants,
      myLevels, theirLevels, theirOnline: c.status === 'online',
    });
    const mutual = [...new Set([...result.iCanTeachThem, ...result.theyCanTeachMe])];
    const levelEntries = Object.values(theirLevels);
    const dominant = levelEntries.length === 0 ? 'Med'
      : levelEntries.filter((l) => l === 'high').length >= levelEntries.length / 2 ? 'High'
      : levelEntries.filter((l) => l === 'low').length > levelEntries.length / 2 ? 'Low' : 'Med';
    return {
      user: publicUser(c),
      score: result.score,
      mutualSkills: mutual,
      teachesMe: result.theyCanTeachMe,
      learnFromMe: result.iCanTeachThem,
      skillLevel: dominant,
      bidirectional: result.bidirectional,
    };
  })
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 40);

  res.json({ matches, myTeaches, myWants });
});
