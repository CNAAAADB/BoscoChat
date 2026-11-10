import express from 'express';
import { requireAuthorization } from '../middleware/authorization.js';
import { ROLES } from '../users/roles.js';
import { probeArchivePdf } from '../documents/s3-read-check.js';

export function createArchiveDiagnosticRouter(authService, { enabled = false, probe = probeArchivePdf } = {}) {
  const router = express.Router();
  // Deliberately absent unless explicitly enabled. Only administrators can probe S3.
  if (!enabled) return router;
  router.get('/s3-check', requireAuthorization(authService, new Set([ROLES.ADMINISTRATOR])), async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const result = await probe(req.query.year);
      return res.json(result);
    } catch (error) {
      if (error.code === 'INVALID_ARCHIVE_YEAR') {
        return res.status(400).json({ error: { code: error.code, message: error.message } });
      }
      // Do not return S3 key names, AWS account details, raw AWS errors or PDF content.
      console.error('Archive S3 check failed', { name: error?.name });
      return res.status(502).json({
        error: { code: 'ARCHIVE_S3_CHECK_FAILED', message: 'No se ha podido comprobar la lectura de S3.' },
      });
    }
  });
  return router;
}
