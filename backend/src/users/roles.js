export const ROLES = Object.freeze({
  FREE: 'free',
  PRO: 'pro',
  PREMIUM: 'premium',
  ADVANCED: 'advanced',
  ADMINISTRATOR: 'administrator',
  DOCUMENTARY_MANAGER: 'documentary_manager',
});

export const ROLE_VALUES = Object.freeze(Object.values(ROLES));
const ROLE_SET = new Set(ROLE_VALUES);
const LEGACY_ALIASES = Object.freeze({ admin: ROLES.ADMINISTRATOR, gestor: ROLES.DOCUMENTARY_MANAGER, gestor_documental: ROLES.DOCUMENTARY_MANAGER });

export function normalizeRole(value, { acceptLegacyAliases = false } = {}) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (ROLE_SET.has(normalized)) return normalized;
  return acceptLegacyAliases ? LEGACY_ALIASES[normalized] ?? null : null;
}
