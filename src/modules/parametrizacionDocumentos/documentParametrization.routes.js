import express from "express";
import {
  getHojaVidaParametrization,
  updateHojaVidaParametrization,
  getCartaPresentacionParametrization,
  updateCartaPresentacionParametrization,
} from "./documentParametrization.controller.js";
import { verifyToken } from "../../middlewares/auth.js";

const router = express.Router();

router.use(verifyToken);

router.get("/hoja-vida", getHojaVidaParametrization);
router.put("/hoja-vida", updateHojaVidaParametrization);

/** RQ04_HU003: Carta de presentación parametrizable */
router.get("/carta-presentacion", getCartaPresentacionParametrization);
router.put("/carta-presentacion", updateCartaPresentacionParametrization);

export default router;
