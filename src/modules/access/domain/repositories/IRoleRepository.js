/**
 * Puerto (interfaz): contrato del repositorio de roles.
 * La implementación concreta vive en infrastructure.
 *
 * @typedef {Object} IRoleRepository
 * @property {(id: string) => Promise<import('../entities/Role.js').Role | null>} getById
 * @property {(name: string) => Promise<import('../entities/Role.js').Role | null>} findByName
 * @property {(role: import('../entities/Role.js').Role) => Promise<import('../entities/Role.js').Role>} save
 * @property {(filter?: { enabled?: boolean }) => Promise<import('../entities/Role.js').Role[]>} findAll
 * @property {(id: string) => Promise<boolean>} deleteById
 */

// En JS no hay interfaces; los use cases dependerán de implementaciones que cumplan este contrato.
export const IRoleRepository = Symbol('IRoleRepository');
