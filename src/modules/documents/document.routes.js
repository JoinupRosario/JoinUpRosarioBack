import express from "express";
import { 
  getDocuments, 
  getDocumentById, 
  uploadDocument, 
  updateDocument, 
  deleteDocument,
  downloadDocument,
  approveDocument,
  getDocumentsByType
} from "./document.controller.js";
import { verifyToken, authorizeRoles } from "../../middlewares/auth.js";
import { upload } from "../../middlewares/upload.js";

const router = express.Router();

// Rutas públicas (con autenticación)
router.use(verifyToken);

// Rutas para documentos
router.get("/", getDocuments);
router.get("/type/:type", getDocumentsByType);
router.get("/:id", getDocumentById);
router.post("/upload", upload.single("document"), uploadDocument);
router.put("/:id", updateDocument);
router.delete("/:id", deleteDocument);

// Descarga de documentos
router.get("/:id/download", downloadDocument);

// Aprobación de documentos
router.patch("/:id/approve", authorizeRoles("admin", "superadmin", "tutor", "leader"), approveDocument);

export default router;
