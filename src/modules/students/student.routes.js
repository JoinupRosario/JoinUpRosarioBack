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
import { verifyToken } from "../../middlewares/auth.js";
import { requirePermission } from "../access/presentation/middlewares/requirePermission.js";
import { upload } from "../../middlewares/upload.js";

const router = express.Router();

router.use(verifyToken);

// AMPR = Acceso módulo prácticas; BUSP = Buscar estudiantes; CEST = Cargar; BEST = Borrar
router.get("/", requirePermission("AMPR", "BUSP"), getStudents);
router.get("/profile", getStudentProfile);
router.put("/profile", updateStudentProfile);
router.get("/:id", requirePermission("AMPR", "BUSP"), getStudentById);
router.post("/", requirePermission("CEST"), createStudent);
router.put("/:id", requirePermission("AMPR"), updateStudent);
router.delete("/:id", requirePermission("BEST"), deleteStudent);

// Subida de archivos
router.post("/:id/cv", upload.single("cv"), uploadCV);

export default router;
