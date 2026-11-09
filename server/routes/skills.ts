import { Router } from 'express';
import { db } from '../db';
import { attachUser, requireAuth } from '../middleware/auth';
import { validateQuery } from '../middleware/validate';
import { z } from 'zod';

export const skillsRouter = Router();
skillsRouter.use(attachUser, requireAuth);

const query = z.object({ q: z.string().trim().max(60).default('') }).strict();

skillsRouter.get('/', validateQuery(query), (_req, res) => {
  const { q } = res.locals.query as z.infer<typeof query>;
  const like = `%${q.toLowerCase()}%`;
  const rows = db.prepare(
    `SELECT id, name, category FROM skills WHERE (? = '' OR lower(name) LIKE ?) ORDER BY category, name`,
  ).all(q.toLowerCase(), like);
  res.json({ skills: rows });
});
