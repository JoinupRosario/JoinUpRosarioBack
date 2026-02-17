import express from "express";
import {
  getProgramFaculties,
  getProgramFacultyById,
  getProgramFacultyByLegacyId,
  getProgramsByFaculty,
  getFacultiesByProgram,
  createProgramFaculty,
  updateProgramFaculty,
  deleteProgramFaculty,
  syncPlansFromUXXI,
  compareProgramsWithUniversitas,
  createProgramsFromUniversitas,
} from "./controller/programFaculty.controller.js";
import { verifyToken, authorizeRoles } from "../../middlewares/auth.js";

const router = express.Router();

router.use(verifyToken);

/** Comparar programas y relaciones con OSB Consulta_programas (modal en front) */
router.get("/compare-universitas", authorizeRoles("admin", "superadmin"), compareProgramsWithUniversitas);
/** Crear programas y relaciones desde Universitas (tras confirmar en modal) */
router.post("/create-from-universitas", authorizeRoles("admin", "superadmin"), createProgramsFromUniversitas);
/** RQ02_HU003: Botón ejecutar integración-actualización planes (UXXI getInfoProgramas) */
router.post("/sync", authorizeRoles("admin", "superadmin"), syncPlansFromUXXI);
router.get("/", getProgramFaculties);
router.get("/by-legacy-id/:programFacultyId", getProgramFacultyByLegacyId);
router.get("/by-faculty/:facultyId/programs", getProgramsByFaculty);
router.get("/by-program/:programId/faculties", getFacultiesByProgram);
router.get("/:id", getProgramFacultyById);
router.post("/", authorizeRoles("admin", "superadmin"), createProgramFaculty);
router.put("/:id", authorizeRoles("admin", "superadmin"), updateProgramFaculty);
router.delete("/:id", authorizeRoles("admin", "superadmin"), deleteProgramFaculty);

export default router;
