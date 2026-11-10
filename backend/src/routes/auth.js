import express from 'express';
import { AuthError } from '../auth/service.js';
import { createAuthRateLimiter } from '../middleware/auth-rate-limit.js';
import { SESSION_COOKIE_NAME, sessionToken } from '../middleware/authorization.js';

const MAX_AGE_SECONDS = 8 * 60 * 60;
const ALLOWED_SAME_SITE = new Set(['lax', 'strict', 'none']);

function cookieOptions(production, sameSite = 'lax') {
  const normalized = String(sameSite).toLowerCase();
  if (!ALLOWED_SAME_SITE.has(normalized)) {
    throw new Error('SESSION_COOKIE_SAME_SITE must be lax, strict or none');
  }
  return {
    httpOnly: true,
    sameSite: normalized,
    secure: production || normalized === 'none',
    path: '/',
    maxAge: MAX_AGE_SECONDS * 1000,
  };
}

export function createAuthRouter(authService, {
  production = false,
  cookieSameSite = 'lax',
  loginRateLimiter = createAuthRateLimiter({ scope: 'login' }),
  registrationRateLimiter = createAuthRateLimiter({ scope: 'register', limit: 10, windowMs: 60 * 60 * 1000 }),
} = {}) {
  const router = express.Router();
  const sessionCookieOptions = cookieOptions(production, cookieSameSite);

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
      await loginRateLimiter.clear(res.locals.authRateLimitKey);
      res.cookie(SESSION_COOKIE_NAME, result.token, sessionCookieOptions);
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
      res.clearCookie(SESSION_COOKIE_NAME, sessionCookieOptions);
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


