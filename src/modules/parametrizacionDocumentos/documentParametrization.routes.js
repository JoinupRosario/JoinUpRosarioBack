import express from "express";
import {
  getHojaVidaParametrization,
  updateHojaVidaParametrization,
} from "./documentParametrization.controller.js";
import { verifyToken } from "../../middlewares/auth.js";

const router = express.Router();

router.use(verifyToken);

router.get("/hoja-vida", getHojaVidaParametrization);
router.put("/hoja-vida", updateHojaVidaParametrization);

export default router;
