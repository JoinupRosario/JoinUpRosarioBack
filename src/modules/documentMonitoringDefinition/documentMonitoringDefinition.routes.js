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

router.get("/meta", requirePermission("CDDM"), getMeta);
router.get("/", requirePermission("CDDM"), listDocumentMonitoringDefinitions);
router.get("/:id/file/:kind/access", requirePermission("CDDM"), getMonitoringDefFileAccess);
router.get("/:id/file/:kind/stream", requirePermission("CDDM"), streamMonitoringDefFile);
router.get("/:id", requirePermission("CDDM"), getDocumentMonitoringDefinitionById);
router.post("/", requirePermission("CRDM"), uploadFields, createDocumentMonitoringDefinition);
router.put("/:id", requirePermission("ACDM"), uploadFields, updateDocumentMonitoringDefinition);
router.delete("/:id", requirePermission("ELDM"), deleteDocumentMonitoringDefinition);

export default router;
