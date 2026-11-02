const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api';

async function request(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    credentials: 'include',
    ...options,
    headers: options.body ? { 'Content-Type': 'application/json', ...options.headers } : options.headers,
  });
  const payload = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error?.message ?? 'No se ha podido completar la operación.');
  return payload;
}

export function listUsers() {
  return request('/admin/users');
}

export function createUser(user) {
  return request('/admin/users', { method: 'POST', body: JSON.stringify(user) });
}

export function changeUserRole(userId, role) {
  return request(`/admin/users/${userId}/role`, { method: 'PATCH', body: JSON.stringify({ role }) });
}

export function setUserSuspended(userId, suspended) {
  return request(`/admin/users/${userId}/suspension`, { method: 'PATCH', body: JSON.stringify({ suspended }) });
}

export function deleteUser(userId) {
  return request(`/admin/users/${userId}`, { method: 'DELETE' });
}
