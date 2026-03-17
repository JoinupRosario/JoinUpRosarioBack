/**
 * Entidad de dominio: Permiso (sin Mongoose).
 * Solo datos y validación; la persistencia está en infraestructura.
 */
import { PermissionCode } from '../value-objects/PermissionCode.js';
import { ModuleName } from '../value-objects/ModuleName.js';

export class Permission {
  /**
   * @param {object} params
   * @param {string} params.id
   * @param {string} params.code
   * @param {string} params.name
   * @param {string} params.module
   */
  constructor({ id, code, name, module }) {
    this.id = id;
    this.code = new PermissionCode(code);
    this.name = name;
    this.module = new ModuleName(module);
  }

  getCodeValue() {
    return this.code.value();
  }

  getModuleValue() {
    return this.module.value();
  }
}
