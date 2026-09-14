import { useEffect, useState } from 'react';
import { currentSession, login, logout, register } from './api/auth.js';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api';

export default function App() {
  const [view, setView] = useState('home');
  const [user, setUser] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState('');
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [registration, setRegistration] = useState({ username: '', email: '', password: '', terms: false });
  const [credentials, setCredentials] = useState({ email: '', password: '' });
  const [newDoc, setNewDoc] = useState({ title: '', content: '', page: 1 });

  useEffect(() => {
    currentSession()
      .then(({ user: restoredUser }) => setUser(restoredUser))
      .catch(() => setUser(null))
      .finally(() => setSessionLoading(false));
  }, []);

  const styles = {
    container: { backgroundColor: '#0a0a0a', color: '#fff', minHeight: '100vh', fontFamily: 'Montserrat, sans-serif', padding: '40px 20px' },
    header: { textAlign: 'center', marginBottom: '60px' },
    mainTitle: { fontSize: 'clamp(3rem, 10vw, 6rem)', fontWeight: 900, margin: 0, letterSpacing: '-4px' },
    subTitle: { color: '#E6D7AA', letterSpacing: 'clamp(5px, 2vw, 18px)', fontWeight: 'bold', fontSize: '1.2rem', marginTop: '25px', display: 'block', textTransform: 'uppercase' },
    nav: { display: 'flex', flexWrap: 'wrap', gap: '30px', justifyContent: 'center', padding: '20px 0', borderTop: '1px solid #28295E', borderBottom: '1px solid #28295E', marginBottom: '50px' },
    navBtn: { background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px', fontSize: '0.85rem' },
    card: { backgroundColor: 'rgba(25, 25, 45, 0.9)', padding: 'clamp(24px, 5vw, 50px)', borderRadius: '32px', border: '1px solid #28295E', maxWidth: '1000px', margin: '0 auto 40px' },
    sectionTitle: { color: '#E6D7AA', fontSize: '2.2rem', fontWeight: 900, marginBottom: '25px', borderLeft: '6px solid #E6D7AA', paddingLeft: '20px' },
    input: { boxSizing: 'border-box', width: '100%', padding: '18px', backgroundColor: '#111', border: '1px solid #555', borderRadius: '15px', color: 'white', marginBottom: '15px', fontSize: '1rem' },
    btnPrimary: { padding: '18px 40px', backgroundColor: '#E6D7AA', color: '#121212', border: 'none', borderRadius: '50px', fontWeight: 900, cursor: 'pointer', textTransform: 'uppercase' },
    error: { background: '#491919', border: '1px solid #ff7777', borderRadius: '12px', color: '#fff', padding: '12px', marginBottom: '16px' },
  };

  const submitRegistration = async (event) => {
    event.preventDefault();
    setAuthError('');
    if (!registration.terms) {
      setAuthError('Debes aceptar la política de protección de datos.');
      return;
    }
    setAuthBusy(true);
    try {
      await register(registration);
      setCredentials({ email: registration.email, password: '' });
      setRegistration({ username: '', email: '', password: '', terms: false });
      setView('login');
    } catch (error) {
      setAuthError(error.message);
    } finally {
      setAuthBusy(false);
    }
  };

  const submitLogin = async (event) => {
    event.preventDefault();
    setAuthBusy(true);
    setAuthError('');
    try {
      const result = await login(credentials);
      setUser(result.user);
      setCredentials({ email: '', password: '' });
      setView('home');
    } catch (error) {
      setAuthError(error.message);
    } finally {
      setAuthBusy(false);
    }
  };

  const signOut = async () => {
    try {
      await logout();
    } catch (error) {
      setAuthError(error.message);
    } finally {
      setUser(null);
      setView('home');
    }
  };

  const isAdmin = user && (user.role === 'admin' || user.role === 'gestor');

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.mainTitle}>BOSCOCHAT</h1>
        <span style={styles.subTitle}>PRAEIT AC TUETUR</span>
      </header>

      <nav style={styles.nav} aria-label="Navegación principal">
        <button style={styles.navBtn} onClick={() => setView('home')}>Inicio</button>
        <button style={styles.navBtn} onClick={() => setView('buscador')}>Archivo</button>
        {!sessionLoading && !user ? (
          <>
            <button style={styles.navBtn} onClick={() => { setAuthError(''); setView('login'); }}>Entrar</button>
            <button style={{ ...styles.navBtn, color: '#E6D7AA' }} onClick={() => { setAuthError(''); setView('registro'); }}>Únete</button>
          </>
        ) : null}
        {user ? (
          <>
            {isAdmin ? <button style={styles.navBtn} onClick={() => setView('admin')}>Gestionar archivo</button> : null}
            <button style={{ ...styles.navBtn, color: '#ff7777' }} onClick={signOut}>Salir</button>
          </>
        ) : null}
      </nav>

      {view === 'home' ? (
        <section style={styles.card}>
          <h2 style={styles.sectionTitle}>Identidad Salesiana</h2>
          <p style={{ lineHeight: 1.9, fontSize: '1.2rem' }}>Los antiguos alumnos salesianos somos personas basadas en el Sistema Preventivo: <strong>razón, religión y bondad amorosa.</strong></p>
          {user ? <p>Sesión iniciada como <strong>{user.username}</strong> ({user.role}).</p> : null}
        </section>
      ) : null}

      {view === 'registro' ? (
        <form style={{ ...styles.card, maxWidth: '500px' }} onSubmit={submitRegistration}>
          <h2 style={styles.sectionTitle}>Registro</h2>
          {authError ? <p role="alert" style={styles.error}>{authError}</p> : null}
          <label>Nombre de usuario<input required minLength="2" maxLength="80" autoComplete="username" style={styles.input} value={registration.username} onChange={(event) => setRegistration({ ...registration, username: event.target.value })} /></label>
          <label>Correo electrónico<input required type="email" autoComplete="email" style={styles.input} value={registration.email} onChange={(event) => setRegistration({ ...registration, email: event.target.value })} /></label>
          <label>Contraseña<input required type="password" minLength="12" maxLength="128" autoComplete="new-password" style={styles.input} value={registration.password} onChange={(event) => setRegistration({ ...registration, password: event.target.value })} /></label>
          <label><input type="checkbox" checked={registration.terms} onChange={(event) => setRegistration({ ...registration, terms: event.target.checked })} /> Acepto la política de protección de datos</label>
          <p>Usa al menos 12 caracteres. Tu contraseña nunca se almacena en texto plano.</p>
          <button style={styles.btnPrimary} disabled={authBusy} type="submit">{authBusy ? 'Creando…' : 'Crear cuenta'}</button>
        </form>
      ) : null}

      {view === 'login' ? (
        <form style={{ ...styles.card, maxWidth: '450px' }} onSubmit={submitLogin}>
          <h2 style={styles.sectionTitle}>Entrar</h2>
          {authError ? <p role="alert" style={styles.error}>{authError}</p> : null}
          <label>Correo electrónico<input required type="email" autoComplete="email" style={styles.input} value={credentials.email} onChange={(event) => setCredentials({ ...credentials, email: event.target.value })} /></label>
          <label>Contraseña<input required type="password" autoComplete="current-password" style={styles.input} value={credentials.password} onChange={(event) => setCredentials({ ...credentials, password: event.target.value })} /></label>
          <button style={styles.btnPrimary} disabled={authBusy} type="submit">{authBusy ? 'Accediendo…' : 'Acceder'}</button>
        </form>
      ) : null}

      {view === 'buscador' ? (
        <section style={styles.card}>
          <h2 style={styles.sectionTitle}>Buscador Histórico</h2>
          <div style={{ display: 'flex', gap: '15px', marginBottom: '40px' }}>
            <input style={styles.input} aria-label="Consulta" placeholder="Buscar..." value={search} onChange={(event) => setSearch(event.target.value)} />
            <button style={styles.btnPrimary} onClick={async () => {
              const response = await fetch(`${API_URL}/search?q=${encodeURIComponent(search)}&userId=${user?.id ?? ''}`, { credentials: 'include' });
              setResults(response.ok ? await response.json() : []);
            }}>Buscar</button>
          </div>
          {results.map((result) => (
            <article key={`${result.title}-${result.page_number}`} style={{ padding: '20px', background: '#1a1a2e', borderRadius: '20px', marginBottom: '10px' }}>
              <h3 style={{ color: '#E6D7AA' }}>{result.title} (Pág. {result.page_number})</h3>
              <p>{result.text_content}</p>
            </article>
          ))}
        </section>
      ) : null}

      {view === 'admin' && isAdmin ? (
        <section style={styles.card}>
          <h2 style={styles.sectionTitle}>Panel de Gestión Documental</h2>
          <input style={styles.input} placeholder="Título del documento" value={newDoc.title} onChange={(event) => setNewDoc({ ...newDoc, title: event.target.value })} />
          <input style={styles.input} type="number" min="1" value={newDoc.page} onChange={(event) => setNewDoc({ ...newDoc, page: event.target.value })} />
          <textarea style={{ ...styles.input, height: '200px' }} placeholder="Texto OCR" value={newDoc.content} onChange={(event) => setNewDoc({ ...newDoc, content: event.target.value })} />
          <button style={styles.btnPrimary} onClick={async () => {
            const response = await fetch(`${API_URL}/admin/upload-doc`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newDoc) });
            if (response.ok) setNewDoc({ title: '', content: '', page: 1 });
          }}>Subir al archivo</button>
        </section>
      ) : null}
    </div>
  );
}
