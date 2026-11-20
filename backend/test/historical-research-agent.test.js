import assert from 'node:assert/strict';
import test from 'node:test';
import {
  researchFocus, planResearchQueries, conductHistoricalResearch, revisitCitedSources,
} from '../src/chat/research-agent.js';

const history = [
  { role:'user', text:'Investiga la historia de la Asociación de Antiguos Alumnos de Don Bosco en Cádiz' },
  { role:'assistant', text:'En 2014 se menciona a Cristóbal Sánchez León como presidente [F1].' },
  { role:'user', text:'¿Cuántos presidentes ha tenido?' },
  { role:'assistant', text:'No dispongo de una lista exhaustiva, pero se menciona a Cristóbal.' },
];
const page = (id, text, pageNo=1) => ({
  ref:'F9', documentId:id, publication:'Don Bosco en España',
  year:1987, page:pageNo, excerpt:text,
});

test('BC-102 Cádiz association remains focus of elliptical follow-up rather than national presidents', () => {
  const focus = researchFocus('¿Y cuántos menciona la revista?', history);
  assert.equal(focus.location, 'Cádiz');
  assert.equal(focus.entity, 'antiguos alumnos');
  assert.equal(focus.intent, 'presidencia');
  const plan = planResearchQueries('¿Y cuántos menciona la revista?', history);
  assert.ok(plan.queries.length >= 3 && plan.queries.length <= 4);
  assert.ok(plan.queries.every(q=>q.includes('Cádiz')));
  assert.ok(plan.queries.some(q=>q.includes('junta directiva')));
});

test('BC-102 investigates several different read-only search avenues, deduplicates pages and excludes wrong presidency', async () => {
  const calls = [];
  const local = page(31,'En Cádiz la Asociación de Antiguos Alumnos eligió presidente a Cristóbal Sánchez León.');
  const other = page(90,'El presidente nacional de los antiguos alumnos presidió la reunión de Sevilla.');
  const second = page(32,'Los antiguos alumnos de Cádiz eligieron presidente a Manuel de la Vega en 1960.');
  const fallback = page(33,'La Junta Directiva de los Antiguos Alumnos de Cádiz volvió a reunirse.');
  const retrieve = async (_pool, query) => {
    calls.push(query);
    if (/junta/i.test(query)) return [fallback,other];
    if (/elecciones/i.test(query)) return [second,local];
    return [local,other];
  };
  const r = await conductHistoricalResearch({}, '¿Y cuántos menciona la revista?',history,{ retrieve });
  assert.ok(calls.length>=2&&calls.length<=4);
  assert.ok(r.sources.some(s=>s.documentId===31));
  assert.ok(r.sources.some(s=>s.documentId===32));
  assert.ok(r.sources.every(s=>s.documentId!==90));
  assert.equal(new Set(r.sources.map(s=>s.documentId+':'+s.page)).size,r.sources.length);
  assert.deepEqual(r.sources.map(s=>s.ref),r.sources.map((_,i)=>'F'+(i+1)));
});

test('BC-102 previous citations are read again through parameterized SQL and missing/deindexed are discarded', async () => {
  const queries=[];
  const pool={async execute(sql,args) {
    queries.push({sql,args});
    if(args[0]===99)return [[]];
    return [[{document_id:33,page_number:23,publication:'Don Bosco en España',publication_year:1978,text_content:'no',excerpt:'La asociación de antiguos alumnos de Cádiz eligió a su presidente.'}]];
  }};
  const result=await revisitCitedSources(pool,[
    {documentId:33,page:23}, {documentId:33,page:23}, {documentId:99,page:10},
  ]);
  assert.equal(result.length,1);
  assert.equal(result[0].documentId,33);
  assert.equal(result[0].year,1978);
  assert.equal(queries.length,2);
  assert.ok(queries.every(q=>q.sql.includes('indexed_at IS NOT NULL') && q.sql.includes('d.id = ?') && q.sql.includes('p.page_number = ?')));
  assert.deepEqual(queries[0].args,[33,23]);
});

test('BC-102 no unsupported claims when only documents about an unrelated association are found', async () => {
  const result=await conductHistoricalResearch({},'¿Cuántos presidentes ha tenido?',history,{
    retrieve:async()=>[page(66,'El presidente de la Confederación Nacional participó en un evento en Bilbao.')],
  });
  assert.equal(result.sources.length,0);
  assert.ok(result.queries.length>=2);
});

test('BC-108 Cádiz reference far from national association is not evidence of local history', async () => {
  const unrelated = page(111, 'En 1881 los salesianos llegaron al puerto de Cádiz. '
    + 'La noticia continuó con actividades educativas. '.repeat(15)
    + 'El presidente de la Asociación Nacional de Antiguos Alumnos visitó Madrid.');
  const local = page(112, 'La Asociación de Antiguos Alumnos de Cádiz celebró su asamblea.');
  const result = await conductHistoricalResearch({}, '¿Cuál es la historia de la asociación de Cádiz?', [], {
    retrieve: async () => [unrelated, local],
  });
  assert.ok(result.sources.some(s => s.documentId === 112));
  assert.ok(result.sources.every(s => s.documentId !== 111));
});
