import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { attachUser, requireAuth } from '../middleware/auth';
import { validateQuery } from '../middleware/validate';

export const resourcesRouter = Router();
resourcesRouter.use(attachUser, requireAuth);

const query = z.object({
  q: z.string().trim().max(80).default(''),
  category: z.enum(['Tech', 'Arts', 'Languages', 'Business', 'Design', 'All']).default('All'),
}).strict();

resourcesRouter.get('/', validateQuery(query), (_req, res) => {
  const { q, category } = res.locals.query as z.infer<typeof query>;
  const like = `%${q.toLowerCase()}%`;
  const rows = db.prepare(`
    SELECT * FROM resources
    WHERE (? = '' OR lower(title) LIKE ? OR lower(skill) LIKE ? OR lower(provider) LIKE ?)
      AND (? = 'All' OR category = ?)
    ORDER BY category, title
  `).all(q.toLowerCase(), like, like, like, category, category);
  res.json({ resources: rows });
});
