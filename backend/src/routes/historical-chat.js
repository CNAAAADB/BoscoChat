import express from 'express';
import { createHmac } from 'node:crypto';
import { requireAuthorization } from '../middleware/authorization.js';
import { createArchiveSearchRateLimiter } from '../middleware/archive-search-rate-limit.js';
import { MemoryAuthRateLimitStore } from '../middleware/auth-rate-limit.js';
import { validateChatInput, retrieveChatSources, chatPrompt, callBedrockChat } from '../chat/historical-chat.js';

export function createHistoricalChatRouter(pool, authService, {
  enabled = false,
  rateLimitStore = new MemoryAuthRateLimitStore(),
  hashKey = 'local-dev-only',
  region = 'us-east-1',
  retrieve = retrieveChatSources,
  converse = callBedrockChat,
} = {}) {
  const router = express.Router();
  const adminOnly = requireAuthorization(authService, new Set(['administrator']));
  // The flag does not weaken the role barrier; disabled endpoints are still non-public.
  router.use(adminOnly);
  router.use((req, res, next) => enabled ? next() : res.status(404).json({
    error: { code: 'CHAT_DISABLED', message: 'El asistente no está disponible.' },
  }));
  router.use(createArchiveSearchRateLimiter({
    store: rateLimitStore,
    hashKey,
    scope: 'administrator-historical-chat',
    limit: 5,
    windowMs: 60_000,
  }));

  // A second, per-admin daily ceiling survives IP rotation and protects inference cost.
  router.use(async (req, res, next) => {
    try {
      const timestamp = Date.now();
      const hashedUser = createHmac('sha256', hashKey).update('admin-chat-daily:' + req.user.id).digest('hex');
      const identityKey = createHmac('sha256', hashKey).update('admin-chat-day-identity:' + req.user.id).digest('hex');
      const result = await rateLimitStore.consume({ ip: hashedUser, identity: identityKey }, {
        timestamp, resetAt: timestamp + 86_400_000, ipLimit: 30, identityLimit: 30,
      });
      if (result) return res.status(429).json({ error: { code: 'CHAT_DAILY_LIMIT', message: 'Se ha alcanzado el límite diario de conversaciones del piloto.' } });
      return next();
    } catch (error) { return next(error); }
  });

  router.post('/message', async (req, res) => {
    try {
      const input = validateChatInput(req.body);
      const sources = await retrieve(pool, input.question);
      if (!Array.isArray(sources) || sources.length === 0) {
        return res.json({ answer: 'No he encontrado fragmentos del archivo histórico que permitan responder a esa pregunta. Prueba con otros términos.', sources: [], usage: { inputTokens: 0, outputTokens: 0 } });
      }
      const prompt = chatPrompt({ ...input, sources });
      const { text, usage } = await converse(prompt, {
        region,
        abortSignal: AbortSignal.timeout(22000),
      });
      // Citation IDs and navigation targets are generated only from trusted SQL rows.
      const safeSources = sources.map(({ ref, documentId, publication, year, page }) => ({ ref, documentId, publication, year, page }));
      res.set('Cache-Control', 'private, no-store');
      console.info('Historical chat inference', { userId: req.user.id, sourceCount: safeSources.length, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens });
      return res.json({ answer: text, sources: safeSources, usage });
    } catch (error) {
      if (error?.status === 400 && error?.code === 'INVALID_CHAT_INPUT') {
        return res.status(400).json({ error: { code: error.code, message: error.message } });
      }
      if (error?.name === 'AbortError' || error?.name === 'TimeoutError') {
        return res.status(504).json({ error: { code: 'CHAT_TIMEOUT', message: 'El modelo ha tardado demasiado. Inténtalo de nuevo.' } });
      }
      // Do not reveal OCR passages, prompts, model details, credentials or internal errors.
      console.error('Historical chat failed', { name: error?.name, code: error?.code });
      return res.status(502).json({ error: { code: 'CHAT_UNAVAILABLE', message: 'No se ha podido consultar el asistente. Inténtalo de nuevo.' } });
    }
  });
  return router;
}
