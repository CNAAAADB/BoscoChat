export function createAuthRateLimiter({ limit = 5, windowMs = 15 * 60 * 1000, now = Date.now } = {}) {
  const attempts = new Map();

  function keyFor(req) {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    return `${req.ip}|${email}`;
  }

  function middleware(req, res, next) {
    const key = keyFor(req);
    const timestamp = now();
    const current = attempts.get(key);
    if (attempts.size >= 10_000 && !attempts.has(key)) {
      for (const [candidate, value] of attempts) {
        if (value.resetAt <= timestamp) attempts.delete(candidate);
      }
      if (attempts.size >= 10_000) attempts.delete(attempts.keys().next().value);
    }
    const entry = !current || current.resetAt <= timestamp
      ? { count: 0, resetAt: timestamp + windowMs }
      : current;

    if (entry.count >= limit) {
      res.set('Retry-After', String(Math.ceil((entry.resetAt - timestamp) / 1000)));
      return res.status(429).json({
        error: { code: 'TOO_MANY_ATTEMPTS', message: 'Demasiados intentos. Vuelve a intentarlo más tarde.' },
      });
    }

    entry.count += 1;
    attempts.set(key, entry);
    res.locals.authRateLimitKey = key;
    return next();
  }

  middleware.clear = (key) => attempts.delete(key);
  return middleware;
}
