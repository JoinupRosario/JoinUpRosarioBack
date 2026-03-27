import express from "express";
import {
  getPostulants,
  getPostulantMe,
  getPostulantById,
  getPostulantProfileData,
  generateHojaVidaPdf,
  canGenerateCartaPresentacion,
  generateCartaPresentacionPdf,
  consultaInfEstudianteUniversitas,
  aplicarInfoUniversitas,
  consultaInfAcademicaUniversitas,
  aplicarInfoAcademicaUniversitas,
  downloadAttachment,
  updatePostulant,
  createPostulant,
  uploadProfilePicture,
  togglePostulantEstado,
  previewSincronizarUxxi,
  sincronizarPostulantesUxxi,
  getHistorialAplicacionesPostulant,
} from "../controllers/postulant.controller.js";
import {
  getProfilesByPostulantId,
  createProfile,
  updateProfile,
  deleteProfile,
  createEnrolledProgram,
  updateEnrolledProgram,
  deleteEnrolledProgram,
  createGraduateProgram,
  updateGraduateProgram,
  deleteGraduateProgram,
  createOtherStudy,
  updateOtherStudy,
  deleteOtherStudy,
  createInterestArea,
  deleteInterestArea,
  createSkill,
  deleteSkill,
  createLanguage,
  deleteLanguage,
  createWorkExperience,
  updateWorkExperience,
  deleteWorkExperience,
  getAvailableWorkExperiences,
  copyWorkExperienceToProfile,
  createAward,
  updateAward,
  deleteAward,
  getAvailableAwards,
  copyAwardToProfile,
  createReference,
  updateReference,
  deleteReference,
  getAvailableReferences,
  copyReferenceToProfile,
  deleteProfileCv,
  deleteProfileSupport,
  uploadProfileSupport,
} from "../controllers/postulantProfile.controller.js";
import { verifyToken } from "../../../middlewares/auth.js";
import { requirePermission } from "../../access/presentation/middlewares/requirePermission.js";
import { userHasPermission } from "../../access/presentation/helpers/checkPermission.js";
import { upload, handleUploadError, uploadProfileSupportMemory, handleProfileSupportUploadError } from "../../../middlewares/upload.js";
import Postulant from "../models/postulants.schema.js";

const router = express.Router();

/** Permite acceso si el usuario tiene uno de los permisos O si :id es su propio postulante (estudiante viendo/editando su perfil). */
function requirePermissionOrOwnPostulant(...permissionCodes) {
  return async (req, res, next) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "No autorizado: usuario no identificado" });
    const id = req.params.id;
    if (id) {
      const postulant = await Postulant.findById(id).select("postulantId").lean();
      if (postulant && String(postulant.postulantId) === String(userId)) return next();
    }
    for (const code of permissionCodes) {
      const has = await userHasPermission(userId, code);
      if (has) return next();
    }
    return res.status(403).json({ message: "No tiene permiso para esta acción" });
  };
}

// Rutas con autenticación
router.use(verifyToken);


// CPOS = Cargar postulantes
router.post("/preview-sincronizar-uxxi", requirePermission("CPOS"), previewSincronizarUxxi);
router.post("/sincronizar-uxxi", requirePermission("CPOS"), sincronizarPostulantesUxxi);
router.post("/create", requirePermission("CPOS"), createPostulant);

// EPOS = Editar postulantes | EMIP = Editar mi perfil. Si :id es su propio postulante, el estudiante puede sin permiso.
router.put("/update/:id", requirePermissionOrOwnPostulant("EPOS", "EMIP"), updatePostulant);

