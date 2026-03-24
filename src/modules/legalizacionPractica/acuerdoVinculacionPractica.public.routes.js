import express from "express";
import {
  getFirmaAcuerdoPublicInfo,
  postFirmaAcuerdoAprobar,
  postFirmaAcuerdoRechazar,
} from "./acuerdoVinculacionPractica.controller.js";

const router = express.Router();

router.get("/firma/:token", getFirmaAcuerdoPublicInfo);
router.post("/firma/:token/aprobar", postFirmaAcuerdoAprobar);
router.post("/firma/:token/rechazar", postFirmaAcuerdoRechazar);

export default router;
