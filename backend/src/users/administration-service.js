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

export class UserAdministrationService {
  constructor(repository, authService) {
    this.repository = repository;
    this.authService = authService;
  }

  async listUsers() {
    return (await this.repository.listUsers()).map(administrativeUser);
  }

  async createUser(input) {
    const role = normalizeRole(input?.role);
    if (!role) throw new AuthError(400, 'INVALID_ROLE', 'Selecciona un rol válido.');
    const user = await this.authService.createAccount(input ?? {}, role);
    return { ...user, suspended: false };
  }

  async changeRole(actorId, targetIdValue, roleValue) {
    const targetId = positiveUserId(targetIdValue);
    const role = normalizeRole(roleValue);
    if (!role) throw new AuthError(400, 'INVALID_ROLE', 'Selecciona un rol válido.');
    if (Number(actorId) === targetId && role !== ROLES.ADMINISTRATOR) {
      throw new AuthError(409, 'SELF_ADMINISTRATION_FORBIDDEN', 'No puedes retirar tu propio acceso de administrador.');
    }
    const user = await this.repository.updateUserRole(targetId, role);
    if (!user) throw new AuthError(404, 'USER_NOT_FOUND', 'No se ha encontrado el usuario.');
    return administrativeUser(user);
  }

  async setSuspended(actorId, targetIdValue, suspended) {
    const targetId = positiveUserId(targetIdValue);
    if (typeof suspended !== 'boolean') {
      throw new AuthError(400, 'INVALID_SUSPENSION_STATE', 'El estado de suspensión debe ser verdadero o falso.');
    }
    if (Number(actorId) === targetId && suspended) {
      throw new AuthError(409, 'SELF_ADMINISTRATION_FORBIDDEN', 'No puedes suspender tu propia cuenta de administrador.');
    }
    const user = await this.repository.setUserSuspended(targetId, suspended);
    if (!user) throw new AuthError(404, 'USER_NOT_FOUND', 'No se ha encontrado el usuario.');
    return administrativeUser(user);
  }

  async deleteUser(actorId, targetIdValue) {
    const targetId = positiveUserId(targetIdValue);
    if (Number(actorId) === targetId) {
      throw new AuthError(409, 'SELF_ADMINISTRATION_FORBIDDEN', 'No puedes eliminar tu propia cuenta de administrador.');
    }
    if (!await this.repository.deleteUser(targetId)) {
      throw new AuthError(404, 'USER_NOT_FOUND', 'No se ha encontrado el usuario.');
    }
  }
}
