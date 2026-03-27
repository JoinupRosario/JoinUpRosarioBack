import express from "express";
import {
  getHojaVidaParametrization,
  updateHojaVidaParametrization,
  getCartaPresentacionParametrization,
  updateCartaPresentacionParametrization,
  getAcuerdoVinculacionParametrization,
  updateAcuerdoVinculacionParametrization,
  previewAcuerdoVinculacionPdf,
} from "./documentParametrization.controller.js";
import { verifyToken } from "../../middlewares/auth.js";
import { requirePermission } from "../access/presentation/middlewares/requirePermission.js";

const router = express.Router();

router.use(verifyToken);

router.get("/hoja-vida", requirePermission("CFDL"), getHojaVidaParametrization);
router.put("/hoja-vida", requirePermission("CFDL"), updateHojaVidaParametrization);

/** RQ04_HU003: Carta de presentación parametrizable */
router.get("/carta-presentacion", requirePermission("CFDL"), getCartaPresentacionParametrization);
router.put("/carta-presentacion", requirePermission("CFDL"), updateCartaPresentacionParametrization);

/** Acuerdo de vinculación (logo + textos). Vista previa genera PDF con datos de ejemplo. */
router.get("/acuerdo-vinculacion", requirePermission("CFDL"), getAcuerdoVinculacionParametrization);
router.put("/acuerdo-vinculacion", requirePermission("CFDL"), updateAcuerdoVinculacionParametrization);
router.post("/acuerdo-vinculacion/preview", requirePermission("CFDL"), previewAcuerdoVinculacionPdf);

export default router;
