import express from "express";
import { 
  getPostulants, 
  getPostulantById,
  updatePostulant,
  createPostulant,
  uploadProfilePicture,
} from "../controllers/postulant.controller.js";
import { verifyToken, authorizeRoles } from "../../../middlewares/auth.js";
import { upload, handleUploadError } from "../../../middlewares/upload.js";

const router = express.Router();

// Rutas públicas (con autenticación)
router.use(verifyToken);

// Rutas específicas primero (antes de las rutas con parámetros)
router.post("/create", createPostulant);
router.put("/update/:id", updatePostulant);

// Rutas generales después
router.get("/", getPostulants);
router.get("/:id", getPostulantById);

// Subir foto de perfil
router.post(
  "/:id/profile-picture",
  upload.single("profile_picture"),
  handleUploadError,
  uploadProfilePicture
);

export default router;
