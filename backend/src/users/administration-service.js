import { AuthError } from '../auth/service.js';
import { normalizeRole, ROLES } from './roles.js';

function positiveUserId(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) {
    throw new AuthError(400, 'INVALID_USER_ID', 'El identificador de usuario no es válido.');
  }
  return id;
}

function administrativeUser(user) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: normalizeRole(user.role, { acceptLegacyAliases: true }) ?? null,
    suspended: Boolean(user.suspendedAt),
  };
}

function translateRepositoryError(error) {
  if (error?.code === 'LAST_ACTIVE_ADMIN') {
    return new AuthError(409, 'LAST_ACTIVE_ADMIN_REQUIRED', 'Debe permanecer al menos una cuenta administradora activa.');
  }
  return error;
}

export class UserAdministrationService {
  constructor(repository, authService) {
    this.repository = repository;
    this.authService = authService;
  }

  async auditDenied(actorId, targetId, action, error) {
    await this.repository.recordAdminAudit({
      actorId,
      targetId: Number.isSafeInteger(targetId) ? targetId : null,
      action,
      outcome: 'denied',
      details: { code: error?.code ?? 'ADMINISTRATION_DENIED' },
    });
  }

  async listUsers() {
    return (await this.repository.listUsers()).map(administrativeUser);
  }

  async createUser(actorId, input) {
    const role = normalizeRole(input?.role);
    if (!role) {
      const error = new AuthError(400, 'INVALID_ROLE', 'Selecciona un rol válido.');
      await this.auditDenied(actorId, null, 'user.create', error);
      throw error;
    }
    try {
      const user = await this.authService.createAccount(input ?? {}, role, actorId);
      return { ...user, suspended: false };
    } catch (error) {
      await this.auditDenied(actorId, null, 'user.create', error);
      throw error;
    }
  }

  async changeRole(actorId, targetIdValue, roleValue) {
    let targetId;
    try {
      targetId = positiveUserId(targetIdValue);
      const role = normalizeRole(roleValue);
      if (!role) throw new AuthError(400, 'INVALID_ROLE', 'Selecciona un rol válido.');
      if (Number(actorId) === targetId && role !== ROLES.ADMINISTRATOR) {
        throw new AuthError(409, 'SELF_ADMINISTRATION_FORBIDDEN', 'No puedes retirar tu propio acceso de administrador.');
      }
      const user = await this.repository.updateUserRole(actorId, targetId, role);
      if (!user) throw new AuthError(404, 'USER_NOT_FOUND', 'No se ha encontrado el usuario.');
      return administrativeUser(user);
    } catch (error) {
      const translated = translateRepositoryError(error);
      await this.auditDenied(actorId, targetId, 'user.role.change', translated);
      throw translated;
    }
  }

  async setSuspended(actorId, targetIdValue, suspended) {
    let targetId;
    try {
      targetId = positiveUserId(targetIdValue);
      if (typeof suspended !== 'boolean') {
        throw new AuthError(400, 'INVALID_SUSPENSION_STATE', 'El estado de suspensión debe ser verdadero o falso.');
      }
      if (Number(actorId) === targetId && suspended) {
        throw new AuthError(409, 'SELF_ADMINISTRATION_FORBIDDEN', 'No puedes suspender tu propia cuenta de administrador.');
      }
      const user = await this.repository.setUserSuspended(actorId, targetId, suspended);
      if (!user) throw new AuthError(404, 'USER_NOT_FOUND', 'No se ha encontrado el usuario.');
      return administrativeUser(user);
    } catch (error) {
      const translated = translateRepositoryError(error);
      await this.auditDenied(actorId, targetId, suspended ? 'user.suspend' : 'user.reactivate', translated);
      throw translated;
    }
  }

  async deleteUser(actorId, targetIdValue) {
    let targetId;
    try {
      targetId = positiveUserId(targetIdValue);
      if (Number(actorId) === targetId) {
        throw new AuthError(409, 'SELF_ADMINISTRATION_FORBIDDEN', 'No puedes eliminar tu propia cuenta de administrador.');
      }
      if (!await this.repository.deleteUser(actorId, targetId)) {
        throw new AuthError(404, 'USER_NOT_FOUND', 'No se ha encontrado el usuario.');
      }
    } catch (error) {
      const translated = translateRepositoryError(error);
      await this.auditDenied(actorId, targetId, 'user.delete', translated);
      throw translated;
    }
  }
}
