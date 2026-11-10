import assert from 'node:assert/strict';
import test from 'node:test';
import { splitExtractedPages } from '../src/documents/extracted-pages.js';

test('BC-007 maps form feeds to physical PDF page numbers', () => {
  const pages = splitExtractedPages('Portada\fPágina dos\fPágina tres\f');
  assert.equal(pages.length, 3);
  assert.deepEqual(pages.map((page) => page.pageNumber), [1, 2, 3]);
  assert.equal(pages[1].text, 'Página dos');
});

test('BC-007 flags missing text for OCR review without discarding page position', () => {
  const pages = splitExtractedPages('Texto\f\fFinal\f');
  assert.equal(pages[1].quality, 'needs_review');
  assert.equal(pages[1].text, '');
  assert.throws(() => splitExtractedPages('a'.repeat(200), { maxPageChars: 100 }), RangeError);
});
