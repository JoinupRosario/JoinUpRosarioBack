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
import { verifyToken } from "../../middlewares/auth.js";
import { requirePermission } from "../access/presentation/middlewares/requirePermission.js";

const router = express.Router();

router.use(verifyToken);

// ¿Está el usuario actual autorizado para prácticas? (para home estudiante) — sin permiso de módulo
router.get("/me-autorizado", requirePermission("AMPR", "BUSP"), getMeAutorizado);

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
