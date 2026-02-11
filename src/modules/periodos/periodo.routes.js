import express from "express";
import {
  getPeriodos,
  getPeriodoById,
  createPeriodo,
  updatePeriodo,
} from "./periodo.controller.js";
import { verifyToken, authorizeRoles } from "../../middlewares/auth.js";

const router = express.Router();

router.use(verifyToken);

router.get("/", getPeriodos);
router.get("/:id", getPeriodoById);
router.post("/", authorizeRoles("admin", "superadmin"), createPeriodo);
router.put("/:id", authorizeRoles("admin", "superadmin"), updatePeriodo);

export default router;
