import express from "express";
import { getNotificationVariables } from "./variableNotificacion.controller.js";
import { verifyToken } from "../../../middlewares/auth.js";

const router = express.Router();
router.use(verifyToken);
router.get("/", getNotificationVariables);

export default router;
