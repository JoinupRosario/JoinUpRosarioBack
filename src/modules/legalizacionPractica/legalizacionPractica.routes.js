import express from "express";
import multer from "multer";
import { verifyToken, authorizeRoles } from "../../middlewares/auth.js";
import {
  getMisLegalizacionesPractica,
  getLegalizacionPracticaEstudiante,
  uploadDocLegalizacionPractica,
  getDocumentoLegalizacionPracticaUrl,
  getDocumentoLegalizacionPracticaDownload,
  getAcuerdoVinculacionPdfEstudiante,
  getAcuerdoVinculacionPdfAdmin,
  deleteDocumentoLegalizacionPractica,
  remitirRevisionLegalizacionPractica,
  getLegalizacionesPracticaAdmin,
  getMetaFiltrosLegalizacionesPracticaAdmin,
  getEstadisticasLegalizacionPractica,
  getLegalizacionPracticaAdmin,
  getDocumentoLegalizacionPracticaUrlAdmin,
  getDocumentoLegalizacionPracticaDownloadAdmin,
  patchDocumentoLegalizacionPracticaAdmin,
  postAprobarLegalizacionPractica,
  postRechazarLegalizacionPractica,
} from "./legalizacionPractica.controller.js";
import {
  postEmitirAcuerdoVinculacionPractica,
  getEstadoAcuerdoVinculacionPractica,
  getPdfAcuerdoEmitido,
} from "./acuerdoVinculacionPractica.controller.js";
import {
  getPlanPracticaDatosCrear,
  getPlanPractica,
  createPlanPractica,
  updatePlanPractica,
  postEnviarFirmasPlanPractica,
  postFirmarPlanPractica,
  postAprobarPlanPractica,
  postRechazarPlanPractica,
  uploadDocumentoExternoPlanPractica,
  getDocumentoExternoPlanPracticaUrl,
} from "./planPractica.controller.js";
import {
  getSeguimientosPractica,
  createSeguimientoPractica,
  updateSeguimientoPractica,
  deleteSeguimientoPractica,
  aprobarSeguimientoPractica,
  rechazarSeguimientoPractica,
  uploadDocumentoSeguimientoPractica,
  getDocumentoSeguimientoPracticaUrl,
  deleteDocumentoSeguimientoPractica,
  postCerrarCasoSeguimientoPractica,
  getReporteCsvSeguimientoPractica,
  getEstadisticasSeguimientoPractica,
  getRegistroDocumentoSeguimientoPractica,
} from "./seguimientoPractica.controller.js";
import {
  getSupervisionPracticaDatosCrear,
  listSupervisionPractica,
  createSupervisionPractica,
  updateSupervisionPractica,
  deleteSupervisionPractica,
  postEnviarFirmasSupervisionPractica,
  postFirmarSupervisionPractica,
  getPdfSupervisionPracticaUrl,
  uploadDocumentoSupervisionPractica,
  getDocumentoSupervisionPracticaUrl,
} from "./supervisionPractica.controller.js";

const router = express.Router();
const uploadLegalizacion = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});
const uploadPlanPdf = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

router.use(verifyToken);

// RQ04_HU006 — Plan de práctica (rutas fijas antes de /:postulacionId)
router.get("/plan-practica/datos-crear/:postulacionId", authorizeRoles("student"), getPlanPracticaDatosCrear);
router.post("/plan-practica/:postulacionId", authorizeRoles("student"), createPlanPractica);
router.get("/plan-practica/:postulacionId", authorizeRoles("student", "admin", "superadmin", "leader"), getPlanPractica);
router.put("/plan-practica/:postulacionId", authorizeRoles("student"), updatePlanPractica);
router.post("/plan-practica/:postulacionId/enviar-firmas", authorizeRoles("student"), postEnviarFirmasPlanPractica);
router.post("/plan-practica/:postulacionId/firmar", postFirmarPlanPractica);
router.post("/plan-practica/:postulacionId/aprobar", authorizeRoles("admin", "superadmin", "leader"), postAprobarPlanPractica);
router.post("/plan-practica/:postulacionId/rechazar", authorizeRoles("admin", "superadmin", "leader"), postRechazarPlanPractica);
router.post(
  "/plan-practica/:postulacionId/documento-externo",
  authorizeRoles("student"),
  uploadPlanPdf.single("file"),
  uploadDocumentoExternoPlanPractica
);
router.get(
  "/plan-practica/:postulacionId/documento-externo/url",
  authorizeRoles("student", "admin", "superadmin", "leader"),
  getDocumentoExternoPlanPracticaUrl
);
router.post(
  "/plan-practica/:postulacionId/cerrar-seguimiento-caso",
  authorizeRoles("admin", "superadmin", "leader"),
  postCerrarCasoSeguimientoPractica
);

