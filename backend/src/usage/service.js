const MAX_PARAMETERS_BYTES = 4096;
const QUERY_TYPES = new Set(['search', 'chat']);

export class UsageError extends Error {
  constructor(status, code, message, details = undefined) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function normalizedPlan(user) {
  const value = typeof user?.role === 'string' ? user.role.trim().toLowerCase() : '';
  return value === 'admin' ? 'administrator' : value === 'gestor' ? 'documentary_manager' : value;
}

function safeParameters(parameters) {
  let serialized;
  try {
    serialized = JSON.stringify(parameters ?? {});
  } catch {
    throw new UsageError(400, 'INVALID_QUERY_PARAMETERS', 'Los parámetros de la consulta no son válidos.');
  }
  if (Buffer.byteLength(serialized, 'utf8') > MAX_PARAMETERS_BYTES) {
    throw new UsageError(413, 'QUERY_PARAMETERS_TOO_LARGE', 'Los parámetros de la consulta son demasiado grandes.');
  }
  return serialized;
}

function periodFor(date, periodSeconds) {
  const periodMs = periodSeconds * 1000;
  const startMs = Math.floor(date.getTime() / periodMs) * periodMs;
  return { periodStart: new Date(startMs), periodEnd: new Date(startMs + periodMs) };
}

export class UsageService {
  constructor(repository, { quotas, now = () => new Date() } = {}) {
    this.repository = repository;
    this.quotas = quotas ?? Object.freeze({});
    this.now = now;
  }

  async consume({ user, type, parameters }) {
    if (!Number.isSafeInteger(Number(user?.id)) || Number(user.id) < 1) {
      throw new UsageError(401, 'AUTHENTICATION_REQUIRED', 'Inicia sesión para continuar.');
    }
    if (!QUERY_TYPES.has(type)) throw new TypeError(`Unsupported query type: ${type}`);

    const plan = normalizedPlan(user);
    const quota = this.quotas[plan]?.[type];
    if (!quota) {
      throw new UsageError(503, 'QUOTA_NOT_CONFIGURED', 'El límite de uso no está configurado para este plan.');
    }

    const timestamp = this.now();
    if (!(timestamp instanceof Date) || Number.isNaN(timestamp.getTime())) throw new TypeError('now must return a valid Date');
    const { periodStart, periodEnd } = periodFor(timestamp, quota.periodSeconds);
    const result = await this.repository.consume({
      userId: Number(user.id), plan, type, parametersJson: safeParameters(parameters), timestamp,
      periodStart, periodEnd, limit: quota.limit,
    });

    if (!result.consumed) {
      throw new UsageError(429, 'QUERY_LIMIT_EXCEEDED',
        'Has alcanzado el límite de consultas de tu plan. Mejora tu plan para continuar.',
        { limit: quota.limit, remaining: 0, resetsAt: periodEnd.toISOString(), type });
    }
    return {
      limit: quota.limit,
      remaining: Math.max(0, quota.limit - result.used),
      resetsAt: periodEnd.toISOString(),
      type,
    };
  }
}
