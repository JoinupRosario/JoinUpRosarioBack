/**
 * Helper centralizado para verificar si un usuario tiene un permiso (por código).
 * Usar desde cualquier controller que necesite comprobar permisos (EFEN, EIDE, EPOS, etc.).
 */
import { CheckUserPermissionUseCase } from '../../application/use-cases/check-access/CheckUserPermissionUseCase.js';
import { UserRoleQueryRepository } from '../../infrastructure/persistence/mongoose/UserRoleQueryRepository.js';

const userRoleQueryRepository = new UserRoleQueryRepository();
const checkUserPermissionUseCase = new CheckUserPermissionUseCase(userRoleQueryRepository);

/**
 * Indica si el usuario tiene el permiso indicado.
 * @param {string} userId - ID del usuario (req.user.id).
 * @param {string} permissionCode - Código del permiso (ej. 'EFEN', 'EIDE', 'EPOS').
 * @returns {Promise<boolean>}
 */
export async function userHasPermission(userId, permissionCode) {
  if (!userId || !permissionCode) return false;
  return checkUserPermissionUseCase.execute({ userId, permissionCode });
}
