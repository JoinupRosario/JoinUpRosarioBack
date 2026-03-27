import express from "express";
import {
  getMeAutorizado,
  getEstudiantesHabilitados,
  getHistorialEstados,
  previewCargueUxxi,
  confirmarCargueUxxi,
  crearUsuariosBD,
  patchEstadoFinalEstudianteHabilitado,
} from "./estudianteHabilitado.controller.js";
import { verifyToken, mapModuloToRole } from "../../middlewares/auth.js";
import { requirePermission } from "../access/presentation/middlewares/requirePermission.js";

const router = express.Router();

router.use(verifyToken);

/**
 * Permite acceso si:
 * - es estudiante/postulante autenticado, o
 * - tiene al menos uno de los permisos administrativos indicados.
 */
function requirePermissionOrStudent(...codes) {
  return async (req, res, next) => {
    const role = req.user?.role || mapModuloToRole(req.user?.modulo);
    if (role === "student") return next();
    return requirePermission(...codes)(req, res, next);
  };
}

// ¿Está el usuario actual autorizado para prácticas? (para home estudiante) — solo requiere sesión
router.get("/me-autorizado", requirePermissionOrStudent("AMPR", "BUSP"), getMeAutorizado);

// AMPR = Acceso módulo prácticas; BUSP = Buscar estudiantes; CEST = Cargar estudiantes
router.get("/", requirePermission("AMPR", "BUSP"), getEstudiantesHabilitados);
router.get("/historial-estados", requirePermission("AMPR", "BUSP"), getHistorialEstados);
router.patch(
  "/:id/estado-final",
  requirePermission("AMPR", "BUSP"),
  patchEstadoFinalEstudianteHabilitado
);
router.post("/preview-uxxi", requirePermission("CEST"), previewCargueUxxi);
router.post("/confirmar-cargue", requirePermission("CEST"), confirmarCargueUxxi);
router.post("/crear-usuarios-bd", requirePermission("CEST"), crearUsuariosBD);

export default router;
