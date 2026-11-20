// BC-108: every chat request reserves its model time BEFORE running SQL.
// A Promise timeout cannot cancel a query already executing; MySQL SELECTs
// also carry MAX_EXECUTION_TIME hints to bound server-side work.
export const CHAT_REQUEST_BUDGET_MS = 24_000;
export const CHAT_SEARCH_BUDGET_MS = 7_000;

export function chatTimeout() {
  const error = new Error('CHAT_TIMEOUT');
  error.name = 'TimeoutError';
  error.code = 'CHAT_TIMEOUT';
  return error;
}

export function remainingChatMs(deadline) {
  if (!Number.isFinite(deadline)) throw new Error('INVALID_CHAT_DEADLINE');
  return Math.max(0, deadline - Date.now());
}

export async function withinChatBudget(operation, deadline, maxWaitMs = 1_900) {
  if (typeof operation !== 'function' || !Number.isFinite(maxWaitMs) || maxWaitMs <= 0) {
    throw new Error('INVALID_CHAT_BUDGET');
  }
  const waitMs = Math.min(remainingChatMs(deadline), maxWaitMs);
  if (waitMs < 1) throw chatTimeout();
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(chatTimeout()), waitMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
