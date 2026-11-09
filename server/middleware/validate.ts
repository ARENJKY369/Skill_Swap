import type { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

/**
 * Strict body validation. Rejects unknown fields (schemas use .strict()),
 * returns a generic 400 with a correlation id. Full details go to the server log.
 */
export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body ?? {});
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const detail = err.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
        console.warn('[validation]', req.path, detail);
        res.status(400).json({ error: 'Invalid request data', issues: err.errors.slice(0, 5).map(e => ({ path: e.path.join('.'), message: e.message })) });
        return;
      }
      next(err);
    }
  };
}

export function validateQuery<T>(schema: ZodSchema<T>) {
  // Express 4 defines req.query as a getter-only property; stash parsed output on res.locals.
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      res.locals.query = schema.parse(req.query ?? {});
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: 'Invalid query parameters' });
        return;
      }
      next(err);
    }
  };
}
