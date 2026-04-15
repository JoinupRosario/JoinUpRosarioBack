import express from "express";
import { verifyToken } from "../../middlewares/auth.js";
import { requirePermission } from "../access/presentation/middlewares/requirePermission.js";
import {
  getReportFilterConfig,
  postReportGenerate,
  getProgramsForReportFilters,
  searchPostulantsForReportFilters,
  getReportingEnum,
} from "./reportingFilters.controller.js";

const router = express.Router();

router.use(verifyToken);
router.use(requirePermission("AMRE", "GPAG"));

router.get("/reports/:reportId/config", getReportFilterConfig);
router.post("/reports/:reportId/generate", postReportGenerate);
router.get("/programs", getProgramsForReportFilters);
router.get("/postulants/search", searchPostulantsForReportFilters);
router.get("/enums/:enumKey", getReportingEnum);

export default router;
