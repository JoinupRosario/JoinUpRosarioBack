/**
 * Entidad de dominio: Rol (sin Mongoose).
 * Lista de permisos del rol (permissionId + enabled).
 */
import { RoleName } from '../value-objects/RoleName.js';

export class Role {
  /**
   * @param {object} params
   * @param {string} [params.id]
   * @param {string} params.name
   * @param {boolean} [params.enabled=true]
   * @param {boolean} [params.isDefault=false]
   * @param {Array<{ permissionId: string, enabled: boolean }>} [params.permissions=[]]
   */
  constructor({ id, name, enabled = true, isDefault = false, permissions = [] }) {
    this.id = id;
    this.name = new RoleName(name);
    this.enabled = enabled;
    this.isDefault = isDefault;
    this.permissions = permissions;
  }

  getNameValue() {
    return this.name.value();
  }

  addPermission(permissionId, enabled = true) {
    const exists = this.permissions.some(
      p => p.permissionId === permissionId || (p.permissionId && p.permissionId.toString() === permissionId.toString())
    );
    if (!exists) {
      this.permissions.push({ permissionId, enabled });
    }
  }

  removePermission(permissionId) {
    const idStr = permissionId && permissionId.toString ? permissionId.toString() : permissionId;
    this.permissions = this.permissions.filter(
      p => (p.permissionId && p.permissionId.toString()) !== idStr
    );
  }

  setEnabled(enabled) {
    this.enabled = enabled;
  }
}
