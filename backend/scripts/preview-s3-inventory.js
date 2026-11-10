#!/usr/bin/env node
// Manual catalog preview. Do not place AWS access keys in arguments or source.
import { readFileSync, writeFileSync } from 'node:fs';
import { summarizeS3Inventory } from '../src/documents/archive-manifest.js';

const [input, output] = process.argv.slice(2);
if (!input || !output || input === output) {
  console.error('Usage: node scripts/preview-s3-inventory.js input.json output.json');
  process.exitCode = 2;
} else {
  try {
    const parsed = JSON.parse(readFileSync(input, 'utf8'));
    const report = summarizeS3Inventory(parsed);
    writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    console.log('Inventario:', report.scanned, 'objetos;', report.recognized, 'reconocidos;', report.needsReview, 'para revisar');
    if (report.truncated) {
      console.error('ATENCION: respuesta truncada; paginar antes de usar el inventario como completo');
      process.exitCode = 1;
    }
  } catch (error) {
    console.error('No se ha podido procesar el inventario:', error.message);
    process.exitCode = 1;
  }
}
