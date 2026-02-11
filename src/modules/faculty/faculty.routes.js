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
} from "./controller/faculty.controller.js";
import { verifyToken, authorizeRoles } from "../../middlewares/auth.js";

const router = express.Router();

router.use(verifyToken);

/** RQ02_HU003: Botón ejecutar integración-actualización facultades (UXXI getInfoFacultades) */
router.post("/sync", authorizeRoles("admin", "superadmin"), syncFacultiesFromUXXI);
router.get("/", getFaculties);
/** RQ02_HU003: Listado facultades activas para parámetro Tipo de estudio */
router.get("/active-list", getFacultiesActiveList);
router.get("/by-faculty-id/:facultyId", getFacultyByFacultyId);
router.get("/:id", getFacultyById);
router.post("/", authorizeRoles("admin", "superadmin"), createFaculty);
router.put("/:id", authorizeRoles("admin", "superadmin"), updateFaculty);
router.delete("/:id", authorizeRoles("admin", "superadmin"), deleteFaculty);

export default router;
