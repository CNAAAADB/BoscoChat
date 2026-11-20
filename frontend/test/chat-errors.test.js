import assert from 'node:assert/strict';
import test from 'node:test';
import { chatHttpError, chatNetworkError } from '../src/chat-errors.js';

test('BC-108 504 gives a timeout-specific retry message, not a network-error claim', () => {
  assert.match(chatHttpError(504, null), /tiempo disponible/);
  assert.match(chatHttpError(502, null), /servidor/);
  assert.doesNotMatch(chatHttpError(502, null), /No se ha podido contactar/);
});

test('BC-108 normalizes 503 and 429 errors without exposing HTML or provider details', () => {
  assert.match(chatHttpError(503, { error: { message: 'Búsqueda temporalmente no disponible.' } }), /Búsqueda/);
  assert.match(chatHttpError(503, null), /búsqueda histórica/i);
  assert.match(chatHttpError(429, null), /límite/);
  assert.match(chatHttpError(400, null), /consulta/);
});

test('BC-108 only genuine connection errors show connectivity guidance', () => {
  assert.match(chatNetworkError(new TypeError('Failed to fetch')), /conexión/);
  assert.match(chatNetworkError(new Error('La investigación ha superado el tiempo disponible.')), /tiempo disponible/);
});
