import express from "express";
import { getParametrosPlantilla, updateParametroVariables } from "./evento.controller.js";
import { verifyToken } from "../../../middlewares/auth.js";

const router = express.Router();
router.use(verifyToken);
router.get("/", getParametrosPlantilla);
router.put("/:id/variables", updateParametroVariables);

export default router;
