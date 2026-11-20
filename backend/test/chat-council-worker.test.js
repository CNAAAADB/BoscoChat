import assert from 'node:assert/strict';
import test from 'node:test';
import { runChatInference } from '../worker/historical-chat-bedrock.js';

const event = {
  depth: 'research', system: 'Sistema investigador con fuentes de historia y citas documentadas verificables.',
  user: '¿Qué sabemos de la revista? FUENTES [F1] Portada: Don Bosco 1954. [F2] Página 3: Cádiz.',
};
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
  const output = await runChatInference({ ...event, council: { refs: ['F1', 'F2'] } }, {
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
  const o = await runChatInference({ ...event, council: { refs: ['F1', 'F2'] } }, {
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

test('BC-107 model cannot inject a fabricated citation into the council', async () => {
  await assert.rejects(() => runChatInference({ ...event, council: { refs: ['F1', 'F2'] } }, {
    infer: async arg => arg.phase === 'proposal'
      ? { text: JSON.stringify({ claims: [{ field: 'f1', value: 'inventado', refs: ['F9'] }] }) }
      : { text: '{"objections":[]}' },
  }), /INVALID_COUNCIL_CLAIM/);
  await assert.rejects(() => runChatInference({ ...event, council: { refs: ['F1', 'F9'] } }, {
    infer: async () => ({ text: 'respuesta' }),
  }), /INVALID_COUNCIL_REQUEST/);
});

test('BC-107 critic failure cannot return a claimed agent agreement', async () => {
  const out = await runChatInference({ ...event, council: { refs: ['F1', 'F2'] } }, {
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
