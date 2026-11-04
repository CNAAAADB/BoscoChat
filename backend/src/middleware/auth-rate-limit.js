import { createHmac } from 'node:crypto';

export class MemoryAuthRateLimitStore {
  constructor() {
    this.attempts = new Map();
  }

  async consume({ ip, identity }, { timestamp, resetAt, ipLimit, identityLimit }) {
    this.#prune(timestamp, ip, identity);
    const ipEntry = currentEntry(this.attempts.get(ip), timestamp, resetAt);
    if (ipEntry.count >= ipLimit) return ipEntry;

    const identityEntry = currentEntry(this.attempts.get(identity), timestamp, resetAt);
    if (identityEntry.count >= identityLimit) return identityEntry;

    ipEntry.count = Math.min(ipEntry.count + 1, ipLimit + 1);
    identityEntry.count = Math.min(identityEntry.count + 1, identityLimit + 1);
    this.attempts.set(ip, ipEntry);
    this.attempts.set(identity, identityEntry);
    return null;
  }

  async clear(key) {
    this.attempts.delete(key);
  }

  #prune(timestamp, ip, identity) {
    if (this.attempts.size < 10_000 || (this.attempts.has(ip) && this.attempts.has(identity))) return;
    for (const [candidate, value] of this.attempts) {
      if (value.resetAt <= timestamp) this.attempts.delete(candidate);
    }
    while (this.attempts.size >= 10_000) {
      this.attempts.delete(this.attempts.keys().next().value);
    }
  }
}

export function createAuthRateLimiter({
  scope = 'auth',
  limit = 5,
  ipLimit = Math.max(20, limit * 4),
  windowMs = 15 * 60 * 1000,
  now = Date.now,
  store = new MemoryAuthRateLimitStore(),
  hashKey = 'boscochat-local-development-only',
} = {}) {
  function keysFor(req) {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    return {
      ip: digest(`${scope}:ip:${req.ip}`, hashKey),
      identity: digest(`${scope}:identity:${req.ip}|${email}`, hashKey),
    };
  }

  async function middleware(req, res, next) {
    try {
      const keys = keysFor(req);
      const timestamp = now();
      const blocked = await store.consume(keys, {
        timestamp,
        resetAt: timestamp + windowMs,
        ipLimit,
        identityLimit: limit,
      });

      if (blocked) {
        res.set('Retry-After', String(Math.max(1, Math.ceil((blocked.resetAt - timestamp) / 1000))));
        return res.status(429).json({
          error: { code: 'TOO_MANY_ATTEMPTS', message: 'Demasiados intentos. Vuelve a intentarlo más tarde.' },
        });
      }

      res.locals.authRateLimitKey = keys.identity;
      return next();
    } catch (error) {
      return next(error);
    }
  }

  middleware.clear = (key) => store.clear(key);
  return middleware;
}

function digest(value, hashKey) {
  return createHmac('sha256', hashKey).update(value).digest('hex');
}

function currentEntry(entry, timestamp, resetAt) {
  return !entry || entry.resetAt <= timestamp ? { count: 0, resetAt } : entry;
}
