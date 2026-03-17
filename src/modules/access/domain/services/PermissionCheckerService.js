/**
 * Servicio de dominio: responde si un usuario tiene un permiso (por código).
 * Recibe los códigos del usuario (ya resueltos por el query repository);
 * no conoce HTTP ni BD.
 */
export class PermissionCheckerService {
  /**
   * Indica si entre los códigos del usuario está el permiso solicitado.
   * @param {string[]} userPermissionCodes - Códigos que tiene el usuario (vía roles).
   * @param {string} permissionCode - Código a verificar (ej. 'AMPO', 'VPPO').
   * @returns {boolean}
   */
  hasPermission(userPermissionCodes, permissionCode) {
    if (!permissionCode || !Array.isArray(userPermissionCodes)) {
      return false;
    }
    const normalized = String(permissionCode).trim().toUpperCase();
    return userPermissionCodes.includes(normalized);
  }
}
