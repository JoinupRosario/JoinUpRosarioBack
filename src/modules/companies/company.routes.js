import express from "express";
import { 
  getCompanies, 
  getCompanyById, 
  createCompany, 
  updateCompany, 
  deleteCompany,
  approveCompany,
  uploadLogo,
  addContact,
  updateContact,
  deleteContact,
  resetContactPassword,
  publicRegisterCompany
} from "./company.controller.js";
import { verifyToken, authorizeRoles } from "../../middlewares/auth.js";
import { upload } from "../../middlewares/upload.js";

const router = express.Router();

// ── Ruta pública sin autenticación (sin archivos hasta implementar S3) ───────
router.post("/public-register", publicRegisterCompany);

// ── Rutas protegidas (requieren token) ──────────────────────────────────────
router.use(verifyToken);

// Rutas para empresas
router.get("/", getCompanies);
router.get("/:id", getCompanyById);
router.post("/", createCompany);
router.put("/:id", updateCompany);
router.delete("/:id", authorizeRoles("admin", "superadmin"), deleteCompany);

// Aprobación de empresas
router.patch("/:id/approve", authorizeRoles("admin", "superadmin", "leader"), approveCompany);

// Rutas para contactos de empresas
router.post("/:id/contacts", addContact);
router.put("/:id/contacts/:contactId", updateContact);
router.delete("/:id/contacts/:contactId", deleteContact);
router.post("/:id/contacts/:contactId/reset-password", resetContactPassword);

// Subida de archivos
router.post("/:id/logo", upload.single("logo"), uploadLogo);

export default router;
