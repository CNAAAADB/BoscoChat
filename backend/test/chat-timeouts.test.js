import assert from 'node:assert/strict';
import test from 'node:test';
import { remainingChatMs, withinChatBudget } from '../src/chat/chat-budget.js';
import { retrieveChatSources, countIndexedPhrase, chatPrompt } from '../src/chat/historical-chat.js';
import { conductHistoricalResearch, revisitCitedSources } from '../src/chat/research-agent.js';

test('BC-108 timeout helper bounds a hanging retrieval without waiting for Lambda death', async () => {
  const started = Date.now();
  await assert.rejects(() => withinChatBudget(
    () => new Promise(() => {}), Date.now() + 40, 50,
  ), error => error.name === 'TimeoutError' && error.code === 'CHAT_TIMEOUT');
  assert.ok(Date.now() - started < 1500);
  await assert.rejects(() => withinChatBudget(
    () => { throw new Error('should not run'); }, Date.now() - 1,
  ), /CHAT_TIMEOUT/);
  assert.equal(remainingChatMs(Date.now() - 100), 0);
});

test('BC-108 every chat FULLTEXT and phrase-count SELECT is limited on the MySQL server', async () => {
  const queries = [];
  const pool = {
    async execute(sql, values) {
      queries.push({ sql, values });
      return [[{ occurrences: 0, matched_documents: 0 }]];
    },
  };
  await retrieveChatSources(pool, 'antiguos alumnos Cádiz');
  await retrieveChatSources(pool, 'antiguos alumnos Cádiz', { followup: true });
  await countIndexedPhrase(pool, 'antiguos alumnos');
  assert.equal(queries.length, 3);
  assert.match(queries[0].sql, /SELECT \/\*\+ MAX_EXECUTION_TIME\(1500\) \*\//);
  assert.match(queries[1].sql, /SELECT \/\*\+ MAX_EXECUTION_TIME\(1200\) \*\//);
  assert.match(queries[2].sql, /SELECT \/\*\+ MAX_EXECUTION_TIME\(1500\) \*\//);
  assert.equal(queries.every(q => !/DROP TABLE|DELETE FROM/i.test(q.sql)), true);
});

test('BC-108 research search deadline returns before unbounded mocks finish', async () => {
  const started = Date.now();
  await assert.rejects(() => conductHistoricalResearch(
    {}, '¿Quién preside la asociación de antiguos alumnos de Cádiz?', [], {
      retrieve: async () => new Promise(() => {}),
      deadline: Date.now() + 60,
    },
  ), /RESEARCH_SEARCH_UNAVAILABLE/);
  assert.ok(Date.now() - started < 1_500);
});

test('BC-108 historical citations fail closed when previously indexed page lookup hangs', async () => {
  const started = Date.now();
  const pool = { execute: async () => new Promise(() => {}) };
  const result = await revisitCitedSources(pool, [{ documentId: 7, page: 22 }], {
    deadline: Date.now() + 55,
  });
  assert.deepEqual(result, []);
  assert.ok(Date.now() - started < 1_500);
});

test('BC-108 prompt differentiates local association founding from regional magazine chronology', () => {
  const prompt = chatPrompt({
    question: 'Cuéntame todo lo que sepas sobre la asociación de Cádiz',
    sources: [{ ref: 'F1', publication: 'Don Bosco en España', year: 1987,
      page: 225, excerpt: 'La revista comenzó a publicarse en 1922.' }],
  });
  assert.match(prompt.system, /NO prueban la fundación de una asociación/);
  assert.match(prompt.system, /No infieras década o fecha de fundación/);
  assert.match(prompt.system, /historia general de la presencia salesiana/);
  assert.ok(prompt.user.includes('1987'));
});
