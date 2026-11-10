import express from 'express';
import { requireAuthorization } from '../middleware/authorization.js';
import { searchArchivePages } from '../documents/archive-search.js';

export function createArchiveSearchRouter(pool, authService, usageService) {
  const router = express.Router();
  router.get('/search', requireAuthorization(authService), async (req, res, next) => {
    try {
      const q = req.query.q;
      // Validate before consuming quota or querying storage.
      if (typeof q !== 'string') {
        return res.status(400).json({ error: { code: 'INVALID_SEARCH_QUERY', message: 'Indica una consulta válida.' } });
      }
      // Validation is also repeated in the search repository.
      const year = req.query.year;
      // Keep resource usage bounded: authorize and account for the query before SQL search.
      const quota = await usageService.consume({ user: req.user, type: 'search', parameters: { query: q, year: year ?? null } });
      const result = await searchArchivePages(pool, q, { year });
      res.set({
        'RateLimit-Limit': String(quota.limit),
        'RateLimit-Remaining': String(quota.remaining),
        'RateLimit-Reset': String(Math.ceil(new Date(quota.resetsAt).getTime() / 1000)),
        'Cache-Control': 'no-store',
      });
      return res.json({ results: result });
    } catch (error) { return next(error); }
  });
  return router;
}
