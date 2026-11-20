// Browser-tab-only conversation persistence for the administrator pilot.
// Session storage is scoped to the authenticated user ID and cleared on logout;
// unlike localStorage, it does not persist across independent browser sessions.
const PREFIX = 'boscochat:admin-chat:';
const MAX_AGE_MS = 2 * 60 * 60 * 1000;
const MAX_MESSAGES = 40;
const MAX_SNAPSHOT_BYTES = 110_000;
const DEPTHS = new Set(['research', 'auto', 'brief']);

export function chatSessionKey(userId) {
  if (!Number.isSafeInteger(Number(userId)) || Number(userId) < 1) return null;
  return PREFIX + Number(userId);
}

export function loadChatSession(storage, userId, now = Date.now()) {
  const key = chatSessionKey(userId);
  if (!key || !storage) return null;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    if (raw.length > MAX_SNAPSHOT_BYTES) throw new Error('oversized');
    const parsed = JSON.parse(raw);
    if (parsed?.version !== 1 || !Number.isFinite(parsed.savedAt) || parsed.savedAt > now
      || now - parsed.savedAt > MAX_AGE_MS || !Array.isArray(parsed.messages)
      || parsed.messages.length > MAX_MESSAGES || !DEPTHS.has(parsed.depth)) {
      throw new Error('expired or malformed');
    }
    const valid = parsed.messages.every((m) => m && typeof m === 'object'
      && (m.role === 'user' || m.role === 'assistant')
      && typeof m.text === 'string' && m.text.length > 0 && m.text.length <= 12000
      && (m.sources === undefined || (Array.isArray(m.sources) && m.sources.length <= 6
        && m.sources.every((s) => s && /^F[1-6]$/.test(s.ref)
          && Number.isSafeInteger(s.documentId) && s.documentId > 0
          && Number.isSafeInteger(s.page) && s.page > 0))));
    if (!valid) throw new Error('invalid messages');
    return { messages: parsed.messages, depth: parsed.depth };
  } catch {
    try { storage.removeItem(key); } catch { /* private browsing/quota */ }
    return null;
  }
}

export function saveChatSession(storage, userId, messages, depth, now = Date.now()) {
  const key = chatSessionKey(userId);
  if (!key || !storage || !DEPTHS.has(depth)) return false;
  try {
    const compact = messages.slice(-MAX_MESSAGES).map(({ role, text, sources }) => ({
      role, text, ...(role === 'assistant' && sources?.length ? { sources } : {}),
    }));
    const serialized = JSON.stringify({ version: 1, savedAt: now, depth, messages: compact });
    if (serialized.length > MAX_SNAPSHOT_BYTES) return false;
    storage.setItem(key, serialized);
    return true;
  } catch {
    return false;
  }
}

export function clearChatSession(storage, userId) {
  const key = chatSessionKey(userId);
  if (!key || !storage) return;
  try { storage.removeItem(key); } catch { /* blocked storage */ }
}
