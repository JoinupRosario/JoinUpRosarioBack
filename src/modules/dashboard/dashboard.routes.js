import express from "express";
import { getDashboardStats } from "./dashboard.controller.js";
import { verifyToken, authorizeRoles } from "../../middlewares/auth.js";

const router = express.Router();

router.get("/stats", verifyToken, authorizeRoles("admin", "superadmin", "leader", "monitor", "company", "student"), getDashboardStats);

export default router;
