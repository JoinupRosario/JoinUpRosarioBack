/**
 * Caso de uso: crear un rol con nombre y permisos opcionales.
 */
import { Role } from '../../../domain/entities/Role.js';

export class CreateRoleUseCase {
  /**
   * @param {object} deps
   * @param {import('../../../domain/repositories/IRoleRepository.js').IRoleRepository} deps.roleRepository
   */
  constructor({ roleRepository }) {
    this.roleRepository = roleRepository;
  }

  /**
   * @param {object} input
   * @param {string} input.name
   * @param {string[]} [input.permissionIds]
   * @param {boolean} [input.isDefault=false]
   * @returns {Promise<object>} Rol creado (plain object para la API).
   */
  async execute({ name, permissionIds = [], isDefault = false }) {
    const existing = await this.roleRepository.findByName(name);
    if (existing) {
      throw new Error('Ya existe un rol con ese nombre');
    }
    const role = new Role({
      name,
      enabled: true,
      isDefault,
      permissions: permissionIds.map(pid => ({ permissionId: pid, enabled: true }))
    });
    const saved = await this.roleRepository.save(role);
    return this._toResponse(saved);
  }

  _toResponse(role) {
    return {
      id: role.id,
      name: role.getNameValue(),
      enabled: role.enabled,
      isDefault: role.isDefault,
      permissions: role.permissions
    };
  }
}
