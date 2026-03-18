import express from "express";
import { getDashboardStats } from "./dashboard.controller.js";
import { verifyToken } from "../../middlewares/auth.js";

const router = express.Router();

// Cualquier usuario autenticado puede ver estadísticas del Dashboard
router.get("/stats", verifyToken, getDashboardStats);

export default router;
