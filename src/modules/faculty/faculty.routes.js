import express from "express";
import {
  getFaculties,
  getFacultiesActiveList,
  getFacultyById,
  getFacultyByFacultyId,
  createFaculty,
  updateFaculty,
  deleteFaculty,
  syncFacultiesFromUXXI,
  compareFacultiesWithUniversitas,
  createFacultiesFromUniversitas,
  deactivateFacultiesNotInUniversitas,
} from "./controller/faculty.controller.js";
import { verifyToken } from "../../middlewares/auth.js";
import { requirePermission } from "../access/presentation/middlewares/requirePermission.js";

const router = express.Router();

router.use(verifyToken);

/** Rutas con path fijo ANTES de /:id para que no se interprete "compare-universitas" como id */
/** Comparar/actualizar facultades desde Universitas: CFPP o CFSYNF */
router.get("/compare-universitas", requirePermission("CFPP", "CFSYNF"), compareFacultiesWithUniversitas);
router.post("/create-from-universitas", requirePermission("CFPP", "CFSYNF"), createFacultiesFromUniversitas);
router.post("/deactivate-from-universitas", requirePermission("CFPP", "CFSYNF"), deactivateFacultiesNotInUniversitas);
router.post("/sync", requirePermission("CFPP", "CFSYNF"), syncFacultiesFromUXXI);

router.get("/active-list", getFacultiesActiveList);
router.get("/by-faculty-id/:facultyId", getFacultyByFacultyId);
router.get("/", getFaculties);
router.get("/:id", getFacultyById);
/** Crear/editar/eliminar facultad: CFPP o CEFAC */
router.post("/", requirePermission("CFPP", "CEFAC"), createFaculty);
router.put("/:id", requirePermission("CFPP", "CEFAC"), updateFaculty);
router.delete("/:id", requirePermission("CFPP", "CEFAC"), deleteFaculty);

export default router;
