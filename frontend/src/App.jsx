import { useEffect, useState } from 'react';
import { currentSession, login, logout, register } from './api/auth.js';
import { changeUserRole, createUser, deleteUser, listUsers, setUserSuspended } from './api/users.js';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api';
// Switch on only after RDS archive migration, real ingestion and API deployment.
const ARCHIVE_SEARCH_ENABLED = import.meta.env.VITE_ARCHIVE_SEARCH === 'true';
const ARCHIVE_PDF_VIEW_ENABLED = import.meta.env.VITE_ARCHIVE_PDF_VIEW === 'true';
const SEARCH_MODES = [
  { value: 'relevance', label: 'Más relevantes' },
  { value: 'all', label: 'Todas las palabras' },
  { value: 'any', label: 'Cualquiera de las palabras' },
  { value: 'exact', label: 'Frase exacta' },
];

function highlightSearchTerms(text, search) {
  const words = [...new Set((search.match(/[\\p{L}\\p{N}]{2,}/gu) ?? []).map((word) => word.toLocaleLowerCase('es')))];
  if (!words.length || !text) return text;
  const escaped = words.map((word) => word.replace(/[.*+?^${}()|[\\]\\]/g, '\\\\const ROLES = ['free''));
  const parts = String(text).split(new RegExp('(' + escaped.join('|') + ')', 'giu'));
  return parts.map((part, index) => words.includes(part.toLocaleLowerCase('es'))
    ? <mark key={index} style={{ background: '#E6D7AA', color: '#121212', borderRadius: 2 }}>{part}</mark>
    : part);
}

const ROLES = ['free', 'pro', 'premium', 'advanced', 'administrator', 'documentary_manager'];

