/**
 * Implementación de IUserRoleQueryRepository: obtiene códigos de permiso activos del usuario
 * vía UserAdministrativo → Roles activos → Permisos activos.
 */
import UserAdministrativo from '../../../../usersAdministrativos/userAdministrativo.model.js';
import Rol from '../../../../roles/roles.model.js';

export class UserRoleQueryRepository {
  /**
   * @param {string} userId - ID del User (Mongo ObjectId string).
   * @returns {Promise<string[]>} Códigos de permiso activos (ej. ['AMPO','VPPO',...]).
   */
  async getUserActivePermissionCodes(userId) {
    // Usar find (no findOne) para unificar permisos de todos los perfiles administrativos
    // del mismo User (evita 403 cuando hay duplicados o varios perfiles por usuario)
    const uaList = await UserAdministrativo.find({ user: userId, estado: true })
      .populate({ path: 'roles.rol', match: { estado: true } })
      .lean();

    const roleIds = new Set();
    for (const ua of uaList) {
      if (!ua.roles || !ua.roles.length) continue;
      for (const r of ua.roles) {
        if (r.rol && r.estado !== false) roleIds.add(r.rol._id?.toString?.() || r.rol._id);
      }
    }

    if (roleIds.size === 0) return [];
    const roleIdsArr = Array.from(roleIds);

    const roles = await Rol.find({ _id: { $in: roleIdsArr }, estado: true })
      .populate('permisos.permiso')
      .lean();

    const codes = new Set();
    for (const role of roles) {
      const permisos = role.permisos || [];
      for (const p of permisos) {
        if (p.estado !== false && p.permiso && p.permiso.codigo) {
          codes.add(String(p.permiso.codigo).trim().toUpperCase());
        }
      }
    }
    return Array.from(codes);
  }
}