// RQ04_HU008 — Supervisión de la práctica (autorización en controlador)
router.get("/supervision-practica/datos-crear/:postulacionId", getSupervisionPracticaDatosCrear);
router.get("/supervision-practica/:postulacionId", listSupervisionPractica);
router.post("/supervision-practica/:postulacionId", createSupervisionPractica);
router.put("/supervision-practica/:postulacionId/:supervisionId", updateSupervisionPractica);
router.delete("/supervision-practica/:postulacionId/:supervisionId", deleteSupervisionPractica);
router.post(
  "/supervision-practica/:postulacionId/:supervisionId/enviar-firmas",
  postEnviarFirmasSupervisionPractica
);
router.post("/supervision-practica/:postulacionId/:supervisionId/firmar", postFirmarSupervisionPractica);
router.get(
  "/supervision-practica/:postulacionId/:supervisionId/pdf/url",
  getPdfSupervisionPracticaUrl
);
router.post(
  "/supervision-practica/:postulacionId/:supervisionId/documentos",
  uploadLegalizacion.single("file"),
  uploadDocumentoSupervisionPractica
);
router.get(
  "/supervision-practica/:postulacionId/:supervisionId/documentos/:documentoId/url",
  getDocumentoSupervisionPracticaUrl
);

// RQ04_HU007 — Seguimientos (rutas fijas antes de patrones genéricos)
router.get(
  "/seguimientos-practica/admin/reporte-csv",
  authorizeRoles("admin", "superadmin", "leader"),
  getReporteCsvSeguimientoPractica
);
router.get(
  "/seguimientos-practica/admin/estadisticas",
  authorizeRoles("admin", "superadmin", "leader"),
  getEstadisticasSeguimientoPractica
);
router.get(
  "/seguimientos-practica/:postulacionId/registro-documento",
  authorizeRoles("student", "admin", "superadmin", "leader"),
  getRegistroDocumentoSeguimientoPractica
);
router.get(
  "/seguimientos-practica/:postulacionId",
  authorizeRoles("student", "admin", "superadmin", "leader"),
  getSeguimientosPractica
);
router.post("/seguimientos-practica/:postulacionId", authorizeRoles("student"), createSeguimientoPractica);
router.put(
  "/seguimientos-practica/:postulacionId/:seguimientoId",
  authorizeRoles("student"),
  updateSeguimientoPractica
);
router.delete(
  "/seguimientos-practica/:postulacionId/:seguimientoId",
  authorizeRoles("student"),
  deleteSeguimientoPractica
);
router.patch(
  "/seguimientos-practica/:postulacionId/:seguimientoId/aprobar",
  authorizeRoles("admin", "superadmin", "leader"),
  aprobarSeguimientoPractica
);
router.patch(
  "/seguimientos-practica/:postulacionId/:seguimientoId/rechazar",
  authorizeRoles("admin", "superadmin", "leader"),
  rechazarSeguimientoPractica
);
router.post(
  "/seguimientos-practica/:postulacionId/:seguimientoId/documentos",
  authorizeRoles("student"),
  uploadLegalizacion.single("file"),
  uploadDocumentoSeguimientoPractica
);
router.get(
  "/seguimientos-practica/:postulacionId/:seguimientoId/documentos/:documentoId/url",
  authorizeRoles("student", "admin", "superadmin", "leader"),
  getDocumentoSeguimientoPracticaUrl
);
router.delete(
  "/seguimientos-practica/:postulacionId/:seguimientoId/documentos/:documentoId",
  authorizeRoles("student"),
  deleteDocumentoSeguimientoPractica
);

