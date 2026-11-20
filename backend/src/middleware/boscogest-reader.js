import { createPublicKey, verify } from 'node:crypto';

// Public verification key distributed with the Lambda package (private subnets).
const trustedKey = createPublicKey(`-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA58RMKjVEaGBziRC54vovlhYEw824K9nTflSa9uCotK4=
-----END PUBLIC KEY-----`);

export function authorizeReaderPage(sessionAuthorization, getKey = () => trustedKey) {
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
