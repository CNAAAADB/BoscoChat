import { useState } from 'react';
import { register } from '../api/auth.js';

function Register({ onRegistered }) {
  const [form, setForm] = useState({ username: '', email: '', password: '', terms: false });
  const [error, setError] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    if (!form.terms) {
      setError('Debes aceptar la política de protección de datos.');
      return;
    }
    try {
      await register(form);
      onRegistered?.(form.email);
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <h2>Registro</h2>
      {error ? <p role="alert">{error}</p> : null}
      <label>Nombre de usuario<input required minLength="2" maxLength="80" autoComplete="username" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} /></label>
      <label>Correo electrónico<input required type="email" autoComplete="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
      <label>Contraseña<input required type="password" minLength="12" maxLength="128" autoComplete="new-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></label>
      <label><input type="checkbox" checked={form.terms} onChange={(event) => setForm({ ...form, terms: event.target.checked })} /> Acepto la política de protección de datos</label>
      <button type="submit">Registrarse</button>
    </form>
  );
}

export default Register;
