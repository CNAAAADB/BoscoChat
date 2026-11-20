// BC-108: distinguish a slow backend from a broken browser connection.
// Keep the submitted question available for manual retry; never retry costly
// historical searches or model calls automatically.
export function chatHttpError(status, payload) {
  if (status === 504 || payload?.error?.code === 'CHAT_TIMEOUT') {
    return 'La investigación ha superado el tiempo disponible. Tu conversación se conserva; puedes reintentarlo.';
  }
  if (status === 502) {
    return 'El servidor no ha podido completar esta consulta. Es posible que haya tardado demasiado; puedes reintentarlo.';
  }
  if (status === 503) {
    return payload?.error?.message ?? 'La búsqueda histórica no está disponible temporalmente. Puedes reintentarlo.';
  }
  if (status === 429) {
    return payload?.error?.message ?? 'Se ha alcanzado el límite de consultas. Inténtalo más tarde.';
  }
  return payload?.error?.message ?? 'La consulta no se ha podido completar. Inténtalo de nuevo.';
}

export function chatNetworkError(error) {
  if (error instanceof TypeError) {
    return 'No se ha podido establecer conexión con BoscoChat. Comprueba la conexión e inténtalo de nuevo.';
  }
  return error?.message || 'No se ha podido completar la consulta.';
}
