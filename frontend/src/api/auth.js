const API_URL = import.meta.env.VITE_API_URL ?? '/api';

async function request(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    credentials: 'include',
    ...options,
    headers: options.body ? { 'Content-Type': 'application/json', ...options.headers } : options.headers,
  });
  const payload = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error?.message ?? 'No se ha podido completar la solicitud.');
  }
  return payload;
}

export function register({ username, email, password }) {
  return request('/auth/register', { method: 'POST', body: JSON.stringify({ username, email, password }) });
}

export function login({ email, password }) {
  return request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
}

export function currentSession() {
  return request('/auth/session');
}

export function logout() {
  return request('/auth/logout', { method: 'POST' });
}