// RQ03_HU001: Perfiles del postulante — propio postulante o VPPO/EMIP (ver) / EPOS/EMIP (editar)
router.get("/:id/profiles", requirePermissionOrOwnPostulant("VPPO", "EMIP"), getProfilesByPostulantId);
router.post("/:id/profiles", requirePermissionOrOwnPostulant("EPOS", "EMIP"), createProfile);
router.put("/:id/profiles/:profileId", requirePermissionOrOwnPostulant("EPOS", "EMIP"), updateProfile);
router.delete("/:id/profiles/:profileId", requirePermissionOrOwnPostulant("EPOS", "EMIP"), deleteProfile);
// Formación en curso, estudios, áreas, skills, idiomas, experiencias, premios, referencias
router.post("/:id/profiles/:profileId/enrolled-programs", requirePermissionOrOwnPostulant("EPOS", "EMIP"), createEnrolledProgram);
router.put("/:id/profiles/:profileId/enrolled-programs/:enrolledId", requirePermissionOrOwnPostulant("EPOS", "EMIP"), updateEnrolledProgram);
router.delete("/:id/profiles/:profileId/enrolled-programs/:enrolledId", requirePermissionOrOwnPostulant("EPOS", "EMIP"), deleteEnrolledProgram);
router.post("/:id/profiles/:profileId/graduate-programs", requirePermissionOrOwnPostulant("EPOS", "EMIP"), createGraduateProgram);
router.put("/:id/profiles/:profileId/graduate-programs/:graduateId", requirePermissionOrOwnPostulant("EPOS", "EMIP"), updateGraduateProgram);
router.delete("/:id/profiles/:profileId/graduate-programs/:graduateId", requirePermissionOrOwnPostulant("EPOS", "EMIP"), deleteGraduateProgram);
router.post("/:id/profiles/:profileId/other-studies", requirePermissionOrOwnPostulant("EPOS", "EMIP"), createOtherStudy);
router.put("/:id/profiles/:profileId/other-studies/:otherStudyId", requirePermissionOrOwnPostulant("EPOS", "EMIP"), updateOtherStudy);
router.delete("/:id/profiles/:profileId/other-studies/:otherStudyId", requirePermissionOrOwnPostulant("EPOS", "EMIP"), deleteOtherStudy);
router.post("/:id/profiles/:profileId/interest-areas", requirePermissionOrOwnPostulant("EPOS", "EMIP"), createInterestArea);
router.delete("/:id/profiles/:profileId/interest-areas/:interestAreaId", requirePermissionOrOwnPostulant("EPOS", "EMIP"), deleteInterestArea);
router.post("/:id/profiles/:profileId/skills", requirePermissionOrOwnPostulant("EPOS", "EMIP"), createSkill);
router.delete("/:id/profiles/:profileId/skills/:skillId", requirePermissionOrOwnPostulant("EPOS", "EMIP"), deleteSkill);
router.post("/:id/profiles/:profileId/languages", requirePermissionOrOwnPostulant("EPOS", "EMIP"), createLanguage);
router.delete("/:id/profiles/:profileId/languages/:languageId", requirePermissionOrOwnPostulant("EPOS", "EMIP"), deleteLanguage);
router.post("/:id/profiles/:profileId/work-experiences", requirePermissionOrOwnPostulant("EPOS", "EMIP"), createWorkExperience);
router.get("/:id/profiles/:profileId/available-work-experiences", requirePermissionOrOwnPostulant("VPPO", "EMIP"), getAvailableWorkExperiences);
router.post("/:id/profiles/:profileId/work-experiences/copy-from/:sourceWorkExperienceId", requirePermissionOrOwnPostulant("EPOS", "EMIP"), copyWorkExperienceToProfile);
router.put("/:id/profiles/:profileId/work-experiences/:workExperienceId", requirePermissionOrOwnPostulant("EPOS", "EMIP"), updateWorkExperience);
router.delete("/:id/profiles/:profileId/work-experiences/:workExperienceId", requirePermissionOrOwnPostulant("EPOS", "EMIP"), deleteWorkExperience);
router.post("/:id/profiles/:profileId/awards", requirePermissionOrOwnPostulant("EPOS", "EMIP"), createAward);
router.get("/:id/profiles/:profileId/available-awards", requirePermissionOrOwnPostulant("VPPO", "EMIP"), getAvailableAwards);
router.post("/:id/profiles/:profileId/awards/copy-from/:sourceAwardId", requirePermissionOrOwnPostulant("EPOS", "EMIP"), copyAwardToProfile);
router.put("/:id/profiles/:profileId/awards/:awardId", requirePermissionOrOwnPostulant("EPOS", "EMIP"), updateAward);
router.delete("/:id/profiles/:profileId/awards/:awardId", requirePermissionOrOwnPostulant("EPOS", "EMIP"), deleteAward);
router.post("/:id/profiles/:profileId/references", requirePermissionOrOwnPostulant("EPOS", "EMIP"), createReference);
router.get("/:id/profiles/:profileId/available-references", requirePermissionOrOwnPostulant("VPPO", "EMIP"), getAvailableReferences);
router.post("/:id/profiles/:profileId/references/copy-from/:sourceReferenceId", requirePermissionOrOwnPostulant("EPOS", "EMIP"), copyReferenceToProfile);
router.put("/:id/profiles/:profileId/references/:referenceId", requirePermissionOrOwnPostulant("EPOS", "EMIP"), updateReference);
router.delete("/:id/profiles/:profileId/references/:referenceId", requirePermissionOrOwnPostulant("EPOS", "EMIP"), deleteReference);
router.delete("/:id/profiles/:profileId/cvs/:profileCvId", requirePermissionOrOwnPostulant("EPOS", "EMIP"), deleteProfileCv);
router.post(
  "/:id/profiles/:profileId/supports",
  requirePermissionOrOwnPostulant("EPOS", "EMIP"),
  uploadProfileSupportMemory.single("file"),
  handleProfileSupportUploadError,
  uploadProfileSupport
);
router.delete("/:id/profiles/:profileId/supports/:profileSupportId", requirePermissionOrOwnPostulant("EPOS", "EMIP"), deleteProfileSupport);

