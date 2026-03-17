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
} from "../controllers/postulantProfile.controller.js";
import { verifyToken } from "../../../middlewares/auth.js";
import { requirePermission } from "../../access/presentation/middlewares/requirePermission.js";
import { upload, handleUploadError } from "../../../middlewares/upload.js";

const router = express.Router();

// Rutas con autenticación
router.use(verifyToken);


// CPOS = Cargar postulantes
router.post("/preview-sincronizar-uxxi", requirePermission("CPOS"), previewSincronizarUxxi);
router.post("/sincronizar-uxxi", requirePermission("CPOS"), sincronizarPostulantesUxxi);
router.post("/create", requirePermission("CPOS"), createPostulant);

// EPOS = Editar postulantes | EMIP = Editar mi perfil (controller valida que EMIP solo aplica al propio usuario)
router.put("/update/:id", requirePermission("EPOS", "EMIP"), updatePostulant);

// RQ03_HU001: Perfiles del postulante — EPOS/EMIP para crear/editar/eliminar
router.get("/:id/profiles", requirePermission("VPPO", "EMIP"), getProfilesByPostulantId);
router.post("/:id/profiles", requirePermission("EPOS", "EMIP"), createProfile);
router.put("/:id/profiles/:profileId", requirePermission("EPOS", "EMIP"), updateProfile);
router.delete("/:id/profiles/:profileId", requirePermission("EPOS", "EMIP"), deleteProfile);
// Formación en curso, estudios, áreas, skills, idiomas, experiencias, premios, referencias
router.post("/:id/profiles/:profileId/enrolled-programs", requirePermission("EPOS", "EMIP"), createEnrolledProgram);
router.put("/:id/profiles/:profileId/enrolled-programs/:enrolledId", requirePermission("EPOS", "EMIP"), updateEnrolledProgram);
router.delete("/:id/profiles/:profileId/enrolled-programs/:enrolledId", requirePermission("EPOS", "EMIP"), deleteEnrolledProgram);
router.post("/:id/profiles/:profileId/graduate-programs", requirePermission("EPOS", "EMIP"), createGraduateProgram);
router.put("/:id/profiles/:profileId/graduate-programs/:graduateId", requirePermission("EPOS", "EMIP"), updateGraduateProgram);
router.delete("/:id/profiles/:profileId/graduate-programs/:graduateId", requirePermission("EPOS", "EMIP"), deleteGraduateProgram);
router.post("/:id/profiles/:profileId/other-studies", requirePermission("EPOS", "EMIP"), createOtherStudy);
router.put("/:id/profiles/:profileId/other-studies/:otherStudyId", requirePermission("EPOS", "EMIP"), updateOtherStudy);
router.delete("/:id/profiles/:profileId/other-studies/:otherStudyId", requirePermission("EPOS", "EMIP"), deleteOtherStudy);
router.post("/:id/profiles/:profileId/interest-areas", requirePermission("EPOS", "EMIP"), createInterestArea);
router.delete("/:id/profiles/:profileId/interest-areas/:interestAreaId", requirePermission("EPOS", "EMIP"), deleteInterestArea);
router.post("/:id/profiles/:profileId/skills", requirePermission("EPOS", "EMIP"), createSkill);
router.delete("/:id/profiles/:profileId/skills/:skillId", requirePermission("EPOS", "EMIP"), deleteSkill);
router.post("/:id/profiles/:profileId/languages", requirePermission("EPOS", "EMIP"), createLanguage);
router.delete("/:id/profiles/:profileId/languages/:languageId", requirePermission("EPOS", "EMIP"), deleteLanguage);
router.post("/:id/profiles/:profileId/work-experiences", requirePermission("EPOS", "EMIP"), createWorkExperience);
router.get("/:id/profiles/:profileId/available-work-experiences", requirePermission("VPPO", "EMIP"), getAvailableWorkExperiences);
router.post("/:id/profiles/:profileId/work-experiences/copy-from/:sourceWorkExperienceId", requirePermission("EPOS", "EMIP"), copyWorkExperienceToProfile);
router.put("/:id/profiles/:profileId/work-experiences/:workExperienceId", requirePermission("EPOS", "EMIP"), updateWorkExperience);
router.delete("/:id/profiles/:profileId/work-experiences/:workExperienceId", requirePermission("EPOS", "EMIP"), deleteWorkExperience);
router.post("/:id/profiles/:profileId/awards", requirePermission("EPOS", "EMIP"), createAward);
router.get("/:id/profiles/:profileId/available-awards", requirePermission("VPPO", "EMIP"), getAvailableAwards);
router.post("/:id/profiles/:profileId/awards/copy-from/:sourceAwardId", requirePermission("EPOS", "EMIP"), copyAwardToProfile);
router.put("/:id/profiles/:profileId/awards/:awardId", requirePermission("EPOS", "EMIP"), updateAward);
router.delete("/:id/profiles/:profileId/awards/:awardId", requirePermission("EPOS", "EMIP"), deleteAward);
router.post("/:id/profiles/:profileId/references", requirePermission("EPOS", "EMIP"), createReference);
router.get("/:id/profiles/:profileId/available-references", requirePermission("VPPO", "EMIP"), getAvailableReferences);
router.post("/:id/profiles/:profileId/references/copy-from/:sourceReferenceId", requirePermission("EPOS", "EMIP"), copyReferenceToProfile);
router.put("/:id/profiles/:profileId/references/:referenceId", requirePermission("EPOS", "EMIP"), updateReference);
router.delete("/:id/profiles/:profileId/references/:referenceId", requirePermission("EPOS", "EMIP"), deleteReference);
router.delete("/:id/profiles/:profileId/cvs/:profileCvId", requirePermission("EPOS", "EMIP"), deleteProfileCv);
router.delete("/:id/profiles/:profileId/supports/:profileSupportId", requirePermission("EPOS", "EMIP"), deleteProfileSupport);

