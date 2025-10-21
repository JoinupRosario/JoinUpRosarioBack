import express from "express";
import { 
  getUsers, 
  getUserById, 
  updateUser, 
  deleteUser,
  updateUserProfile,
  changePassword
} from "./user.controller.js";
import { verifyToken, authorizeRoles } from "../../middlewares/auth.js";

const router = express.Router();

// Rutas públicas (con autenticación)
router.use(verifyToken);

// Rutas para usuarios
router.get("/", authorizeRoles("admin", "superadmin"), getUsers);
router.get("/profile", getUserById);
router.put("/profile", updateUserProfile);
router.put("/change-password", changePassword);
router.get("/:id", getUserById);
router.put("/:id", authorizeRoles("admin", "superadmin"), updateUser);
router.delete("/:id", authorizeRoles("admin", "superadmin"), deleteUser);

export default router;
