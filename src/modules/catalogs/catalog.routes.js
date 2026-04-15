import express from "express";
import { verifyToken } from "../../middlewares/auth.js";
import { requirePermission } from "../access/presentation/middlewares/requirePermission.js";
import { getCatalogByType } from "./catalog.controller.js";

const router = express.Router();

router.use(verifyToken);
router.get("/:type", requirePermission("AMRE", "GPAG"), getCatalogByType);

export default router;
