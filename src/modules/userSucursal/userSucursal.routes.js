import express from "express";
import { getSucursalesByCurrentUser, getSucursalesByUserId } from "./userSucursal.controller.js";
import { verifyToken, authorizeRoles } from "../../middlewares/auth.js";

const router = express.Router();

router.get("/", verifyToken, getSucursalesByCurrentUser);
router.get("/:userId", verifyToken, authorizeRoles("admin", "superadmin"), getSucursalesByUserId);

export default router;
