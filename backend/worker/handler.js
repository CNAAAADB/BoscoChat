import { createWriteStream } from 'node:fs';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { execFile as callbackExecFile } from 'node:child_process';
import { promisify } from 'node:util';
import mysql from 'mysql2/promise';
import { databaseConfig } from '../src/config/database.js';
import { parseArchiveKey } from '../src/documents/archive-keys.js';
import { safeArchivePdfKey } from '../src/documents/archive-filenames.js';
import { splitExtractedPages } from '../src/documents/extracted-pages.js';
import { objectsFromQueueEvent } from './ingestion-events.js';

const execFile = promisify(callbackExecFile);
const BUCKET = 'boscochat-archivo-pdfs';
const LIMIT_PDF_BYTES = 350 * 1024 * 1024;
const LIMIT_TEXT_BYTES = 150 * 1024 * 1024;

export async function saveDocument(pool, metadata, contentBytes, pages, sourceVersionId) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[deleted]] = await connection.execute(
      'SELECT source_version_id FROM archive_deleted_sources WHERE s3_key = ? FOR UPDATE',
      [metadata.key],
    );
    if (deleted?.source_version_id === sourceVersionId) {
      await connection.rollback();
      return false; // Old S3 version was intentionally deleted.
    }
    await connection.execute(
      `INSERT INTO archive_documents
       (s3_key, publication, publication_year, file_size_bytes, indexed_at)
       VALUES (?, ?, ?, ?, NULL)
       ON DUPLICATE KEY UPDATE publication=VALUES(publication),
       publication_year=VALUES(publication_year),
       file_size_bytes=VALUES(file_size_bytes)`,
      [metadata.key, metadata.publication, metadata.year, contentBytes],
    );
    const [[doc]] = await connection.execute(
      'SELECT id FROM archive_documents WHERE s3_key = ? FOR UPDATE', [metadata.key],
    );
    await connection.execute('DELETE FROM archive_pages WHERE document_id = ?', [doc.id]);
    for (const page of pages) {
      await connection.execute(
        'INSERT INTO archive_pages (document_id, page_number, text_content, text_quality) VALUES (?, ?, ?, ?)',
        [doc.id, page.pageNumber, page.text, page.quality],
      );
    }
    const [[count]] = await connection.execute(
      'SELECT COUNT(*) AS total FROM archive_pages WHERE document_id = ?', [doc.id],
    );
    if (Number(count.total) !== pages.length) throw new Error('Persisted page count mismatch');
    await connection.execute('UPDATE archive_documents SET indexed_at = UTC_TIMESTAMP(3) WHERE id = ?', [doc.id]);
    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function ingestOne({ key, catalog = null, s3, S3GetCommand, S3HeadCommand, pool, pdfinfo = execFile, pdftotext = execFile }) {
  const parsed = parseArchiveKey(key);
  if (safeArchivePdfKey(key?.slice('originals/'.length)) !== key) throw new Error('Unsafe archive PDF key');
  const publication = catalog?.publication;
  const year = catalog?.year;
  if (catalog && (parsed.status === 'recognized' || typeof publication !== 'string'
    || publication.length < 2 || publication.length > 180 || publication.trim() !== publication
    || /[\x00-\x1f]/u.test(publication)
    || !Number.isInteger(year) || year < 1800 || year > 2100)) throw new Error('Invalid manual catalogue');
  const metadata = catalog ? { key, publication: publication.normalize('NFC'), year } : parsed;
  if (parsed.status !== 'recognized' && !catalog) throw new Error('Unsupported archive PDF key');
  const dir = await mkdtemp(join(tmpdir(), 'boscochat-worker-'));
  try {
    const pdfPath = join(dir, 'source.pdf');
    const textPath = join(dir, 'source.txt');
    let head;
    try {
      head = await s3.send(new S3HeadCommand({ Bucket: BUCKET, Key: key }));
    } catch (error) {
      if (error?.name === 'NotFound' || error?.name === 'NoSuchKey' || error?.$metadata?.httpStatusCode === 404) {
        return { year: metadata.year, skipped: 'source_absent' };
      }
      throw error;
    }
    const contentBytes = Number(head.ContentLength);
    const sourceVersionId = head.VersionId;
    if (!Number.isSafeInteger(contentBytes) || contentBytes < 1 || contentBytes > LIMIT_PDF_BYTES) {
      throw new Error('PDF size exceeds processing limits');
    }
    const response = await s3.send(new S3GetCommand({ Bucket: BUCKET, Key: key }));
    if (!response.Body) throw new Error('Missing S3 response body');
    await pipeline(response.Body, createWriteStream(pdfPath, { mode: 0o600 }));
    if ((await stat(pdfPath)).size !== contentBytes) throw new Error('Downloaded object size mismatch');
    const { stdout } = await pdfinfo('pdfinfo', [pdfPath], { timeout: 120000, maxBuffer: 512 * 1024 });
    const match = /^Pages:\s*(\d+)\s*$/m.exec(stdout);
    const expectedPages = match ? Number(match[1]) : 0;
    if (!Number.isSafeInteger(expectedPages) || expectedPages < 1 || expectedPages > 5000) {
      throw new Error('Invalid PDF page count');
    }
    await pdftotext('pdftotext', ['-enc', 'UTF-8', '-layout', pdfPath, textPath], { timeout: 12 * 60 * 1000, maxBuffer: 1024 * 1024 });
    if ((await stat(textPath)).size > LIMIT_TEXT_BYTES) throw new Error('Extracted text exceeds limit');
    const pages = splitExtractedPages(await readFile(textPath, 'utf8'));
    if (pages.length !== expectedPages) throw new Error('Physical PDF pages and extracted page count differ');
    // A queued event may finish after an administrator removes the original.
    // Refuse to publish an index if its S3 source disappeared mid-processing.
    let current;
    try {
      current = await s3.send(new S3HeadCommand({ Bucket: BUCKET, Key: key }));
    } catch (error) {
      if (error?.name === 'NotFound' || error?.name === 'NoSuchKey' || error?.$metadata?.httpStatusCode === 404) {
        return { year: metadata.year, skipped: 'source_removed_during_ingestion' };
      }
      throw error;
    }
    if (!sourceVersionId || current.VersionId !== sourceVersionId) {
      return { year: metadata.year, skipped: 'source_version_changed' };
    }
    const persisted = await saveDocument(pool, metadata, contentBytes, pages, sourceVersionId);
    if (!persisted) return { year: metadata.year, skipped: 'source_version_deleted' };
    return { year: metadata.year, pages: pages.length, needsReview: pages.filter(page => page.quality === 'needs_review').length };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// SQS event source mapping uses batch size 1 and ReportBatchItemFailures.
// Repeated S3 notifications reindex the same object transactionally: no duplicate rows.
export async function handler(event) {
  if (event?.action === 'index-archive-pdf') {
    if (typeof event.key !== 'string' || safeArchivePdfKey(event.key.slice('originals/'.length)) !== event.key) throw new Error('INVALID_MANUAL_INDEX_KEY');
    const { S3Client, GetObjectCommand, HeadObjectCommand } = await import('@aws-sdk/client-s3');
    const s3 = new S3Client({ region: 'us-east-1', maxAttempts: 3 });
    const pool = mysql.createPool(databaseConfig({ ...process.env, DB_CONNECTION_LIMIT: '1' }));
    try {
      return await ingestOne({ key: event.key, catalog: event.catalog ?? null, s3, S3GetCommand: GetObjectCommand, S3HeadCommand: HeadObjectCommand, pool });
    } finally { await pool.end(); s3.destroy(); }
  }
  let pool, s3;
  try {
    const { S3Client, GetObjectCommand, HeadObjectCommand } = await import('@aws-sdk/client-s3');
    s3 = new S3Client({ region: 'us-east-1', maxAttempts: 3 });
    pool = mysql.createPool(databaseConfig({ ...process.env, DB_CONNECTION_LIMIT: '1' }));
    const failures = [];
    for (const record of event.Records ?? []) {
      try {
        const objects = objectsFromQueueEvent({ Records: [record] });
        for (const object of objects) {
          const result = await ingestOne({
            key: object.key, s3, S3GetCommand: GetObjectCommand, S3HeadCommand: HeadObjectCommand, pool,
          });
          console.info('Archive indexed', result);
        }
      } catch (error) {
        console.error('Archive ingestion failed', { name: error.name, message: error.message, messageId: record.messageId });
        failures.push({ itemIdentifier: record.messageId });
      }
    }
    return { batchItemFailures: failures };
  } finally {
    if (pool) await pool.end();
    if (s3) s3.destroy();
  }
}
