export class AuthRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async createUser({ username, email, passwordHash }) {
    const [result] = await this.pool.execute(
      'INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [username, email, passwordHash, 'free'],
    );
    return { id: result.insertId, username, email, role: 'free' };
  }

  async findUserByEmail(email) {
    const [rows] = await this.pool.execute(
      'SELECT id, username, email, password_hash AS passwordHash, role FROM users WHERE email = ? LIMIT 1',
      [email],
    );
    return rows[0] ?? null;
  }

  async createSession({ tokenHash, userId, expiresAt }) {
    await this.pool.execute('DELETE FROM auth_sessions WHERE expires_at <= CURRENT_TIMESTAMP');
    await this.pool.execute(
      'INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)',
      [tokenHash, userId, expiresAt],
    );
  }

  async findSession(tokenHash) {
    const [rows] = await this.pool.execute(
      `SELECT u.id, u.username, u.email, u.role, s.expires_at AS expiresAt
         FROM auth_sessions s
         JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ? AND s.expires_at > CURRENT_TIMESTAMP
        LIMIT 1`,
      [tokenHash],
    );
    return rows[0] ?? null;
  }

  async deleteSession(tokenHash) {
    await this.pool.execute('DELETE FROM auth_sessions WHERE token_hash = ?', [tokenHash]);
  }
}
