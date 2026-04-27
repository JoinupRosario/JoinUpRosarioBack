import express from "express";
import multer from "multer";
import {
  getOpportunities,
  getDistinctEstadosPractica,
  getOpportunityById,
  getOfertasParaEstudiantePracticas,
  aplicarOportunidad,
  getMisPostulaciones,
  createOpportunity,
  updateOpportunity,
  deleteOpportunity,
  changeStatus,
  applyToOpportunity,
  getApplications,
  getApplicationDetail,
  updateApplicationState,
  markApplicationDescargoHv,
  estudianteResponderPostulacion,
  coordinacionAceptarEnNombreEstudiante,
  reviewApplication,
  selectMultipleApplications,
  approveProgram,
  rejectProgram,
  rejectOpportunity,
  closeOpportunity,
  seleccionarPostulantePractica,
  getStatusHistory,
  duplicateOpportunity,
  buscarPerfilParaAutogestionada,
  getEmpresasParaAutogestionada,
  crearPracticaAutogestionada,
  addOpportunityDocument,
  deleteOpportunityDocument,
  getOpportunityDocumentPreview,
  getMyEntityOpportunities,
} from "./opportunity.controller.js";
import { verifyToken, authorizeRoles } from "../../middlewares/auth.js";
import {
  requireCompanyOrStaffPermission,
  requireCompanyStudentOrStaffPermission,
  requireStaffPermission,
} from "../../middlewares/authPermission.js";

const router = express.Router();

// Memory storage: los buffers se suben directamente a S3 en el controlador
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "image/jpeg",
    "image/png",
  ];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Tipo de archivo no permitido"), false);
  }
};

const uploadMultiple = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024, files: 3 },
});

const uploadSingle = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 },
});

// Middleware para manejar hasta 3 documentos en la creación
const uploadMultipleDocuments = (req, res, next) => {
  const fields = [1, 2, 3].map((i) => ({ name: `documento${i}`, maxCount: 1 }));
  uploadMultiple.fields(fields)(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message });
    next();
  });
};

// Todas las rutas requieren autenticación
router.use(verifyToken);

// Rutas para oportunidades
router.get(
  "/",
  requireCompanyOrStaffPermission("CPAC", "AMOP", "CPRA", "AMPR"),
  getOpportunities
);
router.get(
  "/meta/distinct-estados",
  requireCompanyOrStaffPermission("CPAC", "AMOP", "CPRA", "AMPR"),
  getDistinctEstadosPractica
);
// Portal de la entidad: lista solo las oportunidades de práctica de la propia empresa.
// El controller resuelve la company a partir del usuario autenticado.
router.get("/mi-entidad", getMyEntityOpportunities);
// RQ04_HU004 práctica autogestionada (líder): antes de /:id
router.get(
  "/autogestionada/buscar-perfil",
  requireStaffPermission("CPRA", "APRA", "AMOP"),
  buscarPerfilParaAutogestionada
);
router.get(
  "/autogestionada/empresas",
  requireStaffPermission("CPRA", "APRA", "AMOP"),
  getEmpresasParaAutogestionada
);
router.post(
  "/practica-autogestionada",
  requireStaffPermission("CPRA", "APRA"),
  crearPracticaAutogestionada
);
// Ofertas de práctica para estudiante autorizado (periodo + programa). Debe ir antes de /:id
router.get("/para-estudiante-practicas", getOfertasParaEstudiantePracticas);
// RQ04_HU002: Mis postulaciones del estudiante (postulante). Debe ir antes de /:id
router.get("/mis-postulaciones", authorizeRoles("student"), getMisPostulaciones);
router.get(
  "/:id",
  requireCompanyStudentOrStaffPermission("CPAC", "AMOP", "CPRA", "APRA"),
  getOpportunityById
);
router.post(
  "/",
  requireCompanyOrStaffPermission("CPRA"),
  uploadMultipleDocuments,
  createOpportunity
);
router.put(
  "/:id",
  requireCompanyOrStaffPermission("APRA", "AOPA", "APOP"),
  updateOpportunity
);
router.delete(
  "/:id",
  requireCompanyOrStaffPermission("APRA", "AOPA"),
  deleteOpportunity
);

