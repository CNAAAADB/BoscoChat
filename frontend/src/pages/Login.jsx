import { useState } from 'react';
import { login } from '../api/auth.js';

function Login({ setUser }) {
  const [credentials, setCredentials] = useState({ email: '', password: '' });
  const [error, setError] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    try {
      const result = await login(credentials);
      setUser(result.user);
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <h2>Iniciar sesión</h2>
      {error ? <p role="alert">{error}</p> : null}
      <label>Correo electrónico<input required type="email" autoComplete="email" value={credentials.email} onChange={(event) => setCredentials({ ...credentials, email: event.target.value })} /></label>
      <label>Contraseña<input required type="password" autoComplete="current-password" value={credentials.password} onChange={(event) => setCredentials({ ...credentials, password: event.target.value })} /></label>
      <button type="submit">Entrar</button>
    </form>
  );
}

export default Login;
