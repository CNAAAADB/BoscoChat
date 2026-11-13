import { createWriteStream } from 'node:fs';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { parseArchiveKey } from '../src/documents/archive-keys.js';

const execFile = promisify(execFileCallback);
const BUCKET = 'boscochat-archivo-pdfs';
const MAX_SOURCE_BYTES = 350 * 1024 * 1024;
const MAX_JPEG_BYTES = 3 * 1024 * 1024;

export function validatePreviewRequest(event) {
  const key = event?.key;
  const page = Number(event?.page);
  if (typeof key !== 'string' || parseArchiveKey(key).status !== 'recognized') {
    throw new Error('INVALID_ARCHIVE_KEY');
  }
  if (!Number.isSafeInteger(page) || page < 1 || page > 5000) {
    throw new Error('INVALID_PREVIEW_PAGE');
  }
  return { key, page, year: parseArchiveKey(key).year };
}

function isMissingKey(error) {
  return ['NoSuchKey', 'NotFound', 'NoSuchObject'].includes(error?.name);
}

async function bodyToBuffer(body) {
  const chunks = [];
  let length = 0;
  for await (const chunk of body) {
    length += chunk.length;
    if (length > MAX_JPEG_BYTES) throw new Error('PREVIEW_TOO_LARGE');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function renderPreview(event, { s3, GetObjectCommand, HeadObjectCommand, PutObjectCommand, invoke = execFile }) {
  const { key, page, year } = validatePreviewRequest(event);
  const head = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
  const length = Number(head.ContentLength);
  if (!Number.isSafeInteger(length) || length < 1 || length > MAX_SOURCE_BYTES) {
    throw new Error('SOURCE_PDF_TOO_LARGE');
  }
  const etag = String(head.ETag ?? '').replaceAll('"', '');
  if (!/^[0-9a-f]{32}(?:-\d+)?$/i.test(etag)) throw new Error('INVALID_PDF_ETAG');
  const previewKey = 'previews/' + year + '/' + etag + '/' + page + '.jpg';
  try {
    const cached = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: previewKey }));
    const bytes = await bodyToBuffer(cached.Body);
    return { image: bytes.toString('base64'), mimeType: 'image/jpeg' };
  } catch (error) {
    if (!isMissingKey(error)) throw error;
  }

  const directory = await mkdtemp(join(tmpdir(), 'boscochat-page-'));
  try {
    const source = join(directory, 'source.pdf');
    const output = join(directory, 'page');
    const original = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    if (!original.Body) throw new Error('SOURCE_PDF_EMPTY');
    await pipeline(original.Body, createWriteStream(source, { mode: 0o600 }));
    if ((await stat(source)).size !== length) throw new Error('SOURCE_PDF_SIZE_MISMATCH');
    await invoke('pdftoppm', [
      '-f', String(page), '-l', String(page), '-scale-to', '1400', '-singlefile',
      '-jpeg', '-jpegopt', 'quality=72', source, output,
    ], { timeout: 60000, maxBuffer: 64 * 1024 });
    const bytes = await readFile(output + '.jpg');
    if (!bytes.length || bytes.length > MAX_JPEG_BYTES || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
      throw new Error('INVALID_PAGE_RENDER');
    }
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET, Key: previewKey, Body: bytes, ContentType: 'image/jpeg',
      ServerSideEncryption: 'AES256',
    }));
    return { image: bytes.toString('base64'), mimeType: 'image/jpeg' };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export async function handler(event) {
  const { S3Client, GetObjectCommand, HeadObjectCommand, PutObjectCommand } = await import('@aws-sdk/client-s3');
  const s3 = new S3Client({ region: 'us-east-1', maxAttempts: 2 });
  try {
    return await renderPreview(event, { s3, GetObjectCommand, HeadObjectCommand, PutObjectCommand });
  } catch (error) {
    console.error('Archive page render failed', { name: error?.name, code: String(error?.message ?? '').slice(0, 40) });
    throw error;
  } finally {
    s3.destroy();
  }
}
