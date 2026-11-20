const API_URL = import.meta.env.VITE_API_URL ?? '/api';

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

export function historicalDownload(filename) {
  return request('/admin/historical/documents/download?filename=' + encodeURIComponent(filename));
}

export function historicalDelete(filename) {
  return request('/admin/historical/documents', { method: 'DELETE', body: JSON.stringify({ filename }) });
}

export function historicalUnindex(filename) {
  return request('/admin/historical/documents/unindex', { method: 'POST', body: JSON.stringify({ filename }) });
}

export function historicalIndex(filename, catalog = null) {
  return request('/admin/historical/documents/index', { method: 'POST', body: JSON.stringify({ filename, ...(catalog ?? {}) }) });
}

export async function historicalUpload(file, onProgress) {
  if (!file || file.size < 1 || file.size > 350 * 1024 * 1024 || !/^[\p{L}\p{N}][\p{L}\p{N} ._()-]{0,155}\.pdf$/iu.test(file.name) || file.name.includes('..')) {
    throw new Error('Selecciona un archivo PDF con un nombre válido y un tamaño máximo de 350 MB.');
  }
  const prepared = await request('/admin/historical/uploads', {
    method: 'POST',
    body: JSON.stringify({ filename: file.name, sizeBytes: file.size }),
  });
  if (typeof onProgress === 'function') onProgress('Subiendo PDF al archivo privado…');
  const uploaded = await fetch(prepared.upload.url, {
    method: 'PUT',
    headers: prepared.upload.headers,
    body: file,
  });
  if (uploaded.status === 412 || uploaded.status === 409) {
    throw new Error('Ya existe un original con ese nombre. No se sobrescriben documentos.');
  }
  if (!uploaded.ok) {
    throw new Error('La subida a S3 ha fallado (' + uploaded.status + '). Comprueba la conexión e inténtalo de nuevo.');
  }
  return prepared;
}

export function historicalFragmentScan(filename) {
  return request('/admin/historical/documents/fragmentation-scan', { method: 'POST', body: JSON.stringify({ filename }) });
}
export function historicalFragmentJob(id) {
  return request('/admin/historical/fragmentation-jobs/' + encodeURIComponent(id));
}
export function historicalFragmentSave(id, segments) {
  return request('/admin/historical/fragmentation-jobs/' + encodeURIComponent(id) + '/segments',
    { method: 'PUT', body: JSON.stringify({ segments }) });
}
export function historicalFragmentCommit(id) {
  return request('/admin/historical/fragmentation-jobs/' + encodeURIComponent(id) + '/commit', { method: 'POST', body: '{}' });
}
