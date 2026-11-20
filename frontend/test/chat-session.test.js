import assert from 'node:assert/strict';
import test from 'node:test';
import { chatSessionKey, loadChatSession, saveChatSession, clearChatSession } from '../src/chat-session.js';

function storage() {
  const records = new Map();
  return {
    getItem: (key) => records.get(key) ?? null,
    setItem: (key, value) => records.set(key, value),
    removeItem: (key) => records.delete(key),
    size: () => records.size,
  };
}
const now = Date.UTC(2026, 10, 20, 11, 0);
const turns = [
  { role: 'user', text: '¿Qué pasó en Atocha?' },
  { role: 'assistant', text: 'En la revista de 1978 hay un artículo [F1].', sources: [
    { ref: 'F1', documentId: 33, publication: 'Don Bosco en España', year: 1978, page: 23 },
  ] },
];

test('BC-101 chat survives navigation and refresh within administrator tab', () => {
  const s = storage();
  assert.equal(saveChatSession(s, 7, turns, 'research', now), true);
  assert.deepEqual(loadChatSession(s, 7, now + 10_000), { messages: turns, depth: 'research' });
  assert.equal(loadChatSession(s, 8, now + 10_000), null);
  assert.equal(chatSessionKey(7), 'boscochat:admin-chat:7');
});

test('BC-101 logout and new conversation remove the history', () => {
  const s = storage();
  saveChatSession(s, 7, turns, 'research', now);
  clearChatSession(s, 7);
  assert.equal(loadChatSession(s, 7, now), null);
  assert.equal(s.size(), 0);
});

test('BC-101 expired and malformed state is ignored and purged', () => {
  const s = storage();
  saveChatSession(s, 7, turns, 'research', now);
  assert.equal(loadChatSession(s, 7, now + 2 * 60 * 60 * 1000 + 1), null);
  s.setItem(chatSessionKey(7), JSON.stringify({ version: 1, savedAt: now, depth: 'research', messages: [
    { role: 'assistant', text: 'wrong', sources: [{ ref: 'F9', documentId: 10, page: 1 }] },
  ] }));
  assert.equal(loadChatSession(s, 7, now + 30_000), null);
  assert.equal(s.size(), 0);
});

test('BC-101 browser tab storage is capped and cannot be used for other users', () => {
  const s = storage();
  const many = Array.from({ length: 50 }, (_, i) => ({ role: 'user', text: String(i + 1) }));
  assert.equal(saveChatSession(s, 7, many, 'brief', now), true);
  assert.equal(loadChatSession(s, 7, now).messages.length, 40);
  assert.equal(loadChatSession(s, 7, now).messages[0].text, '11');
  assert.equal(loadChatSession(s, -1, now), null);
});
