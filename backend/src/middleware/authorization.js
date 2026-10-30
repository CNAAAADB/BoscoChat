import { normalizeRole } from '../users/roles.js';

export const SESSION_COOKIE_NAME = 'boscochat_session';

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').flatMap((part) => {
    const separator = part.indexOf('=');
    if (separator < 0) return [];
    try {
      return [[part.slice(0, separator).trim(), decodeURIComponent(part.slice(separator + 1).trim())]];
    } catch {
      return [];
    }
  }));
}

export function sessionToken(req) {
  return parseCookies(req.get('cookie'))[SESSION_COOKIE_NAME] ?? null;
}

// BC-002 / RF-USER-04 / RNF-SEC-03: resolve identity and permissions only
// from the server-side session; caller-supplied roles and user IDs are ignored.
export function requireAuthorization(authService, allowedRoles = null) {
  return async (req, res, next) => {
    try {
      const user = await authService.session(sessionToken(req));
      if (!user) {
        return res.status(401).json({ error: { code: 'AUTHENTICATION_REQUIRED', message: 'Inicia sesión para continuar.' } });
      }

      const role = normalizeRole(user.role, { acceptLegacyAliases: true });
      if (!role || (allowedRoles && !allowedRoles.has(role))) {
        return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'No tienes permiso para realizar esta acción.' } });
      }

      req.user = { ...user, role };
      return next();
    } catch (error) {
      return next(error);
    }
  };
}