export default function App() {
  const [view, setView] = useState('home');
  const [user, setUser] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState('');
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [searchError, setSearchError] = useState('');
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchYear, setSearchYear] = useState('');
  const [searchMode, setSearchMode] = useState('relevance');
  const [selectedPage, setSelectedPage] = useState(null);
  const [pagePreview, setPagePreview] = useState(null);
  const [pageBusy, setPageBusy] = useState(false);
  const [pageError, setPageError] = useState('');
  const [registration, setRegistration] = useState({ username: '', email: '', password: '', terms: false });
  const [credentials, setCredentials] = useState({ email: '', password: '' });
  const [newDoc, setNewDoc] = useState({ title: '', content: '', page: 1 });
  const [users, setUsers] = useState([]);
  const [userAdminError, setUserAdminError] = useState('');
  const [userAdminBusy, setUserAdminBusy] = useState(false);
  const [newUser, setNewUser] = useState({ username: '', email: '', password: '', role: 'free' });

  useEffect(() => {
    currentSession()
      .then(({ user: restoredUser }) => setUser(restoredUser))
      .catch(() => setUser(null))
      .finally(() => setSessionLoading(false));
  }, []);

  useEffect(() => {
    if (view !== 'users' || user?.role !== 'administrator') return;
    setUserAdminBusy(true);
    setUserAdminError('');
    listUsers()
      .then(({ users: records }) => setUsers(records))
      .catch((error) => setUserAdminError(error.message))
      .finally(() => setUserAdminBusy(false));
  }, [view, user]);

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
      if (selectedPage && ARCHIVE_SEARCH_ENABLED) {
        setView('documento');
      } else {
        setView('home');
      }
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

  const isAdministrator = user?.role === 'administrator';
  const canManageDocuments = isAdministrator || user?.role === 'documentary_manager';

  const refreshUsers = async () => {
    const result = await listUsers();
    setUsers(result.users);
  };

  const runUserAdministration = async (operation) => {
    setUserAdminBusy(true);
    setUserAdminError('');
    try {
      await operation();
      await refreshUsers();
    } catch (error) {
      setUserAdminError(error.message);
    } finally {
      setUserAdminBusy(false);
    }
  };

  const openSearchResult = (result) => {
    if (!ARCHIVE_SEARCH_ENABLED) return;
    setSelectedPage({ documentId: result.document_id, pageNumber: result.page_number, title: result.publication, year: result.publication_year });
    setPagePreview(null);
    setPageError('');
    if (user) setView('documento');
    else { setAuthError(''); setView('login'); }
  };

  useEffect(() => {
    if (view !== 'documento' || !user || !selectedPage || !ARCHIVE_SEARCH_ENABLED) return;
    let cancelled = false;
    setPageBusy(true);
    setPageError('');
    fetch(`${API_URL}/archive/documents/${encodeURIComponent(selectedPage.documentId)}/pages/${encodeURIComponent(selectedPage.pageNumber)}`, { credentials: 'include' })
      .then(async (response) => {
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.error?.message ?? 'No se ha podido abrir el documento.');
        return data.page;
      })
      .then((page) => { if (!cancelled) setPagePreview(page); })
      .catch((error) => { if (!cancelled) setPageError(error.message); })
      .finally(() => { if (!cancelled) setPageBusy(false); });
    return () => { cancelled = true; };
  }, [view, selectedPage, user]);

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
            {canManageDocuments ? <button style={styles.navBtn} onClick={() => setView('admin')}>Gestionar archivo</button> : null}
            {isAdministrator ? <button style={styles.navBtn} onClick={() => setView('users')}>Administrar usuarios</button> : null}
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
          <form style={{ display: 'flex', flexWrap: 'wrap', gap: '15px', marginBottom: '20px' }} onSubmit={async (event) => {
            event.preventDefault();
            setSearchBusy(true);
            setSearchError('');
            setResults([]);
            try {
              const query = new URLSearchParams({ q: search });
              if (ARCHIVE_SEARCH_ENABLED && searchYear) query.set('year', searchYear);
              if (ARCHIVE_SEARCH_ENABLED) query.set('mode', searchMode);
              const endpoint = ARCHIVE_SEARCH_ENABLED ? '/archive/search' : '/search';
              const response = await fetch(`${API_URL}${endpoint}?${query}`, { credentials: 'include' });
              const data = await response.json().catch(() => null);
              if (!response.ok) throw new Error(data?.error?.message ?? 'No se ha podido ejecutar la búsqueda.');
              setResults(ARCHIVE_SEARCH_ENABLED ? data.results : data);
            } catch (error) { setSearchError(error.message); }
            finally { setSearchBusy(false); }
          }}>
            <input required minLength="2" style={{ ...styles.input, flex: '1 1 260px', width: 'auto', marginBottom: 0 }} aria-label="Consulta" placeholder="Buscar..." value={search} onChange={(event) => setSearch(event.target.value)} />
            {ARCHIVE_SEARCH_ENABLED ? <input style={{ ...styles.input, width: '130px', marginBottom: 0 }} aria-label="Filtrar por año" type="number" min="1922" max="2100" placeholder="Año" value={searchYear} onChange={(event) => setSearchYear(event.target.value)} /> : null}
            {ARCHIVE_SEARCH_ENABLED ? <select aria-label="Tipo de búsqueda" style={{ ...styles.input, width: '220px', marginBottom: 0 }} value={searchMode} onChange={(event) => setSearchMode(event.target.value)}>{SEARCH_MODES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select> : null}
            <button style={styles.btnPrimary} disabled={searchBusy || (sessionLoading)} type="submit">{searchBusy ? 'Buscando…' : 'Buscar'}</button>
          </form>
          {ARCHIVE_SEARCH_ENABLED ? <p>La búsqueda es pública. Para consultar el documento original tendrás que iniciar sesión o registrarte.</p> : !user ? <p>Inicia sesión para buscar en el archivo.</p> : null}
          {searchError ? <p role="alert" style={styles.error}>{searchError}</p> : null}
          {ARCHIVE_SEARCH_ENABLED && results.length === 0 && !searchBusy && !searchError ? <p>Las búsquedas muestran un máximo de 10 coincidencias.</p> : null}
          {results.map((result) => (
            <article key={`${result.document_id ?? result.title}-${result.page_number}`} style={{ padding: '20px', background: '#1a1a2e', borderRadius: '20px', marginBottom: '10px' }}>
              <h3 style={{ color: '#E6D7AA' }}>{ARCHIVE_SEARCH_ENABLED ? `${result.publication} (${result.publication_year})` : result.title} (Pág. {result.page_number})</h3>
              <p>{ARCHIVE_SEARCH_ENABLED ? highlightSearchTerms(result.text_content, search) : result.text_content}</p>
              {ARCHIVE_SEARCH_ENABLED ? <button style={styles.btnPrimary} type="button" onClick={() => openSearchResult(result)}>Consultar página {result.page_number}</button> : null}
            </article>
          ))}
        </section>
      ) : null}

      {view === 'documento' && ARCHIVE_SEARCH_ENABLED && selectedPage ? (
        <section style={styles.card}>
          <h2 style={styles.sectionTitle}>{selectedPage.title} ({selectedPage.year})</h2>
          {!user ? (
            <>
              <p>Inicia sesión o regístrate para consultar la página {selectedPage.pageNumber} del documento.</p>
              <button style={styles.btnPrimary} onClick={() => setView('login')}>Entrar</button>{' '}
              <button style={styles.btnPrimary} onClick={() => setView('registro')}>Registrarme</button>
            </>
          ) : (
            <>
              <p>Página {selectedPage.pageNumber} del documento original.</p>
              {pageBusy ? <p>Cargando página…</p> : null}
              {pageError ? <p role="alert" style={styles.error}>{pageError}</p> : null}
              {ARCHIVE_PDF_VIEW_ENABLED && !pageError ? <iframe title={`PDF original ${selectedPage.title}, página ${selectedPage.pageNumber}`} src={`${API_URL}/archive/documents/${selectedPage.documentId}/pdf#page=${selectedPage.pageNumber}`} style={{ width: '100%', height: '75vh', border: 0 }} /> : null}
              {!ARCHIVE_PDF_VIEW_ENABLED && pagePreview ? <article style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7, padding: 20, background: '#151525', borderRadius: 12 }}>{pagePreview.text_content}</article> : null}
              {!ARCHIVE_PDF_VIEW_ENABLED ? <p>Vista de texto de la página. El PDF original estará disponible cuando se habilite el visor protegido.</p> : null}
            </>
          )}
          <button style={{ ...styles.btnPrimary, marginTop: 20 }} onClick={() => setView('buscador')}>Volver a resultados</button>
        </section>
      ) : null}

      {view === 'admin' && canManageDocuments ? (
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

      {view === 'users' && isAdministrator ? (
        <section style={styles.card}>
          <h2 style={styles.sectionTitle}>Administración de usuarios</h2>
          {userAdminError ? <p role="alert" style={styles.error}>{userAdminError}</p> : null}
          <form onSubmit={(event) => {
            event.preventDefault();
            runUserAdministration(async () => {
              await createUser(newUser);
              setNewUser({ username: '', email: '', password: '', role: 'free' });
            });
          }}>
            <h3>Crear cuenta</h3>
            <input required minLength="2" maxLength="80" style={styles.input} placeholder="Nombre" value={newUser.username} onChange={(event) => setNewUser({ ...newUser, username: event.target.value })} />
            <input required type="email" style={styles.input} placeholder="Correo" value={newUser.email} onChange={(event) => setNewUser({ ...newUser, email: event.target.value })} />
            <input required type="password" minLength="12" maxLength="128" style={styles.input} placeholder="Contraseña temporal" value={newUser.password} onChange={(event) => setNewUser({ ...newUser, password: event.target.value })} />
            <select aria-label="Rol de la nueva cuenta" style={styles.input} value={newUser.role} onChange={(event) => setNewUser({ ...newUser, role: event.target.value })}>
              {ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
            </select>
            <button style={styles.btnPrimary} disabled={userAdminBusy} type="submit">Crear cuenta</button>
          </form>

          <h3 style={{ marginTop: '40px' }}>Cuentas existentes</h3>
          {userAdminBusy && users.length === 0 ? <p>Cargando…</p> : null}
          {users.map((record) => {
            const self = Number(record.id) === Number(user.id);
            return (
              <article key={record.id} style={{ padding: '20px', background: '#1a1a2e', borderRadius: '20px', marginBottom: '12px' }}>
                <strong>{record.username}</strong> <span>({record.email})</span>
                <p>Estado: {record.suspended ? 'Suspendida' : 'Activa'}</p>
                <select aria-label={`Rol de ${record.username}`} disabled={self || userAdminBusy} style={styles.input} value={record.role ?? ''} onChange={(event) => runUserAdministration(() => changeUserRole(record.id, event.target.value))}>
                  {ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
                </select>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                  <button style={styles.btnPrimary} disabled={self || userAdminBusy} type="button" onClick={() => runUserAdministration(() => setUserSuspended(record.id, !record.suspended))}>
                    {record.suspended ? 'Reactivar' : 'Suspender'}
                  </button>
                  <button style={{ ...styles.btnPrimary, backgroundColor: '#ff7777' }} disabled={self || userAdminBusy} type="button" onClick={() => {
                    if (window.confirm(`¿Eliminar definitivamente la cuenta de ${record.username}?`)) {
                      runUserAdministration(() => deleteUser(record.id));
                    }
                  }}>
                    Eliminar
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      ) : null}
    </div>
  );
}

