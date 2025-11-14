import express from "express";
import multer from "multer";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import {
  getOpportunities,
  getOpportunityById,
  createOpportunity,
  updateOpportunity,
  deleteOpportunity,
  changeStatus,
  applyToOpportunity,
  getApplications,
  reviewApplication,
  selectMultipleApplications
} from "./opportunity.controller.js";
import { verifyToken, authorizeRoles } from "../../middlewares/auth.js";

const router = express.Router();

// Configuración de multer para múltiples documentos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "src/uploads/attachments/");
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}-${Date.now()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "image/jpeg",
    "image/png"
  ];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Tipo de archivo no permitido"), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB por archivo
    files: 3 // Máximo 3 archivos
  }
});

// Middleware para manejar múltiples archivos con nombres dinámicos
const uploadMultipleDocuments = (req, res, next) => {
  const uploadFields = [];
  for (let i = 1; i <= 3; i++) {
    uploadFields.push({ name: `documento${i}`, maxCount: 1 });
  }
  
  const multerMiddleware = upload.fields(uploadFields);
  multerMiddleware(req, res, (err) => {
    if (err) {
      return res.status(400).json({ message: err.message });
    }
    next();
  });
};

// Todas las rutas requieren autenticación
router.use(verifyToken);

// Rutas para oportunidades
router.get("/", getOpportunities);
router.get("/:id", getOpportunityById);
router.post("/", authorizeRoles("company", "admin", "superadmin"), uploadMultipleDocuments, createOpportunity);
router.put("/:id", authorizeRoles("company", "admin", "superadmin"), updateOpportunity);
router.delete("/:id", authorizeRoles("company", "admin", "superadmin"), deleteOpportunity);

// Cambiar estado de la oportunidad
router.patch("/:id/status", authorizeRoles("admin", "superadmin", "leader"), changeStatus);

// Postulaciones
router.post("/:id/apply", authorizeRoles("student"), applyToOpportunity);
router.get("/:id/applications", authorizeRoles("company", "admin", "superadmin", "leader"), getApplications);
router.patch("/:id/applications/:postulacionId", authorizeRoles("company", "admin", "superadmin", "leader"), reviewApplication);
router.post("/:id/applications/select-multiple", authorizeRoles("company", "admin", "superadmin", "leader"), selectMultipleApplications);

export default router;
