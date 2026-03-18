import express from "express";
import multer from "multer";
import { verifyToken } from "../../middlewares/auth.js";
import { requirePermission } from "../access/presentation/middlewares/requirePermission.js";
import {
  getMeta,
  listDocumentPracticeDefinitions,
  getDocumentPracticeDefinitionById,
  createDocumentPracticeDefinition,
  updateDocumentPracticeDefinition,
  deleteDocumentPracticeDefinition,
  getPracticeDefFileAccess,
  streamPracticeDefFile,
} from "./documentPracticeDefinition.controller.js";

/** Memoria: evita fallos en serverless / FS de solo lectura; el controlador escribe S3 o disco. */
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
router.get("/", requirePermission("CFDL"), listDocumentPracticeDefinitions);
router.get("/:id/file/:kind/access", requirePermission("CFDL"), getPracticeDefFileAccess);
router.get("/:id/file/:kind/stream", requirePermission("CFDL"), streamPracticeDefFile);
router.get("/:id", requirePermission("CFDL"), getDocumentPracticeDefinitionById);
router.post("/", requirePermission("CFDL"), uploadFields, createDocumentPracticeDefinition);
router.put("/:id", requirePermission("CFDL"), uploadFields, updateDocumentPracticeDefinition);
router.delete("/:id", requirePermission("CFDL"), deleteDocumentPracticeDefinition);

export default router;
