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
import { verifyToken } from "../../middlewares/auth.js";
import { requirePermission } from "../access/presentation/middlewares/requirePermission.js";
import { upload } from "../../middlewares/upload.js";

const router = express.Router();

// ── Ruta pública sin autenticación (sin archivos hasta implementar S3) ───────
router.post("/public-register", publicRegisterCompany);

// ── Rutas protegidas (requieren token) ──────────────────────────────────────
router.use(verifyToken);

// AAME = Acceso al módulo Empresa; LEMP = Listar, CEMP = Crear, EEMP = Editar; CCON/ECON/CCEC = Contactos
router.get("/", requirePermission("AAME", "LEMP"), getCompanies);
router.get("/:id", requirePermission("AAME", "LEMP"), getCompanyById);
router.post("/", requirePermission("CEMP"), createCompany);
router.put("/:id", requirePermission("EEMP"), updateCompany);
router.delete("/:id", requirePermission("EEMP"), deleteCompany);

// Aprobación de empresas (CEEE = Cambiar estado a empresas / AIEO según criterio)
router.patch("/:id/approve", requirePermission("EEMP", "CEEE", "AIEO"), approveCompany);

// Rutas para contactos de empresas
router.post("/:id/contacts", requirePermission("CCON"), addContact);
router.put("/:id/contacts/:contactId", requirePermission("ECON"), updateContact);
router.delete("/:id/contacts/:contactId", requirePermission("CCEC"), deleteContact);
router.post("/:id/contacts/:contactId/reset-password", requirePermission("ECON"), resetContactPassword);

// Subida de archivos
router.post("/:id/logo", requirePermission("EEMP"), upload.single("logo"), uploadLogo);

export default router;
