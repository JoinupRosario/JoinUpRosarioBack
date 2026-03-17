/**
 * Value Object: código de permiso (uppercase, trim).
 * Sin dependencias externas (dominio puro).
 */
const MAX_LENGTH = 20;
const PATTERN = /^[A-Z0-9_]{1,20}$/;

export class PermissionCode {
  /** @param {string} value */
  constructor(value) {
    if (value == null || typeof value !== 'string') {
      throw new Error('PermissionCode: el valor es obligatorio');
    }
    const normalized = String(value).trim().toUpperCase();
    if (!normalized) {
      throw new Error('PermissionCode: el código no puede estar vacío');
    }
    if (normalized.length > MAX_LENGTH) {
      throw new Error(`PermissionCode: máximo ${MAX_LENGTH} caracteres`);
    }
    if (!PATTERN.test(normalized)) {
      throw new Error('PermissionCode: solo letras mayúsculas, números y guión bajo');
    }
    this._value = normalized;
  }

  value() {
    return this._value;
  }

  equals(other) {
    return other instanceof PermissionCode && this._value === other._value;
  }
}
