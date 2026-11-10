// Run from a trusted worker with AWS CLI, pdftotext (Poppler), IAM access to
// the private bucket, and network access to the private RDS MySQL instance.
// Usage: node scripts/ingest-archive-pdf.js 'originals/Don Bosco en España_1922.pdf'
import { execFile as execFileCallback } from 'node:child_process';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import pool from '../src/db/connection.js';
import { parseArchiveKey } from '../src/documents/archive-keys.js';
import { splitExtractedPages } from '../src/documents/extracted-pages.js';

const run = promisify(execFileCallback);
const BUCKET = 'boscochat-archivo-pdfs';
const MAX_BYTES = 350 * 1024 * 1024;

async function main() {
  const key = process.argv[2];
  const metadata = parseArchiveKey(key);
  if (metadata.status !== 'recognized') throw new Error('Unrecognized archival annual key');
  const dir = await mkdtemp(join(tmpdir(), 'boscochat-'));
  try {
    const pdf = join(dir, 'original.pdf');
    const txt = join(dir, 'pages.txt');
    // Process arguments, never shell interpolation; IAM identity supplies credentials.
    await run('aws', ['s3', 'cp', '--region', 'us-east-1', `s3://${BUCKET}/${key}`, pdf, '--no-progress'],
      { timeout: 20 * 60 * 1000, maxBuffer: 1024 * 1024 });
    const info = await stat(pdf);
    if (info.size < 1 || info.size > MAX_BYTES) throw new Error('PDF exceeds permitted size or is empty');
    await run('pdftotext', ['-enc', 'UTF-8', '-layout', pdf, txt],
      { timeout: 15 * 60 * 1000, maxBuffer: 1024 * 1024 });
    const pages = splitExtractedPages(await readFile(txt, 'utf8'));
    if (pages.every((page) => page.text.length === 0)) throw new Error('No extractable text; OCR required');
    const db = await pool.getConnection();
    try {
      await db.beginTransaction();
      await db.execute(
        `INSERT INTO archive_documents (s3_key, publication, publication_year, file_size_bytes, indexed_at)
         VALUES (?, ?, ?, ?, NULL)
         ON DUPLICATE KEY UPDATE publication=VALUES(publication),
             publication_year=VALUES(publication_year), file_size_bytes=VALUES(file_size_bytes)`,
        [key, metadata.publication, metadata.year, info.size],
      );
      const [[record]] = await db.execute('SELECT id FROM archive_documents WHERE s3_key = ? FOR UPDATE', [key]);
      await db.execute('DELETE FROM archive_pages WHERE document_id = ?', [record.id]);
      for (const page of pages) {
        await db.execute(
          'INSERT INTO archive_pages (document_id, page_number, text_content, text_quality) VALUES (?, ?, ?, ?)',
          [record.id, page.pageNumber, page.text, page.quality],
        );
      }
      await db.execute('UPDATE archive_documents SET indexed_at = UTC_TIMESTAMP(3) WHERE id = ?', [record.id]);
      await db.commit();
      console.log(JSON.stringify({
        year: metadata.year, pages: pages.length,
        reviewPages: pages.filter((page) => page.quality === 'needs_review').length,
        sizeBytes: info.size,
      }));
    } catch (error) {
      await db.rollback();
      throw error;
    } finally { db.release(); }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

try { await main(); } catch (error) {
  console.error('PDF ingestion failed:', error.message);
  process.exitCode = 1;
} finally { await pool.end(); }
