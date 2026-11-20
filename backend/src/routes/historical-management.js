import express from 'express';
import { requireAuthorization } from '../middleware/authorization.js';
import { ROLES } from '../users/roles.js';
import { parseArchiveKey } from '../documents/archive-keys.js';
import { safeArchivePdfKey } from '../documents/archive-filenames.js';
import { signedArchiveUpload, signedArchiveDownload, MAX_PDF_BYTES } from '../documents/archive-s3-signing.js';

const BUCKET = 'boscochat-archivo-pdfs';
const REGION = 'us-east-1';
const allowed = new Set([ROLES.DOCUMENTARY_MANAGER, ROLES.ADMINISTRATOR]);
const fragmentFilename = /^Don Bosco en Espa(?:ñ|n)a_\d{4}_\d{2}(?:-\d{2})?_p\d{4}\.pdf$/iu;

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
  invokeIngestor = null,
  deletionEnabled = false,
  manualIndexEnabled = false,
  unindexEnabled = false,
  fragmentationEnabled = false,
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
        'SELECT d.s3_key, d.publication, d.publication_year, d.indexed_at, COUNT(p.page_number) AS pages FROM archive_documents d LEFT JOIN archive_pages p ON p.document_id = d.id WHERE d.s3_key LIKE \'originals/%\' GROUP BY d.id',
      );
      const indexed = new Map(statusRows.map((row) => [row.s3_key, row]));
      const fragmented = fragmentationEnabled
        ? new Set((await pool.execute("SELECT source_key FROM archive_fragmentation_jobs WHERE status = 'completed'"))[0].map((r) => r.source_key))
        : new Set();
      const query = filter.toLocaleLowerCase('es');
      const documents = objects
        // Incomplete S3 uploads are never published in the archive directory.
        .filter((o) => !fragmentationEnabled || !fragmentFilename.test(o.Key.slice('originals/'.length)) || indexed.has(o.Key))
        .filter((o) => !query || o.Key.slice('originals/'.length).toLocaleLowerCase('es').includes(query))
        .map((o) => {
          const meta = parseArchiveKey(o.Key);
          const db = indexed.get(o.Key);
          return {
            filename: o.Key.slice('originals/'.length),
            year: db?.publication_year ?? (meta.status === 'recognized' ? meta.year : null),
            publication: db?.publication ?? (meta.status === 'recognized' ? meta.publication : null),
            sizeBytes: o.Size,
            lastModified: o.LastModified ? new Date(o.LastModified).toISOString() : null,
            status: fragmented.has(o.Key) ? 'fragmented'
              : db?.indexed_at && Number(db.pages) > 0 ? 'indexed'
                : meta.status === 'recognized' ? 'pending' : 'stored',
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

  // A manual retry enters the same trusted worker as automatic S3 ingestion.
  // This operation is asynchronous: HTTP 202 means accepted, not indexed.
  router.post('/documents/index', (req, res, next) => {
    if (!manualIndexEnabled) return replyError(res, 503, 'INDEXING_NOT_ENABLED', 'La indexación manual todavía no está habilitada.');
    return next();
  }, async (req, res, next) => {
    const filename = req.body?.filename;
    const key = safeArchivePdfKey(filename);
    if (!key) return replyError(res, 400, 'INVALID_DOCUMENT_FILENAME', 'Nombre de documento no válido.');
    const auto = parseArchiveKey(key);
    try {
      const [catalogRows] = await pool.execute(
        'SELECT publication, publication_year, indexed_at FROM archive_documents WHERE s3_key = ?', [key],
      );
      if (catalogRows[0]?.indexed_at) return replyError(res, 409, 'DOCUMENT_ALREADY_INDEXED', 'Este documento ya está indexado.');
      if (fragmentationEnabled) {
        const [completed] = await pool.execute("SELECT id FROM archive_fragmentation_jobs WHERE source_key = ? AND status = 'completed' LIMIT 1", [key]);
        if (completed.length) return replyError(res, 409, 'SOURCE_ALREADY_FRAGMENTED', 'El PDF anual se conserva como respaldo de los números ya publicados.');
      }
      let catalog = null;
      if (auto.status !== 'recognized') {
        const publication = req.body?.publication ?? catalogRows[0]?.publication;
        const year = req.body?.year ?? catalogRows[0]?.publication_year;
        if (typeof publication !== 'string' || publication.trim() !== publication
          || publication.length < 2 || publication.length > 180
          || /[\x00-\x1f]/u.test(publication)
          || !Number.isInteger(Number(year)) || Number(year) < 1800 || Number(year) > 2100) {
          return replyError(res, 400, 'DOCUMENT_CATALOG_REQUIRED', 'Indica una publicación y un año válido (1800–2100) para indexar este PDF.');
        }
        catalog = { publication: publication.normalize('NFC'), year: Number(year) };
      }
      const head = await withS3(async (client, { HeadObjectCommand }) => {
        try { return await client.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key })); }
        catch (error) { if (isAbsentObject(error)) return null; throw error; }
      });
      if (!head) return replyError(res, 404, 'DOCUMENT_NOT_FOUND', 'Documento no encontrado.');
      if (fragmentationEnabled && fragmentFilename.test(filename)) {
        return replyError(res, 409, 'FRAGMENT_MANUAL_INDEX_FORBIDDEN', 'Los números generados deben publicarse conjuntamente, no indexarse manualmente.');
      }
      if (typeof head.VersionId !== 'string' || !head.VersionId || head.VersionId === 'null') return replyError(res, 409, 'ARCHIVE_VERSIONING_REQUIRED', 'No se puede indexar sin comprobar la versión del original.');
      const bytes = Number(head.ContentLength);
      if (!Number.isSafeInteger(bytes) || bytes < 1 || bytes > MAX_PDF_BYTES) {
        return replyError(res, 400, 'INVALID_DOCUMENT_SIZE', 'El PDF supera el tamaño permitido para indexación.');
      }
      // Serialize manual reindex requests across backend instances.
      let connection;
      try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        const [[prior]] = await connection.execute(
          'SELECT requested_at FROM archive_manual_index_requests WHERE s3_key = ? FOR UPDATE', [key],
        );
        if (prior && Date.now() - new Date(prior.requested_at).getTime() < 10 * 60 * 1000) {
          await connection.rollback();
          res.set('Retry-After', '600');
          return replyError(res, 429, 'INDEX_ALREADY_REQUESTED', 'Ya se ha solicitado esta indexación recientemente. Comprueba su estado antes de repetirla.');
        }
        await connection.execute(
          'INSERT INTO admin_audit_logs (actor_user_id, target_user_id, action, outcome, details_json) VALUES (?, NULL, ?, ?, CAST(? AS JSON))',
          [req.user.id, 'archive.index.request', 'accepted', JSON.stringify({ filename, ...(catalog ? { catalog } : {}) })],
        );
        if (invokeIngestor) {
          await invokeIngestor(key, catalog);
        } else {
          const { LambdaClient, InvokeCommand } = await import('@aws-sdk/client-lambda');
          const client = new LambdaClient({ region: REGION, maxAttempts: 2 });
          try {
            const response = await client.send(new InvokeCommand({
              FunctionName: 'boscochat-pdf-ingestor', InvocationType: 'Event',
              Payload: Buffer.from(JSON.stringify({ action: 'index-archive-pdf', key, ...(catalog ? { catalog } : {}) })),
            }));
            if (response.StatusCode !== 202) throw new Error('ARCHIVE_INDEX_INVOCATION_FAILED');
          } finally { client.destroy(); }
        }
        // A manually unindexed PDF is suppressed by its current source VersionId.
        // Clear suppression only after accepting an explicit reindex request.
        await connection.execute('DELETE FROM archive_deleted_sources WHERE s3_key = ? AND source_version_id = ?', [key, head.VersionId]);
        await connection.execute(
          'INSERT INTO archive_manual_index_requests (s3_key, requested_at) VALUES (?, UTC_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE requested_at = UTC_TIMESTAMP(3)',
          [key],
        );
        await connection.commit();
      } catch (error) {
        if (connection) await connection.rollback().catch(() => {});
        throw error;
      } finally {
        if (connection) connection.release();
      }
      res.set('Cache-Control', 'private, no-store');
      return res.status(202).json({ status: 'queued', filename, message: 'Indexación solicitada. El proceso puede tardar varios minutos; actualiza el estado más tarde.' });
    } catch (error) { return next(error); }
  });

  // Remove only the search index, never the private S3 original.
  // A version-specific tombstone stops delayed SQS events from republishing pages.
  router.post('/documents/unindex', (req, res, next) => {
    if (!unindexEnabled) return replyError(res, 503, 'UNINDEX_NOT_ENABLED', 'La desindexación todavía no está habilitada.');
    return next();
  }, async (req, res, next) => {
    const filename = req.body?.filename;
    const key = safeArchivePdfKey(filename);
    if (!key) return replyError(res, 400, 'INVALID_DOCUMENT_FILENAME', 'Nombre de documento no válido.');
    let connection;
    try {
      const head = await withS3(async (client, { HeadObjectCommand }) => {
        try { return await client.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key })); }
        catch (error) { if (isAbsentObject(error)) return null; throw error; }
      });
      if (!head) return replyError(res, 404, 'DOCUMENT_NOT_FOUND', 'No se ha encontrado el PDF original.');
      if (!head.VersionId || head.VersionId === 'null') {
        return replyError(res, 409, 'ARCHIVE_VERSIONING_REQUIRED', 'El PDF no tiene una versión identificable. No es seguro desindexarlo.');
      }
      connection = await pool.getConnection();
      await connection.beginTransaction();
      const [[doc]] = await connection.execute('SELECT id, indexed_at FROM archive_documents WHERE s3_key = ? FOR UPDATE', [key]);
      if (!doc?.indexed_at) {
        await connection.rollback();
        return replyError(res, 409, 'DOCUMENT_NOT_INDEXED', 'El documento ya está fuera del buscador.');
      }
      await connection.execute(
        'INSERT INTO archive_deleted_sources (s3_key, source_version_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE source_version_id = VALUES(source_version_id), deleted_at = UTC_TIMESTAMP(3)',
        [key, head.VersionId],
      );
      await connection.execute('DELETE FROM archive_pages WHERE document_id = ?', [doc.id]);
      await connection.execute('UPDATE archive_documents SET indexed_at = NULL WHERE id = ?', [doc.id]);
      await connection.execute(
        'INSERT INTO admin_audit_logs (actor_user_id, target_user_id, action, outcome, details_json) VALUES (?, NULL, ?, ?, CAST(? AS JSON))',
        [req.user.id, 'archive.document.unindex', 'success', JSON.stringify({ filename, sourceVersionId: head.VersionId })],
      );
      await connection.commit();
      res.set('Cache-Control', 'private, no-store');
      return res.json({ unindexed: true, filename, originalRetained: true });
    } catch (error) {
      if (connection) await connection.rollback().catch(() => {});
      return next(error);
    } finally {
      if (connection) connection.release();
    }
  });

  // Remove the searchable MySQL document (including its CASCADE pages) and
  // hide the current original in versioned private S3. Older S3 versions are
  // retained by bucket versioning for recovery and require separate retention policy.
  router.delete('/documents', (req, res, next) => {
    if (!deletionEnabled) return replyError(res, 503, 'DELETION_NOT_ENABLED', 'La eliminación de documentos todavía no está habilitada.');
    return next();
  }, async (req, res, next) => {
    const filename = req.body?.filename;
    const key = safeArchivePdfKey(filename);
    if (!key) return replyError(res, 400, 'INVALID_DOCUMENT_FILENAME', 'Nombre de documento no válido.');
    let connection;
    try {
      const head = await withS3(async (client, { HeadObjectCommand }) => {
        try { return await client.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key })); }
        catch (error) { if (isAbsentObject(error)) return null; throw error; }
      });
      if (!head) return replyError(res, 404, 'DOCUMENT_NOT_FOUND', 'Documento no encontrado.');
      // A versioned source ID is required to keep a reliable tombstone. It
      // prevents an in-flight worker from restoring a deleted old version.
      if (typeof head.VersionId !== 'string' || !head.VersionId || head.VersionId === 'null' || !head.ETag) {
        return replyError(res, 409, 'ARCHIVE_VERSIONING_REQUIRED', 'No se puede eliminar de forma segura: falta la versión del original.');
      }
      connection = await pool.getConnection();
      await connection.beginTransaction();
      await connection.execute('SELECT id FROM archive_documents WHERE s3_key = ? FOR UPDATE', [key]);
      await connection.execute(
        'INSERT INTO archive_deleted_sources (s3_key, source_version_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE source_version_id = VALUES(source_version_id), deleted_at = UTC_TIMESTAMP(3)',
        [key, head.VersionId],
      );
      await connection.execute(
        'INSERT INTO admin_audit_logs (actor_user_id, target_user_id, action, outcome, details_json) VALUES (?, NULL, ?, ?, CAST(? AS JSON))',
        [req.user.id, 'archive.document.delete', 'success', JSON.stringify({ filename, sourceVersionId: head.VersionId })],
      );
      await withS3(async (client, { DeleteObjectCommand }) => {
        await client.send(new DeleteObjectCommand({
          Bucket: BUCKET, Key: key,
          IfMatch: head.ETag,
        }));
      });
      await connection.execute('DELETE FROM archive_documents WHERE s3_key = ?', [key]);
      await connection.commit();
      res.set('Cache-Control', 'private, no-store');
      return res.json({ deleted: true, filename });
    } catch (error) {
      if (connection) await connection.rollback().catch(() => {});
      if (error?.$metadata?.httpStatusCode === 412) {
        return replyError(res, 409, 'DOCUMENT_CHANGED', 'El documento ha cambiado. Actualiza el directorio antes de eliminarlo.');
      }
      return next(error);
    } finally {
      if (connection) connection.release();
    }
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
