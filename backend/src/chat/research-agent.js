// Bounded, read-only historical research planner.
// A follow-up is about the preceding entity unless the user changes subject.
// Never allow an LLM to supply SQL, table names, document IDs or tool actions.
import { retrieveChatSources } from './historical-chat.js';

const MAX_QUERIES = 4;
const MAX_SOURCES = 6;
const GENERIC = new Set(['España', 'Bosco', 'Don', 'Salesianos', 'Salesiana', 'Salesiano', 'Revista', 'Alumnos', 'Antiguos', 'Asociación', 'Historia']);
const STOP = new Set(['que', 'quien', 'como', 'cuando', 'cuantos', 'cuantas', 'veces', 'cual', 'donde', 'para', 'sobre', 'desde', 'hasta', 'entre', 'historia', 'revista', 'revistas', 'documentos', 'archivo', 'alumnos', 'antiguos', 'salesiana', 'salesiano', 'salesianos', 'asociacion']);

function normalized(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function locationIn(text) {
  const matches = [...String(text ?? '').matchAll(/\b(?:en|de|del)\s+([A-ZÁÉÍÓÚÑ][\p{L}]{3,})/gu)];
  return matches.map(m=>m[1]).filter(s=>!GENERIC.has(s)).at(-1) ?? null;
}

function topic(text) {
  const n = normalized(text);
  if (/antiguos?\s+alumnos?|asociacion/.test(n)) return 'antiguos alumnos';
  if (/colegio|escuela|centro|instituto/.test(n)) return 'colegio salesiano';
  if (/oratorio/.test(n)) return 'oratorio';
  return null;
}

export function researchFocus(question, history = []) {
  const previousQuestions = history.filter(t => t?.role === 'user').map(t => t.text).reverse();
  const location = locationIn(question) ?? previousQuestions.map(locationIn).find(Boolean) ?? null;
  const context = [question, ...previousQuestions];
  const entity = context.map(topic).find(Boolean) ?? null;
  const q = normalized(question);
  const previousIntent = normalized(previousQuestions[0] ?? '');
  // A follow-up such as "¿y cuántos menciona la revista?" refers to the
  // presidency discussed in the immediately preceding user question.
  const elliptical = /^(?:y\s+)?(?:cuantos?|cuantas?|cuales?|quienes?)\b/.test(q);
  const intentText = elliptical ? q + ' ' + previousIntent : q;
  const intent = /presid|junta\s+directiva|eleccion|reeleccion/.test(intentText)
    ? 'presidencia' : /fundac|origen|comienzo/.test(q)
      ? 'fundacion' : /encuentro|actividad|fiesta|celebracion/.test(q)
        ? 'actividades' : 'general';
  return { location, entity, intent };
}

function sanitizedTokens(text) {
  return (normalized(text).match(/[a-z0-9]{3,}/g) ?? [])
    .filter(t => !STOP.has(t)).slice(0,6).join(' ');
}

export function planResearchQueries(question, history = []) {
  const focus = researchFocus(question, history);
  const loc = focus.location ?? '';
  const entity = focus.entity ?? '';
  const key = sanitizedTokens(question);
  const queries = [];
  const add = s => {
    const clean = s.trim().replace(/\s+/g,' ').slice(0,170);
    if (clean.length >= 3 && !queries.some(x=>normalized(x)===normalized(clean))) queries.push(clean);
  };
  if (focus.intent === 'presidencia') {
    add(`${loc} ${entity} presidente`);
    add(`${loc} ${entity} junta directiva`);
    add(`${loc} ${entity} elecciones reelegido`);
    add(`${loc} ${entity} nombramiento`);
  } else if (focus.intent === 'fundacion') {
    add(`${loc} ${entity} fundación`);
    add(`${loc} ${entity} aniversario historia`);
    add(`${loc} ${entity} comienzos`);
  } else if (focus.intent === 'actividades') {
    add(`${loc} ${entity} encuentros`);
    add(`${loc} ${entity} actividades`);
    add(`${loc} ${entity} fiesta`);
  } else {
    add(`${loc} ${entity} ${key}`);
    add(`${loc} ${entity} historia`);
    add(`${loc} ${entity} actividades`);
  }
  add(`${loc} ${entity} ${key}`);
  // No unscoped "presidente": results from national or unrelated associations
  // would be presented as if they were local evidence.
  if (focus.location && focus.entity) {
    return { focus, queries: queries.filter(q=>normalized(q).includes(normalized(focus.location))).slice(0,MAX_QUERIES) };
  }
  return { focus, queries: queries.slice(0,MAX_QUERIES) };
}

function evidenceScore(source, focus) {
  const text = normalized(source.excerpt);
  const local = focus.location ? text.includes(normalized(focus.location)) : true;
  const entity = focus.entity === 'antiguos alumnos'
    ? /antiguos?\s+alumn|asociacion/.test(text)
    : focus.entity === 'colegio salesiano'
      ? /colegio|escuela|centro|instituto/.test(text)
      : focus.entity === 'oratorio' ? text.includes('oratorio') : true;
  const direct = focus.intent === 'presidencia'
    ? /president|reelegid|junta\s+directiva|elecci[oó]n|nombrad/.test(text)
    : focus.intent === 'fundacion'
      ? /fundad|fundaci|inaugur|origen|comienz/.test(text)
      : focus.intent === 'actividades'
        ? /encuentro|actividad|fiesta|celebr|teatro|reuni/.test(text) : true;
  return { valid: local && entity && direct, score: Number(local)*5 + Number(entity)*3 + Number(direct)*3 };
}

/**
 * Rehydrate citations from earlier turns using *current* database authorization
 * rather than trusting page text or publication names sent from the browser.
 * A deleted or unindexed page cannot become evidence again.
 */
export async function revisitCitedSources(pool, trail = []) {
  const verified = [];
  const seen = new Set();
  for (const item of trail.slice(-4)) {
    if (!Number.isSafeInteger(item.documentId) || item.documentId < 1
      || !Number.isSafeInteger(item.page) || item.page < 1) continue;
    const key = item.documentId + ':' + item.page;
    if (seen.has(key)) continue;
    seen.add(key);
    const [rows] = await pool.execute(
      `SELECT d.id AS document_id, d.publication, d.publication_year,
              p.page_number, LEFT(p.text_content, 1250) AS excerpt
         FROM archive_pages p JOIN archive_documents d ON d.id = p.document_id
        WHERE d.indexed_at IS NOT NULL AND d.id = ? AND p.page_number = ?
        LIMIT 1`,
      [item.documentId, item.page],
    );
    const row = rows[0];
    if (!row || !row.excerpt || !Number.isSafeInteger(Number(row.document_id))
      || !Number.isSafeInteger(Number(row.page_number))) continue;
    verified.push({
      ref:'F1', documentId:Number(row.document_id), page:Number(row.page_number),
      publication:String(row.publication ?? '').slice(0,160),
      year:row.publication_year==null?null:Number(row.publication_year),
      excerpt:String(row.excerpt).replace(/\\s+/g,' ').slice(0,850),
    });
  }
  return verified;
}

export async function conductHistoricalResearch(pool, question, history = [], {
  retrieve = retrieveChatSources,
  maxQueries = MAX_QUERIES,
} = {}) {
  const { focus, queries } = planResearchQueries(question, history);
  const found = new Map();
  const performed = [];
  let failures = 0;
  // First investigate two distinct avenues, then broaden up to two more
  // only if the initial evidence is too sparse.
  for (let i = 0; i < queries.length && i < maxQueries; i++) {
    if (i >= 2 && [...found.values()].filter(s => evidenceScore(s,focus).valid).length >= 4) break;
    const query = queries[i];
    try {
      const results = await retrieve(pool,query);
      if (!Array.isArray(results)) throw new Error('INVALID_RESEARCH_RESULTS');
      performed.push(query);
      for (const s of results) {
        if (!Number.isSafeInteger(s.documentId) || !Number.isSafeInteger(s.page)
          || typeof s.excerpt !== 'string') continue;
        const k = s.documentId + ':' + s.page;
        if (!found.has(k)) found.set(k, { ...s });
      }
    } catch(e) {
      failures++;
      // Never give up on the entire answer because a single lexical route
      // cannot be indexed by FULLTEXT (e.g. OCR stopword queries).
      console.warn('Historical research query unavailable', { code: e?.code, name: e?.name });
    }
  }
  if (failures === performed.length + failures && failures > 0) throw new Error('RESEARCH_SEARCH_UNAVAILABLE');
  const ranked = [...found.values()]
    .map(s => ({ source:s, ...evidenceScore(s,focus) }))
    .filter(s => s.valid)
    .sort((a,b)=>b.score-a.score || a.source.documentId-b.source.documentId || a.source.page-b.source.page)
    .slice(0,MAX_SOURCES)
    .map((item,i)=>({ ...item.source, ref:'F'+(i+1) }));
  return { focus, queries: performed, sources: ranked, candidateCount: found.size };
}
