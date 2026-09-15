import express from 'express';
import cors from 'cors';
import { AuthRepository } from './db/auth-repository.js';
import { AuthService } from './auth/service.js';
import { createAuthRouter } from './routes/auth.js';
import { createLegacyRouter } from './routes/legacy.js';

export function createApp({ pool, environment = process.env, authService } = {}) {
  if (!authService && !pool) throw new Error('pool or authService is required');

  const app = express();
  const allowedOrigins = new Set((environment.CORS_ORIGINS ?? 'http://localhost:5173').split(',').map((value) => value.trim()).filter(Boolean));
  const service = authService ?? new AuthService(new AuthRepository(pool));
  const authRouter = createAuthRouter(service, {
    production: environment.NODE_ENV === 'production',
    cookieSameSite: environment.SESSION_COOKIE_SAME_SITE ?? 'lax',
  });

  app.disable('x-powered-by');
  app.set('trust proxy', environment.TRUST_PROXY === '1' ? 1 : false);
  app.use((req, res, next) => {
    res.set({
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
    });
    next();
  });
  app.use((req, res, next) => {
    const origin = req.get('origin');
    if (origin && !allowedOrigins.has(origin)) {
      return res.status(403).json({ error: { code: 'ORIGIN_NOT_ALLOWED', message: 'Origen no permitido.' } });
    }
    return next();
  });
  app.use(cors({
    credentials: true,
    origin(origin, callback) {
      callback(null, !origin || allowedOrigins.has(origin));
    },
  }));
  app.use(express.json({ limit: '16kb', type: 'application/json' }));
  app.use('/api/auth', authRouter);
  app.use('/api', authRouter);
  if (pool) app.use('/api', createLegacyRouter(pool, service));

  app.get('/health', (req, res) => res.json({ status: 'ok' }));

  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error?.type === 'entity.parse.failed') {
      return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'El cuerpo JSON no es válido.' } });
    }
    console.error('Unhandled request error', { method: req.method, path: req.path, name: error?.name });
    return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'No se ha podido completar la solicitud.' } });
  });

  return app;
}
