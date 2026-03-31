import express from "express";
import {
  getPrograms,
  getProgramById,
  getProgramByMysqlId,
  createProgram,
  updateProgram,
  deleteProgram,
} from "./controller/program.controller.js";
import {
  getTypePracticeRuleItems,
  getTypePracticeRules,
  putTypePracticeRule,
} from "./controller/programTypePracticeRule.controller.js";
import { verifyToken } from "../../middlewares/auth.js";
import { requirePermission } from "../access/presentation/middlewares/requirePermission.js";

const router = express.Router();

router.use(verifyToken);

router.get("/", getPrograms);
router.get("/by-mysql-id/:mysqlId", getProgramByMysqlId);
/** Reglas programa → tipo práctica (Configurar reglas de negocio). Debe ir antes de /:id */
router.get(
  "/type-practice-rules",
  requirePermission("CFOP", "CFOA"),
  getTypePracticeRules
);
router.get(
  "/type-practice-rule-items",
  requirePermission("CFOP", "CFOA"),
  getTypePracticeRuleItems
);
router.put(
  "/:programId/type-practice-rule",
  requirePermission("CFOP", "CFOA"),
  putTypePracticeRule
);
router.get("/:id", getProgramById);
/** Crear/editar/eliminar programa: CFPP o CEPRO */
router.post("/", requirePermission("CFPP", "CEPRO"), createProgram);
router.put("/:id", requirePermission("CFPP", "CEPRO"), updateProgram);
router.delete("/:id", requirePermission("CFPP", "CEPRO"), deleteProgram);

export default router;
