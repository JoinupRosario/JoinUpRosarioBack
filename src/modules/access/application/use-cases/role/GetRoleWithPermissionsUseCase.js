/**
 * Caso de uso: obtener un rol por ID con sus permisos (para API).
 */
import { RoleNotFoundError } from '../../../domain/errors/RoleNotFoundError.js';

export class GetRoleWithPermissionsUseCase {
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
   * @returns {Promise<object>}
   */
  async execute({ roleId }) {
    const role = await this.roleRepository.getById(roleId);
    if (!role) {
      throw new RoleNotFoundError();
    }
    return {
      id: role.id,
      name: role.getNameValue?.(),
      enabled: role.enabled,
      isDefault: role.isDefault,
      permissions: role.permissions || []
    };
  }
}
