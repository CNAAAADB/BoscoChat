// Queue recognized annual and monthly PDFs. Dry-run by default.
// Usage: node scripts/queue-archive-backfill.js <sqs-queue-url> [--send]
// Run from a trusted AWS shell WITH SQS connectivity; VPC CloudShell may lack it.
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { parseArchiveKey } from '../src/documents/archive-keys.js';

const run = promisify(execFileCb);
const [queueUrl, mode] = process.argv.slice(2);
if (!queueUrl?.startsWith('https://sqs.us-east-1.amazonaws.com/')) {
  throw new Error('Pass the SQS queue URL from the CloudFormation stack');
}
if (mode && mode !== '--send') throw new Error('Only --send is supported');

const { stdout } = await run('aws', [
  's3api', 'list-objects-v2', '--region', 'us-east-1',
  '--bucket', 'boscochat-archivo-pdfs', '--prefix', 'originals/',
  '--query', 'Contents[].{Key:Key,Size:Size}', '--output', 'json',
], { maxBuffer: 8 * 1024 * 1024, timeout: 120000 });
const objects = JSON.parse(stdout ?? '[]') ?? [];
const eligible = objects.filter(item =>
  parseArchiveKey(item.Key).status === 'recognized' &&
  Number.isSafeInteger(item.Size) && item.Size > 0 && item.Size <= 350 * 1024 * 1024,
);
console.log(`Recognized archive PDFs eligible: ${eligible.length}; mode: ${mode === '--send' ? 'SEND' : 'DRY RUN'}`);
if (mode !== '--send') process.exit(0);
for (const { Key, Size } of eligible) {
  const message = {
    id: `backfill-${createHash('sha256').update(Key).digest('hex').slice(0,20)}`,
    source: 'aws.s3',
    'detail-type': 'Object Created',
    detail: {
      bucket: { name: 'boscochat-archivo-pdfs' },
      object: { key: Key, size: Size },
    },
  };
  await run('aws', ['sqs', 'send-message', '--region', 'us-east-1',
    '--queue-url', queueUrl, '--message-body', JSON.stringify(message)],
  { maxBuffer: 1024 * 1024, timeout: 30000 });
  console.info('Queued:', Key);
}
