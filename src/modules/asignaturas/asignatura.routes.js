import express  from "express";
import multer   from "multer";
import { verifyToken, authorizeRoles } from "../../middlewares/auth.js";
import {
  getAsignaturas,
  syncAsignaturasFromSftp,
  syncAsignaturasFromExcel,
  getPeriodosAsignaturas,
} from "./asignatura.controller.js";

const router = express.Router();

// Multer en memoria (solo .xlsx, máx 10 MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const ok = file.mimetype === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            || file.originalname.endsWith(".xlsx");
    cb(ok ? null : new Error("Solo se aceptan archivos .xlsx"), ok);
  },
});

router.use(verifyToken);

router.get("/",           getAsignaturas);
router.get("/periodos",   getPeriodosAsignaturas);
router.post("/sync-sftp", authorizeRoles("admin", "superadmin"), syncAsignaturasFromSftp);
router.post("/sync-excel",
  authorizeRoles("admin", "superadmin"),
  upload.single("file"),
  syncAsignaturasFromExcel
);

export default router;
