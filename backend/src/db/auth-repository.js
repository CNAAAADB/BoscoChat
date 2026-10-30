export class AuthRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async createUser({ username, email, passwordHash, role = 'free' }) {
    const [result] = await this.pool.execute(
      'INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [username, email, passwordHash, role],
    );
    return { id: result.insertId, username, email, role, suspendedAt: null };
  }

  async findUserByEmail(email) {
    const [rows] = await this.pool.execute(
      'SELECT id, username, email, password_hash AS passwordHash, role, suspended_at AS suspendedAt FROM users WHERE email = ? LIMIT 1',
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
      `SELECT u.id, u.username, u.email, u.role, u.suspended_at AS suspendedAt, s.expires_at AS expiresAt
         FROM auth_sessions s
         JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ? AND s.expires_at > CURRENT_TIMESTAMP AND u.suspended_at IS NULL
        LIMIT 1`,
      [tokenHash],
    );
    return rows[0] ?? null;
  }

  async deleteSession(tokenHash) {
    await this.pool.execute('DELETE FROM auth_sessions WHERE token_hash = ?', [tokenHash]);
  }

  async findUserById(id) {
    const [rows] = await this.pool.execute(
      'SELECT id, username, email, role, suspended_at AS suspendedAt FROM users WHERE id = ? LIMIT 1',
      [id],
    );
    return rows[0] ?? null;
  }

  async listUsers() {
    const [rows] = await this.pool.execute(
      'SELECT id, username, email, role, suspended_at AS suspendedAt FROM users ORDER BY id',
    );
    return rows;
  }

  async updateUserRole(id, role) {
    const [result] = await this.pool.execute('UPDATE users SET role = ? WHERE id = ?', [role, id]);
    return result.affectedRows === 0 ? null : this.findUserById(id);
  }

  async setUserSuspended(id, suspended) {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [result] = await connection.execute(
        suspended
          ? 'UPDATE users SET suspended_at = CURRENT_TIMESTAMP WHERE id = ?'
          : 'UPDATE users SET suspended_at = NULL WHERE id = ?',
        [id],
      );
      if (result.affectedRows === 0) {
        await connection.rollback();
        return null;
      }
      if (suspended) await connection.execute('DELETE FROM auth_sessions WHERE user_id = ?', [id]);
      await connection.commit();
      return this.findUserById(id);
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async deleteUser(id) {
    const [result] = await this.pool.execute('DELETE FROM users WHERE id = ?', [id]);
    return result.affectedRows > 0;
  }
}

