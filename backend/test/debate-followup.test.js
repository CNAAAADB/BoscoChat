import assert from 'node:assert/strict';
import test from 'node:test';
import { chooseDebateFollowup, collectDebateFollowup, filterDebateFollowup } from '../src/chat/debate-followup.js';

const history = [
  { role: 'user', text: 'Investiga los antiguos alumnos de Cádiz' },
  { role: 'assistant', text: 'Una asociación aparece en fuentes.' },
];

test('BC-107 follow-up chooses server-owned local query, not AI claims', () => {
  const q = chooseDebateFollowup('¿Quién fue presidente?', history, [
    'Cádiz antiguos alumnos presidente',
    'Cádiz antiguos alumnos junta directiva',
    'Cádiz antiguos alumnos elecciones reelegido',
    'Cádiz antiguos alumnos nombramiento',
  ]);
  assert.ok(q.includes('Cádiz antiguos alumnos'));
  assert.match(q, /actas/);
  assert.doesNotMatch(q, /DROP|DELETE|SELECT/i);
});

test('BC-107 follow-up does not execute SQL when six references already occupy the budget', async () => {
  let called = 0;
  const existing = Array.from({ length: 6 }, (_, i) => ({
    documentId: i + 1, page: 1, excerpt: 'En Cádiz antiguos alumnos presidente',
  }));
  const res = await collectDebateFollowup({}, 'Cádiz antiguos alumnos actas', existing, {
    retrieve: async () => { called++; return []; },
  });
  assert.equal(called, 0);
  assert.equal(res.attempted, false);
});

test('BC-107 follow-up is read-only, one invocation, deduplicated and strictly bounded', async () => {
  const existing = [{ documentId: 2, page: 3, excerpt: 'Antiguos alumnos de Cádiz eligen presidente.' }];
  let calls = 0;
  const evidence = await collectDebateFollowup({}, 'Cádiz antiguos alumnos junta', existing, {
    retrieve: async () => {
      calls++;
      return [
        existing[0],
        { documentId: 7, page: 9, excerpt: 'Antiguos alumnos de Cádiz eligieron presidente.' },
        { documentId: 8, page: 4, excerpt: 'Fue elegido el presidente del colegio de Sevilla.' },
        { documentId: 9, page: 1, excerpt: 'Antiguos alumnos de Cádiz nombraron al presidente.' },
        { documentId: 10, page: 2, excerpt: 'Exceso ignorado' },
      ];
    },
  });
  assert.equal(calls, 1);
  assert.equal(evidence.sources.length, 2);
  assert.deepEqual(evidence.sources.map(x => x.documentId), [7, 8]);
  const focused = filterDebateFollowup(evidence.sources,
    { location: 'Cádiz', entity: 'antiguos alumnos', intent: 'presidencia' });
  assert.deepEqual(focused.map(x => x.documentId), [7]);
});

test('BC-107 retrieval error results in no new evidence and no additional queries', async () => {
  let calls = 0;
  const failed = await collectDebateFollowup({}, 'Cádiz oratorio', [], {
    retrieve: async () => { calls++; throw new Error('database unreachable'); },
  });
  assert.equal(calls, 1);
  assert.equal(failed.failed, true);
  assert.deepEqual(failed.sources, []);
});

test('BC-107 never trusts arbitrary query objects or unbounded search parameters', async () => {
  assert.throws(() => chooseDebateFollowup('oratorio', [], ['x'.repeat(15), ...Array(9).fill('a')]),
    /INVALID_DEBATE_PLAN/);
  await assert.rejects(
    () => collectDebateFollowup({}, 'DROP TABLE docs', [], { limit: 9, retrieve: async () => [] }),
    /INVALID_DEBATE_FOLLOWUP/,
  );
});
