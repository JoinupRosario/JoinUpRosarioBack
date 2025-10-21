import express from "express";
import { 
  getStudents, 
  getStudentById, 
  createStudent, 
  updateStudent, 
  deleteStudent,
  uploadCV,
  getStudentProfile,
  updateStudentProfile
} from "./student.controller.js";
import { verifyToken, authorizeRoles } from "../../middlewares/auth.js";
import { upload } from "../../middlewares/upload.js";

const router = express.Router();

// Rutas públicas (con autenticación)
router.use(verifyToken);

// Rutas para estudiantes
router.get("/", authorizeRoles("admin", "superadmin", "leader", "monitor"), getStudents);
router.get("/profile", getStudentProfile);
router.put("/profile", updateStudentProfile);
router.get("/:id", getStudentById);
router.post("/", authorizeRoles("admin", "superadmin"), createStudent);
router.put("/:id", updateStudent);
router.delete("/:id", authorizeRoles("admin", "superadmin"), deleteStudent);

// Subida de archivos
router.post("/:id/cv", upload.single("cv"), uploadCV);

export default router;
