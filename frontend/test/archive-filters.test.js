import assert from 'node:assert/strict';
import test from 'node:test';
import { ARCHIVE_PUBLICATIONS, filterHistoricalDocuments } from '../src/archive-filters.js';

const docs = [
  { filename: 'Don Bosco en España_1987.pdf', publication: 'Don Bosco en España', year: 1987 },
  { filename: 'Boletín Salesiano_1886_01.pdf', publication: 'Boletín Salesiano', year: 1886 },
  { filename: 'Boletín Salesiano_1900_02.pdf', publication: 'Boletín Salesiano', year: 1900 },
  { filename: 'Sin catalogar.pdf', publication: null, year: null },
];

test('BC-110 both sources appear even before new material is indexed', () => {
  assert.deepEqual(ARCHIVE_PUBLICATIONS.map((item) => item.value),
    ['', 'Don Bosco en España', 'Boletín Salesiano']);
});

test('BC-110 historical directory filters can combine source and year', () => {
  assert.deepEqual(filterHistoricalDocuments(docs,
    { publication: 'Boletín Salesiano', year: '1886' }).map((doc) => doc.filename),
  ['Boletín Salesiano_1886_01.pdf']);
  assert.equal(filterHistoricalDocuments(docs, { publication: 'Don Bosco en España' }).length, 1);
  assert.equal(filterHistoricalDocuments(docs, { year: '1900' }).length, 1);
  assert.equal(filterHistoricalDocuments(docs, { query: 'sin catalogar' }).length, 1);
  assert.equal(filterHistoricalDocuments(docs).length, 4);
});
