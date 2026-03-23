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
  getDocumentoLegalizacionDownloadAdmin,
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
  getReportesEstadisticasMTM,
  getEstadisticasLegalizacionMTM,
  getSeguimientosMTM,
  createSeguimientoMTM,
  updateSeguimientoMTM,
  deleteSeguimientoMTM,
  aprobarSeguimientoMTM,
  rechazarSeguimientoMTM,
  accionMasivaSeguimientosMTM,
  getTotalHorasSeguimientosMTM,
  uploadDocumentoSeguimientoMTM,
  getDocumentoSeguimientoUrl,
  getDocumentoSeguimientoUrlAdmin,
  getDocumentoSeguimientoDownloadAdmin,
  getOrCreateLinkAsistenciaMTM,
  getAsistenciaFormByToken,
  postRegistrarAsistenciaMTM,
  getReporteAsistenciaMTM,
  getReporteAsistenciaMTMStudent,
  getReporteAsistenciaMTMAdminByPostulacion,
} from "./oportunidadMTM.controller.js";

const router = express.Router();

const ALLOWED_LEGALIZACION_MON_MTYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const uploadLegalizacion = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_LEGALIZACION_MON_MTYPES.has(file.mimetype) || String(file.mimetype || "").startsWith("image/")) {
      return cb(null, true);
    }
    cb(new Error("Tipo de archivo no permitido para documentos de legalización"), false);
  },
});

// RQ04_HU010: Asistencia MTM — rutas públicas (sin token) para registro por link
router.get("/asistencia-publica/:token/form", getAsistenciaFormByToken);
router.post("/asistencia-publica/:token/registrar", postRegistrarAsistenciaMTM);

router.use(verifyToken);

// RQ04_HU010: Link y reporte desde módulo legalización
router.get("/legalizaciones-admin/:postulacionId/link-asistencia", authorizeRoles("admin", "superadmin", "leader"), getOrCreateLinkAsistenciaMTM);
router.get("/legalizaciones-admin/:postulacionId/reporte-asistencia", authorizeRoles("admin", "superadmin", "leader"), getReporteAsistenciaMTMAdminByPostulacion);
router.get("/legalizaciones-admin/reporte-asistencia", authorizeRoles("admin", "superadmin", "leader"), getReporteAsistenciaMTM);

// RQ04_HU001: rutas para estudiante (deben ir antes de /:id)
router.get("/para-estudiante", authorizeRoles("student"), getOportunidadesMTMParaEstudiante);
router.get("/mis-postulaciones", authorizeRoles("student"), getMisPostulacionesMTM);
router.get("/mis-aceptadas", authorizeRoles("student"), getMisAceptadasMTM);
router.post("/:id/aplicar", authorizeRoles("student"), aplicarOportunidadMTM);

// RQ04_HU004: Legalización MTM (estudiante)
router.get("/legalizaciones/:postulacionId", authorizeRoles("student"), getLegalizacionMTM);
router.get("/legalizaciones/:postulacionId/documentos/:definitionId/url", authorizeRoles("student"), getDocumentoLegalizacionUrl);
router.delete("/legalizaciones/:postulacionId/documentos/:definitionId", authorizeRoles("student"), deleteDocumentoLegalizacionMTM);
router.put("/legalizaciones/:postulacionId", authorizeRoles("student"), updateLegalizacionMTM);
router.post("/legalizaciones/:postulacionId/documentos", authorizeRoles("student"), uploadLegalizacion.single("file"), uploadDocLegalizacionMTM);
router.post("/legalizaciones/:postulacionId/remitir-revision", authorizeRoles("student"), remitirRevisionLegalizacionMTM);
router.get("/legalizaciones/:postulacionId/link-asistencia", authorizeRoles("student"), getOrCreateLinkAsistenciaMTM);
router.get("/legalizaciones/:postulacionId/reporte-asistencia", authorizeRoles("student"), getReporteAsistenciaMTMStudent);

// RQ04_HU006: Legalización MTM — coordinación (admin)
router.get("/legalizaciones-admin", authorizeRoles("admin", "superadmin", "leader"), getLegalizacionesMTMAdmin);
router.get("/legalizaciones-admin/estadisticas", authorizeRoles("admin", "superadmin", "leader"), getEstadisticasLegalizacionMTM);
router.get("/legalizaciones-admin/:postulacionId", authorizeRoles("admin", "superadmin", "leader"), getLegalizacionMTMAdmin);
router.get("/legalizaciones-admin/:postulacionId/documentos/:definitionId/url", authorizeRoles("admin", "superadmin", "leader"), getDocumentoLegalizacionUrlAdmin);
router.get("/legalizaciones-admin/:postulacionId/documentos/:definitionId/descarga", authorizeRoles("admin", "superadmin", "leader"), getDocumentoLegalizacionDownloadAdmin);
router.patch("/legalizaciones-admin/:postulacionId/documentos/:definitionId", authorizeRoles("admin", "superadmin", "leader"), patchDocumentoLegalizacionMTM);
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

// RQ04_HU008: Seguimientos MTM (estudiante: registro; admin: aprobar/rechazar, total horas)
router.get("/seguimientos/:postulacionId", authorizeRoles("student", "admin", "superadmin", "leader"), getSeguimientosMTM);
router.get("/seguimientos/:postulacionId/total-horas", authorizeRoles("admin", "superadmin", "leader"), getTotalHorasSeguimientosMTM);
router.post("/seguimientos/:postulacionId", authorizeRoles("student", "admin", "superadmin", "leader"), createSeguimientoMTM);
router.put("/seguimientos/:postulacionId/:seguimientoId", authorizeRoles("student", "admin", "superadmin", "leader"), updateSeguimientoMTM);
router.delete("/seguimientos/:postulacionId/:seguimientoId", authorizeRoles("student", "admin", "superadmin", "leader"), deleteSeguimientoMTM);
router.patch("/seguimientos/:postulacionId/:seguimientoId/aprobar", authorizeRoles("admin", "superadmin", "leader"), aprobarSeguimientoMTM);
router.patch("/seguimientos/:postulacionId/:seguimientoId/rechazar", authorizeRoles("admin", "superadmin", "leader"), rechazarSeguimientoMTM);
router.post("/seguimientos/:postulacionId/accion-masiva", authorizeRoles("admin", "superadmin", "leader"), accionMasivaSeguimientosMTM);
router.post("/seguimientos/:postulacionId/:seguimientoId/documento", authorizeRoles("student"), uploadLegalizacion.single("file"), uploadDocumentoSeguimientoMTM);
router.get("/seguimientos/:postulacionId/:seguimientoId/documento/url", authorizeRoles("student"), getDocumentoSeguimientoUrl);
router.get("/seguimientos/:postulacionId/:seguimientoId/documento/url-admin", authorizeRoles("admin", "superadmin", "leader"), getDocumentoSeguimientoUrlAdmin);
router.get("/seguimientos/:postulacionId/:seguimientoId/documento/descarga", authorizeRoles("admin", "superadmin", "leader"), getDocumentoSeguimientoDownloadAdmin);

router.get("/", getOportunidadesMTM);
router.get("/reportes/estadisticas", authorizeRoles("admin", "superadmin", "leader"), getReportesEstadisticasMTM);
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
