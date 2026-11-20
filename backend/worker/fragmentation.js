// BC-105: generate real issue PDFs, then replace annual search visibility in one DB transaction.
// The original object is NEVER deleted. Intended for private VPC worker with qpdf installed.
import { createWriteStream } from 'node:fs';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { monthlyFragmentFilename, validateMonthlySegments } from '../src/documents/fragmentation.js';

const execFile = promisify(execFileCallback);
const BUCKET = 'boscochat-archivo-pdfs';
function errorCode(error) {
  if (error?.code === 'SOURCE_CHANGED' || error?.message === 'SOURCE_CHANGED') return 'SOURCE_CHANGED';
  if (error?.code === 'ER_DUP_ENTRY') return 'ISSUE_ALREADY_EXISTS';
  return 'PROCESSING_FAILED';
}
function decodedSegments(job) {
  const value = typeof job.segments_json === 'string' ? JSON.parse(job.segments_json) : job.segments_json;
  return validateMonthlySegments(value, Number(job.page_count));
}
async function assertSource(s3, HeadObjectCommand, job) {
  const head = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: job.source_key }));
  if (head.VersionId !== job.source_version_id) {
    const error = new Error('SOURCE_CHANGED');
    error.code = 'SOURCE_CHANGED';
    throw error;
  }
  if (!Number.isSafeInteger(Number(head.ContentLength)) || Number(head.ContentLength) > 350 * 1024 * 1024) {
    throw new Error('INVALID_SOURCE_SIZE');
  }
}
async function buildOutputs(job, segments, { s3, GetObjectCommand, HeadObjectCommand, PutObjectCommand, pdfRun }) {
  const dir = await mkdtemp(join(tmpdir(), 'boscochat-fragment-'));
  try {
    const source = join(dir, 'source.pdf');
    const downloaded = await s3.send(new GetObjectCommand({
      Bucket: BUCKET, Key: job.source_key, VersionId: job.source_version_id,
    }));
    if (!downloaded.Body) throw new Error('SOURCE_BODY_MISSING');
    await pipeline(downloaded.Body, createWriteStream(source, { mode: 0o600 }));
    const length = (await stat(source)).size;
    if (length < 1 || length > 350 * 1024 * 1024) throw new Error('SOURCE_TOO_LARGE');
    const { stdout: info } = await pdfRun('pdfinfo', [source], { timeout: 120000, maxBuffer: 512000 });
    const physical = /^Pages:\s*(\d+)\s*$/m.exec(info);
    if (!physical || Number(physical[1]) !== Number(job.page_count)) throw new Error('PAGE_COUNT_CHANGED');
    const outputs = [];
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const filename = monthlyFragmentFilename(Number(job.publication_year), segment);
      const key = 'originals/' + filename;
      const target = join(dir, 'segment-' + i + '.pdf');
      // qpdf accepts a single inclusive range; no shell is used.
      await pdfRun('qpdf', ['--empty', '--pages', source, segment.startPage + '-' + segment.endPage,
        '--', target], { timeout: 180000, maxBuffer: 512000 });
      const { stdout: segmentInfo } = await pdfRun('pdfinfo', [target], { timeout: 120000, maxBuffer: 512000 });
      const match = /^Pages:\s*(\d+)\s*$/m.exec(segmentInfo);
      if (!match || Number(match[1]) !== segment.endPage - segment.startPage + 1) {
        throw new Error('FRAGMENT_PAGE_MISMATCH');
      }
      const bytes = await readFile(target);
      if (bytes.length < 1 || bytes.length > 350 * 1024 * 1024) throw new Error('FRAGMENT_SIZE_INVALID');
      // Never overwrite an existing archive file.
      await s3.send(new PutObjectCommand({
        Bucket: BUCKET, Key: key, Body: bytes, ContentType: 'application/pdf',
        ServerSideEncryption: 'AES256', IfNoneMatch: '*',
        Metadata: { 'fragment-job': job.id, 'source-version': job.source_version_id,
          'page-start': String(segment.startPage), 'page-end': String(segment.endPage) },
      }));
      outputs.push({ key, bytes: bytes.length, ...segment });
    }
    return outputs;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function activate(pool, job, outputs, segments) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[locked]] = await connection.execute(
      'SELECT status, source_version_id FROM archive_fragmentation_jobs WHERE id = ? FOR UPDATE', [job.id],
    );
    if (locked?.status !== 'processing' || locked.source_version_id !== job.source_version_id) throw new Error('JOB_NOT_PROCESSING');
    const [[annual]] = await connection.execute(
      'SELECT id, indexed_at FROM archive_documents WHERE s3_key = ? FOR UPDATE', [job.source_key],
    );
    if (!annual?.indexed_at) throw new Error('SOURCE_NOT_INDEXED');
    const [sourcePages] = await connection.execute(
      'SELECT page_number, text_content, text_quality FROM archive_pages WHERE document_id = ? ORDER BY page_number',
      [annual.id],
    );
    if (sourcePages.length !== Number(job.page_count) || outputs.length !== segments.length) throw new Error('SOURCE_PAGES_CHANGED');
    // All children are prepared but kept outside search until a single commit.
    for (const output of outputs) {
      await connection.execute(
        'INSERT INTO archive_documents (s3_key, publication, publication_year, file_size_bytes, indexed_at) VALUES (?, ?, ?, ?, NULL)',
        [output.key, job.publication, job.publication_year, output.bytes],
      );
      const [[child]] = await connection.execute('SELECT id FROM archive_documents WHERE s3_key = ? FOR UPDATE', [output.key]);
      for (let page = output.startPage; page <= output.endPage; page++) {
        const sourcePage = sourcePages[page - 1];
        if (Number(sourcePage.page_number) !== page) throw new Error('SOURCE_PAGE_GAP');
        await connection.execute(
          'INSERT INTO archive_pages (document_id, page_number, text_content, text_quality) VALUES (?, ?, ?, ?)',
          [child.id, page - output.startPage + 1, sourcePage.text_content, sourcePage.text_quality],
        );
      }
      await connection.execute(
        'INSERT INTO archive_fragmentation_issues (job_id, document_id, parent_s3_key, source_page_start, source_page_end, month_start, month_end, issue_number) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [job.id, child.id, job.source_key, output.startPage, output.endPage,
          output.monthStart, output.monthEnd, output.issueNumber || null],
      );
    }
    await connection.execute(
      'INSERT INTO archive_deleted_sources (s3_key, source_version_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE source_version_id = VALUES(source_version_id), deleted_at = UTC_TIMESTAMP(3)',
      [job.source_key, job.source_version_id],
    );
    await connection.execute('UPDATE archive_documents SET indexed_at = UTC_TIMESTAMP(3) WHERE id IN (SELECT document_id FROM archive_fragmentation_issues WHERE job_id = ?)', [job.id]);
    await connection.execute('DELETE FROM archive_pages WHERE document_id = ?', [annual.id]);
    await connection.execute('UPDATE archive_documents SET indexed_at = NULL WHERE id = ?', [annual.id]);
    await connection.execute("UPDATE archive_fragmentation_jobs SET status = 'completed', error_code = NULL WHERE id = ?", [job.id]);
    await connection.execute(
      'INSERT INTO admin_audit_logs (actor_user_id, target_user_id, action, outcome, details_json) VALUES (?, NULL, ?, ?, CAST(? AS JSON))',
      [job.created_by, 'archive.fragmentation.commit', 'success',
        JSON.stringify({ jobId: job.id, sourceKey: job.source_key, generated: outputs.length })],
    );
    await connection.commit();
    return { status: 'completed', fragments: outputs.length };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
}

