import express from 'express';
import { createHmac } from 'node:crypto';
import { requireAuthorization } from '../middleware/authorization.js';
import { createArchiveSearchRateLimiter } from '../middleware/archive-search-rate-limit.js';
import { MemoryAuthRateLimitStore } from '../middleware/auth-rate-limit.js';
import { validateChatInput, retrieveChatSources, rankChatSources, countPhraseIntent, countIndexedPhrase, chatPrompt, callBedrockChat } from '../chat/historical-chat.js';

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
      // Any deterministic database count is evidence for the model, not a
      // canned answer. Never equate zero exact matches with zero historical
      // references (variants and OCR inaccuracies are common).
      const countPhrase = countPhraseIntent(input.question);
      let count = null;
      if (countPhrase) {
        try {
          count = await countIndexedPhrase(pool, countPhrase);
        } catch (error) {
          console.warn('Historical chat exact-count unavailable', { code: error?.code, name: error?.name });
        }
      }
      let sources = await retrieve(pool, input.question);
      // A follow-up like "¿Y en Madrid?" often requires terms from the
      // previous question to retrieve the right documentary context.
      if (sources.length === 0 && input.history.length) {
        const priorQuestion = [...input.history].reverse().find(turn => turn.role === 'user')?.text;
        if (priorQuestion) {
          const joined = priorQuestion.slice(0, 230) + ' ' + input.question.slice(0, 230);
          sources = await retrieve(pool, joined);
        }
      }
      sources = rankChatSources(input.question, sources);
      const prompt = chatPrompt({ ...input, sources, count });
      const { text, usage } = await converse(prompt, {
        region,
        abortSignal: AbortSignal.timeout(22000),
      });
      // Citation IDs and navigation targets are generated only from trusted SQL rows.
      // Do not display every retrieved result as if it were a source for the
      // answer. Only expose citations the model actually included.
      const cited = new Set([...text.matchAll(/\\[F[1-3]\\]/g)].map(m => m[0].slice(1,-1)));
      const safeSources = sources.filter(source => cited.has(source.ref))
        .map(({ ref, documentId, publication, year, page }) => ({ ref, documentId, publication, year, page }));
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
