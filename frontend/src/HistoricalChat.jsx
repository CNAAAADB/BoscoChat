import { useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL ?? '/api';

export default function HistoricalChat({ onOpenSource }) {
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    const input = question.trim();
    if (busy || input.length < 3 || input.length > 500) return;
    const history = messages.slice(-6).map((m) => ({ role: m.role, text: m.role === 'assistant' ? m.text.slice(0, 1200) : m.text }));
    setMessages((prior) => [...prior, { role: 'user', text: input }]);
    setQuestion('');
    setBusy(true);
    setError('');
    try {
      const response = await fetch(API_URL + '/admin/chat/message', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: input, history }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error?.message ?? 'No se ha podido contactar con el asistente.');
      if (typeof payload.answer !== 'string' || !Array.isArray(payload.sources)) throw new Error('Respuesta inesperada del asistente.');
      setMessages((prior) => [...prior, { role: 'assistant', text: payload.answer, sources: payload.sources }]);
    } catch (failure) {
      setMessages((prior) => prior.slice(0, -1));
      setQuestion(input);
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  const field = { width: '100%', boxSizing: 'border-box', borderRadius: 12, background: '#101528', border: '1px solid #42466b', color: '#fff', padding: 14, fontFamily: 'inherit' };
  return (
    <section aria-label="Chat histórico de administración" style={{ backgroundColor: '#18192d', border: '1px solid #34375e', borderRadius: 24, padding: 'clamp(18px, 4vw, 36px)', maxWidth: 940, margin: '0 auto 40px' }}>
      <h2 style={{ color: '#E6D7AA', marginTop: 0 }}>Chat histórico</h2>
      <p style={{ color: '#c5c7db', lineHeight: 1.6 }}>
        Conversa con BoscoChat sobre la historia salesiana, haz preguntas de seguimiento y explora las fuentes del archivo. Si no encuentra evidencias, te ayudará a reformular la búsqueda.
      </p>
      <div aria-live="polite" aria-label="Conversación" style={{ display: 'grid', gap: 14, marginBottom: 22 }}>
        {messages.length === 0 ? <p style={{ color: '#afb5cc' }}>Por ejemplo: «¿Qué actividades salesianas se mencionan en Barcelona?»</p> : null}
        {messages.map((message, index) => (
          <article key={index} style={{ background: message.role === 'user' ? '#242747' : '#111629', borderRadius: 14, padding: 18, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', textAlign: 'left', justifySelf: message.role === 'user' ? 'end' : 'start', width: 'min(100%, 760px)', boxSizing: 'border-box' }}>
            <strong style={{ color: '#E6D7AA' }}>{message.role === 'user' ? 'Tu pregunta' : 'BoscoChat'}</strong>
            <p style={{ lineHeight: 1.7, marginBottom: 4 }}>{message.text}</p>
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
          <button type="button" disabled={busy || messages.length === 0} onClick={() => { setMessages([]); setQuestion(''); setError(''); }}
            style={{ padding: '12px 22px', borderRadius: 10, background: 'transparent', border: '1px solid #75799a', color: '#fff', cursor: 'pointer' }}>Nueva conversación</button>
        </div>
      </form>
    </section>
  );
}
