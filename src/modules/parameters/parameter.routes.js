import express from "express";
import { 
  getParameters, 
  getParameterById, 
  createParameter, 
  updateParameter, 
  deleteParameter,
  getParametersByCategory
} from "./parameter.controller.js";
import { verifyToken, authorizeRoles } from "../../middlewares/auth.js";

const router = express.Router();

// Rutas públicas (con autenticación)
router.use(verifyToken);

// Rutas para parámetros
router.get("/", getParameters);
router.get("/category/:category", getParametersByCategory);
router.get("/:id", getParameterById);
router.post("/", authorizeRoles("admin", "superadmin"), createParameter);
router.put("/:id", authorizeRoles("admin", "superadmin"), updateParameter);
router.delete("/:id", authorizeRoles("admin", "superadmin"), deleteParameter);

export default router;
