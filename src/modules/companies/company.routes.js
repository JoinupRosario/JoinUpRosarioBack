import express from "express";
import { 
  getCompanies, 
  getCompanyById, 
  createCompany, 
  updateCompany, 
  deleteCompany,
  approveCompany,
  uploadLogo
} from "./company.controller.js";
import { verifyToken, authorizeRoles } from "../../middlewares/auth.js";
import { upload } from "../../middlewares/upload.js";

const router = express.Router();

// Rutas públicas (con autenticación)
router.use(verifyToken);

// Rutas para empresas
router.get("/", getCompanies);
router.get("/:id", getCompanyById);
router.post("/", createCompany);
router.put("/:id", updateCompany);
router.delete("/:id", authorizeRoles("admin", "superadmin"), deleteCompany);

// Aprobación de empresas
router.patch("/:id/approve", authorizeRoles("admin", "superadmin", "leader"), approveCompany);

// Subida de archivos
router.post("/:id/logo", upload.single("logo"), uploadLogo);

export default router;
