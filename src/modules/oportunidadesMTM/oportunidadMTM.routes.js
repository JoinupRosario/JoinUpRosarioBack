import express from "express";
import { verifyToken, authorizeRoles } from "../../middlewares/auth.js";
import {
  getOportunidadesMTM,
  getOportunidadMTMById,
  createOportunidadMTM,
  updateOportunidadMTM,
  changeStatusMTM,
  duplicateOportunidadMTM,
  deleteOportunidadMTM
} from "./oportunidadMTM.controller.js";

const router = express.Router();

router.use(verifyToken);

router.get("/", getOportunidadesMTM);
router.get("/:id", getOportunidadMTMById);

router.post("/", authorizeRoles("admin", "superadmin"), createOportunidadMTM);
router.put("/:id", authorizeRoles("admin", "superadmin"), updateOportunidadMTM);
router.patch("/:id/status", authorizeRoles("admin", "superadmin"), changeStatusMTM);
router.post("/:id/duplicate", authorizeRoles("admin", "superadmin"), duplicateOportunidadMTM);
router.delete("/:id", authorizeRoles("admin", "superadmin"), deleteOportunidadMTM);

export default router;
