import express from "express";
import {
  getMeAutorizado,
  getEstudiantesHabilitados,
  previewCargueUxxi,
  confirmarCargueUxxi,
  crearUsuariosBD,
} from "./estudianteHabilitado.controller.js";
import { verifyToken } from "../../middlewares/auth.js";
import { requirePermission } from "../access/presentation/middlewares/requirePermission.js";

const router = express.Router();

router.use(verifyToken);

// ¿Está el usuario actual autorizado para prácticas? (para home estudiante) — sin permiso de módulo
router.get("/me-autorizado", getMeAutorizado);

// AMPR = Acceso módulo prácticas; BUSP = Buscar estudiantes; CEST = Cargar estudiantes
router.get("/", requirePermission("AMPR", "BUSP"), getEstudiantesHabilitados);
router.post("/preview-uxxi", requirePermission("CEST"), previewCargueUxxi);
router.post("/confirmar-cargue", requirePermission("CEST"), confirmarCargueUxxi);
router.post("/crear-usuarios-bd", requirePermission("CEST"), crearUsuariosBD);

export default router;
