import assert from 'node:assert/strict';
import test from 'node:test';
import { detectMonthlySegments, validateMonthlySegments, monthlyFragmentFilename } from '../src/documents/fragmentation.js';

function cover(month, year, issue) {
  return 'Don Bosco en España\nNúmero ' + issue + '\n' + month + ' de ' + year +
    '\nPublicación salesiana con artículos y noticias históricas de las distintas casas.';
}
function pages(...texts) {
  return texts.map((text, index) => ({ page_number: index + 1, text_content: text }));
}
test('BC-105 identifies separate monthly issue covers and inclusive boundaries', () => {
  const proposed = detectMonthlySegments(pages(
    cover('enero', 1954, 1), 'Noticias interiores sobre febrero',
    cover('febrero', 1954, 2), 'Final de la publicación'), 1954);
  assert.equal(proposed.length, 2);
  assert.deepEqual(proposed.map(({ startPage, endPage, monthStart }) => [startPage, endPage, monthStart]),
    [[1, 2, 1], [3, 4, 2]]);
  assert.deepEqual(validateMonthlySegments(proposed, 4).map(x => [x.startPage, x.endPage]), [[1, 2], [3, 4]]);
});

test('BC-105 supports one issue, no OCR and unknown month without inventing boundaries', () => {
  const one = detectMonthlySegments(pages(cover('marzo', 1954, 3), 'Noticias'), 1954);
  assert.equal(one.length, 1);
  const unreadable = detectMonthlySegments(pages('', 'page without OCR'), 1954);
  assert.equal(unreadable.length, 1);
  assert.equal(unreadable[0].monthStart, null);
  assert.throws(() => validateMonthlySegments(unreadable, 2), /INVALID_FRAGMENT_SEGMENTS/);
});

test('BC-105 allows combined issues, but never allows overlap, gaps or missing months', () => {
  const a = [{ startPage: 1, endPage: 2, monthStart: 1, monthEnd: 2, issueNumber: '7' },
    { startPage: 3, endPage: 5, monthStart: 3, monthEnd: 3, issueNumber: '' }];
  assert.equal(validateMonthlySegments(a, 5).length, 2);
  assert.match(monthlyFragmentFilename(1954, a[0]), /1954_01-02_p0001\.pdf$/);
  assert.throws(() => validateMonthlySegments([{ ...a[0], endPage: 3 }, a[1]], 5), /INVALID_FRAGMENT_SEGMENTS/);
  assert.throws(() => validateMonthlySegments([{ ...a[0] }, { ...a[1], endPage: 4 }], 5), /INCOMPLETE_FRAGMENT_COVERAGE/);
  assert.throws(() => validateMonthlySegments([{ ...a[0], monthStart: null }, a[1]], 5), /INVALID_FRAGMENT_SEGMENTS/);
});

test('BC-105 refuses noncontiguous indexed pages before changing any archive state', () => {
  assert.throws(() => detectMonthlySegments([{ page_number: 2, text_content: cover('enero', 1954, 1) }], 1954),
    /NON_CONTIGUOUS_ARCHIVE_PAGES/);
});

test('BC-105 identifies a double-month cover as one combined issue', () => {
  const result = detectMonthlySegments(pages(
    'Don Bosco en España. Número 9. enero-febrero de 1954.',
    'Noticias de la casa',
    cover('marzo', 1954, 10),
  ), 1954);
  assert.equal(result.length, 2);
  assert.equal(result[0].monthStart, 1);
  assert.equal(result[0].monthEnd, 2);
});
