import express from "express";
import { 
  getInternships, 
  getInternshipById, 
  createInternship, 
  updateInternship, 
  deleteInternship,
  approveInternship,
  submitReport,
  submitEvaluation,
  recordAttendance,
  recordAbsence,
  generateCertificate
} from "./internship.controller.js";
import { verifyToken, authorizeRoles } from "../../middlewares/auth.js";
import { upload } from "../../middlewares/upload.js";

const router = express.Router();

// Rutas públicas (con autenticación)
router.use(verifyToken);

// Rutas para pasantías
router.get("/", getInternships);
router.get("/:id", getInternshipById);
router.post("/", authorizeRoles("admin", "superadmin", "leader"), createInternship);
router.put("/:id", updateInternship);
router.delete("/:id", authorizeRoles("admin", "superadmin"), deleteInternship);

// Aprobación de pasantía
router.patch("/:id/approve", authorizeRoles("admin", "superadmin", "leader"), approveInternship);

// Reportes mensuales
router.post("/:id/reports", upload.single("report"), submitReport);

// Evaluaciones
router.post("/:id/evaluations", submitEvaluation);

// Asistencia
router.post("/:id/attendance", recordAttendance);
router.post("/:id/absences", recordAbsence);

// Certificados
router.post("/:id/certificate", generateCertificate);

export default router;
