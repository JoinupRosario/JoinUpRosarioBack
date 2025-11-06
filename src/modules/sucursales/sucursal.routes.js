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

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(verifyToken);

// Rutas
router.get("/", getSucursales);
router.get("/:id", getSucursalById);
router.post("/", createSucursal);
router.put("/:id", updateSucursal);
router.delete("/:id", deleteSucursal);
router.patch("/:id/toggle-estado", toggleEstadoSucursal);

export default router;

