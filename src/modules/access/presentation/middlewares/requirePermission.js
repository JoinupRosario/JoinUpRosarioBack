/**
 * Middleware: exige que el usuario tenga al menos uno de los permisos indicados.
 * Debe usarse después de verifyToken (req.user debe existir).
 */
import { userHasPermission } from '../helpers/checkPermission.js';

/**
 * @param {...string} permissionCodes - Uno o más códigos (ej. 'AMPO', 'VPPO'). Si tiene al menos uno, pasa.
 * @returns {import('express').RequestHandler}
 */
export function requirePermission(...permissionCodes) {
  return async (req, res, next) => {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'No autorizado: usuario no identificado' });
    }
    if (!permissionCodes.length) {
      return next();
    }
    try {
      for (const code of permissionCodes) {
        const has = await userHasPermission(userId, code);
        if (has) return next();
      }
      return res.status(403).json({ message: 'No tiene permiso para esta acción' });
    } catch (err) {
      return res.status(500).json({ message: 'Error al verificar permiso', error: err.message });
    }
  };
}