// Ruta "mi postulante" — puede ver/editar su propio perfil con VPPO o EMIP
router.get("/me", requirePermission("VPPO", "EMIP"), getPostulantMe);

// LBPO = Listar/Buscar postulante
router.get("/", requirePermission("LBPO"), getPostulants);

// VPPO = Ver perfil postulante
router.get("/:id/generate-hoja-vida-pdf", requirePermission("VPPO", "EMIP"), generateHojaVidaPdf);
router.get("/:id/can-generate-carta-presentacion", requirePermission("VPPO", "EMIP"), canGenerateCartaPresentacion);
router.get("/:id/generate-carta-presentacion-pdf", requirePermission("VPPO", "EMIP"), generateCartaPresentacionPdf);
router.get("/:id/profile-data", requirePermission("VPPO", "EMIP"), getPostulantProfileData);
// Consulta y aplicación desde Sistema Académico: mismo permiso para ver diferencias y aplicar
router.get("/:id/consulta-inf-estudiante-universitas", requirePermission("ADPS"), consultaInfEstudianteUniversitas);
router.put("/:id/aplicar-info-universitas", requirePermission("ADPS"), aplicarInfoUniversitas);
router.get("/:id/consulta-inf-academica-universitas", requirePermission("ADAP"), consultaInfAcademicaUniversitas);
router.put("/:id/aplicar-info-academica-universitas", requirePermission("ADAP"), aplicarInfoAcademicaUniversitas);
router.put("/:id/toggle-estado", requirePermission("CEPO"), togglePostulantEstado);
router.get("/:id/attachments/:attachmentId/download", requirePermission("VPPO", "EMIP"), downloadAttachment);
router.get("/:id", requirePermission("VPPO", "EMIP"), getPostulantById);

// Subir foto de perfil — editar perfil (EPOS/EMIP)
router.post(
  "/:id/profile-picture",
  requirePermission("EPOS", "EMIP"),
  upload.single("profile_picture"),
  handleUploadError,
  uploadProfilePicture
);

export default router;
