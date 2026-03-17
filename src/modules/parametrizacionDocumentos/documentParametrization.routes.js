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

const router = express.Router();

router.use(verifyToken);

router.get("/hoja-vida", getHojaVidaParametrization);
router.put("/hoja-vida", updateHojaVidaParametrization);

/** RQ04_HU003: Carta de presentación parametrizable */
router.get("/carta-presentacion", getCartaPresentacionParametrization);
router.put("/carta-presentacion", updateCartaPresentacionParametrization);

/** Acuerdo de vinculación (logo + textos). Vista previa genera PDF con datos de ejemplo. */
router.get("/acuerdo-vinculacion", getAcuerdoVinculacionParametrization);
router.put("/acuerdo-vinculacion", updateAcuerdoVinculacionParametrization);
router.post("/acuerdo-vinculacion/preview", previewAcuerdoVinculacionPdf);

export default router;
