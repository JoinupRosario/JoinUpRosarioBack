import express from "express";
import {
  getVariablesDisponibles,
  getCondicionesCurriculares,
  getCondicionCurricularById,
  getProgramasHabilitadosPorPeriodo,
  createCondicionCurricular,
  updateCondicionCurricular,
  toggleEstadoCondicion,
  deleteCondicionCurricular,
} from "./condicionCurricular.controller.js";
import { verifyToken, authorizeRoles } from "../../middlewares/auth.js";

const router = express.Router();

router.use(verifyToken);

// Metadatos (variables y operadores disponibles para el builder)
router.get("/variables", getVariablesDisponibles);
// Programas con condición curricular activa para un periodo (formación académica en oportunidades)
router.get("/programas-habilitados", getProgramasHabilitadosPorPeriodo);

// CRUD
router.get("/",    getCondicionesCurriculares);
router.get("/:id", getCondicionCurricularById);
router.post("/",   authorizeRoles("admin", "superadmin"), createCondicionCurricular);
router.put("/:id", authorizeRoles("admin", "superadmin"), updateCondicionCurricular);
router.patch("/:id/toggle-estado", authorizeRoles("admin", "superadmin"), toggleEstadoCondicion);
router.delete("/:id", authorizeRoles("admin", "superadmin"), deleteCondicionCurricular);

export default router;
