/**
 * Puerto (interfaz): contrato del repositorio de permisos.
 *
 * @typedef {Object} IPermissionRepository
 * @property {(code: string) => Promise<import('../entities/Permission.js').Permission | null>} getByCode
 * @property {(module: string) => Promise<import('../entities/Permission.js').Permission[]>} listByModule
 * @property {() => Promise<import('../entities/Permission.js').Permission[]>} findAll
 * @property {(id: string) => Promise<import('../entities/Permission.js').Permission | null>} getById
 */

export const IPermissionRepository = Symbol('IPermissionRepository');
