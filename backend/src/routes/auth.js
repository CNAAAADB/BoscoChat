import express from 'express';
import { AuthError } from '../auth/service.js';
import { createAuthRateLimiter } from '../middleware/auth-rate-limit.js';

const COOKIE_NAME = 'boscochat_session';
const MAX_AGE_SECONDS = 8 * 60 * 60;

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').flatMap((part) => {
    const separator = part.indexOf('=');
    if (separator < 0) return [];
    try {
      return [[part.slice(0, separator).trim(), decodeURIComponent(part.slice(separator + 1).trim())]];
    } catch {
      return [];
    }
  }));
}

function sessionToken(req) {
  return parseCookies(req.get('cookie'))[COOKIE_NAME] ?? null;
}

function cookieOptions(production) {
  return { httpOnly: true, sameSite: 'lax', secure: production, path: '/', maxAge: MAX_AGE_SECONDS * 1000 };
}

export function createAuthRouter(authService, {
  production = false,
  loginRateLimiter = createAuthRateLimiter(),
  registrationRateLimiter = createAuthRateLimiter({ limit: 10, windowMs: 60 * 60 * 1000 }),
} = {}) {
  const router = express.Router();

  router.post('/register', registrationRateLimiter, async (req, res, next) => {
    try {
      const user = await authService.register(req.body ?? {});
      res.status(201).json({ user });
    } catch (error) {
      next(error);
    }
  });

  router.post('/login', loginRateLimiter, async (req, res, next) => {
    try {
      const result = await authService.login(req.body ?? {});
      loginRateLimiter.clear(res.locals.authRateLimitKey);
      res.cookie(COOKIE_NAME, result.token, cookieOptions(production));
      res.json({ user: result.user, expiresAt: result.expiresAt.toISOString() });
    } catch (error) {
      next(error);
    }
  });

  router.get('/session', async (req, res, next) => {
    try {
      const user = await authService.session(sessionToken(req));
      if (!user) return res.status(401).json({ error: { code: 'AUTHENTICATION_REQUIRED', message: 'Inicia sesión para continuar.' } });
      return res.json({ user });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/logout', async (req, res, next) => {
    try {
      await authService.logout(sessionToken(req));
      res.clearCookie(COOKIE_NAME, cookieOptions(production));
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  router.use((error, req, res, next) => {
    if (error instanceof AuthError) {
      return res.status(error.status).json({ error: { code: error.code, message: error.message } });
    }
    return next(error);
  });

  return router;
}
