import { createHash, randomBytes } from 'node:crypto';
import { hashPassword, verifyPassword } from './password.js';

const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DUMMY_HASH_PROMISE = hashPassword('invalid-password-used-only-for-timing');

export class AuthError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function normalizeRegistration(input) {
  const username = typeof input.username === 'string' ? input.username.trim() : '';
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  const password = typeof input.password === 'string' ? input.password : '';

  if (username.length < 2 || username.length > 80) {
    throw new AuthError(400, 'INVALID_USERNAME', 'El nombre de usuario debe tener entre 2 y 80 caracteres.');
  }
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
    throw new AuthError(400, 'INVALID_EMAIL', 'Introduce un correo electrónico válido.');
  }
  if (password.length < 12 || password.length > 128) {
    throw new AuthError(400, 'INVALID_PASSWORD', 'La contraseña debe tener entre 12 y 128 caracteres.');
  }
  return { username, email, password };
}

function publicUser(user) {
  return { id: user.id, username: user.username, email: user.email, role: user.role };
}

export function tokenDigest(token) {
  return createHash('sha256').update(token).digest('hex');
}

export class AuthService {
  constructor(repository, { now = () => new Date() } = {}) {
    this.repository = repository;
    this.now = now;
  }

  async register(input) {
    const { username, email, password } = normalizeRegistration(input);
    const passwordHash = await hashPassword(password);
    try {
      return publicUser(await this.repository.createUser({ username, email, passwordHash }));
    } catch (error) {
      if (error?.code === 'ER_DUP_ENTRY') {
        throw new AuthError(409, 'EMAIL_ALREADY_REGISTERED', 'Ya existe una cuenta con ese correo electrónico.');
      }
      throw error;
    }
  }

  async login(input) {
    const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
    const password = typeof input.password === 'string' ? input.password : '';
    if (!email || !password) {
      throw new AuthError(400, 'MISSING_CREDENTIALS', 'Correo electrónico y contraseña son obligatorios.');
    }

    const user = await this.repository.findUserByEmail(email);
    const valid = await verifyPassword(password, user?.passwordHash ?? await DUMMY_HASH_PROMISE);
    if (!user || !valid) {
      throw new AuthError(401, 'INVALID_CREDENTIALS', 'Credenciales no válidas.');
    }

    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(this.now().getTime() + SESSION_TTL_MS);
    await this.repository.createSession({ tokenHash: tokenDigest(token), userId: user.id, expiresAt });
    return { token, expiresAt, user: publicUser(user) };
  }

  async session(token) {
    if (!token) return null;
    const session = await this.repository.findSession(tokenDigest(token));
    return session ? publicUser(session) : null;
  }

  async logout(token) {
    if (token) await this.repository.deleteSession(tokenDigest(token));
  }
}
