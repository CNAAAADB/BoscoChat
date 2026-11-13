import express from 'express';
import { requireAuthorization } from '../middleware/authorization.js';
import { ROLES } from '../users/roles.js';
import { parseArchiveKey } from '../documents/archive-keys.js';
import { safeArchivePdfKey } from '../documents/archive-filenames.js';
import { signedArchiveUpload, signedArchiveDownload, MAX_PDF_BYTES } from '../documents/archive-s3-signing.js';

const BUCKET = 'boscochat-archivo-pdfs';
const REGION = 'us-east-1';
const allowed = new Set([ROLES.DOCUMENTARY_MANAGER]);

function replyError(res, status, code, message) {
  return res.status(status).json({ error: { code, message } });
}
function archiveFileFromYear(year) {
  if (!Number.isSafeInteger(year) || year < 1922 || year > 2100) return null;
  return 'originals/Don Bosco en España_' + year + '.pdf';
}
function isAbsentObject(error) {
  return error?.name === 'NotFound' || error?.name === 'NoSuchKey'
    || error?.$metadata?.httpStatusCode === 404;
}

export function createHistoricalManagementRouter(pool, authService, {
  s3Client = null,
  s3Commands = null,
  signer = { upload: signedArchiveUpload, download: signedArchiveDownload },
} = {}) {
  const router = express.Router();
  router.use(requireAuthorization(authService, allowed));

  async function withS3(fn) {
    if (s3Client) return fn(s3Client, s3Commands ?? await import('@aws-sdk/client-s3'));
    const sdk = await import('@aws-sdk/client-s3');
    const client = new sdk.S3Client({ region: REGION, maxAttempts: 2 });
    try { return await fn(client, sdk); } finally { client.destroy(); }
  }

  router.get('/documents', async (req, res, next) => {
    try {
      const filter = typeof req.query.q === 'string' ? req.query.q.trim().normalize('NFC') : '';
      if (filter.length > 100 || typeof req.query.q === 'object') {
        return replyError(res, 400, 'INVALID_DOCUMENT_FILTER', 'El filtro no es válido.');
      }
      const objects = await withS3(async (client, { ListObjectsV2Command }) => {
        const found = [];
        let token;
        do {
          const page = await client.send(new ListObjectsV2Command({
            Bucket: BUCKET, Prefix: 'originals/', MaxKeys: 1000,
            ...(token ? { ContinuationToken: token } : {}),
          }));
          for (const item of page.Contents ?? []) {
            if (typeof item.Key === 'string' && item.Key.startsWith('originals/')
              && safeArchivePdfKey(item.Key.slice('originals/'.length)) === item.Key && item.Size > 0) found.push(item);
          }
          token = page.IsTruncated ? page.NextContinuationToken : null;
          if (page.IsTruncated && !token) throw new Error('ARCHIVE_LIST_PAGINATION_FAILED');
          if (found.length > 2000) throw new Error('ARCHIVE_LIST_TOO_LARGE');
        } while (token);
        return found;
      });
      const [statusRows] = await pool.execute(
        'SELECT d.s3_key, d.indexed_at, COUNT(p.page_number) AS pages FROM archive_documents d LEFT JOIN archive_pages p ON p.document_id = d.id WHERE d.s3_key LIKE \'originals/%\' GROUP BY d.id',
      );
      const indexed = new Map(statusRows.map((row) => [row.s3_key, row]));
      const query = filter.toLocaleLowerCase('es');
      const documents = objects
        .filter((o) => !query || o.Key.slice('originals/'.length).toLocaleLowerCase('es').includes(query))
        .map((o) => {
          const meta = parseArchiveKey(o.Key);
          const db = indexed.get(o.Key);
          return {
            filename: o.Key.slice('originals/'.length),
            year: meta.status === 'recognized' ? meta.year : null,
            sizeBytes: o.Size,
            lastModified: o.LastModified ? new Date(o.LastModified).toISOString() : null,
            status: db?.indexed_at && Number(db.pages) > 0 ? 'indexed' : meta.status === 'recognized' ? 'pending' : 'stored',
            pages: Number(db?.pages ?? 0),
            indexedAt: db?.indexed_at ? new Date(db.indexed_at).toISOString() : null,
          };
        })
        .sort((a, b) => a.year === null && b.year === null
          ? a.filename.localeCompare(b.filename, 'es')
          : a.year === null ? 1 : b.year === null ? -1 : b.year - a.year);
      res.set('Cache-Control', 'private, no-store');
      return res.json({ documents, total: documents.length });
    } catch (error) { return next(error); }
  });

  router.post('/uploads', async (req, res, next) => {
    const filename = typeof req.body?.filename === 'string' ? req.body.filename.trim().normalize('NFC') : '';
    const bytes = req.body?.sizeBytes;
    const key = safeArchivePdfKey(filename);
    const meta = key ? parseArchiveKey(key) : null;
    if (!key || !Number.isSafeInteger(bytes) || bytes < 1 || bytes > MAX_PDF_BYTES) {
      return replyError(res, 400, 'INVALID_ARCHIVE_UPLOAD', 'Selecciona un PDF con nombre seguro (máximo 350 MB).');
    }
    try {
      const exists = await withS3(async (client, { HeadObjectCommand }) => {
        try {
          await client.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
          return true;
        } catch (error) {
          if (isAbsentObject(error)) return false;
          throw error;
        }
      });
      if (exists) return replyError(res, 409, 'DOCUMENT_ALREADY_EXISTS', 'Ya existe un PDF con ese nombre. No se sobrescriben originales.');
      const upload = signer.upload({ key, fileSize: bytes, now: new Date() });
      res.set('Cache-Control', 'private, no-store');
      return res.status(201).json({ upload, year: meta?.status === 'recognized' ? meta.year : null, filename, willIndexAutomatically: meta?.status === 'recognized' });
    } catch (error) { return next(error); }
  });

  router.get('/documents/download', async (req, res, next) => {
    const filename = typeof req.query.filename === 'string' ? req.query.filename : '';
    const key = safeArchivePdfKey(filename);
    if (!key) return replyError(res, 400, 'INVALID_DOCUMENT_FILENAME', 'Nombre de documento no válido.');
    try {
      const exists = await withS3(async (client, { HeadObjectCommand }) => {
        try {
          await client.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
          return true;
        } catch (error) {
          if (isAbsentObject(error)) return false;
          throw error;
        }
      });
      if (!exists) return replyError(res, 404, 'DOCUMENT_NOT_FOUND', 'Documento no encontrado.');
      res.set('Cache-Control', 'private, no-store');
      return res.json({ download: signer.download({ key, now: new Date() }) });
    } catch (error) { return next(error); }
  });

  router.get('/documents/:year/download', async (req, res, next) => {
    const key = archiveFileFromYear(Number(req.params.year));
    if (!key) return replyError(res, 400, 'INVALID_DOCUMENT_YEAR', 'Año no válido.');
    try {
      const exists = await withS3(async (client, { HeadObjectCommand }) => {
        try {
          await client.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
          return true;
        } catch (error) {
          if (isAbsentObject(error)) return false;
          throw error;
        }
      });
      if (!exists) return replyError(res, 404, 'DOCUMENT_NOT_FOUND', 'Documento no encontrado.');
      const download = signer.download({ key, now: new Date() });
      res.set('Cache-Control', 'private, no-store');
      return res.json({ download });
    } catch (error) { return next(error); }
  });

  return router;
}
