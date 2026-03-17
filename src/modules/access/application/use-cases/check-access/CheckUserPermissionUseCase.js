/**
 * Caso de uso: comprobar si el usuario tiene un permiso (por código).
 * Orquesta IUserRoleQueryRepository + PermissionCheckerService.
 */
import { PermissionCheckerService } from '../../../domain/services/PermissionCheckerService.js';

export class CheckUserPermissionUseCase {
  /**
   * @param {import('../../../domain/repositories/IUserRoleQueryRepository.js').IUserRoleQueryRepository} userRoleQueryRepository
   */
  constructor(userRoleQueryRepository) {
    this.userRoleQueryRepository = userRoleQueryRepository;
    this.permissionChecker = new PermissionCheckerService();
  }

  /**
   * @param {object} input
   * @param {string} input.userId
   * @param {string} input.permissionCode
   * @returns {Promise<boolean>}
   */
  async execute({ userId, permissionCode }) {
    const codes = await this.userRoleQueryRepository.getUserActivePermissionCodes(userId);
    return this.permissionChecker.hasPermission(codes, permissionCode);
  }
}
