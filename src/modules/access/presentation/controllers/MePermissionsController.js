/**
 * Controller para que el frontend obtenga los permisos del usuario logueado (GET /access/me/permissions).
 */
import { UserRoleQueryRepository } from '../../infrastructure/persistence/mongoose/UserRoleQueryRepository.js';

const userRoleQueryRepository = new UserRoleQueryRepository();

export async function getMyPermissions(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'No autorizado' });
    }
    const permissions = await userRoleQueryRepository.getUserActivePermissionCodes(userId);
    return res.json({ success: true, data: { permissions } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}
