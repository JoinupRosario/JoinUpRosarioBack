/**
 * Autorización por permisos del rol (colección permisos + roles del usuario).
 * Los estudiantes no cargan permisos granulares: las rutas solo-estudiante siguen usando authorizeRoles('student').
 */
import { mapModuloToRole } from "./auth.js";
import { requirePermission } from "../modules/access/presentation/middlewares/requirePermission.js";

const STAFF_FULL_ACCESS_ROLES = ["superadmin", "admin"];

export function getUserRole(req) {
  return req.user?.role || mapModuloToRole(req.user?.modulo);
}

export function isStudentUser(req) {
  return getUserRole(req) === "student";
}

export function isStaffFullAccess(req) {
  return STAFF_FULL_ACCESS_ROLES.includes(getUserRole(req));
}

/**
 * Personal no estudiante: al menos uno de los permisos (OR).
 * Los estudiantes reciben 403 (no deben llamar rutas solo staff).
 * admin/superadmin conservan acceso completo (compatibilidad con despliegues sin permisos asignados al rol).
 */
export function requireStaffPermission(...permissionCodes) {
  return async (req, res, next) => {
    if (isStudentUser(req)) {
      return res.status(403).json({ message: "No autorizado" });
    }
    if (isStaffFullAccess(req)) return next();
    return requirePermission(...permissionCodes)(req, res, next);
  };
}

/**
 * Estudiante: accede sin permiso granular.
 * admin/superadmin: acceso completo.
 * Resto del personal: al menos uno de los permisos (OR).
 */
export function requireStudentOrStaffPermission(...permissionCodes) {
  return async (req, res, next) => {
    if (isStudentUser(req)) return next();
    if (isStaffFullAccess(req)) return next();
    return requirePermission(...permissionCodes)(req, res, next);
  };
}

/**
 * Empresa (company): pasa sin permiso. Otros no-estudiantes: al menos un permiso.
 * Para rutas compartidas empresa + staff en oportunidades de práctica.
 */
export function requireCompanyOrStaffPermission(...permissionCodes) {
  return async (req, res, next) => {
    const role = getUserRole(req);
    if (role === "company") return next();
    if (isStudentUser(req)) {
      return res.status(403).json({ message: "No autorizado" });
    }
    if (isStaffFullAccess(req)) return next();
    return requirePermission(...permissionCodes)(req, res, next);
  };
}

/**
 * Empresa o estudiante: sin permiso granular en BD.
 * Personal (líder, etc.): al menos un permiso; admin/superadmin sin restricción.
 */
export function requireCompanyStudentOrStaffPermission(...permissionCodes) {
  return async (req, res, next) => {
    const role = getUserRole(req);
    if (role === "company" || role === "student") return next();
    if (isStaffFullAccess(req)) return next();
    return requirePermission(...permissionCodes)(req, res, next);
  };
}
