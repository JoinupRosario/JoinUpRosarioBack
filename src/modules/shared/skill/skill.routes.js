import express from "express";
import { getSkills } from "./skill.controller.js";
import { verifyToken } from "../../../middlewares/auth.js";

const router = express.Router();
router.use(verifyToken);
router.get("/", getSkills);

export default router;