// Cambiar estado de la oportunidad
router.patch("/:id/status", requireStaffPermission("CEPR"), changeStatus);

// Postulaciones
router.post("/:id/apply", authorizeRoles("student"), applyToOpportunity);
// RQ04_HU002: Aplicar a oportunidad con hoja de vida (postulante). Body: { profileId }
router.post("/:id/aplicar", authorizeRoles("student"), aplicarOportunidad);
router.get(
  "/:id/applications",
  requireCompanyOrStaffPermission("LAOP", "VAOP", "CPAC", "AMOP"),
  getApplications
);
router.get(
  "/:id/applications/detail/:postulacionId",
  requireCompanyOrStaffPermission("VAOP", "LAOP", "AMOP"),
  getApplicationDetail
);
router.patch("/:id/applications/:postulacionId/estudiante-responder", authorizeRoles("student"), estudianteResponderPostulacion);
router.patch(
  "/:id/applications/:postulacionId/coord-aceptar",
  requireStaffPermission("AAOP", "APPA", "CEPR"),
  coordinacionAceptarEnNombreEstudiante
);
router.patch(
  "/:id/applications/:postulacionId/state",
  requireCompanyOrStaffPermission("AAOP", "MARE", "ABRA"),
  updateApplicationState
);
router.patch(
  "/:id/applications/:postulacionId/descargo-hv",
  requireCompanyOrStaffPermission("MADE", "AAOP"),
  markApplicationDescargoHv
);
router.patch(
  "/:id/applications/:postulacionId",
  requireCompanyOrStaffPermission("MARE", "ABRA", "VAOP"),
  reviewApplication
);
router.post(
  "/:id/applications/select-multiple",
  requireCompanyOrStaffPermission("AAOP", "MARE", "LAOP"),
  selectMultipleApplications
);
router.post(
  "/:id/applications/:postulacionId/seleccionar",
  requireCompanyOrStaffPermission("AAOP", "MARE"),
  seleccionarPostulantePractica
);

// Aprobación por programa académico
router.post("/:id/approve-program", requireStaffPermission("APPA", "CPPA"), approveProgram);
router.post("/:id/reject-program", requireStaffPermission("APPA", "CEPR", "CCEP"), rejectProgram);

// Rechazar oportunidad con motivo
router.post("/:id/reject", requireStaffPermission("CEPR", "APRA"), rejectOpportunity);

// Cerrar oportunidad (solo Activa; body: contrató, motivoNoContrato?, postulantesSeleccionados?, datosTutor?)
router.post(
  "/:id/close",
  requireCompanyOrStaffPermission("CEPR", "APRA", "AOPA"),
  closeOpportunity
);

// Historial de estados (empresa: misma lógica que otras rutas; el controlador restringe a dueños)
router.get(
  "/:id/history",
  requireCompanyOrStaffPermission("CCEP", "CPAC", "CEPR", "AMOP"),
  getStatusHistory
);

// Duplicar oportunidad
router.post(
  "/:id/duplicate",
  requireCompanyOrStaffPermission("DOPO", "APRA"),
  duplicateOpportunity
);

// Gestión de documentos de la oportunidad (S3)
router.post(
  "/:id/documentos",
  requireCompanyOrStaffPermission("APRA", "AOPA"),
  uploadSingle.single("documento"),
  addOpportunityDocument
);
router.delete(
  "/:id/documentos/:docId",
  requireCompanyOrStaffPermission("APRA", "AOPA"),
  deleteOpportunityDocument
);
router.get(
  "/:id/documentos/:docId/preview",
  requireCompanyStudentOrStaffPermission("CPAC", "AMOP", "CPRA", "APRA"),
  getOpportunityDocumentPreview
);

export default router;
