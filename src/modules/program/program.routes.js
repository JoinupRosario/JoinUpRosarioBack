import express from "express";
import {
  getPrograms,
  getProgramById,
  getProgramByMysqlId,
  createProgram,
  updateProgram,
  deleteProgram,
} from "./controller/program.controller.js";
import { verifyToken, authorizeRoles } from "../../middlewares/auth.js";

const router = express.Router();

router.use(verifyToken);

router.get("/", getPrograms);
router.get("/by-mysql-id/:mysqlId", getProgramByMysqlId);
router.get("/:id", getProgramById);
router.post("/", authorizeRoles("admin", "superadmin"), createProgram);
router.put("/:id", authorizeRoles("admin", "superadmin"), updateProgram);
router.delete("/:id", authorizeRoles("admin", "superadmin"), deleteProgram);

export default router;
