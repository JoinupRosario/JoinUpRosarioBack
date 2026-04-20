import express from "express";
import {
  getVariablesDisponibles,
  getCondicionesCurriculares,
  getCondicionCurricularById,
  getProgramasHabilitadosPorPeriodo,
  getProgramFacultyIdsEnReglasActivas,
  createCondicionCurricular,
  updateCondicionCurricular,
  toggleEstadoCondicion,
  deleteCondicionCurricular,
} from "./condicionCurricular.controller.js";
import { verifyToken } from "../../middlewares/auth.js";
import { requirePermission } from "../access/presentation/middlewares/requirePermission.js";
import { requireCompanyOrStaffPermission } from "../../middlewares/authPermission.js";

const router = express.Router();

router.use(verifyToken);

// Metadatos (variables y operadores disponibles para el builder)
router.get("/variables", requirePermission("CFCC"), getVariablesDisponibles);
// Programas con condición curricular activa para un periodo (formación académica en oportunidades).
// Entidad (company) y quienes gestionan oportunidades necesitan este metadato sin tener CFCC.
router.get(
  "/programas-habilitados",
  requireCompanyOrStaffPermission("CPAC", "AMOP", "CPRA", "AMPR", "CFCC"),
  getProgramasHabilitadosPorPeriodo
);
router.get("/program-faculty-en-reglas-activas", requirePermission("CFCC"), getProgramFacultyIdsEnReglasActivas);

// CRUD
router.get("/", requirePermission("CFCC"), getCondicionesCurriculares);
router.get("/:id", requirePermission("CFCC"), getCondicionCurricularById);
router.post("/", requirePermission("CFCC"), createCondicionCurricular);
router.put("/:id", requirePermission("CFCC"), updateCondicionCurricular);
router.patch("/:id/toggle-estado", requirePermission("CFCC"), toggleEstadoCondicion);
router.delete("/:id", requirePermission("CFCC"), deleteCondicionCurricular);

export default router;
