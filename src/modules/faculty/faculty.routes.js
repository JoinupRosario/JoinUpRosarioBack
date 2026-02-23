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
import { verifyToken, authorizeRoles } from "../../middlewares/auth.js";

const router = express.Router();

router.use(verifyToken);

/** Rutas con path fijo ANTES de /:id para que no se interprete "compare-universitas" como id */
/** Comparar facultades BD vs OSB Consulta_facultades (modal comparativo en front) */
router.get("/compare-universitas", authorizeRoles("admin", "superadmin"), compareFacultiesWithUniversitas);
/** Crear facultades nuevas desde lista Universitas (tras confirmar en modal) */
router.post("/create-from-universitas", authorizeRoles("admin", "superadmin"), createFacultiesFromUniversitas);
/** Inactivar facultades que ya no vienen en UXXI/Universitas */
router.post("/deactivate-from-universitas", authorizeRoles("admin", "superadmin"), deactivateFacultiesNotInUniversitas);
/** RQ02_HU003: Botón ejecutar integración-actualización facultades (UXXI getInfoFacultades) */
router.post("/sync", authorizeRoles("admin", "superadmin"), syncFacultiesFromUXXI);
/** RQ02_HU003: Listado facultades activas para parámetro Tipo de estudio */
router.get("/active-list", getFacultiesActiveList);
router.get("/by-faculty-id/:facultyId", getFacultyByFacultyId);
router.get("/", getFaculties);
/** GET por id debe ir al final; validar ObjectId para no hacer cast de "compare-universitas" */
router.get("/:id", getFacultyById);
router.post("/", authorizeRoles("admin", "superadmin"), createFaculty);
router.put("/:id", authorizeRoles("admin", "superadmin"), updateFaculty);
router.delete("/:id", authorizeRoles("admin", "superadmin"), deleteFaculty);

export default router;
