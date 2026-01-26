import express from "express";
import {
  getPostulantDocumentLogs
} from "../controllers/logs/postulantDocumentLog.controller.js";
import {
    
  getPostulantStatusLogs
} from "../controllers/logs/postulantStatusLog.controller.js"
import { verifyToken, authorizeRoles } from "../../../middlewares/auth.js";

const router = express.Router();

router.use(verifyToken);

router.get(
  "/status",
  authorizeRoles("admin", "superadmin", "leader", "monitor"),
  getPostulantStatusLogs
);

router.get(
  "/documents",
  authorizeRoles("admin", "superadmin", "leader", "monitor"),
  getPostulantDocumentLogs
);

export default router;
