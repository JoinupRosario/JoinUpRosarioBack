import express from "express";
import { 
  getReports, 
  getReportById, 
  generateReport, 
  downloadReport,
  getReportTypes
} from "./report.controller.js";
import { verifyToken, authorizeRoles } from "../../middlewares/auth.js";

const router = express.Router();

// Rutas públicas (con autenticación)
router.use(verifyToken);

// Rutas para reportes
router.get("/", getReports);
router.get("/types", getReportTypes);
router.get("/:id", getReportById);
router.post("/generate", authorizeRoles("admin", "superadmin", "leader"), generateReport);
router.get("/:id/download", downloadReport);

export default router;
