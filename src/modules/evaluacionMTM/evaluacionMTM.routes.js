import express from "express";
import { verifyToken } from "../../middlewares/auth.js";
import { requireStaffPermission } from "../../middlewares/authPermission.js";

import {
  getFormularioPublico,
  postRespuestaPublica,
} from "./evaluacionMTM.public.controller.js";

import {
  listSurveys,
  getSurveyById,
  createSurvey,
  updateSurvey,
  activateSurvey,
  archiveSurvey,
  listEvaluaciones,
  getEvaluacionDetalle,
  getEvaluacionDetalleByLegalizacion,
  getRespuestaDetalle,
  reenviarToken,
  dispararEvaluacionAdmin,
  getReporteEvaluaciones,
} from "./evaluacionMTM.controller.js";

const router = express.Router();

// ── Rutas públicas (acceso por token de correo) ──────────────────────
router.get("/publico/:token", getFormularioPublico);
router.post("/publico/:token/responder", postRespuestaPublica);

// ── A partir de aquí, autenticadas ───────────────────────────────────
router.use(verifyToken);

// Surveys (plantillas) — Coordinador general MTM
router.get("/surveys", requireStaffPermission("AESM", "AMMO"), listSurveys);
router.post("/surveys", requireStaffPermission("CESM", "AMMO"), createSurvey);
router.get("/surveys/:id", requireStaffPermission("AESM", "AMMO"), getSurveyById);
router.put("/surveys/:id", requireStaffPermission("CESM", "AMMO"), updateSurvey);
router.post("/surveys/:id/activar", requireStaffPermission("CESM", "AMMO"), activateSurvey);
router.post("/surveys/:id/archivar", requireStaffPermission("CESM", "AMMO"), archiveSurvey);

// Evaluaciones — Coordinador GuiARTE
router.get("/evaluaciones", requireStaffPermission("AESM", "PESM", "AMMO"), listEvaluaciones);
router.get(
  "/evaluaciones/legalizacion/:legalizacionId",
  requireStaffPermission("AESM", "PESM", "AMMO"),
  getEvaluacionDetalleByLegalizacion
);
router.get("/evaluaciones/:id", requireStaffPermission("AESM", "PESM", "AMMO"), getEvaluacionDetalle);
router.get("/evaluaciones/respuestas/:respuestaId", requireStaffPermission("AESM", "PESM", "AMMO"), getRespuestaDetalle);
router.post("/evaluaciones/tokens/:tokenId/reenviar", requireStaffPermission("PESM", "AMMO"), reenviarToken);
router.post(
  "/evaluaciones/legalizacion/:legalizacionId/disparar",
  requireStaffPermission("PESM", "AMMO"),
  dispararEvaluacionAdmin
);

// Reportes
router.get("/reportes/resumen", requireStaffPermission("AESM", "PESM", "AMMO"), getReporteEvaluaciones);

export default router;
