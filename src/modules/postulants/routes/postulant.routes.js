import express from "express";
import {
  getPostulants,
  getPostulantById,
  getPostulantProfileData,
  generateHojaVidaPdf,
  consultaInfEstudianteUniversitas,
  aplicarInfoUniversitas,
  consultaInfAcademicaUniversitas,
  aplicarInfoAcademicaUniversitas,
  downloadAttachment,
  updatePostulant,
  createPostulant,
  uploadProfilePicture,
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
  createAward,
  updateAward,
  deleteAward,
  createReference,
  updateReference,
  deleteReference,
  deleteProfileCv,
  deleteProfileSupport,
} from "../controllers/postulantProfile.controller.js";
import { verifyToken, authorizeRoles } from "../../../middlewares/auth.js";
import { upload, handleUploadError } from "../../../middlewares/upload.js";

const router = express.Router();

// Rutas con autenticación
router.use(verifyToken);

// Rutas específicas primero (antes de las rutas con parámetros)
router.post("/preview-sincronizar-uxxi", previewSincronizarUxxi);
router.post("/sincronizar-uxxi", sincronizarPostulantesUxxi);
router.post("/create", createPostulant);
router.put("/update/:id", updatePostulant);

// RQ03_HU001: Perfiles del postulante (hasta 5 por postulante)
router.get("/:id/profiles", getProfilesByPostulantId);
router.post("/:id/profiles", createProfile);
router.put("/:id/profiles/:profileId", updateProfile);
router.delete("/:id/profiles/:profileId", deleteProfile);
// Formación en curso registrada (enrolled) y programas finalizados (graduate)
router.post("/:id/profiles/:profileId/enrolled-programs", createEnrolledProgram);
router.put("/:id/profiles/:profileId/enrolled-programs/:enrolledId", updateEnrolledProgram);
router.delete("/:id/profiles/:profileId/enrolled-programs/:enrolledId", deleteEnrolledProgram);
router.post("/:id/profiles/:profileId/graduate-programs", createGraduateProgram);
router.put("/:id/profiles/:profileId/graduate-programs/:graduateId", updateGraduateProgram);
router.delete("/:id/profiles/:profileId/graduate-programs/:graduateId", deleteGraduateProgram);
router.post("/:id/profiles/:profileId/other-studies", createOtherStudy);
router.put("/:id/profiles/:profileId/other-studies/:otherStudyId", updateOtherStudy);
router.delete("/:id/profiles/:profileId/other-studies/:otherStudyId", deleteOtherStudy);
router.post("/:id/profiles/:profileId/interest-areas", createInterestArea);
router.delete("/:id/profiles/:profileId/interest-areas/:interestAreaId", deleteInterestArea);
router.post("/:id/profiles/:profileId/skills", createSkill);
router.delete("/:id/profiles/:profileId/skills/:skillId", deleteSkill);
router.post("/:id/profiles/:profileId/languages", createLanguage);
router.delete("/:id/profiles/:profileId/languages/:languageId", deleteLanguage);
router.post("/:id/profiles/:profileId/work-experiences", createWorkExperience);
router.put("/:id/profiles/:profileId/work-experiences/:workExperienceId", updateWorkExperience);
router.delete("/:id/profiles/:profileId/work-experiences/:workExperienceId", deleteWorkExperience);
router.post("/:id/profiles/:profileId/awards", createAward);
router.put("/:id/profiles/:profileId/awards/:awardId", updateAward);
router.delete("/:id/profiles/:profileId/awards/:awardId", deleteAward);
router.post("/:id/profiles/:profileId/references", createReference);
router.put("/:id/profiles/:profileId/references/:referenceId", updateReference);
router.delete("/:id/profiles/:profileId/references/:referenceId", deleteReference);
router.delete("/:id/profiles/:profileId/cvs/:profileCvId", deleteProfileCv);
router.delete("/:id/profiles/:profileId/supports/:profileSupportId", deleteProfileSupport);

// Rutas generales después
router.get("/", getPostulants);
router.get("/:id/generate-hoja-vida-pdf", generateHojaVidaPdf);
router.get("/:id/profile-data", getPostulantProfileData);
router.get("/:id/consulta-inf-estudiante-universitas", consultaInfEstudianteUniversitas);
router.put("/:id/aplicar-info-universitas", aplicarInfoUniversitas);
router.get("/:id/consulta-inf-academica-universitas", consultaInfAcademicaUniversitas);
router.put("/:id/aplicar-info-academica-universitas", aplicarInfoAcademicaUniversitas);
router.get("/:id/attachments/:attachmentId/download", downloadAttachment);
router.get("/:id", getPostulantById);

// Subir foto de perfil
router.post(
  "/:id/profile-picture",
  upload.single("profile_picture"),
  handleUploadError,
  uploadProfilePicture
);

export default router;
