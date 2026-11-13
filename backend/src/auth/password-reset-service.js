import { createHash, randomBytes } from 'node:crypto';
import { AuthError } from '../auth/service.js';
import { hashPassword } from '../auth/password.js';

const RESET_MINUTES = 20;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export function resetTokenHash(token) {
  return createHash('sha256').update(token).digest('hex');
}

// No credentials, raw tokens or plaintext passwords are recorded in the audit table.
// DB token consumption holds the row lock until password change and session revocation commit.
export class PasswordResetService {
  constructor(repository, { now = () => new Date() } = {}) {
    this.repository = repository;
    this.now = now;
  }

  async issueByAdministrator(actorId, targetIdValue) {
    const targetId = Number(targetIdValue);
    if (!Number.isSafeInteger(targetId) || targetId < 1) {
      throw new AuthError(400, 'INVALID_USER_ID', 'Usuario no válido.');
    }
    if (Number(actorId) === targetId) {
      throw new AuthError(409, 'SELF_RESET_FORBIDDEN', 'Usa la recuperación de contraseña para tu propia cuenta.');
    }
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(this.now().getTime() + RESET_MINUTES * 60_000);
    const issued = await this.repository.createPasswordReset({
      actorId, targetId, digest: resetTokenHash(token), expiresAt,
    });
    if (!issued) throw new AuthError(404, 'USER_NOT_FOUND', 'Usuario no encontrado.');
    return { token, expiresAt: expiresAt.toISOString() };
  }

  async redeem({ token, password }) {
    if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) {
      throw new AuthError(400, 'INVALID_RESET_TOKEN', 'El enlace no es válido o ha caducado.');
    }
    if (typeof password !== 'string' || password.length < 12 || password.length > 128) {
      throw new AuthError(400, 'INVALID_PASSWORD', 'La contraseña debe tener entre 12 y 128 caracteres.');
    }
    const digest = resetTokenHash(token);
    const passwordHash = await hashPassword(password);
    const accepted = await this.repository.consumePasswordReset({ digest, passwordHash, now: this.now() });
    if (!accepted) throw new AuthError(400, 'INVALID_RESET_TOKEN', 'El enlace no es válido o ha caducado.');
    return { changed: true };
  }
}
