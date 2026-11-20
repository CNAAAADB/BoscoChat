import express from 'express';
import { createHmac } from 'node:crypto';
import { requireAuthorization } from '../middleware/authorization.js';
import { createArchiveSearchRateLimiter } from '../middleware/archive-search-rate-limit.js';
import { MemoryAuthRateLimitStore } from '../middleware/auth-rate-limit.js';
import { validateChatInput, retrieveChatSources, rankChatSources, countPhraseIntent, countIndexedPhrase, chatPrompt, callBedrockChat } from '../chat/historical-chat.js';
import { conductHistoricalResearch, revisitCitedSources } from '../chat/research-agent.js';
import { chooseDebateFollowup, collectDebateFollowup, filterDebateFollowup } from '../chat/debate-followup.js';

export function createHistoricalChatRouter(pool, authService, {
  enabled = false,
  rateLimitStore = new MemoryAuthRateLimitStore(),
  hashKey = 'local-dev-only',
  region = 'us-east-1',
  retrieve = retrieveChatSources,
  converse = callBedrockChat,
  councilEnabled = false,
  councilExpansionEnabled = false,
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
      // Investigation is multi-pass and entity-focused; archived references
      // from previous turns are reauthorized against current indexed rows.
      // The alternative concise modes keep the existing lightweight search.
      let sources;
      let research = null;
      if (input.depth === 'research') {
        const investigation = await conductHistoricalResearch(pool, input.question, input.history, { retrieve });
        const previous = await revisitCitedSources(pool, input.sourceTrail);
        const combined = new Map();
        // Previously cited, still indexed evidence is useful for follow-ups.
        // Never trust the browser's publication/year or excerpt as evidence.
        for (const s of [...previous, ...investigation.sources]) {
          const key = s.documentId + ':' + s.page;
          if (!combined.has(key)) combined.set(key,s);
        }
        sources = [...combined.values()].slice(0,6).map((s,i)=>({ ...s, ref:'F'+(i+1) }));
        research = { focus: investigation.focus, queries: investigation.queries,
          candidates: investigation.candidateCount,
          verifiedPreviousSources: previous.length, retrievedSources: investigation.sources.length };
      } else {
        sources = rankChatSources(input.question, await retrieve(pool, input.question), { maxSources: 3 });
      }
      const prompt = chatPrompt({ ...input, sources, count, research });
      if (councilEnabled && input.depth === 'research' && sources.length >= 2) {
        prompt.council = { refs: sources.map(s => s.ref),
          evidence: sources.map(s => ({ ref: s.ref, text: s.excerpt })),
        };
      }
      // One strict 22s wall-clock budget for BOTH optional rounds, including
      // DB follow-up. A slow first round never earns a new unbounded timeout.
      const deadline = Date.now() + 22_000;
      async function invokeWithinBudget(inputPrompt) {
        const remaining = deadline - Date.now();
        if (remaining < 1000) {
          const error = new Error('COUNCIL_DEADLINE_EXCEEDED');
          error.name = 'TimeoutError';
          throw error;
        }
        return converse(inputPrompt, { region, abortSignal: AbortSignal.timeout(remaining) });
      }
      const expand = councilEnabled && councilExpansionEnabled
        && input.depth === 'research' && sources.length >= 2;
      if (expand) prompt.council.phase = 'probe';
      let inference = await invokeWithinBudget(prompt);
      if (expand && inference.probe) {
        const firstUsage = inference.usage;
        const query = chooseDebateFollowup(input.question, input.history, research?.queries ?? []);
        const followup = await collectDebateFollowup(pool, query, sources, { retrieve });
        const selected = filterDebateFollowup(followup.sources, research?.focus ?? {});
        const combined = [...sources, ...selected].slice(0, 6);
        sources = combined.map((source, i) => ({ ...source, ref: 'F' + (i + 1) }));
        // The existing archive search and SQL authorization remain the source
        // of truth. No model-generated text is used to formulate a DB query.
        const second = chatPrompt({ ...input, sources, count, research });
        second.council = {
          phase: 'resolve', previous: inference.probe,
          refs: sources.map(source => source.ref),
          evidence: sources.map(source => ({ ref: source.ref, text: source.excerpt })),
        };
        inference = await invokeWithinBudget(second);
        if (typeof inference.text !== 'string' || !inference.council) {
          throw new Error('INVALID_COUNCIL_RESOLUTION');
        }
        inference = {
          ...inference,
          usage: {
            inputTokens: firstUsage.inputTokens + inference.usage.inputTokens,
            outputTokens: firstUsage.outputTokens + inference.usage.outputTokens,
          },
          council: {
            ...inference.council, rounds: 2,
            followupSearches: followup.attempted ? 1 : 0,
          },
        };
      }
      const { text, usage, council } = inference;
      // Citation IDs and navigation targets are generated only from trusted SQL rows.
      // Do not display every retrieved result as if it were a source for the
      // answer. Only expose citations the model actually included.
      // A model can invent a citation label even after critique. In the opt-in
      // council route, replace any label not present in the server's SQL result.
      const allowed = new Set(sources.map(s => s.ref));
      const safeText = council ? text.replace(/\[F\d{1,4}\]/g, label =>
        allowed.has(label.slice(1, -1)) ? label : '[referencia no verificada]') : text;
      const cited = new Set([...safeText.matchAll(/\[F[1-6]\]/g)].map(m => m[0].slice(1,-1)));
      const safeSources = sources.filter(source => cited.has(source.ref))
        .map(({ ref, documentId, publication, year, page }) => ({ ref, documentId, publication, year, page }));
      res.set('Cache-Control', 'private, no-store');
      console.info('Historical chat inference', { userId: req.user.id, sourceCount: safeSources.length, searchCount: research?.queries?.length ?? 1, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens });
      return res.json({ answer: safeText, sources: safeSources, usage, depth: input.depth,
        ...(council ? { council: { status: council.status, agreedCount: council.agreedCount,
          disputedCount: council.disputedCount,
          rounds: council.rounds ?? 1,
          followupSearches: council.followupSearches ?? 0 } } : {}),
      });
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
