import express from "express";
import multer from "multer";
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
  publicRegisterCompany,
  uploadCompanyInitialFiles,
  getCompanyDocumentSignedUrl,
  deleteCompanyDocument,
  getMyCompany,
  getMyCompanyDocumentSignedUrl,
} from "./company.controller.js";
import { verifyToken } from "../../middlewares/auth.js";
import { requirePermission } from "../access/presentation/middlewares/requirePermission.js";
import { upload } from "../../middlewares/upload.js";

const router = express.Router();

const companyAssetsMulter = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === "logo") {
      if (/^image\/(jpeg|png|gif|webp)$/i.test(file.mimetype)) return cb(null, true);
      return cb(new Error("El logo debe ser imagen JPG, PNG, GIF o WEBP"));
    }
    if (/^(application\/pdf|image\/(jpeg|png|gif|webp))$/i.test(file.mimetype)) return cb(null, true);
    return cb(new Error("Los documentos deben ser PDF o imagen (JPG, PNG, GIF, WEBP)"));
  },
});

const companyAssetFields = companyAssetsMulter.fields([
  { name: "logo", maxCount: 1 },
  { name: "chamberOfCommerceCertificate", maxCount: 1 },
  { name: "rutDocument", maxCount: 1 },
  { name: "agencyAccreditationDocument", maxCount: 1 },
]);

function companyAssetsMiddleware(req, res, next) {
  companyAssetFields(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    next();
  });
}

// ── Registro público (JSON o multipart; archivos solo se suben a S3 tras crear la empresa) ──
router.post("/public-register", companyAssetsMiddleware, publicRegisterCompany);

// ── Rutas protegidas (requieren token) ──────────────────────────────────────
router.use(verifyToken);

// Portal de la propia entidad (rol "company"): no requiere permisos granulares,
// el controller valida que la empresa y el contacto estén activos.
router.get("/me", getMyCompany);
router.get("/me/document/:field", getMyCompanyDocumentSignedUrl);

// AAME = Acceso al módulo Empresa; LEMP = Listar, CEMP = Crear, EEMP = Editar; CCON/ECON/CCEC = Contactos
router.get("/", requirePermission("AAME", "LEMP"), getCompanies);
router.get(
  "/:id/document/:field",
  requirePermission("AAME", "LEMP", "EEMP", "CEEE", "AIEO"),
  getCompanyDocumentSignedUrl
);
router.delete(
  "/:id/document/:field",
  requirePermission("CEMP", "EEMP"),
  deleteCompanyDocument
);
router.get("/:id", requirePermission("AAME", "LEMP"), getCompanyById);
router.post("/", requirePermission("CEMP"), createCompany);
router.post(
  "/:id/initial-files",
  requirePermission("CEMP", "EEMP"),
  companyAssetsMiddleware,
  uploadCompanyInitialFiles
);
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