// Ruta "mi postulante" — requiere permiso de perfil propio/visualización.
router.get("/me", requirePermission("EMIP", "VPPO"), getPostulantMe);

// LBPO = Listar/Buscar postulante
router.get("/", requirePermission("LBPO"), getPostulants);

// VPPO = Ver perfil postulante. Si :id es su propio postulante, el estudiante puede sin permiso.
router.get("/:id/generate-hoja-vida-pdf", requirePermissionOrOwnPostulant("VPPO", "EMIP"), generateHojaVidaPdf);
router.get("/:id/can-generate-carta-presentacion", requirePermissionOrOwnPostulant("VPPO", "EMIP"), canGenerateCartaPresentacion);
router.get("/:id/generate-carta-presentacion-pdf", requirePermissionOrOwnPostulant("VPPO", "EMIP"), generateCartaPresentacionPdf);
router.get("/:id/profile-data", requirePermissionOrOwnPostulant("VPPO", "EMIP"), getPostulantProfileData);
router.get("/:id/historial-aplicaciones", requirePermissionOrOwnPostulant("VPPO", "EMIP"), getHistorialAplicacionesPostulant);
// Consulta y aplicación desde Sistema Académico: mismo permiso para ver diferencias y aplicar
router.get("/:id/consulta-inf-estudiante-universitas", requirePermission("ADPS"), consultaInfEstudianteUniversitas);
router.put("/:id/aplicar-info-universitas", requirePermission("ADPS"), aplicarInfoUniversitas);
router.get("/:id/consulta-inf-academica-universitas", requirePermission("ADAP"), consultaInfAcademicaUniversitas);
router.put("/:id/aplicar-info-academica-universitas", requirePermission("ADAP"), aplicarInfoAcademicaUniversitas);
router.put("/:id/toggle-estado", requirePermission("CEPO"), togglePostulantEstado);
router.get("/:id/attachments/:attachmentId/download", requirePermissionOrOwnPostulant("VPPO", "EMIP"), downloadAttachment);
router.get("/:id", requirePermissionOrOwnPostulant("VPPO", "EMIP"), getPostulantById);

// Subir foto de perfil — propio postulante o EPOS/EMIP
router.post(
  "/:id/profile-picture",
  requirePermissionOrOwnPostulant("EPOS", "EMIP"),
  upload.single("profile_picture"),
  handleUploadError,
  uploadProfilePicture
);

export default router;
