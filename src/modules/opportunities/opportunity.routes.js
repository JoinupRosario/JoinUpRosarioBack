import express from "express";
import { 
  getOpportunities, 
  getOpportunityById, 
  createOpportunity, 
  updateOpportunity, 
  deleteOpportunity,
  publishOpportunity,
  applyToOpportunity,
  getApplications,
  reviewApplication
} from "./opportunity.controller.js";
import { verifyToken, authorizeRoles } from "../../middlewares/auth.js";

const router = express.Router();

// Rutas públicas (con autenticación)
router.use(verifyToken);

// Rutas para oportunidades
router.get("/", getOpportunities);
router.get("/:id", getOpportunityById);
router.post("/", authorizeRoles("company", "admin", "superadmin"), createOpportunity);
router.put("/:id", updateOpportunity);
router.delete("/:id", authorizeRoles("company", "admin", "superadmin"), deleteOpportunity);

// Publicar oportunidad
router.patch("/:id/publish", authorizeRoles("company", "admin", "superadmin"), publishOpportunity);

// Postulaciones
router.post("/:id/apply", authorizeRoles("student"), applyToOpportunity);
router.get("/:id/applications", authorizeRoles("company", "admin", "superadmin", "leader"), getApplications);
router.patch("/:id/applications/:applicationId", authorizeRoles("company", "admin", "superadmin", "leader"), reviewApplication);

export default router;