export async function processFragmentation(jobId, { pool, s3, GetObjectCommand, HeadObjectCommand,
  PutObjectCommand, pdfRun = execFile }) {
  if (typeof jobId !== 'string' || !/^[0-9a-f-]{36}$/i.test(jobId)) throw new Error('INVALID_JOB_ID');
  const [updated] = await pool.execute(
    "UPDATE archive_fragmentation_jobs SET status = 'processing' WHERE id = ? AND status = 'queued'", [jobId],
  );
  if (updated.affectedRows !== 1) return { status: 'not_queued' };
  try {
    const [rows] = await pool.execute('SELECT * FROM archive_fragmentation_jobs WHERE id = ?', [jobId]);
    if (!rows.length) throw new Error('JOB_NOT_FOUND');
    const job = rows[0];
    const segments = decodedSegments(job);
    await assertSource(s3, HeadObjectCommand, job);
    const outputs = await buildOutputs(job, segments, { s3, GetObjectCommand, HeadObjectCommand, PutObjectCommand, pdfRun });
    await assertSource(s3, HeadObjectCommand, job);
    return await activate(pool, job, outputs, segments);
  } catch (error) {
    await pool.execute(
      "UPDATE archive_fragmentation_jobs SET status = 'failed', error_code = ? WHERE id = ? AND status = 'processing'",
      [errorCode(error), jobId],
    );
    throw error;
  }
}
