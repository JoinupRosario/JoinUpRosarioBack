import express from "express";
import { 
  getReports, 
  getReportById, 
  generateReport, 
  downloadReport,
  getReportTypes
} from "./report.controller.js";
import { verifyToken } from "../../middlewares/auth.js";
import { requirePermission } from "../access/presentation/middlewares/requirePermission.js";

const router = express.Router();

// Rutas públicas (con autenticación)
router.use(verifyToken);

// AMRE = Acceso al módulo Reportes; GPAG = Gestor de páginas (listar/ver reportes)
router.get("/", requirePermission("AMRE", "GPAG"), getReports);
router.get("/types", requirePermission("AMRE", "GPAG"), getReportTypes);
router.get("/:id", requirePermission("AMRE", "GPAG"), getReportById);
router.post("/generate", requirePermission("AMRE", "GPAG"), generateReport);
router.get("/:id/download", requirePermission("AMRE", "GPAG"), downloadReport);

export default router;
