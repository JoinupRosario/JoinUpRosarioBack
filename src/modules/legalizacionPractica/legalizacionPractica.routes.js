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

const router = express.Router();
const uploadLegalizacion = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

router.use(verifyToken);

// Rutas fijas primero (antes de /:postulacionId)
router.get("/mis-aceptadas", authorizeRoles("student"), getMisLegalizacionesPractica);

router.get("/admin/list", authorizeRoles("admin", "superadmin", "leader"), getLegalizacionesPracticaAdmin);
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
