import express from "express";
import multer from "multer";
import { verifyToken, authorizeRoles } from "../../middlewares/auth.js";
import {
  requireStaffPermission,
  requireStudentOrStaffPermission,
} from "../../middlewares/authPermission.js";
import {
  getOportunidadesMTM,
  getDistinctEstadosMTM,
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
  seleccionarPostulanteMTM,
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

router.get(
  "/meta/distinct-estados",
  requireStaffPermission("COMT2", "COMN", "AMOP", "AMMO"),
  getDistinctEstadosMTM
);

// RQ04_HU010: Link y reporte desde módulo legalización
router.get(
  "/legalizaciones-admin/:postulacionId/link-asistencia",
  requireStaffPermission("DRAM", "AMMO", "ADLM"),
  getOrCreateLinkAsistenciaMTM
);
router.get(
  "/legalizaciones-admin/:postulacionId/reporte-asistencia",
  requireStaffPermission("DRAM", "AMMO", "ADLM"),
  getReporteAsistenciaMTMAdminByPostulacion
);
router.get("/legalizaciones-admin/reporte-asistencia", requireStaffPermission("DRAM", "AMMO", "LLMO"), getReporteAsistenciaMTM);

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
router.get(
  "/legalizaciones-admin",
  requireStaffPermission("LLMO", "CLMO", "AMMO", "ADLM"),
  getLegalizacionesMTMAdmin
);
router.get(
  "/legalizaciones-admin/estadisticas",
  requireStaffPermission("LLMO", "CLMO", "AMMO", "ADLM"),
  getEstadisticasLegalizacionMTM
);
router.get(
  "/legalizaciones-admin/:postulacionId",
  requireStaffPermission("CLMO", "ACLM", "APLM", "ADLM", "AMMO"),
  getLegalizacionMTMAdmin
);
router.get(
  "/legalizaciones-admin/:postulacionId/documentos/:definitionId/url",
  requireStaffPermission("VADM", "APDM", "ACLM", "ADLM"),
  getDocumentoLegalizacionUrlAdmin
);
router.get(
  "/legalizaciones-admin/:postulacionId/documentos/:definitionId/descarga",
  requireStaffPermission("VADM", "APDM", "ACLM", "ADLM"),
  getDocumentoLegalizacionDownloadAdmin
);
router.patch(
  "/legalizaciones-admin/:postulacionId/documentos/:definitionId",
  requireStaffPermission("ACAM", "APDM", "ACLM", "ADLM"),
  patchDocumentoLegalizacionMTM
);
router.post(
  "/legalizaciones-admin/:postulacionId/aprobar",
  requireStaffPermission("APLM", "APDM", "ACLM"),
  postAprobarLegalizacionMTM
);
router.post(
  "/legalizaciones-admin/:postulacionId/rechazar",
  requireStaffPermission("APLM", "ANLM", "ACLM"),
  postRechazarLegalizacionMTM
);

// RQ04_HU006: Plan de trabajo MTM (estudiante: crear/editar/enviar; profesor/admin: aprobar/rechazar)
router.get("/plan-trabajo/datos-crear/:postulacionId", authorizeRoles("student"), getPlanTrabajoMTMDatosCrear);
router.get(
  "/plan-trabajo/:postulacionId",
  requireStudentOrStaffPermission("VMPM", "CREM", "ACPM", "AMMO"),
  getPlanTrabajoMTM
);
router.post("/plan-trabajo/:postulacionId", authorizeRoles("student"), createPlanTrabajoMTM);
router.put("/plan-trabajo/:postulacionId", authorizeRoles("student"), updatePlanTrabajoMTM);
router.post("/plan-trabajo/:postulacionId/enviar-revision", authorizeRoles("student"), enviarRevisionPlanTrabajoMTM);
router.post("/plan-trabajo/:postulacionId/aprobar", requireStaffPermission("APPM", "ACPM"), aprobarPlanTrabajoMTM);
router.post("/plan-trabajo/:postulacionId/rechazar", requireStaffPermission("RPPM", "ACPM"), rechazarPlanTrabajoMTM);

// RQ04_HU008: Seguimientos MTM (estudiante: registro; admin: aprobar/rechazar, total horas)
router.get(
  "/seguimientos/:postulacionId",
  requireStudentOrStaffPermission("CSLM", "CRSM", "ACSM", "AMMO"),
  getSeguimientosMTM
);
router.get(
  "/seguimientos/:postulacionId/total-horas",
  requireStaffPermission("CRSM", "APAM", "CSLM", "AMMO"),
  getTotalHorasSeguimientosMTM
);
router.post(
  "/seguimientos/:postulacionId",
  requireStudentOrStaffPermission("CRSM", "ACSM", "DSML", "AMMO"),
  createSeguimientoMTM
);
router.put(
  "/seguimientos/:postulacionId/:seguimientoId",
  requireStudentOrStaffPermission("ACSM", "CRSM", "AMMO"),
  updateSeguimientoMTM
);
router.delete(
  "/seguimientos/:postulacionId/:seguimientoId",
  requireStudentOrStaffPermission("ACSM", "CRSM", "AMMO"),
  deleteSeguimientoMTM
);
router.patch(
  "/seguimientos/:postulacionId/:seguimientoId/aprobar",
  requireStaffPermission("APAM", "APCM"),
  aprobarSeguimientoMTM
);
router.patch(
  "/seguimientos/:postulacionId/:seguimientoId/rechazar",
  requireStaffPermission("REASM", "APCM"),
  rechazarSeguimientoMTM
);
router.post(
  "/seguimientos/:postulacionId/accion-masiva",
  requireStaffPermission("APAM", "APCM", "REASM"),
  accionMasivaSeguimientosMTM
);
router.post("/seguimientos/:postulacionId/:seguimientoId/documento", authorizeRoles("student"), uploadLegalizacion.single("file"), uploadDocumentoSeguimientoMTM);
router.get("/seguimientos/:postulacionId/:seguimientoId/documento/url", authorizeRoles("student"), getDocumentoSeguimientoUrl);
router.get(
  "/seguimientos/:postulacionId/:seguimientoId/documento/url-admin",
  requireStaffPermission("ACSM", "APAM", "AMMO"),
  getDocumentoSeguimientoUrlAdmin
);
router.get(
  "/seguimientos/:postulacionId/:seguimientoId/documento/descarga",
  requireStaffPermission("ACSM", "APAM", "AMMO"),
  getDocumentoSeguimientoDownloadAdmin
);

router.get("/", requireStaffPermission("COMT2", "COMN", "AMOP", "AMMO"), getOportunidadesMTM);
router.get("/reportes/estadisticas", requireStaffPermission("AMMO", "AMOP", "LLMO"), getReportesEstadisticasMTM);
router.get(
  "/:id/history",
  requireStaffPermission("COMT2", "LAOP", "VAOP", "AMOP"),
  getStatusHistoryMTM
);
router.get(
  "/:id/applications",
  requireStaffPermission("LAOP", "VAOP", "COMT2", "AMOP"),
  getApplicationsMTM
);
router.get(
  "/:id/applications/detail/:postulacionId",
  requireStaffPermission("VAOP", "LAOP", "AMOP"),
  getApplicationDetailMTM
);
router.patch("/:id/applications/:postulacionId/estudiante-responder", authorizeRoles("student"), estudianteResponderPostulacionMTM);
router.patch(
  "/:id/applications/:postulacionId/state",
  requireStaffPermission("AAOP", "MARE", "ABRA"),
  updateApplicationStateMTM
);
router.patch(
  "/:id/applications/:postulacionId/descargo-hv",
  requireStaffPermission("MADE", "AAOP"),
  markApplicationDescargoHvMTM
);
router.post(
  "/:id/applications/:postulacionId/seleccionar",
  requireStaffPermission("AAOP", "MARE"),
  seleccionarPostulanteMTM
);
router.get("/:id", requireStudentOrStaffPermission("COMT2", "COMN", "AMOP", "AMMO"), getOportunidadMTMById);

router.post("/", requireStaffPermission("COMT"), createOportunidadMTM);
router.put("/:id", requireStaffPermission("AOMT", "AOMA"), updateOportunidadMTM);
router.patch("/:id/status", requireStaffPermission("CEOM"), changeStatusMTM);
router.post("/:id/duplicate", requireStaffPermission("DOPO"), duplicateOportunidadMTM);
router.post("/:id/cerrar", requireStaffPermission("CEOM", "AOMT"), cerrarOportunidadMTM);
router.delete("/:id", requireStaffPermission("AOMT", "AOMA"), deleteOportunidadMTM);

export default router;
