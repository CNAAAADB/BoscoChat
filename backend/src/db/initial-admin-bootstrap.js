// One-shot, auditable first-administrator provisioning.
// Email is supplied only through a temporary Lambda environment variable.
export async function ensureInitialAdministrator(pool, email) {
  if (typeof email !== 'string' || email.trim() !== email
      || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('INITIAL_ADMIN_EMAIL_INVALID');
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [administrators] = await connection.execute(
      "SELECT id FROM users WHERE role = 'administrator' AND suspended_at IS NULL ORDER BY id FOR UPDATE",
    );
    if (administrators.length !== 0) {
      await connection.rollback();
      return { status: 'administrator_exists' };
    }
    const [matches] = await connection.execute(
      'SELECT id, role, suspended_at AS suspendedAt FROM users WHERE email = ? LIMIT 1 FOR UPDATE',
      [email.toLowerCase()],
    );
    if (!matches.length) {
      await connection.rollback();
      return { status: 'account_missing' };
    }
    const target = matches[0];
    if (target.suspendedAt !== null) {
      await connection.rollback();
      return { status: 'account_suspended' };
    }
    const [updated] = await connection.execute(
      "UPDATE users SET role = 'administrator' WHERE id = ? AND suspended_at IS NULL",
      [target.id],
    );
    if (updated.affectedRows !== 1) throw new Error('INITIAL_ADMIN_UPDATE_FAILED');
    await connection.execute(
      'INSERT INTO admin_audit_logs (actor_user_id, target_user_id, action, outcome, details_json) VALUES (?, ?, ?, ?, CAST(? AS JSON))',
      [target.id, target.id, 'bootstrap.admin.initial', 'success', JSON.stringify({ method: 'one_time_aws_bootstrap' })],
    );
    await connection.commit();
    return { status: 'promoted' };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
