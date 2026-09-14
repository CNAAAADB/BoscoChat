import express from 'express';

// These pre-existing MVP placeholders remain available until their owning stories
// (BC-002, BC-003, BC-007 and BC-008) replace them with protected implementations.
function readSessionCookie(header = '') {
  const cookie = header.split(';').find((part) => part.trim().startsWith('boscochat_session='));
  if (!cookie) return null;
  try {
    return decodeURIComponent(cookie.slice(cookie.indexOf('=') + 1).trim());
  } catch {
    return null;
  }
}

function requireSession(authService, roles = null) {
  return async (req, res, next) => {
    try {
      const user = await authService.session(readSessionCookie(req.get('cookie')));
      if (!user) return res.status(401).json({ error: { code: 'AUTHENTICATION_REQUIRED', message: 'Inicia sesión para continuar.' } });
      if (roles && !roles.has(user.role)) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'No tienes permiso para realizar esta acción.' } });
      req.user = user;
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

export function createLegacyRouter(pool, authService) {
  const router = express.Router();
  const authenticated = requireSession(authService);
  const documentaryManager = requireSession(authService, new Set(['admin', 'gestor']));
  const administrator = requireSession(authService, new Set(['admin']));

  router.get('/search', authenticated, async (req, res, next) => {
    try {
      const { q } = req.query;
      if (req.user.id) {
        await pool.execute('UPDATE users SET query_count = query_count + 1 WHERE id = ?', [req.user.id]);
      }
      const [rows] = await pool.execute(
        `SELECT d.title, p.text_content, p.page_number
           FROM pages p JOIN documents d ON p.document_id = d.id
          WHERE p.text_content LIKE ?`,
        [`%${q ?? ''}%`],
      );
      res.json(rows);
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

  router.post('/update-role', administrator, async (req, res, next) => {
    try {
      const { userId, newRole } = req.body;
      await pool.execute('UPDATE users SET role = ? WHERE id = ?', [newRole, userId]);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
