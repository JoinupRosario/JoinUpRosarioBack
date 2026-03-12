import express from "express";
import { getDestinatariosNotificacion } from "./destinatarioNotificacion.controller.js";
import { verifyToken } from "../../../middlewares/auth.js";

const router = express.Router();
router.use(verifyToken);
router.get("/", getDestinatariosNotificacion);

export default router;
