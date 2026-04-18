import React, { useState } from 'react';
import logo from './logo.png'; 

export default function App() {
  const [view, setView] = useState('home');
  const [user, setUser] = useState(null);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [formData, setFormData] = useState({ name: '', email: '', password: '', terms: false });
  const [newDoc, setNewDoc] = useState({ title: '', content: '', page: 1 });

  const styles = {
    container: { backgroundColor: '#0a0a0a', color: '#ffffff', minHeight: '100vh', fontFamily: "'Montserrat', sans-serif", padding: '40px 20px', backgroundImage: `linear-gradient(rgba(10,10,10,0.98), rgba(10,10,10,0.98)), url(${logo})`, backgroundSize: '25%', backgroundPosition: 'center', backgroundRepeat: 'no-repeat', backgroundAttachment: 'fixed' },
    header: { textAlign: 'center', marginBottom: '60px' },
    mainTitle: { fontSize: '6rem', fontWeight: '900', margin: 0, letterSpacing: '-4px', fontFamily: "'B612', sans-serif" },
    subTitle: { color: '#E6D7AA', letterSpacing: '18px', fontWeight: 'bold', fontSize: '1.2rem', marginTop: '25px', display: 'block', textTransform: 'uppercase' },
    nav: { display: 'flex', gap: '30px', justifyContent: 'center', padding: '20px 0', borderTop: '1px solid #28295E', borderBottom: '1px solid #28295E', marginBottom: '50px' },
    navBtn: { background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px', fontSize: '0.85rem' },
    card: { backgroundColor: 'rgba(25, 25, 45, 0.85)', padding: '50px', borderRadius: '40px', border: '1px solid #28295E', maxWidth: '1000px', margin: '0 auto 40px auto', backdropFilter: 'blur(15px)' },
    sectionTitle: { color: '#E6D7AA', fontSize: '2.2rem', fontWeight: '900', marginBottom: '25px', borderLeft: '6px solid #E6D7AA', paddingLeft: '20px' },
    input: { width: '100%', padding: '18px', backgroundColor: '#111', border: '1px solid #333', borderRadius: '15px', color: 'white', marginBottom: '15px', fontSize: '1rem' },
    btnPrimary: { padding: '18px 40px', backgroundColor: '#E6D7AA', color: '#121212', border: 'none', borderRadius: '50px', fontWeight: '900', cursor: 'pointer', textTransform: 'uppercase' },
    adminBtn: { backgroundColor: '#44ff44', color: '#000', padding: '10px 20px', borderRadius: '10px', fontWeight: 'bold', border: 'none', cursor: 'pointer' }
  };

  const esAdmin = user && (user.role === 'admin' || user.role === 'gestor');

  const handleUpload = async () => {
    const res = await fetch('http://localhost:3000/api/admin/upload-doc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newDoc)
    });
    if (res.ok) {
      alert("Contenido indexado correctamente.");
      setNewDoc({ title: '', content: '', page: 1 });
    }
  };

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.mainTitle}>BOSCOCHAT</h1>
        <span style={styles.subTitle}>PRAEIT AC TUETUR</span>
      </header>

      <nav style={styles.nav}>
        <button style={styles.navBtn} onClick={() => setView('home')}>Inicio</button>
        <button style={styles.navBtn} onClick={() => setView('buscador')}>Archivo</button>
        {!user ? (
          <>
            <button style={styles.navBtn} onClick={() => setView('login')}>Entrar</button>
            <button style={{...styles.navBtn, color: '#E6D7AA'}} onClick={() => setView('registro')}>Únete</button>
          </>
        ) : (
          <>
            <button style={{...styles.navBtn, color: '#E6D7AA'}} onClick={() => setView('suscripciones')}>Planes</button>
            {esAdmin && <button style={styles.adminBtn} onClick={() => setView('admin')}>Gestionar Archivo</button>}
            <button style={{...styles.navBtn, color: '#ff4444'}} onClick={() => setUser(null)}>Salir</button>
          </>
        )}
      </nav>

      {view === 'home' && (
        <div>
          <div style={styles.card}>
            <h2 style={styles.sectionTitle}>Identidad Salesiana</h2>
            <p style={{lineHeight: '1.9', fontSize: '1.2rem'}}>Los antiguos alumnos salesianos somos personas basadas en el Sistema Preventivo: <strong>razón, religión y bondad amorosa.</strong></p>
          </div>
        </div>
      )}

      {view === 'admin' && esAdmin && (
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>Panel de Gestión Documental</h2>
          <input style={styles.input} placeholder="Título del Documento" value={newDoc.title} onChange={e => setNewDoc({...newDoc, title: e.target.value})} />
          <input style={styles.input} type="number" value={newDoc.page} onChange={e => setNewDoc({...newDoc, page: e.target.value})} />
          <textarea style={{...styles.input, height: '200px'}} placeholder="Pega el texto aquí..." value={newDoc.content} onChange={e => setNewDoc({...newDoc, content: e.target.value})} />
          <button style={styles.btnPrimary} onClick={handleUpload}>Subir al Archivo</button>
        </div>
      )}

      {view === 'buscador' && (
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>Buscador Histórico</h2>
          <div style={{display: 'flex', gap: '15px', marginBottom: '40px'}}>
            <input style={styles.input} placeholder="Buscar..." onChange={e => setSearch(e.target.value)} />
            <button style={styles.btnPrimary} onClick={async () => {
              const res = await fetch(`http://localhost:3000/api/search?q=${search}&userId=${user?.id}`);
              setResults(await res.json());
            }}>BUSCAR</button>
          </div>
          {results.map((r, i) => (
            <div key={i} style={{padding: '20px', background: '#1a1a2e', borderRadius: '20px', marginBottom: '10px'}}>
              <h3 style={{color: '#E6D7AA'}}>{r.title} (Pág. {r.page_number})</h3>
              <p>{r.text_content}</p>
            </div>
          ))}
        </div>
      )}

      {view === 'registro' && (
        <div style={{...styles.card, maxWidth: '500px'}}>
          <h2 style={styles.sectionTitle}>Registro</h2>
          <input style={styles.input} placeholder="Nombre" onChange={e => setFormData({...formData, name: e.target.value})} />
          <input style={styles.input} placeholder="Email" onChange={e => setFormData({...formData, email: e.target.value})} />
          <input style={styles.input} type="password" placeholder="Pass" onChange={e => setFormData({...formData, password: e.target.value})} />
          <label><input type="checkbox" onChange={e => setFormData({...formData, terms: e.target.checked})} /> Acepto la política de datos.</label>
          <button style={styles.btnPrimary} onClick={async () => {
             if(!formData.terms) return alert("Acepta la política");
             await fetch('http://localhost:3000/api/register', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(formData) });
             setView('login');
          }}>Crear Cuenta</button>
        </div>
      )}

      {view === 'login' && (
        <div style={{...styles.card, maxWidth: '450px'}}>
          <h2 style={styles.sectionTitle}>Entrar</h2>
          <input style={styles.input} placeholder="Email" id="logEmail" />
          <input style={styles.input} type="password" placeholder="Pass" id="logPass" />
          <button style={styles.btnPrimary} onClick={async () => {
            const res = await fetch('http://localhost:3000/api/login', { 
              method: 'POST', headers: {'Content-Type': 'application/json'}, 
              body: JSON.stringify({email: document.getElementById('logEmail').value, password: document.getElementById('logPass').value}) 
            });
            if(res.ok) { setUser(await res.json()); setView('home'); }
          }}>Acceder</button>
        </div>
      )}

      {view === 'suscripciones' && user && (
        <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px'}}>
          {['Free', 'Pro', 'Premium'].map(plan => (
            <div key={plan} style={{...styles.card, margin: 0, textAlign: 'center', border: user.role === plan.toLowerCase() ? '3px solid #E6D7AA' : '1px solid #28295E'}}>
              <h3 style={{color: '#E6D7AA'}}>{plan}</h3>
              <button style={styles.btnPrimary} disabled={user.role === plan.toLowerCase()} onClick={async () => {
                const res = await fetch('http://localhost:3000/api/update-role', {
                  method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({userId: user.id, newRole: plan.toLowerCase()})
                });
                if(res.ok) { setUser({...user, role: plan.toLowerCase()}); alert("Plan actualizado"); }
              }}>{user.role === plan.toLowerCase() ? 'Actual' : 'Elegir'}</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}