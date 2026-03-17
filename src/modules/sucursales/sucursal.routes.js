import express from "express";
import {
  getSucursales,
  getSucursalById,
  createSucursal,
  updateSucursal,
  deleteSucursal,
  toggleEstadoSucursal
} from "./sucursal.controller.js";
import { verifyToken } from "../../middlewares/auth.js";
import { requirePermission } from "../access/presentation/middlewares/requirePermission.js";

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(verifyToken);

// AMSU = Acceso al módulo Sucursales; CTSU = Consultar, CCSU = Crear, EDSU = Editar, ELSU = Eliminar
router.get("/", requirePermission("AMSU", "CTSU"), getSucursales);
router.get("/:id", requirePermission("AMSU", "CTSU"), getSucursalById);
router.post("/", requirePermission("CCSU"), createSucursal);
router.put("/:id", requirePermission("EDSU"), updateSucursal);
router.delete("/:id", requirePermission("ELSU"), deleteSucursal);
router.patch("/:id/toggle-estado", requirePermission("EDSU"), toggleEstadoSucursal);

export default router;

