import { useEffect, useState } from 'react';
import { loadChatSession, saveChatSession, clearChatSession } from './chat-session.js';
import { chatHttpError, chatNetworkError } from './chat-errors.js';

const API_URL = import.meta.env.VITE_API_URL ?? '/api';

export default function HistoricalChat({ onOpenSource, userId }) {
  const [initial] = useState(() => loadChatSession(window.sessionStorage, userId));
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState(() => initial?.messages ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [depth, setDepth] = useState(() => initial?.depth ?? 'research');

  useEffect(() => {
    saveChatSession(window.sessionStorage, userId, messages, depth);
  }, [userId, messages, depth]);

  async function submit(event) {
    event.preventDefault();
    const input = question.trim();
    if (busy || input.length < 3 || input.length > 500) return;
    const history = messages.slice(-8).map((m) => ({ role: m.role, text: m.role === 'assistant' ? m.text.slice(0, 1800) : m.text }));
    const sourceTrail = messages.filter(m => m.role === 'assistant')
      .slice(-3).flatMap(m => m.sources ?? [])
      .slice(-6).map(({ documentId, page }) => ({ documentId, page }));
    setMessages((prior) => [...prior, { role: 'user', text: input }]);
    setQuestion('');
    setBusy(true);
    setError('');
    try {
      const response = await fetch(API_URL + '/admin/chat/message', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: input, history, depth, sourceTrail }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(chatHttpError(response.status, payload));
      if (typeof payload?.answer !== 'string' || !Array.isArray(payload.sources)) throw new Error('El servidor ha enviado una respuesta incompleta. Tu conversación se conserva; puedes reintentarlo.');
      setMessages((prior) => [...prior, { role: 'assistant', text: payload.answer, sources: payload.sources, ...(payload.council ? { council: payload.council } : {}) }].slice(-40));
    } catch (failure) {
      setMessages((prior) => prior.slice(0, -1));
      setQuestion(input);
      setError(chatNetworkError(failure));
    } finally {
      setBusy(false);
    }
  }

  const field = { width: '100%', boxSizing: 'border-box', borderRadius: 12, background: '#101528', border: '1px solid #42466b', color: '#fff', padding: 14, fontFamily: 'inherit' };
  return (
    <section aria-label="Chat histórico de administración" style={{ backgroundColor: '#18192d', border: '1px solid #34375e', borderRadius: 24, padding: 'clamp(18px, 4vw, 36px)', maxWidth: 940, margin: '0 auto 40px' }}>
      <h2 style={{ color: '#E6D7AA', marginTop: 0 }}>Chat histórico</h2>
      <p style={{ color: '#c5c7db', lineHeight: 1.6 }}>
        Investiga la historia salesiana con referencias a las revistas y sus páginas. Puedes continuar el diálogo y abrir las fuentes sin perder esta conversación. Se conserva temporalmente en esta pestaña hasta que cierres sesión.
      </p>
      <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <label htmlFor="boscochat-depth" style={{ color: '#E6D7AA', fontWeight: 700 }}>Profundidad de las respuestas</label>
        <select id="boscochat-depth" value={depth} disabled={busy} onChange={(event) => setDepth(event.target.value)}
          style={{ borderRadius: 10, border: '1px solid #75799a', background: '#101528', color: 'white', padding: '10px 12px' }}>
          <option value="research">Investigación — análisis detallado y referencias</option>
          <option value="auto">Automática — según la pregunta</option>
          <option value="brief">Breve — respuesta directa</option>
        </select>
      </div>
      <div aria-live="polite" aria-label="Conversación" style={{ display: 'grid', gap: 14, marginBottom: 22 }}>
        {messages.length === 0 ? <p style={{ color: '#afb5cc' }}>Por ejemplo: «¿Qué actividades salesianas se mencionan en Barcelona?»</p> : null}
        {messages.map((message, index) => (
          <article key={index} style={{ background: message.role === 'user' ? '#242747' : '#111629', borderRadius: 14, padding: 18, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', textAlign: 'left', justifySelf: message.role === 'user' ? 'end' : 'start', width: 'min(100%, 760px)', boxSizing: 'border-box' }}>
            <strong style={{ color: '#E6D7AA' }}>{message.role === 'user' ? 'Tu pregunta' : 'BoscoChat'}</strong>
            <p style={{ lineHeight: 1.7, marginBottom: 4 }}>{message.text}</p>
            {message.role === 'assistant' && message.council ? (
              <p style={{ fontSize: 12, color: '#b7c3de', margin: '8px 0' }} role="status">
                {(message.council.rounds === 2
                  ? 'Se realizó una segunda deliberación' + (message.council.followupSearches ? ' con búsqueda documental adicional' : '') + '. '
                  : '')
                + (message.council.status === 'agreed'
                  ? 'Análisis contrastado por varios especialistas. El acuerdo entre modelos no sustituye la comprobación de fuentes.'
                  : 'Los especialistas no han resuelto todas las discrepancias. Revisa las citas y las incertidumbres indicadas.')}
              </p>
            ) : null}
            {message.sources?.length ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }} aria-label="Fuentes documentales">
                {message.sources.map((source) => (
                  <button type="button" key={source.ref} onClick={() => onOpenSource(source)}
                    style={{ border: '1px solid #6b6f94', borderRadius: 10, background: '#202545', color: '#e8e5d5', padding: '9px 12px', cursor: 'pointer' }}>
                    [{source.ref}] {source.publication} {source.year ?? ''} · p. {source.page}
                  </button>
                ))}
              </div>
            ) : null}
          </article>
        ))}
        {busy ? <p role="status">Consultando el archivo y generando una respuesta…</p> : null}
        {error ? <p role="alert" style={{ color: '#ff9999' }}>{error}</p> : null}
      </div>
      <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
        <label htmlFor="boscochat-question" style={{ color: '#E6D7AA', fontWeight: 700 }}>Tu mensaje</label>
        <textarea id="boscochat-question" rows={3} style={field} maxLength={500} minLength={3} required disabled={busy} value={question}
          onChange={(event) => setQuestion(event.target.value)} placeholder="Pregúntame sobre el archivo o continúa la conversación…" />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <button type="submit" disabled={busy || question.trim().length < 3} style={{ padding: '12px 24px', borderRadius: 10, background: '#E6D7AA', color: '#111', border: 0, fontWeight: 800, cursor: busy ? 'wait' : 'pointer' }}>Enviar</button>
          <button type="button" disabled={busy || messages.length === 0} onClick={() => { clearChatSession(window.sessionStorage, userId); setMessages([]); setQuestion(''); setError(''); }}
            style={{ padding: '12px 22px', borderRadius: 10, background: 'transparent', border: '1px solid #75799a', color: '#fff', cursor: 'pointer' }}>Nueva conversación</button>
        </div>
      </form>
    </section>
  );
}
