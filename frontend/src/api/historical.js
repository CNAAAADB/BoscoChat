const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api';

async function request(path, options = {}) {
  const response = await fetch(API_URL + path, {
    credentials: 'include',
    ...options,
    headers: options.body ? { 'Content-Type': 'application/json', ...(options.headers ?? {}) } : options.headers,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error?.message ?? 'No se ha podido completar la operación.');
  return payload;
}

export function historicalDocuments() {
  return request('/admin/historical/documents');
}

export function historicalDownload(year) {
  return request('/admin/historical/documents/' + encodeURIComponent(year) + '/download');
}

export async function historicalUpload(file, onProgress) {
  if (!file || file.size < 1 || file.size > 350 * 1024 * 1024 || !/^Don Bosco en Espa(?:ñ|n)a_\d{4}\.pdf$/iu.test(file.name)) {
    throw new Error('Selecciona un PDF anual «Don Bosco en España_YYYY.pdf» de hasta 350 MB.');
  }
  const prepared = await request('/admin/historical/uploads', {
    method: 'POST',
    body: JSON.stringify({ filename: file.name, sizeBytes: file.size }),
  });
  if (typeof onProgress === 'function') onProgress('Subiendo PDF al archivo privado…');
  const form = new FormData();
  for (const [key, value] of Object.entries(prepared.upload.fields)) form.append(key, value);
  form.append('file', file, file.name);
  const uploaded = await fetch(prepared.upload.url, { method: 'POST', body: form });
  if (!uploaded.ok) {
    throw new Error('La subida a S3 ha fallado (' + uploaded.status + '). Comprueba la conexión e inténtalo de nuevo.');
  }
  return prepared;
}
