import express from "express";
import { getParametrosPlantilla } from "./parametroPlantilla.controller.js";
import { verifyToken } from "../../middlewares/auth.js";

const router = express.Router();
router.use(verifyToken);
router.get("/", getParametrosPlantilla);

export default router;
