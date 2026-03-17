/**
 * Caso de uso: actualizar nombre y/o estado de un rol.
 */
import { RoleNotFoundError } from '../../../domain/errors/RoleNotFoundError.js';

export class UpdateRoleUseCase {
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
   * @param {string} [input.name]
   * @param {boolean} [input.enabled]
   * @returns {Promise<object>}
   */
  async execute({ roleId, name, enabled }) {
    const role = await this.roleRepository.getById(roleId);
    if (!role) {
      throw new RoleNotFoundError();
    }
    const toSave = {
      id: roleId,
      getNameValue: () => name != null ? name : role.getNameValue?.(),
      enabled: enabled !== undefined ? enabled : role.enabled,
      permissions: role.permissions || []
    };
    const saved = await this.roleRepository.save(toSave);
    return { id: saved.id, name: saved.getNameValue?.() ?? name, enabled: saved.enabled };
  }
}