// Rutas fijas primero (antes de /:postulacionId)
router.get("/mis-aceptadas", authorizeRoles("student"), getMisLegalizacionesPractica);

router.get("/admin/list", authorizeRoles("admin", "superadmin", "leader"), getLegalizacionesPracticaAdmin);
router.get(
  "/admin/meta/filtros",
  authorizeRoles("admin", "superadmin", "leader"),
  getMetaFiltrosLegalizacionesPracticaAdmin
);
router.get("/admin/estadisticas", authorizeRoles("admin", "superadmin", "leader"), getEstadisticasLegalizacionPractica);
router.get(
  "/admin/:postulacionId/acuerdo-vinculacion/pdf",
  authorizeRoles("admin", "superadmin", "leader"),
  getAcuerdoVinculacionPdfAdmin
);
router.get(
  "/admin/:postulacionId/acuerdo-vinculacion/estado",
  authorizeRoles("admin", "superadmin", "leader"),
  getEstadoAcuerdoVinculacionPractica
);
router.get(
  "/admin/:postulacionId/acuerdo-vinculacion/pdf-emitido",
  authorizeRoles("admin", "superadmin", "leader"),
  getPdfAcuerdoEmitido
);
router.get("/admin/:postulacionId", authorizeRoles("admin", "superadmin", "leader"), getLegalizacionPracticaAdmin);
router.get(
  "/admin/:postulacionId/documentos/:definitionId/url",
  authorizeRoles("admin", "superadmin", "leader"),
  getDocumentoLegalizacionPracticaUrlAdmin
);
router.get(
  "/admin/:postulacionId/documentos/:definitionId/descarga",
  authorizeRoles("admin", "superadmin", "leader"),
  getDocumentoLegalizacionPracticaDownloadAdmin
);
router.patch(
  "/admin/:postulacionId/documentos/:definitionId",
  authorizeRoles("admin", "superadmin", "leader"),
  patchDocumentoLegalizacionPracticaAdmin
);
router.post("/admin/:postulacionId/aprobar", authorizeRoles("admin", "superadmin", "leader"), postAprobarLegalizacionPractica);
router.post("/admin/:postulacionId/rechazar", authorizeRoles("admin", "superadmin", "leader"), postRechazarLegalizacionPractica);

// Estudiante: detalle y documentos por postulación
router.get(
  "/:postulacionId/acuerdo-vinculacion/pdf",
  authorizeRoles("student"),
  getAcuerdoVinculacionPdfEstudiante
);
router.post(
  "/:postulacionId/acuerdo-vinculacion/emitir",
  authorizeRoles("student"),
  postEmitirAcuerdoVinculacionPractica
);
router.get(
  "/:postulacionId/acuerdo-vinculacion/estado",
  authorizeRoles("student", "admin", "superadmin", "leader"),
  getEstadoAcuerdoVinculacionPractica
);
router.get(
  "/:postulacionId/acuerdo-vinculacion/pdf-emitido",
  authorizeRoles("student", "admin", "superadmin", "leader"),
  getPdfAcuerdoEmitido
);
router.get("/:postulacionId", authorizeRoles("student"), getLegalizacionPracticaEstudiante);
router.post(
  "/:postulacionId/documentos",
  authorizeRoles("student"),
  uploadLegalizacion.single("file"),
  uploadDocLegalizacionPractica
);
router.get("/:postulacionId/documentos/:definitionId/url", authorizeRoles("student"), getDocumentoLegalizacionPracticaUrl);
router.get(
  "/:postulacionId/documentos/:definitionId/descarga",
  authorizeRoles("student"),
  getDocumentoLegalizacionPracticaDownload
);
router.delete("/:postulacionId/documentos/:definitionId", authorizeRoles("student"), deleteDocumentoLegalizacionPractica);
router.post("/:postulacionId/remitir-revision", authorizeRoles("student"), remitirRevisionLegalizacionPractica);

export default router;
