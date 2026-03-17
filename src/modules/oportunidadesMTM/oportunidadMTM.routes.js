import express from "express";
import multer from "multer";
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
  getMisAceptadasMTM,
  cerrarOportunidadMTM,
  getApplicationsMTM,
  getApplicationDetailMTM,
  updateApplicationStateMTM,
  markApplicationDescargoHvMTM,
  estudianteResponderPostulacionMTM,
  getStatusHistoryMTM,
  getLegalizacionMTM,
  updateLegalizacionMTM,
  uploadDocLegalizacionMTM,
  getDocumentoLegalizacionUrl,
  deleteDocumentoLegalizacionMTM,
  remitirRevisionLegalizacionMTM,
  getLegalizacionesMTMAdmin,
  getLegalizacionMTMAdmin,
  getDocumentoLegalizacionUrlAdmin,
  patchDocumentoLegalizacionMTM,
  postAprobarLegalizacionMTM,
  postRechazarLegalizacionMTM,
  getPlanTrabajoMTM,
  getPlanTrabajoMTMDatosCrear,
  createPlanTrabajoMTM,
  updatePlanTrabajoMTM,
  enviarRevisionPlanTrabajoMTM,
  aprobarPlanTrabajoMTM,
  rechazarPlanTrabajoMTM,
} from "./oportunidadMTM.controller.js";

const router = express.Router();

const uploadLegalizacion = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "application/pdf") return cb(null, true);
    cb(new Error("Solo se permiten archivos PDF"), false);
  },
});

router.use(verifyToken);

// RQ04_HU001: rutas para estudiante (deben ir antes de /:id)
router.get("/para-estudiante", authorizeRoles("student"), getOportunidadesMTMParaEstudiante);
router.get("/mis-postulaciones", authorizeRoles("student"), getMisPostulacionesMTM);
router.get("/mis-aceptadas", authorizeRoles("student"), getMisAceptadasMTM);
router.post("/:id/aplicar", authorizeRoles("student"), aplicarOportunidadMTM);

// RQ04_HU004: Legalización MTM (estudiante)
router.get("/legalizaciones/:postulacionId", authorizeRoles("student"), getLegalizacionMTM);
router.get("/legalizaciones/:postulacionId/documentos/:tipo/url", authorizeRoles("student"), getDocumentoLegalizacionUrl);
router.delete("/legalizaciones/:postulacionId/documentos/:tipo", authorizeRoles("student"), deleteDocumentoLegalizacionMTM);
router.put("/legalizaciones/:postulacionId", authorizeRoles("student"), updateLegalizacionMTM);
router.post("/legalizaciones/:postulacionId/documentos", authorizeRoles("student"), uploadLegalizacion.single("file"), uploadDocLegalizacionMTM);
router.post("/legalizaciones/:postulacionId/remitir-revision", authorizeRoles("student"), remitirRevisionLegalizacionMTM);

// RQ04_HU006: Legalización MTM — coordinación (admin)
router.get("/legalizaciones-admin", authorizeRoles("admin", "superadmin", "leader"), getLegalizacionesMTMAdmin);
router.get("/legalizaciones-admin/:postulacionId", authorizeRoles("admin", "superadmin", "leader"), getLegalizacionMTMAdmin);
router.get("/legalizaciones-admin/:postulacionId/documentos/:tipo/url", authorizeRoles("admin", "superadmin", "leader"), getDocumentoLegalizacionUrlAdmin);
router.patch("/legalizaciones-admin/:postulacionId/documentos/:tipo", authorizeRoles("admin", "superadmin", "leader"), patchDocumentoLegalizacionMTM);
router.post("/legalizaciones-admin/:postulacionId/aprobar", authorizeRoles("admin", "superadmin", "leader"), postAprobarLegalizacionMTM);
router.post("/legalizaciones-admin/:postulacionId/rechazar", authorizeRoles("admin", "superadmin", "leader"), postRechazarLegalizacionMTM);

// RQ04_HU006: Plan de trabajo MTM (estudiante: crear/editar/enviar; profesor/admin: aprobar/rechazar)
router.get("/plan-trabajo/datos-crear/:postulacionId", authorizeRoles("student"), getPlanTrabajoMTMDatosCrear);
router.get("/plan-trabajo/:postulacionId", authorizeRoles("student", "admin", "superadmin", "leader"), getPlanTrabajoMTM);
router.post("/plan-trabajo/:postulacionId", authorizeRoles("student"), createPlanTrabajoMTM);
router.put("/plan-trabajo/:postulacionId", authorizeRoles("student"), updatePlanTrabajoMTM);
router.post("/plan-trabajo/:postulacionId/enviar-revision", authorizeRoles("student"), enviarRevisionPlanTrabajoMTM);
router.post("/plan-trabajo/:postulacionId/aprobar", authorizeRoles("admin", "superadmin", "leader"), aprobarPlanTrabajoMTM);
router.post("/plan-trabajo/:postulacionId/rechazar", authorizeRoles("admin", "superadmin", "leader"), rechazarPlanTrabajoMTM);

router.get("/", getOportunidadesMTM);
router.get("/:id/history", authorizeRoles("admin", "superadmin", "leader"), getStatusHistoryMTM);
router.get("/:id/applications", authorizeRoles("admin", "superadmin", "leader"), getApplicationsMTM);
router.get("/:id/applications/detail/:postulacionId", authorizeRoles("admin", "superadmin", "leader"), getApplicationDetailMTM);
router.patch("/:id/applications/:postulacionId/estudiante-responder", authorizeRoles("student"), estudianteResponderPostulacionMTM);
router.patch("/:id/applications/:postulacionId/state", authorizeRoles("admin", "superadmin", "leader"), updateApplicationStateMTM);
router.patch("/:id/applications/:postulacionId/descargo-hv", authorizeRoles("admin", "superadmin", "leader"), markApplicationDescargoHvMTM);
router.get("/:id", getOportunidadMTMById);

router.post("/", authorizeRoles("admin", "superadmin"), createOportunidadMTM);
router.put("/:id", authorizeRoles("admin", "superadmin"), updateOportunidadMTM);
router.patch("/:id/status", authorizeRoles("admin", "superadmin"), changeStatusMTM);
router.post("/:id/duplicate", authorizeRoles("admin", "superadmin"), duplicateOportunidadMTM);
router.post("/:id/cerrar", authorizeRoles("admin", "superadmin"), cerrarOportunidadMTM);
router.delete("/:id", authorizeRoles("admin", "superadmin"), deleteOportunidadMTM);

export default router;
