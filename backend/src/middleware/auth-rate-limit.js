export function createAuthRateLimiter({
  limit = 5,
  ipLimit = Math.max(20, limit * 4),
  windowMs = 15 * 60 * 1000,
  now = Date.now,
} = {}) {
  const attempts = new Map();

  function keysFor(req) {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    return {
      ip: `ip:${req.ip}`,
      identity: `identity:${req.ip}|${email}`,
    };
  }

  function middleware(req, res, next) {
    const keys = keysFor(req);
    const timestamp = now();
    if (attempts.size >= 10_000 && (!attempts.has(keys.ip) || !attempts.has(keys.identity))) {
      for (const [candidate, value] of attempts) {
        if (value.resetAt <= timestamp) attempts.delete(candidate);
      }
      if (attempts.size >= 10_000) attempts.delete(attempts.keys().next().value);
    }
    const ipEntry = currentEntry(attempts.get(keys.ip), timestamp, windowMs);
    const identityEntry = currentEntry(attempts.get(keys.identity), timestamp, windowMs);
    const blocked = ipEntry.count >= ipLimit ? ipEntry : identityEntry.count >= limit ? identityEntry : null;

    if (blocked) {
      res.set('Retry-After', String(Math.ceil((blocked.resetAt - timestamp) / 1000)));
      return res.status(429).json({
        error: { code: 'TOO_MANY_ATTEMPTS', message: 'Demasiados intentos. Vuelve a intentarlo más tarde.' },
      });
    }

    ipEntry.count += 1;
    identityEntry.count += 1;
    attempts.set(keys.ip, ipEntry);
    attempts.set(keys.identity, identityEntry);
    // Successful authentication may clear only the credential-specific bucket.
    // The aggregate IP bucket must remain so rotating identities cannot bypass it.
    res.locals.authRateLimitKey = keys.identity;
    return next();
  }

  middleware.clear = (key) => attempts.delete(key);
  return middleware;
}

function currentEntry(entry, timestamp, windowMs) {
  return !entry || entry.resetAt <= timestamp
    ? { count: 0, resetAt: timestamp + windowMs }
    : entry;
}

