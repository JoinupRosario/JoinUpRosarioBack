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
    const ua = await UserAdministrativo.findOne({ user: userId, estado: true })
      .populate({ path: 'roles.rol', match: { estado: true } })
      .lean();

    if (!ua || !ua.roles || ua.roles.length === 0) {
      return [];
    }

    const roleIds = ua.roles
      .filter(r => r.rol && r.estado !== false)
      .map(r => r.rol._id);

    if (roleIds.length === 0) return [];

    const roles = await Rol.find({ _id: { $in: roleIds }, estado: true })
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
