import assert from 'node:assert/strict';
import test from 'node:test';
import { generateKeyPairSync, sign } from 'node:crypto';
import { authorizeReaderPage } from '../src/middleware/boscogest-reader.js';

test('BoscoGest proofs authorize only the signed page within their lifetime', async () => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const now = Math.floor(Date.now() / 1000);
  const guard = authorizeReaderPage(() => assert.fail('unexpected session fallback'), async () => publicKey);
  async function read(claims, key = privateKey) {
    const signature = sign(null, Buffer.from(claims), key).toString('base64url');
    const req = { get: () => claims + '.' + signature, params: { documentId: '7', pageNumber: '2' } };
    const res = { status(code) { this.code = code; return this; }, json() {} };
    await guard(req, res, () => { res.code = 200; });
    return [res.code, req.user?.id];
  }
  const valid = 'bg-page-v1:7:2:15:' + (now + 60);
  assert.deepEqual(await read(valid), [200, 'boscogest:15']);
  for (const invalid of [valid.replace(':7:', ':8:'), valid.replace(':2:', ':3:'), 'bg-page-v1:7:2:15:' + (now - 1)]) {
    assert.deepEqual(await read(invalid), [401, undefined]);
  }
  assert.deepEqual(await read(valid, generateKeyPairSync('ed25519').privateKey), [401, undefined]);
});
