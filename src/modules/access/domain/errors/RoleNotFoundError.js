/**
 * Error de dominio: rol no encontrado.
 */
export class RoleNotFoundError extends Error {
  /** @param {string} [message] */
  constructor(message = 'Rol no encontrado') {
    super(message);
    this.name = 'RoleNotFoundError';
  }
}
