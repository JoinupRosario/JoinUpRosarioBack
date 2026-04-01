import express from "express";
import multer from "multer";
import { verifyToken, authorizeRoles } from "../../middlewares/auth.js";
import {
  getCertificacionPorPostulacion,
  postInicializarCertificacion,
  postDocumentoCertificacion,
  getDocumentoCertificacionUrl,
  patchVinculacionLaboral,
  getAdminEstadisticasCertificacion,
  getAdminReporteCsvCertificacion,
} from "./certificacionPractica.controller.js";

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

router.use(verifyToken);

router.get("/postulacion/:postulacionId", getCertificacionPorPostulacion);
router.get("/postulacion/:postulacionId/documento/url", getDocumentoCertificacionUrl);

router.post(
  "/postulacion/:postulacionId/inicializar",
  authorizeRoles("admin", "superadmin", "leader"),
  postInicializarCertificacion
);
router.post(
  "/postulacion/:postulacionId/documento",
  authorizeRoles("admin", "superadmin", "leader"),
  upload.single("file"),
  postDocumentoCertificacion
);
router.patch(
  "/postulacion/:postulacionId/vinculacion-laboral",
  authorizeRoles("admin", "superadmin", "leader"),
  patchVinculacionLaboral
);

router.get("/admin/estadisticas", authorizeRoles("admin", "superadmin", "leader"), getAdminEstadisticasCertificacion);
router.get("/admin/reporte-csv", authorizeRoles("admin", "superadmin", "leader"), getAdminReporteCsvCertificacion);

export default router;
