import express from 'express';
import { requireAuthorization } from '../middleware/authorization.js';

export function createArchiveDocumentRouter(pool, authService) {
  const router = express.Router();
  const authenticated = requireAuthorization(authService);
  router.get('/:documentId/pages/:pageNumber', authenticated, async (req, res, next) => {
    try {
      const id = Number(req.params.documentId);
      const page = Number(req.params.pageNumber);
      if (!Number.isSafeInteger(id) || id < 1 || !Number.isSafeInteger(page) || page < 1) {
        return res.status(400).json({ error: { code: 'INVALID_DOCUMENT_PAGE', message: 'Documento o página inválidos.' } });
      }
      const [rows] = await pool.execute(
        `SELECT d.id, d.publication, d.publication_year, p.page_number, p.text_content
           FROM archive_documents d JOIN archive_pages p ON d.id = p.document_id
          WHERE d.id = ? AND d.indexed_at IS NOT NULL AND p.page_number = ? LIMIT 1`,
        [id, page],
      );
      if (!rows.length) return res.status(404).json({ error: { code: 'PAGE_NOT_FOUND', message: 'No se ha encontrado la página.' } });
      res.set('Cache-Control', 'private, no-store');
      return res.json({ page: rows[0] });
    } catch (error) { return next(error); }
  });
  return router;
}
