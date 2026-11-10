const BUCKET = 'boscochat-archivo-pdfs';
const { yearPattern } = { yearPattern: /^(19[2-9][0-9]|20[0-9]{2}|2100)$/ };

export function archivePdfKey(year) {
  if (typeof year !== 'string' || !yearPattern.test(year) || Number(year) < 1922) {
    const error = new Error('El año debe estar entre 1922 y 2100.');
    error.status = 400;
    error.code = 'INVALID_ARCHIVE_YEAR';
    throw error;
  }
  return `originals/Don Bosco en España_${year}.pdf`;
}

export async function checkPdfHeader({ s3, commandFactory, year }) {
  const key = archivePdfKey(year);
  const response = await s3.send(commandFactory({ Bucket: BUCKET, Key: key, Range: 'bytes=0-4' }));
  const chunks = [];
  let total = 0;
  try {
    for await (const chunk of response.Body ?? []) {
      total += chunk.length;
      if (total > 5) throw new Error('Unexpected S3 response size');
      chunks.push(Buffer.from(chunk));
    }
  } finally {
    if (typeof response.Body?.destroy === 'function') response.Body.destroy();
  }
  const validPdf = Buffer.concat(chunks).equals(Buffer.from('%PDF-'));
  return { readable: true, validPdfHeader: validPdf, year: Number(year) };
}

export async function probeArchivePdf(year) {
  // AWS Lambda Node.js 22 runtime includes the AWS SDK v3. It is dynamically loaded
  // to keep offline tests independent of runtime-provided packages.
  const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3');
  const s3 = new S3Client({ region: 'us-east-1', maxAttempts: 2 });
  try {
    return await checkPdfHeader({ s3, commandFactory: (input) => new GetObjectCommand(input), year });
  } finally {
    s3.destroy();
  }
}
