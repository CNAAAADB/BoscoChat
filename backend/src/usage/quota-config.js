const QUERY_TYPES = Object.freeze(['search', 'chat']);
const PLAN_PATTERN = /^[a-z][a-z0-9_]{0,31}$/;

function quotaEntry(plan, type, value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`QUERY_QUOTAS_JSON ${plan}.${type} must be an object`);
  }
  const limit = Number(value.limit);
  const periodSeconds = Number(value.periodSeconds);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1_000_000) {
    throw new Error(`QUERY_QUOTAS_JSON ${plan}.${type}.limit must be an integer between 1 and 1000000`);
  }
  if (!Number.isSafeInteger(periodSeconds) || periodSeconds < 60 || periodSeconds > 31_536_000) {
    throw new Error(`QUERY_QUOTAS_JSON ${plan}.${type}.periodSeconds must be an integer between 60 and 31536000`);
  }
  return Object.freeze({ limit, periodSeconds });
}

// BC-003 / RF-USAGE-02: plan limits are deployment configuration, not hard-coded product policy.
export function queryQuotaConfig(environment = process.env) {
  const raw = environment.QUERY_QUOTAS_JSON;
  if (typeof raw !== 'string' || raw.trim() === '') return Object.freeze({});

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('QUERY_QUOTAS_JSON must contain valid JSON');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('QUERY_QUOTAS_JSON must be an object keyed by plan');
  }

  const result = Object.create(null);
  for (const [rawPlan, values] of Object.entries(parsed)) {
    const plan = rawPlan.toLowerCase();
    if (!PLAN_PATTERN.test(plan) || plan !== rawPlan) {
      throw new Error(`QUERY_QUOTAS_JSON contains invalid plan key: ${rawPlan}`);
    }
    if (!values || typeof values !== 'object' || Array.isArray(values)) {
      throw new Error(`QUERY_QUOTAS_JSON ${plan} must be an object`);
    }
    result[plan] = Object.freeze(Object.fromEntries(
      QUERY_TYPES.filter((type) => values[type] !== undefined)
        .map((type) => [type, quotaEntry(plan, type, values[type])]),
    ));
  }
  return Object.freeze(result);
}

export { QUERY_TYPES };
