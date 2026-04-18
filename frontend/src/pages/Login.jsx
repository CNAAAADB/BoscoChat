import { useState } from 'react';

function Login({ setUser }) {
  const [email, setEmail] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch('http://localhost:3000/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });

      if (response.ok) {
        const data = await response.json();
        setUser(data); // Esto nos manda al Dashboard automáticamente
      } else {
        alert("Usuario no encontrado en la base de datos");
      }
    } catch (error) {
      alert("Error al conectar con el servidor. ¿Está el backend encendido?");
    }
  };

  return (
    <div style={{ padding: '20px' }}>
      <h2>Iniciar Sesión 🔐</h2>
      <form onSubmit={handleSubmit}>
        <input 
          type="email" 
          placeholder="Tu email de MySQL" 
          value={email} 
          onChange={(e) => setEmail(e.target.value)} 
          style={{ padding: '10px', marginBottom: '10px' }}
        />
        <br />
        <button type="submit">Entrar</button>
      </form>
    </div>
  );
}

export default Login;