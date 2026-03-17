/**
 * Caso de uso: asignar la lista completa de permisos a un rol.
 */
import { RoleNotFoundError } from '../../../domain/errors/RoleNotFoundError.js';

export class AssignPermissionsToRoleUseCase {
  /**
   * @param {object} deps
   * @param {import('../../../domain/repositories/IRoleRepository.js').IRoleRepository} deps.roleRepository
   */
  constructor({ roleRepository }) {
    this.roleRepository = roleRepository;
  }

  /**
   * @param {object} input
   * @param {string} input.roleId
   * @param {string[]} input.permissionIds
   * @returns {Promise<object>}
   */
  async execute({ roleId, permissionIds }) {
    const role = await this.roleRepository.getById(roleId);
    if (!role) {
      throw new RoleNotFoundError();
    }
    role.permissions = (permissionIds || []).map(pid => ({ permissionId: pid, enabled: true }));
    await this.roleRepository.save(role);
    return { roleId, permissionIds: permissionIds || [] };
  }
}
