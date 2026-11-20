import express from 'express';
import { randomUUID } from 'node:crypto';
import { requireAuthorization } from '../middleware/authorization.js';
import { ROLES } from '../users/roles.js';
import { safeArchivePdfKey } from '../documents/archive-filenames.js';
import { detectMonthlySegments, validateMonthlySegments } from '../documents/fragmentation.js';

const BUCKET = 'boscochat-archivo-pdfs';
const permitted = new Set([ROLES.DOCUMENTARY_MANAGER, ROLES.ADMINISTRATOR]);
function fail(res, status, code, message) {
  return res.status(status).json({ error: { code, message } });
}
function validId(id) {
  return typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}
function publicJob(row) {
  const raw = typeof row.segments_json === 'string' ? JSON.parse(row.segments_json) : row.segments_json;
  return {
    id: row.id, filename: row.source_key.slice('originals/'.length),
    year: Number(row.publication_year), pageCount: Number(row.page_count),
    status: row.status, segments: raw, errorCode: row.error_code ?? null,
  };
}

export function createFragmentationRouter(pool, authService, {
  enabled = false,
  s3Client = null,
  S3HeadCommand = null,
  invokeFragmenter = null,
} = {}) {
  const router = express.Router();
  router.use(requireAuthorization(authService, permitted));
  router.use((req, res, next) => enabled ? next() : fail(res, 503, 'FRAGMENTATION_DISABLED', 'La fragmentación aún no está habilitada.'));

  async function sourceVersion(key) {
    if (s3Client) {
      const command = S3HeadCommand ?? (await import('@aws-sdk/client-s3')).HeadObjectCommand;
      return s3Client.send(new command({ Bucket: BUCKET, Key: key }));
    }
    const { S3Client, HeadObjectCommand } = await import('@aws-sdk/client-s3');
    const client = new S3Client({ region: 'us-east-1', maxAttempts: 2 });
    try { return await client.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key })); }
    finally { client.destroy(); }
  }
  async function dispatch(jobId) {
    if (invokeFragmenter) return invokeFragmenter(jobId);
    const { LambdaClient, InvokeCommand } = await import('@aws-sdk/client-lambda');
    const client = new LambdaClient({ region: 'us-east-1', maxAttempts: 2 });
    try {
      const response = await client.send(new InvokeCommand({
        FunctionName: process.env.ARCHIVE_FRAGMENTATION_WORKER ?? 'boscochat-pdf-ingestor',
        InvocationType: 'Event',
        Payload: Buffer.from(JSON.stringify({ action: 'fragment-archive-pdf', jobId })),
      }));
      if (response.StatusCode !== 202) throw new Error('FRAGMENTER_DISPATCH_FAILED');
    } finally { client.destroy(); }
  }

  router.post('/documents/fragmentation-scan', async (req, res, next) => {
    const filename = req.body?.filename;
    const key = safeArchivePdfKey(filename);
    if (!key) return fail(res, 400, 'INVALID_DOCUMENT', 'Selecciona un PDF válido del archivo.');
    try {
      const [documents] = await pool.execute(
        'SELECT id, publication, publication_year, indexed_at FROM archive_documents WHERE s3_key = ?',
        [key],
      );
      const doc = documents[0];
      if (!doc?.indexed_at || doc.publication !== 'Don Bosco en España') {
        return fail(res, 409, 'SOURCE_NOT_READY', 'Primero debe indexarse un PDF anual de Don Bosco en España.');
      }
      const [pages] = await pool.execute(
        'SELECT page_number, LEFT(text_content, 2000) AS text_content FROM archive_pages WHERE document_id = ? ORDER BY page_number',
        [doc.id],
      );
      if (!pages.length || pages.length > 5000) return fail(res, 409, 'NO_INDEXED_PAGES', 'No hay páginas indexadas suficientes.');
      const head = await sourceVersion(key);
      if (!head.VersionId || head.VersionId === 'null') return fail(res, 409, 'VERSIONING_REQUIRED', 'El original necesita versionado S3.');
      const proposed = detectMonthlySegments(pages, Number(doc.publication_year));
      const id = randomUUID();
      await pool.execute(
        'INSERT INTO archive_fragmentation_jobs (id, source_key, source_version_id, publication, publication_year, page_count, segments_json, status, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [id, key, head.VersionId, doc.publication, doc.publication_year, pages.length,
          JSON.stringify(proposed), 'proposed', req.user.id],
      ).catch((error) => {
        if (error.code === 'ER_DUP_ENTRY') return null;
        throw error;
      });
      const [jobs] = await pool.execute(
        'SELECT * FROM archive_fragmentation_jobs WHERE source_key = ? AND source_version_id = ? LIMIT 1',
        [key, head.VersionId],
      );
      return res.status(200).json({ job: publicJob(jobs[0]) });
    } catch (error) { return next(error); }
  });

  router.get('/fragmentation-jobs/:id', async (req, res, next) => {
    if (!validId(req.params.id)) return fail(res, 400, 'INVALID_JOB', 'Operación inválida.');
    try {
      const [rows] = await pool.execute('SELECT * FROM archive_fragmentation_jobs WHERE id = ?', [req.params.id]);
      if (!rows.length) return fail(res, 404, 'JOB_NOT_FOUND', 'No se encuentra la operación.');
      return res.json({ job: publicJob(rows[0]) });
    } catch (error) { return next(error); }
  });

  router.put('/fragmentation-jobs/:id/segments', async (req, res, next) => {
    if (!validId(req.params.id)) return fail(res, 400, 'INVALID_JOB', 'Operación inválida.');
    try {
      const [rows] = await pool.execute('SELECT * FROM archive_fragmentation_jobs WHERE id = ?', [req.params.id]);
      if (!rows.length) return fail(res, 404, 'JOB_NOT_FOUND', 'No se encuentra la operación.');
      if (rows[0].status !== 'proposed' && rows[0].status !== 'failed') return fail(res, 409, 'JOB_LOCKED', 'La fragmentación ya está en proceso.');
      let segments;
      try { segments = validateMonthlySegments(req.body?.segments, Number(rows[0].page_count)); }
      catch { return fail(res, 400, 'INVALID_SEGMENTS', 'Revisa meses y páginas: deben cubrir todo el PDF sin solapamientos.'); }
      const [saved] = await pool.execute(
        "UPDATE archive_fragmentation_jobs SET segments_json = ?, status = 'proposed', error_code = NULL WHERE id = ? AND status IN ('proposed', 'failed')",
        [JSON.stringify(segments), req.params.id],
      );
      if (saved.affectedRows !== 1) return fail(res, 409, 'JOB_LOCKED', 'La fragmentación se está procesando.');
      return res.json({ job: { ...publicJob(rows[0]), segments, status: 'proposed' } });
    } catch (error) { return next(error); }
  });

  router.post('/fragmentation-jobs/:id/commit', async (req, res, next) => {
    if (!validId(req.params.id)) return fail(res, 400, 'INVALID_JOB', 'Operación inválida.');
    try {
      const [rows] = await pool.execute('SELECT * FROM archive_fragmentation_jobs WHERE id = ?', [req.params.id]);
      if (!rows.length) return fail(res, 404, 'JOB_NOT_FOUND', 'No se encuentra la operación.');
      const job = rows[0];
      if (job.status !== 'proposed' && job.status !== 'failed') return fail(res, 409, 'JOB_LOCKED', 'El trabajo ya se ha enviado.');
      const segments = typeof job.segments_json === 'string' ? JSON.parse(job.segments_json) : job.segments_json;
      try { validateMonthlySegments(segments, Number(job.page_count)); }
      catch { return fail(res, 409, 'SEGMENTS_NOT_READY', 'Corrige los límites y meses antes de fragmentar.'); }
      const head = await sourceVersion(job.source_key);
      if (head.VersionId !== job.source_version_id) return fail(res, 409, 'SOURCE_CHANGED', 'El PDF original ha cambiado. Vuelve a escanear.');
      const [updated] = await pool.execute(
        "UPDATE archive_fragmentation_jobs SET status = 'queued', error_code = NULL WHERE id = ? AND status IN ('proposed', 'failed')",
        [job.id],
      );
      if (updated.affectedRows !== 1) return fail(res, 409, 'JOB_LOCKED', 'Ya existe un trabajo en curso.');
      try { await dispatch(job.id); }
      catch (error) {
        await pool.execute("UPDATE archive_fragmentation_jobs SET status = 'failed', error_code = 'DISPATCH_FAILED' WHERE id = ? AND status = 'queued'", [job.id]);
        throw error;
      }
      return res.status(202).json({ job: { ...publicJob(job), status: 'queued' } });
    } catch (error) { return next(error); }
  });
  return router;
}
