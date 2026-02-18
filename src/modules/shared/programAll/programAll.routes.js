import express from "express";
import { getProgramAllList } from "./programAll.controller.js";
import { verifyToken } from "../../../middlewares/auth.js";

const router = express.Router();

router.use(verifyToken);
router.get("/", getProgramAllList);

export default router;
