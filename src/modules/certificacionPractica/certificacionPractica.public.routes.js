import express from "express";
import multer from "multer";
import { getPublicCertificacionInfo, postPublicCertificacionDocumento } from "./certificacionPractica.controller.js";

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

router.get("/:token", getPublicCertificacionInfo);
router.post("/:token/documento", upload.single("file"), postPublicCertificacionDocumento);

export default router;
