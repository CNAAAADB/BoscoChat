import assert from 'node:assert/strict';
import test from 'node:test';
import { reconcileCouncil, runEvidenceCouncil } from '../src/agents/evidence-council.js';
import { reviewDocumentCatalogue } from '../src/documents/document-council.js';

const a = { claims: [
  { field: 'year', value: '1954', refs: ['P1'] },
  { field: 'issue', value: '23', refs: ['P2'] },
] };
const b = { claims: [
  { field: 'year', value: '1954', refs: ['P2'] },
  { field: 'issue', value: '24', refs: ['P2'] },
] };

test('BC-107 parallel independent analysts and critic veto; never majority-vote a conflict', async () => {
  const called = [];
  const result = await runEvidenceCouncil({
    roles: ['bibliographer', 'structural_reader'], allowedRefs: ['P1', 'P2'],
    invoke: async role => {
      called.push(role);
      await Promise.resolve();
      return role === 'bibliographer' ? a : b;
    },
    critic: async (_proposals, preliminary) => {
      assert.deepEqual(called, ['bibliographer', 'structural_reader']);
      assert.equal(preliminary.agreed[0].field, 'year');
      return { objections: ['year'] };
    },
  });
  assert.equal(result.status, 'needs_review');
  assert.deepEqual(result.agreed, []);
  assert.deepEqual(result.disputed.map(x => x.field).sort(), ['issue', 'year']);
});

test('BC-107 exact agreement is labelled as agent agreement, not documentary verification', () => {
  const result = reconcileCouncil([
    { role: 'bibliographer', claims: [a.claims[0]] },
    { role: 'structural_reader', claims: [b.claims[0]] },
  ], ['P1', 'P2']);
  assert.equal(result.status, 'agreed');
  assert.equal(result.agreed[0].status, 'agent_agreement');
  assert.deepEqual(result.agreed[0].refs, ['P1', 'P2']);
});

test('BC-107 rejects invented page references, repeated roles and duplicate fields', () => {
  assert.throws(() => reconcileCouncil([
    { role: 'bibliographer', claims: [{ field: 'year', value: '1954', refs: ['P999'] }] },
    { role: 'structural_reader', claims: b.claims },
  ], ['P1', 'P2']), /INVALID_COUNCIL_CLAIM/);
  assert.throws(() => reconcileCouncil([
    { role: 'bibliographer', claims: a.claims },
    { role: 'bibliographer', claims: b.claims },
  ], ['P1', 'P2']), /INVALID_COUNCIL_PROPOSALS/);
  assert.throws(() => reconcileCouncil([
    { role: 'bibliographer', claims: [a.claims[0], a.claims[0]] },
    { role: 'structural_reader', claims: b.claims },
  ], ['P1', 'P2']), /INVALID_COUNCIL_CLAIM/);
});

test('BC-107 one failed analyst cannot result in agreed catalogue data', async () => {
  const result = await runEvidenceCouncil({
    roles: ['bibliographer', 'structural_reader'], allowedRefs: ['P1'],
    invoke: async role => {
      if (role === 'bibliographer') throw new Error('model failed');
      return { claims: [{ field: 'year', value: '1954', refs: ['P1'] }] };
    },
    critic: async () => ({ objections: [] }),
  });
  assert.equal(result.status, 'needs_review');
  assert.equal(result.reason, 'specialist_unavailable');
});

test('BC-107 document adapter always requires a human and preserves physical source pages', async () => {
  const result = await reviewDocumentCatalogue({
    pages: [{ pageNumber: 1, text: 'Don Bosco en España 1954' }, { pageNumber: 2, text: 'Revista' }],
    analyze: async ({ role, pages }) => {
      assert.equal(pages.length, 2);
      assert.ok(['bibliographer', 'structural_reader'].includes(role));
      return { claims: [a.claims[0]] };
    },
    critic: async () => ({ objections: [] }),
  });
  assert.equal(result.status, 'agreed');
  assert.equal(result.publishable, false);
  assert.equal(result.requiresHumanReview, true);
});

test('BC-107 rejects fake critic response and never publishes a tentative decision', async () => {
  const result = await runEvidenceCouncil({
    roles: ['bibliographer', 'structural_reader'], allowedRefs: ['P1'],
    invoke: async () => ({ claims: [{ field: 'year', value: '1954', refs: ['P1'] }] }),
    critic: async () => ({ objections: 'all good' }),
  });
  assert.equal(result.status, 'needs_review');
  assert.deepEqual(result.agreed, []);
});
