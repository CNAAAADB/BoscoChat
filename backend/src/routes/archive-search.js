import express from 'express';
import { searchArchivePages } from '../documents/archive-search.js';

export function createArchiveSearchRouter(pool) {
  const router = express.Router();
  // Public discovery, with no PDF download or direct object keys exposed.
  // Apply WAF/API Gateway rate limits before opening this endpoint to the Internet.
  router.get('/search', async (req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    try {
      const result = await searchArchivePages(pool, req.query.q, { year: req.query.year });
      return res.json({ results: result });
    } catch (error) {
      return next(error);
    }
  });
  return router;
}
