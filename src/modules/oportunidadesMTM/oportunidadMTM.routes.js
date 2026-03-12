import express from "express";
import { verifyToken, authorizeRoles } from "../../middlewares/auth.js";
import {
  getOportunidadesMTM,
  getOportunidadMTMById,
  createOportunidadMTM,
  updateOportunidadMTM,
  changeStatusMTM,
  duplicateOportunidadMTM,
  deleteOportunidadMTM,
  getOportunidadesMTMParaEstudiante,
  aplicarOportunidadMTM,
  getMisPostulacionesMTM,
  cerrarOportunidadMTM,
  getApplicationsMTM,
  getApplicationDetailMTM,
  updateApplicationStateMTM,
  getStatusHistoryMTM,
} from "./oportunidadMTM.controller.js";

const router = express.Router();

router.use(verifyToken);

// RQ04_HU001: rutas para estudiante (deben ir antes de /:id)
router.get("/para-estudiante", authorizeRoles("student"), getOportunidadesMTMParaEstudiante);
router.get("/mis-postulaciones", authorizeRoles("student"), getMisPostulacionesMTM);
router.post("/:id/aplicar", authorizeRoles("student"), aplicarOportunidadMTM);

router.get("/", getOportunidadesMTM);
router.get("/:id/history", authorizeRoles("admin", "superadmin", "leader"), getStatusHistoryMTM);
router.get("/:id/applications", authorizeRoles("admin", "superadmin", "leader"), getApplicationsMTM);
router.get("/:id/applications/detail/:postulacionId", authorizeRoles("admin", "superadmin", "leader"), getApplicationDetailMTM);
router.patch("/:id/applications/:postulacionId/state", authorizeRoles("admin", "superadmin", "leader"), updateApplicationStateMTM);
router.get("/:id", getOportunidadMTMById);

router.post("/", authorizeRoles("admin", "superadmin"), createOportunidadMTM);
router.put("/:id", authorizeRoles("admin", "superadmin"), updateOportunidadMTM);
router.patch("/:id/status", authorizeRoles("admin", "superadmin"), changeStatusMTM);
router.post("/:id/duplicate", authorizeRoles("admin", "superadmin"), duplicateOportunidadMTM);
router.post("/:id/cerrar", authorizeRoles("admin", "superadmin"), cerrarOportunidadMTM);
router.delete("/:id", authorizeRoles("admin", "superadmin"), deleteOportunidadMTM);

export default router;
