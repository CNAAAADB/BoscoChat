import assert from 'node:assert/strict';
import test from 'node:test';
import mysql from 'mysql2/promise';
import { databaseConfig } from '../src/config/database.js';
import { retrieveChatSources } from '../src/chat/historical-chat.js';

test('BC-109 Boolean FULLTEXT executes on real MySQL 8.4 index with authorized source filtering', {
  skip: process.env.MYSQL_INTEGRATION !== '1',
  timeout: 30_000,
}, async (t) => {
  const pool = mysql.createPool(databaseConfig());
  t.after(() => pool.end());
  const base = 'originals/bc-109-ci-' + process.pid + '-';
  const docs = [];
  try {
    for (const [i, text, indexed] of [
      [0, 'En Cádiz la Asociación de Antiguos Alumnos eligió presidente a un nuevo responsable.', true],
      [1, 'En Sevilla los antiguos alumnos eligieron presidente en asamblea.', true],
      [2, 'En Cádiz la Asociación de Antiguos Alumnos eligió presidente en otra reunión.', false],
    ]) {
      const [result] = await pool.execute(
        'INSERT INTO archive_documents (s3_key, publication, publication_year, indexed_at) VALUES (?, ?, ?, ?)',
        [base + i + '.pdf', 'Revista de pruebas', 1954, indexed ? new Date() : null],
      );
      docs.push(result.insertId);
      await pool.execute('INSERT INTO archive_pages (document_id, page_number, text_content) VALUES (?, ?, ?)',
        [result.insertId, 1, text]);
    }
    const found = await retrieveChatSources(pool, 'Cádiz antiguos alumnos presidente');
    assert.ok(found.some(row => row.documentId === docs[0]), 'indexed Cádiz page must be found');
    assert.ok(found.every(row => row.documentId !== docs[2]), 'unindexed pages must be excluded');
    assert.ok(found.every(row => row.documentId !== docs[1]), 'unrelated city should not match required Cádiz');
    assert.ok(found.some(row => row.excerpt.includes('Asociación de Antiguos Alumnos')));
  } finally {
    for (const id of docs) {
      await pool.execute('DELETE FROM archive_pages WHERE document_id = ?', [id]);
      await pool.execute('DELETE FROM archive_documents WHERE id = ?', [id]);
    }
  }
});
