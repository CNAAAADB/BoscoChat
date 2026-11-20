// BC-107: bounded deterministic follow-up; the model NEVER creates SQL or selects tables.
// Used only if the initial evidence council reports a material disagreement.
import { planResearchQueries, evidenceScore } from './research-agent.js';

const EXTRA = Object.freeze({
  presidencia: 'nombramiento actas',
  fundacion: 'origen aniversario',
  actividades: 'reuniones cronica',
  general: 'documentacion historia',
});
function clean(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es').replace(/\s+/g, ' ').trim();
}

export function chooseDebateFollowup(question, history = [], performed = []) {
  if (typeof question !== 'string' || question.length > 500
    || !Array.isArray(performed) || performed.length > 8 || performed.some(q => typeof q !== 'string')) {
    throw new Error('INVALID_DEBATE_PLAN');
  }
  const plan = planResearchQueries(question, history);
  const used = new Set(performed.map(clean));
  const next = plan.queries.find(query => !used.has(clean(query)));
  if (next) return next;
  // Fallback is a fixed vocabulary on the server; never extrapolate from
  // agent claims or let document content become a search instruction.
  const { location, entity, intent } = plan.focus;
  if (!location || !entity) return null;
  const query = (location + ' ' + entity + ' ' + EXTRA[intent]).trim().slice(0, 170);
  return used.has(clean(query)) ? null : query;
}

export async function collectDebateFollowup(pool, query, existing, { retrieve, limit = 2 } = {}) {
  if (query === null) return { attempted: false, sources: [] };
  if (typeof query !== 'string' || query.length < 3 || query.length > 170
    || !Array.isArray(existing) || existing.length > 6
    || typeof retrieve !== 'function' || limit !== 2) {
    throw new Error('INVALID_DEBATE_FOLLOWUP');
  }
  if (existing.length >= 6) return { attempted: false, sources: [] };
  // Maximum one read-only archive search. Never retry an error from a low-quality OCR index.
  try {
    const result = await retrieve(pool, query);
    if (!Array.isArray(result)) throw new Error('INVALID_DEBATE_RESULTS');
    const seen = new Set(existing.map(s => s.documentId + ':' + s.page));
    const selected = [];
    for (const source of result.slice(0, 12)) {
      if (!Number.isSafeInteger(source?.documentId) || source.documentId <= 0
        || !Number.isSafeInteger(source?.page) || source.page <= 0
        || typeof source.excerpt !== 'string' || !source.excerpt.trim()
        || source.excerpt.length > 1250) continue;
      const key = source.documentId + ':' + source.page;
      if (seen.has(key)) continue;
      seen.add(key);
      selected.push(source);
      if (selected.length >= Math.min(limit, 6 - existing.length)) break;
    }
    return { attempted: true, sources: selected };
  } catch (error) {
    console.warn('Debate followup search unavailable', { code: error?.code, name: error?.name });
    return { attempted: true, sources: [], failed: true };
  }
}

export function filterDebateFollowup(sources, focus) {
  return sources.filter(s => evidenceScore(s, focus).valid);
}
