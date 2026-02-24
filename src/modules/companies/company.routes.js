import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
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

// Multer para registro público (PDF o imagen, máx 5 MB cada archivo)
const PUBLIC_UPLOAD_DIR = 'src/uploads/public-register/';
if (!fs.existsSync(PUBLIC_UPLOAD_DIR)) fs.mkdirSync(PUBLIC_UPLOAD_DIR, { recursive: true });

const publicUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, PUBLIC_UPLOAD_DIR),
    filename: (_req, file, cb) => cb(null, `${uuidv4()}-${Date.now()}${path.extname(file.originalname)}`)
  }),
  fileFilter: (_req, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    cb(null, allowed.includes(file.mimetype));
  },
  limits: { fileSize: 5 * 1024 * 1024, files: 2 }
});

// ── Ruta pública sin autenticación ──────────────────────────────────────────
router.post("/public-register", publicUpload.fields([
  { name: 'chamberOfCommerce', maxCount: 1 },
  { name: 'rut', maxCount: 1 }
]), publicRegisterCompany);

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
