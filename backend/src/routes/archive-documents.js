import express from 'express';
import { requireAuthorization } from '../middleware/authorization.js';

export function createArchiveDocumentRouter(pool, authService, { pdfViewerEnabled = false, allowedOrigins = [] } = {}) {
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

  if (pdfViewerEnabled) {
    async function servePdf(req, res) {
      const documentId = Number(req.params.documentId);
      if (!Number.isSafeInteger(documentId) || documentId < 1) {
        return res.status(400).json({ error: { code: 'INVALID_DOCUMENT', message: 'Documento inválido.' } });
      }
      try {
        const [rows] = await pool.execute(
          'SELECT s3_key FROM archive_documents WHERE id = ? AND indexed_at IS NOT NULL LIMIT 1',
          [documentId],
        );
        if (!rows.length || !/^originals\/[^/]+\.pdf$/i.test(rows[0].s3_key)) {
          return res.status(404).json({ error: { code: 'DOCUMENT_NOT_FOUND', message: 'Documento no encontrado.' } });
        }
        const { S3Client, HeadObjectCommand, GetObjectCommand } = await import('@aws-sdk/client-s3');
        const client = new S3Client({ region: 'us-east-1', maxAttempts: 2 });
        const bucket = 'boscochat-archivo-pdfs';
        const objectKey = rows[0].s3_key;
        try {
          const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: objectKey }));
          const length = Number(head.ContentLength);
          if (!Number.isSafeInteger(length) || length < 1) throw new Error('Invalid S3 object length');
          const rangeHeader = req.get('range');
          const matched = rangeHeader ? /^bytes=(\d+)-(\d*)$/.exec(rangeHeader) : null;
          let start = 0;
          let end = Math.min(length - 1, 1024 * 1024 - 1);
          if (rangeHeader) {
            if (!matched) return res.status(416).set('Content-Range', `bytes */${length}`).end();
            start = Number(matched[1]);
            end = matched[2] ? Number(matched[2]) : Math.min(length - 1, start + 1024 * 1024 - 1);
            if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= length || end < start || end - start >= 1024 * 1024) {
              return res.status(416).set('Content-Range', `bytes */${length}`).end();
            }
            end = Math.min(end, length - 1);
          }
          const origin = allowedOrigins.filter((value) => /^https?:\/\//.test(value));
          res.removeHeader('X-Frame-Options');
          res.set({
            'Content-Security-Policy': `default-src 'none'; frame-ancestors ${origin.length ? origin.join(' ') : "'none'"}`,
            'Cache-Control': 'private, no-store',
            'Accept-Ranges': 'bytes',
            'Content-Type': 'application/pdf',
            'Content-Disposition': 'inline',
            'Content-Range': `bytes ${start}-${end}/${length}`,
            'Content-Length': String(end - start + 1),
            'X-Content-Type-Options': 'nosniff',
          });
          if (req.method === 'HEAD') return res.status(206).end();
          const response = await client.send(new GetObjectCommand({
            Bucket: bucket, Key: objectKey, Range: `bytes=${start}-${end}`,
          }));
          res.status(206);
          for await (const chunk of response.Body) {
            if (!res.write(chunk)) await new Promise((resolve) => res.once('drain', resolve));
          }
          return res.end();
        } finally { client.destroy(); }
      } catch (error) {
        if (res.headersSent) return res.destroy(error);
        console.error('Protected archive PDF access failed', { name: error?.name });
        return res.status(502).json({ error: { code: 'PDF_ACCESS_FAILED', message: 'No se ha podido abrir el PDF.' } });
      }
    }
    router.get('/:documentId/pdf', authenticated, servePdf);
    router.head('/:documentId/pdf', authenticated, servePdf);
  }
  return router;
}
