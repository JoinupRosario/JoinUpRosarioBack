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
import { verifyToken } from "../../middlewares/auth.js";
import { requirePermission } from "../access/presentation/middlewares/requirePermission.js";

const router = express.Router();

router.use(verifyToken);

/** Actualizar info programas (Universitas): CFPP o CFSYNP */
router.get("/compare-universitas", requirePermission("CFPP", "CFSYNP"), compareProgramsWithUniversitas);
router.post("/create-from-universitas", requirePermission("CFPP", "CFSYNP"), createProgramsFromUniversitas);
router.post("/sync", requirePermission("CFPP", "CFSYNP"), syncPlansFromUXXI);

router.get("/", getProgramFaculties);
router.get("/by-legacy-id/:programFacultyId", getProgramFacultyByLegacyId);
router.get("/by-faculty/:facultyId/programs", getProgramsByFaculty);
router.get("/by-program/:programId/faculties", getFacultiesByProgram);
router.get("/:id", getProgramFacultyById);
router.post("/", requirePermission("CFPP", "CEPRO"), createProgramFaculty);
router.put("/:id", requirePermission("CFPP", "CEPRO"), updateProgramFaculty);
router.delete("/:id", requirePermission("CFPP", "CEPRO"), deleteProgramFaculty);

export default router;
