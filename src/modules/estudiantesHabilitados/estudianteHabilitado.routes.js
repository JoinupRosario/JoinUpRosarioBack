import express from "express";
import {
  getEstudiantesHabilitados,
  previewCargueUxxi,
  confirmarCargueUxxi,
  crearUsuariosBD,
} from "./estudianteHabilitado.controller.js";
import { verifyToken } from "../../middlewares/auth.js";

const router = express.Router();

router.use(verifyToken);

// Listar estudiantes habilitados (paginado + filtros)
router.get("/", getEstudiantesHabilitados);

// Preview: descarga SFTP + OSB + evaluación de reglas (sin guardar)
router.post("/preview-uxxi", previewCargueUxxi);

// Confirmar cargue: guarda los resultados del preview en BD
router.post("/confirmar-cargue", confirmarCargueUxxi);

// Crear User + Postulant para estudiantes que no existen en BD
router.post("/crear-usuarios-bd", crearUsuariosBD);

export default router;
