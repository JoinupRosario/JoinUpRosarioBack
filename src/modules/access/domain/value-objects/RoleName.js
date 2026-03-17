/**
 * Value Object: nombre del rol (trim, longitud máxima).
 * Sin dependencias externas (dominio puro).
 */
const MAX_LENGTH = 100;

export class RoleName {
  /** @param {string} value */
  constructor(value) {
    if (value == null || typeof value !== 'string') {
      throw new Error('RoleName: el valor es obligatorio');
    }
    const trimmed = String(value).trim();
    if (!trimmed) {
      throw new Error('RoleName: el nombre no puede estar vacío');
    }
    if (trimmed.length > MAX_LENGTH) {
      throw new Error(`RoleName: máximo ${MAX_LENGTH} caracteres`);
    }
    this._value = trimmed;
  }

  value() {
    return this._value;
  }

  equals(other) {
    return other instanceof RoleName && this._value === other._value;
  }
}
