import express from 'express';
import { randomUUID } from 'node:crypto';
import { requireAuthorization } from '../middleware/authorization.js';
import { ROLES } from '../users/roles.js';
import { signedTiffZipUpload, MAX_TIFF_ZIP_BYTES } from '../documents/archive-s3-signing.js';

const BUCKET = 'boscochat-archivo-pdfs';
const REGION = 'us-east-1';
const allowed = new Set([ROLES.DOCUMENTARY_MANAGER, ROLES.ADMINISTRATOR]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function safeTiffZipFilename(value) {
  if (typeof value !== 'string') return null;
  const name = value.normalize('NFC');
  if (!/^[\p{L}\p{N}][\p{L}\p{N} ._()-]{0,155}\.zip$/iu.test(name)
    || name.includes('..') || name.trim() !== name) return null;
  return name;
}

export function tiffImportKey(jobId, filename) {
  return UUID.test(jobId) && safeTiffZipFilename(filename)
    ? 'imports/tiff/' + jobId + '/' + filename : null;
}

function respondError(res, status, code, message) {
  return res.status(status).json({ error: { code, message } });
}
function missing(error) {
  return error?.name === 'NotFound' || error?.name === 'NoSuchKey'
    || error?.$metadata?.httpStatusCode === 404;
}

async function readJsonBody(body, maxBytes = 6 * 1024 * 1024) {
  if (!body) throw new Error('EMPTY_IMPORT_RESULT');
  if (typeof body.transformToByteArray === 'function') {
    const bytes = await body.transformToByteArray();
    if (bytes.length > maxBytes) throw new Error('IMPORT_RESULT_TOO_LARGE');
    return JSON.parse(Buffer.from(bytes).toString('utf8'));
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of body) {
    size += chunk.length;
    if (size > maxBytes) throw new Error('IMPORT_RESULT_TOO_LARGE');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export function createTiffImportRouter(pool, authService, {
  s3Client = null, s3Commands = null,
  signUpload = signedTiffZipUpload,
  invokeOcr = null,
} = {}) {
  const router = express.Router();
  router.use(requireAuthorization(authService, allowed));

  async function withS3(fn) {
    if (s3Client) return fn(s3Client, s3Commands ?? await import('@aws-sdk/client-s3'));
    const sdk = await import('@aws-sdk/client-s3');
    const client = new sdk.S3Client({ region: REGION, maxAttempts: 2 });
    try { return await fn(client, sdk); }
    finally { client.destroy(); }
  }

  router.post('/uploads', async (req, res, next) => {
    const filename = safeTiffZipFilename(req.body?.filename);
    const sizeBytes = req.body?.sizeBytes;
    if (!filename || !Number.isSafeInteger(sizeBytes) || sizeBytes < 1
      || sizeBytes > MAX_TIFF_ZIP_BYTES) {
      return respondError(res, 400, 'INVALID_TIFF_ZIP_UPLOAD',
        'Selecciona un ZIP de TIFF de hasta 100 MB, con nombre seguro.');
    }
    try {
      const jobId = randomUUID();
      const key = tiffImportKey(jobId, filename);
      const upload = signUpload({ key, fileSize: sizeBytes, now: new Date() });
      res.set('Cache-Control', 'private, no-store');
      return res.status(201).json({
        jobId, upload, maxPages: 40, maxTiffBytes: 9 * 1024 * 1024,
        message: 'Los TIFF deben estar numerados y en orden (0001.tif, 0002.tif, etc.).',
      });
    } catch (error) { return next(error); }
  });

  router.post('/submit', async (req, res, next) => {
    const jobId = req.body?.jobId;
    const filename = safeTiffZipFilename(req.body?.filename);
    const key = tiffImportKey(jobId, filename);
    if (!key) return respondError(res, 400, 'INVALID_TIFF_IMPORT', 'Solicitud de OCR no válida.');
    const markerKey = 'imports/jobs/' + jobId + '.json';
    try {
      const result = await withS3(async (client, {
        HeadObjectCommand, PutObjectCommand, DeleteObjectCommand,
      }) => {
        let head;
        try { head = await client.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key })); }
        catch (error) {
          if (missing(error)) return { error: 'UPLOAD_NOT_FOUND' };
          throw error;
        }
        const bytes = Number(head.ContentLength);
        if (!Number.isSafeInteger(bytes) || bytes < 1 || bytes > MAX_TIFF_ZIP_BYTES
          || typeof head.VersionId !== 'string' || !head.VersionId || head.VersionId === 'null'
          || head.ContentType !== 'application/zip') return { error: 'INVALID_UPLOADED_ZIP' };

        const marker = { jobId, filename, key, sourceVersionId: head.VersionId,
          createdBy: req.user.id, createdAt: new Date().toISOString(),
          state: 'queued', publishable: false };
        try {
          await client.send(new PutObjectCommand({
            Bucket: BUCKET, Key: markerKey, Body: JSON.stringify(marker),
            ContentType: 'application/json', ServerSideEncryption: 'AES256',
            IfNoneMatch: '*',
          }));
        } catch (error) {
          if (error?.$metadata?.httpStatusCode === 412
            || error?.$metadata?.httpStatusCode === 409) return { error: 'ALREADY_SUBMITTED' };
          throw error;
        }
        try {
          await pool.execute(
            'INSERT INTO admin_audit_logs (actor_user_id, target_user_id, action, outcome, details_json) VALUES (?, NULL, ?, ?, CAST(? AS JSON))',
            [req.user.id, 'archive.tiff.ocr.request', 'accepted',
              JSON.stringify({ jobId, filename, sourceVersionId: head.VersionId })],
          );
          if (invokeOcr) {
            await invokeOcr({ jobId, key, sourceVersionId: head.VersionId });
          } else {
            const { LambdaClient, InvokeCommand } = await import('@aws-sdk/client-lambda');
            const lambda = new LambdaClient({ region: REGION, maxAttempts: 2 });
            try {
              const response = await lambda.send(new InvokeCommand({
                FunctionName: 'boscochat-pdf-ingestor', InvocationType: 'Event',
                Payload: Buffer.from(JSON.stringify({
                  action: 'ocr-tiff-zip', jobId, key, sourceVersionId: head.VersionId,
                })),
              }));
              if (response.StatusCode !== 202) throw new Error('TIFF_OCR_DISPATCH_FAILED');
            } finally { lambda.destroy(); }
          }
        } catch (error) {
          // Roll back the marker on submission failures to permit safe retry.
          await client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: markerKey }))
            .catch(() => {});
          throw error;
        }
        return { status: 'queued' };
      });
      if (result.error === 'UPLOAD_NOT_FOUND') {
        return respondError(res, 404, 'TIFF_ZIP_NOT_FOUND', 'El ZIP aún no está almacenado.');
      }
      if (result.error === 'INVALID_UPLOADED_ZIP') {
        return respondError(res, 400, 'INVALID_UPLOADED_ZIP', 'El ZIP no tiene la versión, formato o tamaño esperado.');
      }
      if (result.error === 'ALREADY_SUBMITTED') {
        return respondError(res, 409, 'TIFF_IMPORT_ALREADY_SUBMITTED', 'Este lote ya tiene una solicitud de OCR.');
      }
      res.set('Cache-Control', 'private, no-store');
      return res.status(202).json({ jobId, status: 'queued',
        message: 'OCR solicitado. El archivo original se conserva y la publicación exige revisión.' });
    } catch (error) { return next(error); }
  });

  router.get('/:jobId', async (req, res, next) => {
    const jobId = req.params.jobId;
    if (!UUID.test(jobId)) return respondError(res, 400, 'INVALID_TIFF_JOB_ID', 'Trabajo no válido.');
    try {
      const data = await withS3(async (client, { GetObjectCommand }) => {
        async function get(key) {
          try {
            const response = await client.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
            return await readJsonBody(response.Body);
          } catch (error) {
            if (missing(error)) return null;
            throw error;
          }
        }
        const marker = await get('imports/jobs/' + jobId + '.json');
        if (!marker || marker.jobId !== jobId) return null;
        const review = await get('imports/reviews/' + jobId + '.json');
        if (review && review.jobId !== jobId) throw new Error('INVALID_TIFF_REVIEW');
        return {
          jobId, filename: marker.filename, status: review?.status ?? 'queued',
          pageCount: review?.pageCount ?? null,
          engine: review?.engine ?? null,
          publicationAllowed: false,
          notes: review?.notes ?? null,
          errorCode: review?.errorCode ?? null,
          pages: (review?.pages ?? []).map(p => ({
            pageNumber: p.pageNumber, sourceFilename: p.sourceFilename,
            confidence: p.confidence, needsReview: p.needsReview,
            textPreview: String(p.ocrText ?? '').slice(0, 450),
          })),
        };
      });
      if (!data) return respondError(res, 404, 'TIFF_JOB_NOT_FOUND', 'Trabajo no encontrado.');
      res.set('Cache-Control', 'private, no-store');
      return res.json(data);
    } catch (error) { return next(error); }
  });
  return router;
}
