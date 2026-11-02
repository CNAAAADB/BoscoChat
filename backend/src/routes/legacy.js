import express from 'express';
import { requireAuthorization } from '../middleware/authorization.js';
import { ROLES } from '../users/roles.js';

function setQuotaHeaders(res, quota) {
  res.set({
    'RateLimit-Limit': String(quota.limit),
    'RateLimit-Remaining': String(quota.remaining),
    'RateLimit-Reset': String(Math.ceil(new Date(quota.resetsAt).getTime() / 1000)),
  });
}

export function createLegacyRouter(pool, authService, usageService, administrationService) {
  const router = express.Router();
  const authenticated = requireAuthorization(authService);
  const documentaryManager = requireAuthorization(authService, new Set([ROLES.ADMINISTRATOR, ROLES.DOCUMENTARY_MANAGER]));
  const administrator = requireAuthorization(authService, new Set([ROLES.ADMINISTRATOR]));

  router.get('/search', authenticated, async (req, res, next) => {
    try {
      const { q } = req.query;
      const quota = await usageService.consume({ user: req.user, type: 'search', parameters: { query: q ?? '' } });
      const [rows] = await pool.execute(
        `SELECT d.title, p.text_content, p.page_number
           FROM pages p JOIN documents d ON p.document_id = d.id
          WHERE p.text_content LIKE ?`,
        [`%${q ?? ''}%`],
      );
      setQuotaHeaders(res, quota);
      res.json(rows);
    } catch (error) {
      next(error);
    }
  });

  router.post('/chat', authenticated, async (req, res, next) => {
    try {
      const message = typeof req.body?.message === 'string' ? req.body.message : '';
      const quota = await usageService.consume({ user: req.user, type: 'chat', parameters: { message } });
      setQuotaHeaders(res, quota);
      res.json({ answer: 'Respuesta simulada de BoscoChat' });
    } catch (error) {
      next(error);
    }
  });

  router.post('/admin/upload-doc', documentaryManager, async (req, res, next) => {
    try {
      const { title, content, page } = req.body;
      const [document] = await pool.execute(
        'INSERT INTO documents (title) VALUES (?) ON DUPLICATE KEY UPDATE title=title',
        [title],
      );
      await pool.execute(
        'INSERT INTO pages (document_id, text_content, page_number) VALUES (?, ?, ?)',
        [document.insertId || 1, content, page],
      );
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  // Compatibility alias retained for the original MVP client. It delegates to
  // the canonical BC-002 service so role validation and self-protection cannot
  // be bypassed through the legacy path.
  router.post('/update-role', administrator, async (req, res, next) => {
    try {
      const user = await administrationService.changeRole(req.user.id, req.body?.userId, req.body?.newRole);
      res.json({ user });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

