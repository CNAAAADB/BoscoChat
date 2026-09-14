import React, { useState } from 'react';
import logo from './logo.png'; // Importamos el logo

export default function App() {
  const [view, setView] = useState('home');
  const [user, setUser] = useState(null);
  
  const [loginData, setLoginData] = useState({ email: '', password: '', terms: false });
  const [regData, setRegData] = useState({ name: '', email: '', password: '' });
  const [docInyect, setDocInyect] = useState({ title: '', content: '' });
  
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState([]);

  const styles = {
    main: { 
      backgroundColor: '#121212', 
      color: 'white', 
      minHeight: '100vh', 
      fontFamily: 'system-ui', 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      padding: '40px 20px',
      position: 'relative',
      overflowX: 'hidden',
      // Estilos para el fondo con el logo
      backgroundImage: `linear-gradient(rgba(18, 18, 18, 0.85), rgba(18, 18, 18, 0.85)), url(${logo})`,
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
      backgroundAttachment: 'fixed',
      backgroundSize: '40%' // Ajusta este % para que el logo sea más grande o pequeño
    },
    title: { fontSize: '4.5rem', marginBottom: '40px', fontWeight: '800', letterSpacing: '-2px', zIndex: 1 },
    nav: { display: 'flex', gap: '30px', marginBottom: '40px', borderBottom: '1px solid #333', width: '100%', maxWidth: '800px', justifyContent: 'center', paddingBottom: '20px', zIndex: 1 },
    card: { backgroundColor: 'rgba(30, 30, 30, 0.9)', padding: '30px', borderRadius: '15px', width: '100%', maxWidth: '600px', border: '1px solid #333', boxShadow: '0 10px 30px rgba(0,0,0,0.5)', zIndex: 1 },
    input: { width: '100%', padding: '14px', margin: '12px 0', borderRadius: '8px', border: '1px solid #444', backgroundColor: '#252525', color: 'white', boxSizing: 'border-box', fontSize: '1rem' },
    btn: { width: '100%', padding: '14px', backgroundColor: '#4f46e5', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' },
    link: { color: '#4f46e5', cursor: 'pointer', fontWeight: '600', background: 'none', border: 'none', fontSize: '1.2rem' },
    resultItem: { padding: '20px', borderBottom: '1px solid #333', textAlign: 'left' }
  };

  // --- Funciones de Lógica ---
  const handleSearch = async () => {
    if (!searchQuery) return;
    try {
      const res = await fetch(`http://localhost:3000/search?q=${searchQuery}`);
      const data = await res.json();
      setResults(data);
    } catch { alert("Error de conexión"); }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!loginData.terms) return alert("Acepta la política de datos");
    try {
      const res = await fetch('http://localhost:3000/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginData.email, password: loginData.password })
      });
      if (res.ok) { setUser(await res.json()); setView('dashboard'); } 
      else { alert("Acceso denegado"); }
    } catch { alert("Error al conectar"); }
  };

  const handleInyectar = async () => {
    const pages = docInyect.content.split('\n').filter(line => line.trim() !== '');
    try {
      const res = await fetch('http://localhost:3000/api/documents', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: docInyect.title, author: user.name, pages, role: user.role })
      });
      if (res.ok) { alert("Inyectado con éxito"); setDocInyect({ title: '', content: '' }); }
    } catch { alert("Error"); }
  };

  return (
    <div style={styles.main}>
      <h1 style={styles.title}>BOSCOCHAT</h1>
      
      <nav style={styles.nav}>
        <button style={styles.link} onClick={() => setView('home')}>Home</button>
        <button style={styles.link} onClick={() => { setView('buscador'); setResults([]); }}>Buscador</button>
        {!user ? (
          <>
            <button style={styles.link} onClick={() => setView('login')}>Entrar</button>
            <button style={styles.link} onClick={() => setView('registro')}>Registro</button>
          </>
        ) : (
          <>
            <button style={styles.link} onClick={() => setView('dashboard')}>Dashboard</button>
            <button style={{ ...styles.link, color: '#ff4444' }} onClick={() => { setUser(null); setView('home'); }}>Salir</button>
          </>
        )}
      </nav>

      {view === 'home' && (
        <div style={{ textAlign: 'center', maxWidth: '600px', zIndex: 1 }}>
          <h2 style={{ fontSize: '2.5rem' }}>Tu Gestor Inteligente</h2>
          <p style={{ color: '#ccc', fontSize: '1.2rem' }}>Explora y gestiona tus documentos de forma rápida en BOSCOCHAT.</p>
        </div>
      )}

      {view === 'buscador' && (
        <div style={styles.card}>
          <h3 style={{ marginTop: 0 }}>🔍 Buscador General</h3>
          <div style={{ display: 'flex', gap: '10px' }}>
            <input style={styles.input} placeholder="¿Qué buscas?" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
            <button style={{ ...styles.btn, width: 'auto', marginTop: '12px' }} onClick={handleSearch}>Buscar</button>
          </div>
          <div style={{ maxHeight: '400px', overflowY: 'auto', marginTop: '20px' }}>
            {results.map((r, i) => (
              <div key={i} style={styles.resultItem}>
                <strong style={{ color: '#4f46e5' }}>{r.title}</strong> <small>(Pág. {r.page_number})</small>
                <p style={{ fontSize: '0.9rem', color: '#ccc' }}>{r.text_content}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {view === 'login' && (
        <div style={styles.card}>
          <h3>Identificación</h3>
          <form onSubmit={handleLogin}>
            <input style={styles.input} type="email" placeholder="Email" value={loginData.email} onChange={e => setLoginData({ ...loginData, email: e.target.value })} required />
            <input style={styles.input} type="password" placeholder="Contraseña" value={loginData.password} onChange={e => setLoginData({ ...loginData, password: e.target.value })} required />
            <label style={{ fontSize: '0.8rem' }}>
              <input type="checkbox" checked={loginData.terms} onChange={e => setLoginData({ ...loginData, terms: e.target.checked })} /> Acepto LOPD
            </label>
            <button style={{ ...styles.btn, marginTop: '15px' }}>Acceder</button>
          </form>
        </div>
      )}

      {view === 'registro' && (
        <div style={styles.card}>
          <h3>Nueva Cuenta</h3>
          <form onSubmit={async (e) => {
            e.preventDefault();
            await fetch('http://localhost:3000/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(regData) });
            alert("Registrado."); setView('login');
          }}>
            <input style={styles.input} placeholder="Nombre" value={regData.name} onChange={e => setRegData({ ...regData, name: e.target.value })} required />
            <input style={styles.input} type="email" placeholder="Email" value={regData.email} onChange={e => setRegData({ ...regData, email: e.target.value })} required />
            <input style={styles.input} type="password" placeholder="Contraseña" value={regData.password} onChange={e => setRegData({ ...regData, password: e.target.value })} required />
            <button style={styles.btn}>Registrarse</button>
          </form>
        </div>
      )}

      {view === 'dashboard' && user && (
        <div style={{ width: '100%', maxWidth: '650px', zIndex: 1 }}>
          {(user.role === 'admin' || user.role === 'gestor_documental') && (
            <div style={{ ...styles.card, borderColor: '#10b981', borderLeft: '5px solid #10b981' }}>
              <h4 style={{ color: '#10b981', marginTop: 0 }}>Carga de Documentos</h4>
              <input style={styles.input} placeholder="Título" value={docInyect.title} onChange={e => setDocInyect({ ...docInyect, title: e.target.value })} />
              <textarea style={{ ...styles.input, height: '150px', resize: 'none' }} placeholder="Texto por líneas..." value={docInyect.content} onChange={e => setDocInyect({ ...docInyect, content: e.target.value })} />
              <button style={{ ...styles.btn, backgroundColor: '#10b981' }} onClick={handleInyectar}>Inyectar en BD</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}