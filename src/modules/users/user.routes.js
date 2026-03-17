import express from "express";
import { 
  getUsers, 
  getUserById, 
  updateUser, 
  deleteUser,
  updateUserProfile,
  changePassword,
  getMyPermissions,
  getNotificationPreferences,
  updateNotificationPreferences,
} from "./user.controller.js";
import { verifyToken } from "../../middlewares/auth.js";
import { requirePermission } from "../access/presentation/middlewares/requirePermission.js";

const router = express.Router();

// Rutas públicas (con autenticación)
router.use(verifyToken);

// Perfil y preferencias propias (sin permiso de módulo)
router.get("/profile", getUserById);
router.get("/my-permissions", getMyPermissions);
router.get("/notification-preferences", getNotificationPreferences);
router.put("/notification-preferences", updateNotificationPreferences);
router.put("/profile", updateUserProfile);
router.put("/change-password", changePassword);

// Rutas de administración de usuarios (requieren permisos)
router.get("/", requirePermission("AMUS", "LUSU"), getUsers);
router.get("/:id", requirePermission("AMUS", "VUSU"), getUserById);
router.put("/:id", requirePermission("EDUS"), updateUser);
router.delete("/:id", requirePermission("CEUS", "CEUS2"), deleteUser);

export default router;
