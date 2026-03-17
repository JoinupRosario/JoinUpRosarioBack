/**
 * Error de dominio: permiso no encontrado.
 */
export class PermissionNotFoundError extends Error {
  /** @param {string} [message] */
  constructor(message = 'Permiso no encontrado') {
    super(message);
    this.name = 'PermissionNotFoundError';
  }
}
