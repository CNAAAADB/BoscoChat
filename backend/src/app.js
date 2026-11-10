import express from 'express';
import cors from 'cors';
import { AuthRepository } from './db/auth-repository.js';
import { AuthService } from './auth/service.js';
import { UserAdministrationService } from './users/administration-service.js';
import { UsageRepository } from './db/usage-repository.js';
import { queryQuotaConfig } from './usage/quota-config.js';
import { UsageService } from './usage/service.js';
import { MysqlAuthRateLimitStore } from './db/auth-rate-limit-store.js';
import { createAuthRateLimiter } from './middleware/auth-rate-limit.js';
import { createAuthRouter } from './routes/auth.js';
import { createAdminUsersRouter } from './routes/admin-users.js';
import { createLegacyRouter } from './routes/legacy.js';
import { createArchiveDiagnosticRouter } from './routes/archive-diagnostics.js';
import { createArchiveSearchRouter } from './routes/archive-search.js';
import { createArchiveDocumentRouter } from './routes/archive-documents.js';

export function createApp({
  pool,
  environment = process.env,
  authService,
  usageService,
  administrationService,
  authRateLimitStore,
} = {}) {
  if (!authService && !pool) throw new Error('pool or authService is required');

  const app = express();
  const allowedOrigins = new Set((environment.CORS_ORIGINS ?? 'http://localhost:5173').split(',').map((value) => value.trim()).filter(Boolean));
  const repository = authService?.repository ?? new AuthRepository(pool);
  const service = authService ?? new AuthService(repository);
  const administration = administrationService ?? new UserAdministrationService(repository, service);
  const usage = usageService ?? (pool ? new UsageService(new UsageRepository(pool), { quotas: queryQuotaConfig(environment) }) : null);
  const sharedAuthRateLimitStore = authRateLimitStore ?? (!authService && pool ? new MysqlAuthRateLimitStore(pool) : null);
  const authRateLimitHashKey = environment.AUTH_RATE_LIMIT_HMAC_KEY;
  if (environment.NODE_ENV === 'production' && !sharedAuthRateLimitStore) {
    throw new Error('AUTH_RATE_LIMIT_STORE_REQUIRED');
  }
  if (environment.NODE_ENV === 'production' && Buffer.byteLength(authRateLimitHashKey ?? '') < 32) {
    throw new Error('AUTH_RATE_LIMIT_HMAC_KEY_REQUIRED');
  }
  const authRouter = createAuthRouter(service, {
    production: environment.NODE_ENV === 'production',
    cookieSameSite: environment.SESSION_COOKIE_SAME_SITE ?? 'lax',
    loginRateLimiter: createAuthRateLimiter({
      scope: 'login',
      store: sharedAuthRateLimitStore ?? undefined,
      hashKey: authRateLimitHashKey,
    }),
    registrationRateLimiter: createAuthRateLimiter({
      scope: 'register',
      limit: 10,
      windowMs: 60 * 60 * 1000,
      store: sharedAuthRateLimitStore ?? undefined,
      hashKey: authRateLimitHashKey,
    }),
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
  app.use('/api/admin/users', createAdminUsersRouter(service, administration));
  app.use('/api/admin/archive', createArchiveDiagnosticRouter(service, { enabled: environment.ARCHIVE_S3_PROBE_ENABLED === 'true' }));
  if (pool) {
    if (environment.ARCHIVE_PUBLIC_SEARCH_ENABLED === 'true') {
      app.use('/api/archive', createArchiveSearchRouter(pool));
    }
    app.use('/api/archive/documents', createArchiveDocumentRouter(pool, service, {
      pdfViewerEnabled: environment.ARCHIVE_PDF_VIEW_ENABLED === 'true',
      allowedOrigins: [...allowedOrigins],
    }));
    app.use('/api', createLegacyRouter(pool, service, usage, administration));
  }

  app.get('/health', (req, res) => res.json({ status: 'ok' }));

  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error?.type === 'entity.parse.failed') {
      return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'El cuerpo JSON no es válido.' } });
    }
    if (error?.status && error?.code) {
      if (error.code === 'QUERY_LIMIT_EXCEEDED' && error.details) {
        const resetSeconds = Math.ceil(new Date(error.details.resetsAt).getTime() / 1000);
        res.set({
          'RateLimit-Limit': String(error.details.limit),
          'RateLimit-Remaining': '0',
          'RateLimit-Reset': String(resetSeconds),
          'Retry-After': String(Math.max(0, resetSeconds - Math.ceil(Date.now() / 1000))),
        });
      }
      return res.status(error.status).json({
        error: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) },
      });
    }
    console.error('Unhandled request error', { method: req.method, path: req.path, name: error?.name });
    return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'No se ha podido completar la solicitud.' } });
  });

  return app;
}


