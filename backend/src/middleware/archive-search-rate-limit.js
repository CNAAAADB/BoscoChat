import { createHmac } from 'node:crypto';
import { MemoryAuthRateLimitStore } from './auth-rate-limit.js';

// Shared MySQL store in production: a per-container memory limiter is not safe on Lambda.
export function createArchiveSearchRateLimiter({
  store = new MemoryAuthRateLimitStore(),
  hashKey = 'boscochat-local-development-only',
  now = Date.now,
  limit = 30,
  windowMs = 60_000,
} = {}) {
  return async function archiveSearchRateLimiter(req, res, next) {
    try {
      const timestamp = now();
      const ipHash = createHmac('sha256', hashKey).update('archive-search:ip:' + req.ip).digest('hex');
      const identityHash = createHmac('sha256', hashKey).update('archive-search:identity:' + req.ip).digest('hex');
      const blocked = await store.consume({ ip: ipHash, identity: identityHash }, {
        timestamp,
        resetAt: timestamp + windowMs,
        ipLimit: limit,
        identityLimit: limit,
      });
      res.set('Cache-Control', 'no-store');
      res.set('RateLimit-Limit', String(limit));
      if (blocked) {
        res.set('Retry-After', String(Math.max(1, Math.ceil((blocked.resetAt - timestamp) / 1000))));
        return res.status(429).json({
          error: { code: 'SEARCH_RATE_LIMITED', message: 'Demasiadas búsquedas. Inténtalo de nuevo en unos instantes.' },
        });
      }
      return next();
    } catch (error) {
      // Fail closed: do not expose an unbounded public query when the shared store fails.
      return next(error);
    }
  };
}
