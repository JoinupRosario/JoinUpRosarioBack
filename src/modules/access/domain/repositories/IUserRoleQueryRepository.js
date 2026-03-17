/**
 * Puerto (interfaz): consulta de permisos del usuario (vía UserAdministrativo → Roles → Permisos).
 * Devuelve los códigos de permiso activos para un userId.
 *
 * @typedef {Object} IUserRoleQueryRepository
 * @property {(userId: string) => Promise<string[]>} getUserActivePermissionCodes
 */

export const IUserRoleQueryRepository = Symbol('IUserRoleQueryRepository');
