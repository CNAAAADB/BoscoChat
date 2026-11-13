const USER_FIELDS = 'id, username, email, role, suspended_at AS suspendedAt';

function lastActiveAdministratorError() {
  const error = new Error('At least one active administrator must remain');
  error.code = 'LAST_ACTIVE_ADMIN';
  return error;
}

export class AuthRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async writeAdminAudit(executor, { actorId, targetId = null, action, outcome, details = null }) {
    await executor.execute(
      `INSERT INTO admin_audit_logs
        (actor_user_id, target_user_id, action, outcome, details_json)
       VALUES (?, ?, ?, ?, CAST(? AS JSON))`,
      [actorId, targetId, action, outcome, JSON.stringify(details ?? {})],
    );
  }

  async recordAdminAudit(entry) {
    await this.writeAdminAudit(this.pool, entry);
  }

  async createUser({ username, email, passwordHash, role = 'free', actorId = null }) {
    if (actorId === null) {
      const [result] = await this.pool.execute(
        'INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)',
        [username, email, passwordHash, role],
      );
      return { id: result.insertId, username, email, role, suspendedAt: null };
    }
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [result] = await connection.execute(
        'INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)',
        [username, email, passwordHash, role],
      );
      await this.writeAdminAudit(connection, {
        actorId, targetId: result.insertId, action: 'user.create', outcome: 'success', details: { role },
      });
      await connection.commit();
      return { id: result.insertId, username, email, role, suspendedAt: null };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
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
    const [rows] = await this.pool.execute(`SELECT ${USER_FIELDS} FROM users WHERE id = ? LIMIT 1`, [id]);
    return rows[0] ?? null;
  }

  async listUsers() {
    const [rows] = await this.pool.execute(`SELECT ${USER_FIELDS} FROM users ORDER BY id`);
    return rows;
  }

  async lockAdministrationState(connection, targetId) {
    const [activeAdministrators] = await connection.execute(
      `SELECT id FROM users
        WHERE role = 'administrator' AND suspended_at IS NULL
        ORDER BY id FOR UPDATE`,
    );
    const [targets] = await connection.execute(
      `SELECT ${USER_FIELDS} FROM users WHERE id = ? FOR UPDATE`,
      [targetId],
    );
    return { activeAdministrators, target: targets[0] ?? null };
  }

  ensureAdministratorRemains(activeAdministrators, target, removesActiveAdministrator) {
    if (removesActiveAdministrator
      && target.role === 'administrator'
      && target.suspendedAt === null
      && activeAdministrators.length <= 1) {
      throw lastActiveAdministratorError();
    }
  }

  async updateUserRole(actorId, id, role) {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const { activeAdministrators, target } = await this.lockAdministrationState(connection, id);
      if (!target) {
        await connection.rollback();
        return null;
      }
      this.ensureAdministratorRemains(activeAdministrators, target, role !== 'administrator');
      await connection.execute('UPDATE users SET role = ? WHERE id = ?', [role, id]);
      await this.writeAdminAudit(connection, {
        actorId, targetId: id, action: 'user.role.change', outcome: 'success', details: { role },
      });
      const [rows] = await connection.execute(`SELECT ${USER_FIELDS} FROM users WHERE id = ?`, [id]);
      await connection.commit();
      return rows[0];
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async setUserSuspended(actorId, id, suspended) {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const { activeAdministrators, target } = await this.lockAdministrationState(connection, id);
      if (!target) {
        await connection.rollback();
        return null;
      }
      this.ensureAdministratorRemains(activeAdministrators, target, suspended);
      await connection.execute(
        suspended
          ? 'UPDATE users SET suspended_at = CURRENT_TIMESTAMP WHERE id = ?'
          : 'UPDATE users SET suspended_at = NULL WHERE id = ?',
        [id],
      );
      if (suspended) await connection.execute('DELETE FROM auth_sessions WHERE user_id = ?', [id]);
      await this.writeAdminAudit(connection, {
        actorId, targetId: id, action: suspended ? 'user.suspend' : 'user.reactivate', outcome: 'success',
      });
      const [rows] = await connection.execute(`SELECT ${USER_FIELDS} FROM users WHERE id = ?`, [id]);
      await connection.commit();
      return rows[0];
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async deleteUser(actorId, id) {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const { activeAdministrators, target } = await this.lockAdministrationState(connection, id);
      if (!target) {
        await connection.rollback();
        return false;
      }
      this.ensureAdministratorRemains(activeAdministrators, target, true);
      await this.writeAdminAudit(connection, {
        actorId, targetId: id, action: 'user.delete', outcome: 'success', details: { priorRole: target.role },
      });
      await connection.execute('DELETE FROM users WHERE id = ?', [id]);
      await connection.commit();
      return true;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
  // BC-002 password reset: issue exactly one pending reset per target user.
  async createPasswordReset({ actorId, targetId, digest, expiresAt }) {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.execute('SELECT id FROM users WHERE id = ? FOR UPDATE', [targetId]);
      if (!rows.length) {
        await connection.rollback();
        return false;
      }
      await connection.execute('DELETE FROM password_reset_tokens WHERE user_id = ?', [targetId]);
      await connection.execute(
        'INSERT INTO password_reset_tokens (token_hash, user_id, expires_at) VALUES (?, ?, ?)',
        [digest, targetId, expiresAt],
      );
      await this.writeAdminAudit(connection, {
        actorId, targetId, action: 'user.password.reset.issue', outcome: 'success',
      });
      await connection.commit();
      return true;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally { connection.release(); }
  }

  async consumePasswordReset({ digest, passwordHash, now }) {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [tokens] = await connection.execute(
        'SELECT user_id, expires_at FROM password_reset_tokens WHERE token_hash = ? FOR UPDATE',
        [digest],
      );
      const token = tokens[0];
      if (!token || new Date(token.expires_at).getTime() <= now.getTime()) {
        await connection.rollback();
        return false;
      }
      // Invalidate all sessions and outstanding links on successful password change.
      await connection.execute('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, token.user_id]);
      await connection.execute('DELETE FROM auth_sessions WHERE user_id = ?', [token.user_id]);
      await connection.execute('DELETE FROM password_reset_tokens WHERE user_id = ?', [token.user_id]);
      await connection.commit();
      return true;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally { connection.release(); }
  }

}
