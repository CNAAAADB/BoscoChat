import assert from 'node:assert/strict';
import test from 'node:test';
import { runChatInference } from '../worker/historical-chat-bedrock.js';

const event = {
  depth: 'research', system: 'Sistema investigador con fuentes de historia y citas documentadas verificables.',
  user: '¿Qué sabemos de la revista? FUENTES [F1] Portada: Don Bosco 1954. [F2] Página 3: Cádiz.',
};
const council = { refs: ['F1', 'F2'], evidence: [
  { ref: 'F1', text: 'Portada: Don Bosco 1954.' },
  { ref: 'F2', text: 'Página 3: Cádiz.' },
] };
test('BC-107 existing inference performs exactly one bounded model call when council is off', async () => {
  const steps = [];
  const output = await runChatInference(event, { infer: async arg => {
    steps.push(arg);
    return { text: 'Una respuesta [F1].', usage: { inputTokens: 15, outputTokens: 10 } };
  } });
  assert.deepEqual(steps.map(x => x.phase), ['single']);
  assert.equal(steps[0].maxTokens, 1900);
  assert.equal(output.council, undefined);
});

test('BC-107 parallel proposals, adversarial critic, and grounded synthesis are bounded', async () => {
  const phases = [];
  const proposal = { claims: [
    { field: 'f1', value: 'Portada: Don Bosco 1954.', refs: ['F1'] },
  ] };
  const output = await runChatInference({ ...event, council }, {
    infer: async arg => {
      phases.push(arg.phase);
      assert.ok(arg.maxTokens > 0 && arg.maxTokens <= 1450);
      if (arg.phase === 'proposal') return { text: JSON.stringify(proposal), usage: { inputTokens: 3, outputTokens: 2 } };
      if (arg.phase === 'critique') {
        assert.match(arg.user, /PROPUESTAS/);
        return { text: '{"objections":[]}', usage: { inputTokens: 3, outputTokens: 2 } };
      }
      assert.equal(arg.phase, 'synthesis');
      assert.match(arg.user, /agent_agreement/);
      return { text: 'La portada indica Don Bosco 1954 [F1].', usage: { inputTokens: 3, outputTokens: 2 } };
    },
  });
  assert.deepEqual(phases, ['proposal', 'proposal', 'critique', 'synthesis']);
  assert.equal(output.council.status, 'agreed');
  assert.equal(output.council.agreedCount, 1);
  assert.deepEqual(output.usage, { inputTokens: 12, outputTokens: 8 });
});

test('BC-107 contestation is made explicit to synthesis instead of false consensus', async () => {
  const o = await runChatInference({ ...event, council }, {
    infer: async arg => {
      if (arg.phase === 'proposal') return { text: JSON.stringify({
        claims: [{ field: 'f1', value: '1954', refs: ['F1'] }],
      }) };
      if (arg.phase === 'critique') return { text: '{"objections":["f1"]}' };
      assert.match(arg.user, /needs_review/);
      return { text: 'No es posible confirmar la fecha.', usage: {} };
    },
  });
  assert.equal(o.council.status, 'needs_review');
  assert.equal(o.council.disputedCount, 1);
});

test('BC-107 invented model citation fails closed but returns a cautious answer', async () => {
  const result = await runChatInference({ ...event, council }, {
    infer: async arg => arg.phase === 'proposal'
      ? { text: JSON.stringify({ claims: [{ field: 'f1', value: 'inventado', refs: ['F9'] }] }) }
      : { text: 'No puedo justificar la afirmación con las fuentes disponibles.' },
  });
  assert.equal(result.council.status, 'needs_review');
  assert.equal(result.council.agreedCount, 0);
  await assert.rejects(() => runChatInference({ ...event, council: { refs: ['F1', 'F9'], evidence: council.evidence } }, {
    infer: async () => ({ text: 'respuesta' }),
  }), /INVALID_COUNCIL_REQUEST/);
});

test('BC-107 critic failure cannot return a claimed agent agreement', async () => {
  const out = await runChatInference({ ...event, council }, {
    infer: async arg => {
      if (arg.phase === 'proposal') return { text: JSON.stringify({
        claims: [{ field: 'f1', value: '1954', refs: ['F1'] }],
      }) };
      if (arg.phase === 'critique') throw new Error('unavailable');
      assert.match(arg.user, /critic_unavailable/);
      return { text: 'La fecha exige confirmación.' };
    },
  });
  assert.equal(out.council.status, 'needs_review');
  assert.equal(out.council.agreedCount, 0);
});

test('BC-107 disputed first debate returns probe for server-owned additional retrieval', async () => {
  const phases = [];
  const result = await runChatInference({ ...event, council: { ...council, phase: 'probe' } }, {
    infer: async arg => {
      phases.push(arg.phase);
      if (arg.phase === 'proposal') return { text: JSON.stringify({ claims: [
        { field: 'f1', value: phases.length === 1 ? '1954' : 'Don Bosco', refs: ['F1'] },
      ] }), usage: { inputTokens: 2, outputTokens: 1 } };
      if (arg.phase === 'critique') return { text: '{"objections":["f1"]}', usage: { inputTokens: 2, outputTokens: 1 } };
      throw new Error('Probe must not synthesize before follow-up');
    },
  });
  assert.equal(result.status, 'probe');
  assert.equal(result.council.status, 'needs_review');
  assert.deepEqual(phases, ['proposal', 'proposal', 'critique']);
  assert.equal(result.council.rounds, 1);
  assert.equal(result.council.minutes.disputed[0].field, 'f1');
});

test('BC-107 second debate considers objections and newly authorized OCR pages', async () => {
  const phases = [];
  const prior = { status: 'needs_review', agreed: [], disputed: [
    { field: 'f1', reasons: ['conflicting_values'], alternatives: [
      { value: '1954', refs: ['F1'] }, { value: '1955', refs: ['F1'] },
    ] },
  ] };
  const result = await runChatInference({
    ...event,
    user: event.user + ' [F3] La revista tiene fecha 1954.',
    council: {
      phase: 'resolve', previous: prior,
      refs: ['F1', 'F2', 'F3'],
      evidence: [...council.evidence, { ref: 'F3', text: 'La revista tiene fecha 1954.' }],
    },
  }, {
    infer: async arg => {
      phases.push(arg.phase);
      if (arg.phase === 'proposal') {
        assert.match(arg.user, /ACTA ANTERIOR/);
        assert.match(arg.user, /F3/);
        return { text: JSON.stringify({ claims: [
          { field: 'f3', value: 'La revista tiene fecha 1954.', refs: ['F3'] },
        ] }) };
      }
      if (arg.phase === 'critique') return { text: '{"objections":[]}' };
      assert.equal(arg.phase, 'synthesis');
      assert.match(arg.user, /previousDisputes/);
      return { text: 'La revista data de 1954 [F3].' };
    },
  });
  assert.equal(result.council.rounds, 2);
  assert.equal(result.council.status, 'agreed');
  assert.deepEqual(phases, ['proposal', 'proposal', 'critique', 'synthesis']);
});

test('BC-107 cannot request third round or smuggle oversized debate minutes', async () => {
  await assert.rejects(() => runChatInference({
    ...event, council: { ...council, phase: 'resolve',
      previous: { status: 'needs_review', agreed: [], disputed: Array(20).fill({ field: 'f1' }) } },
  }, { infer: async () => ({ text: 'ok' }) }), /INVALID_COUNCIL_PHASE/);
  await assert.rejects(() => runChatInference({
    ...event, council: { ...council, phase: 'third' },
  }, { infer: async () => ({ text: 'ok' }) }), /INVALID_COUNCIL_PHASE/);
});
