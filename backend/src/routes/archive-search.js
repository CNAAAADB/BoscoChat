import express from 'express';
import { searchArchivePages } from '../documents/archive-search.js';

export function createArchiveSearchRouter(pool, { issueMetadataEnabled = false } = {}) {
  const router = express.Router();
  // Public discovery, with no PDF download or direct object keys exposed.
  // Apply WAF/API Gateway rate limits before opening this endpoint to the Internet.
  router.get('/search', async (req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    try {
      const result = await searchArchivePages(pool, req.query.q, { year: req.query.year, mode: req.query.mode, page: req.query.page, pageSize: req.query.pageSize, issueMetadataEnabled });
      // Explicit protocol marker for diagnosing frontend/backend deployment drift.
      res.set('X-BoscoChat-Search-API', 'paginated-v1');
      return res.json(result);
    } catch (error) {
      return next(error);
    }
  });
  router.get('/catalog', async (req, res, next) => {
    const page = Number(req.query.page ?? 1);
    const offset = (page - 1) * 24;
    if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(offset)) {
      return res.status(400).json({ error: { code: 'INVALID_PAGE', message: 'Página inválida.' } });
    }
    try {
      const [rows] = await pool.query(
        `SELECT d.id, d.publication, d.publication_year,
                (SELECT MIN(p.page_number) FROM archive_pages p WHERE p.document_id = d.id) AS first_page
           FROM archive_documents d
          WHERE d.indexed_at IS NOT NULL
          HAVING first_page IS NOT NULL
          ORDER BY d.publication_year DESC, d.publication, d.id
          LIMIT 25 OFFSET ?`, [offset],
      );
      return res.json({ issues: rows.slice(0, 24), has_more: rows.length > 24 });
    } catch (error) {
      return next(error);
    }
  });
  return router;
}
