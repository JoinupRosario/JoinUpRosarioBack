import express from "express";
import multer from "multer";
import { verifyToken } from "../../middlewares/auth.js";
import { requirePermission } from "../access/presentation/middlewares/requirePermission.js";
import {
  getMeta,
  listDocumentMonitoringDefinitions,
  getDocumentMonitoringDefinitionById,
  createDocumentMonitoringDefinition,
  updateDocumentMonitoringDefinition,
  deleteDocumentMonitoringDefinition,
  getMonitoringDefFileAccess,
  streamMonitoringDefFile,
} from "./documentMonitoringDefinition.controller.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, true),
});

const uploadFields = upload.fields([
  { name: "plantilla", maxCount: 1 },
  { name: "modelo", maxCount: 1 },
]);

const router = express.Router();

router.use(verifyToken);

router.get("/meta", requirePermission("CFDL"), getMeta);
router.get("/", requirePermission("CFDL"), listDocumentMonitoringDefinitions);
router.get("/:id/file/:kind/access", requirePermission("CFDL"), getMonitoringDefFileAccess);
router.get("/:id/file/:kind/stream", requirePermission("CFDL"), streamMonitoringDefFile);
router.get("/:id", requirePermission("CFDL"), getDocumentMonitoringDefinitionById);
router.post("/", requirePermission("CFDL"), uploadFields, createDocumentMonitoringDefinition);
router.put("/:id", requirePermission("CFDL"), uploadFields, updateDocumentMonitoringDefinition);
router.delete("/:id", requirePermission("CFDL"), deleteDocumentMonitoringDefinition);

export default router;
