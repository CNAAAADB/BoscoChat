import { createPublicKey, verify } from 'node:crypto';

let cachedKey;
let validUntil = 0;
let pending;

async function readerKey() {
  if (cachedKey && Date.now() < validUntil) return cachedKey;
  pending ??= fetch('https://api.boscogest.com/magazines/archive/reader-key', {
    redirect: 'error', signal: AbortSignal.timeout(5000),
  }).then(async (response) => {
    if (!response.ok) throw new Error('READER_KEY_UNAVAILABLE');
    const key = createPublicKey((await response.json()).public_key);
    if (key.asymmetricKeyType !== 'ed25519') throw new Error('INVALID_READER_KEY');
    cachedKey = key;
    validUntil = Date.now() + 60000;
    return key;
  }).finally(() => { pending = undefined; });
  return pending;
}

export function authorizeReaderPage(sessionAuthorization, getKey = readerKey) {
  return async (req, res, next) => {
    const proof = req.get('X-BoscoGest-Page');
    if (!proof) return sessionAuthorization(req, res, next);
    const match = /^(bg-page-v1:([1-9]\d{0,14}):([1-9]\d{0,3}):([1-9]\d{0,14}):(\d{10}))\.([\w-]{86})$/.exec(proof);
    const now = Math.floor(Date.now() / 1000);
    const denied = () => res.status(401).json({ error: { code: 'INVALID_READER_PROOF' } });
    if (!match || match[2] !== req.params.documentId || match[3] !== req.params.pageNumber ||
        Number(match[5]) <= now || Number(match[5]) > now + 90) return denied();
    try {
      const key = await getKey();
      if (!verify(null, Buffer.from(match[1]), key, Buffer.from(match[6], 'base64url'))) return denied();
      req.archiveReaderId = 'boscogest:' + match[4];
      req.user = { id: req.archiveReaderId };
      return next();
    } catch {
      return res.status(503).json({ error: { code: 'READER_VERIFICATION_UNAVAILABLE' } });
    }
  };
}
