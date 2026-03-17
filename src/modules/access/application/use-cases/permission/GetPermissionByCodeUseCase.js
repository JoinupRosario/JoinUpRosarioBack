/**
 * Caso de uso: obtener un permiso por código.
 */
import { PermissionNotFoundError } from '../../../domain/errors/PermissionNotFoundError.js';

export class GetPermissionByCodeUseCase {
  /**
   * @param {object} deps
   * @param {import('../../../domain/repositories/IPermissionRepository.js').IPermissionRepository} deps.permissionRepository
   */
  constructor({ permissionRepository }) {
    this.permissionRepository = permissionRepository;
  }

  /**
   * @param {object} input
   * @param {string} input.code
   * @returns {Promise<object>}
   */
  async execute({ code }) {
    const permission = await this.permissionRepository.getByCode(code);
    if (!permission) {
      throw new PermissionNotFoundError();
    }
    return {
      id: permission.id,
      code: permission.getCodeValue?.() ?? permission.code,
      name: permission.name,
      module: permission.getModuleValue?.() ?? permission.module
    };
  }
}
