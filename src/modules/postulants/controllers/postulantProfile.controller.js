import Postulant from "../models/postulants.schema.js";
import PostulantProfile from "../models/profile/profile.schema.js";
import ProfileProfileVersion from "../models/profile/profileProfileVersion.schema.js";
import ProfileEnrolledProgram from "../models/profile/profileEnrolledProgram.schema.js";
import ProfileGraduateProgram from "../models/profile/profileGraduateProgram.schema.js";
import ProfileOtherStudy from "../models/profile/profileOtherStudy.schema.js";
import ProfileInterestArea from "../models/profile/profileInterestArea.schema.js";
import ProfileSkill from "../models/profile/profileSkill.schema.js";
import ProfileLanguage from "../models/profile/profileLanguage.schema.js";
import ProfileWorkExperience from "../models/profile/profileWorkExperience.schema.js";
import ProfileAward from "../models/profile/profileAward.schema.js";
import ProfileReference from "../models/profile/profileReference.schema.js";
import ProfileCv from "../models/profile/profileCv.schema.js";
import ProfileSupport from "../models/profile/profileSupport.schema.js";
import Attachment from "../../shared/attachment/attachment.schema.js";
import { s3Config, deleteFromS3 } from "../../../config/s3.config.js";
import { recalcAndSaveProfileCompleteness } from "../services/profileCompleteness.service.js";

/** RQ03_HU001: Máximo de perfiles (hojas de vida) por postulante */
export const MAX_PROFILES_PER_POSTULANT = 5;

/**
 * Resuelve :id de la ruta a documento Postulant. :id puede ser Postulant._id, postulantId (User id) o mysqlId (legacy).
 * Retorna { postulantDocId, userId } o null si no existe.
 */
async function resolvePostulant(id) {
  let postulant = await Postulant.findById(id).select("_id postulantId").lean();
  if (!postulant) {
    postulant = await Postulant.findOne({ postulantId: id }).select("_id postulantId").lean();
  }
  if (!postulant && id != null && String(id).trim() !== "") {
    const numId = Number(id);
    if (Number.isFinite(numId)) {
      postulant = await Postulant.findOne({ mysqlId: numId }).select("_id postulantId").lean();
    }
  }
  if (!postulant) return null;
  return {
    postulantDocId: postulant._id,
    userId: postulant.postulantId ?? null,
  };
}

/**
 * GET /postulants/:id/profiles
 * Lista las versiones de perfil (profile_profile_version) del postulante y los perfiles base (postulant_profile).
 * - baseProfiles: perfiles base (postulant_profile) de este postulante; se devuelve para que la UI muestre al menos
 *   un perfil cuando no hay versiones (p. ej. migración o tras borrar todas las versiones).
 * - profiles: solo versiones (profile_profile_version). Crear "nuevo perfil" crea una versión; eliminar elimina una versión.
 */
export const getProfilesByPostulantId = async (req, res) => {
  try {
    const { id } = req.params;
    const postulant = await resolvePostulant(id);
    if (!postulant) {
      return res.status(404).json({ message: "Postulante no encontrado" });
    }
    const { postulantDocId, userId } = postulant;
    const postulantMatch = {
      $or: [
        { postulantId: postulantDocId },
        ...(userId ? [{ postulantId: userId }] : []),
      ],
    };
    const baseProfiles = await PostulantProfile.find(postulantMatch)
      .select("_id studentCode profileName")
      .lean();
    const profileIds = baseProfiles.map((p) => p._id);
    const versions =
      profileIds.length > 0
        ? await ProfileProfileVersion.find({ profileId: { $in: profileIds } })
            .sort({ dateCreation: 1 })
            .lean()
        : [];

    // ProfileCv: profileId (base) + profileVersionId (opcional). Si profileVersionId es null, la HV es del perfil base.
    // Base tiene HV si existe al menos un ProfileCv con ese profileId. Versión tiene HV solo si existe ProfileCv con profileVersionId = esa versión.
    const cvDocs =
      profileIds.length > 0
        ? await ProfileCv.find({ profileId: { $in: profileIds } })
            .select("profileId profileVersionId")
            .lean()
        : [];
    const hasCvByBaseId = new Map(profileIds.map((id) => [String(id), cvDocs.some((c) => String(c.profileId) === String(id))]));
    const hasCvByVersionId = new Map(
      versions.map((v) => [
        String(v._id),
        cvDocs.some((c) => String(c.profileId) === String(v.profileId) && c.profileVersionId != null && String(c.profileVersionId) === String(v._id)),
      ])
    );

    const profiles = versions.map((v) => ({
      type: "version",
      _id: v._id,
      profileId: v.profileId,
      versionId: v._id,
      profileName: v.profileName,
      profileText: v.profileText,
      dateCreation: v.dateCreation,
      dateUpdate: v.dateUpdate,
      createdAt: v.dateCreation || v.createdAt,
      hasCv: hasCvByVersionId.get(String(v._id)) === true,
    }));

    const baseProfilesForClient = baseProfiles.map((p) => ({
      _id: p._id,
      studentCode: p.studentCode,
      profileName: p.profileName,
      hasCv: hasCvByBaseId.get(String(p._id)) === true,
    }));

    res.json({
      postulantId: postulantDocId,
      count: profiles.length,
      totalVersions: profiles.length,
      maxAllowed: MAX_PROFILES_PER_POSTULANT,
      baseProfiles: baseProfilesForClient,
      profiles,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * POST /postulants/:id/profiles
 * Crea una nueva versión de perfil (profile_profile_version). No crea perfil base (postulant_profile).
 * - Si el postulante no tiene ningún perfil base, se crea uno (PostulantProfile) y luego la versión.
 * - Si ya tiene al menos uno, se usa el primero encontrado como padre. Máximo MAX_PROFILES_PER_POSTULANT versiones.
 * Modelos: PostulantProfile (postulant_profile) = perfil base; ProfileProfileVersion (profile_profile_version) = versión "hoja de vida".
 */
export const createProfile = async (req, res) => {
  try {
    const { id } = req.params;
    const postulant = await resolvePostulant(id);
    if (!postulant) {
      return res.status(404).json({ message: "Postulante no encontrado" });
    }
    const { postulantDocId, userId } = postulant;
    const postulantMatch = {
      $or: [
        { postulantId: postulantDocId },
        ...(userId ? [{ postulantId: userId }] : []),
      ],
    };

    let baseProfile = await PostulantProfile.findOne(postulantMatch);
    if (!baseProfile) {
      baseProfile = new PostulantProfile({
        postulantId: postulantDocId,
        studentCode: req.body?.studentCode || req.body?.profileName || "Principal",
        profileText: req.body?.profileText || "",
      });
      await baseProfile.save();
    }
    const baseId = baseProfile._id;
    const allBaseIds = (await PostulantProfile.find(postulantMatch).select("_id").lean()).map((p) => p._id);
    const versionCount = await ProfileProfileVersion.countDocuments({ profileId: { $in: allBaseIds } });
    if (versionCount >= MAX_PROFILES_PER_POSTULANT) {
      return res.status(400).json({
        message: `Ya tiene el máximo de ${MAX_PROFILES_PER_POSTULANT} versiones. No se pueden crear más.`,
        maxAllowed: MAX_PROFILES_PER_POSTULANT,
      });
    }

    const profileName = (req.body?.profileName || req.body?.studentCode || "").trim() || "Sin nombre";
    const profileText = (req.body?.profileText || "").trim() || "";
    const userCreator = req.user?.id || req.user?.email || req.user?.sub || "system";

    const version = new ProfileProfileVersion({
      profileId: baseId,
      profileName,
      profileText,
      dateCreation: new Date(),
      userCreator,
    });
    await version.save();
    const created = version.toObject ? version.toObject() : version;

    res.status(201).json({
      type: "version",
      _id: created._id,
      profileId: created.profileId,
      versionId: created._id,
      profileName: created.profileName,
      profileText: created.profileText,
      dateCreation: created.dateCreation,
      dateUpdate: created.dateUpdate,
      createdAt: created.dateCreation || created.createdAt,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * PUT /postulants/:id/profiles/:profileId
 * Actualiza perfil base (postulant_profile) o una versión (profile_profile_version).
 * Si profileId es un PostulantProfile._id, se actualiza el perfil base. Si es un ProfileProfileVersion._id, se actualiza la versión.
 */
export const updateProfile = async (req, res) => {
  try {
    const { id, profileId } = req.params;
    const postulant = await resolvePostulant(id);
    if (!postulant) {
      return res.status(404).json({ message: "Postulante no encontrado" });
    }
    const { postulantDocId, userId } = postulant;
    const postulantMatch = {
      $or: [
        { postulantId: postulantDocId },
        ...(userId ? [{ postulantId: userId }] : []),
      ],
    };

    // 1) Intentar actualizar perfil base (postulant_profile)
    const baseProfile = await PostulantProfile.findOne({
      _id: profileId,
      ...postulantMatch,
    });
    if (baseProfile) {
      const body = mapBodyToProfile(req.body);
      Object.assign(baseProfile, body);
      await baseProfile.save();
      await baseProfile.populate("levelJob", "name value");
      await baseProfile.populate("companySector", "name value");
      return res.json(baseProfile);
    }

    // 2) Actualizar versión (profile_profile_version)
    const version = await ProfileProfileVersion.findOne({ _id: profileId });
    if (!version?.profileId) {
      return res.status(404).json({ message: "Versión de perfil no encontrada" });
    }
    const baseBelongsToPostulant = await PostulantProfile.findOne({
      _id: version.profileId,
      ...postulantMatch,
    });
    if (!baseBelongsToPostulant) {
      return res.status(404).json({ message: "Versión de perfil no encontrada" });
    }

    if (req.body?.profileName !== undefined) version.profileName = req.body.profileName;
    if (req.body?.profileText !== undefined) version.profileText = req.body.profileText;
    if (req.body?.studentCode !== undefined) version.profileName = req.body.studentCode;
    version.dateUpdate = new Date();
    version.userUpdater = req.user?.id || req.user?.email || req.user?.sub || "system";
    await version.save();

    const updated = version.toObject ? version.toObject() : version;
    return res.json({
      type: "version",
      _id: updated._id,
      profileId: updated.profileId,
      versionId: updated._id,
      profileName: updated.profileName,
      profileText: updated.profileText,
      dateCreation: updated.dateCreation,
      dateUpdate: updated.dateUpdate,
      createdAt: updated.dateCreation || updated.createdAt,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * DELETE /postulants/:id/profiles/:profileId
 * Elimina solo una versión (profile_profile_version). No se elimina nunca el perfil base (postulant_profile).
 * Tras borrar, GET /profiles sigue devolviendo baseProfiles para que la UI muestre al menos el perfil base (p. ej. "1107517662").
 */
export const deleteProfile = async (req, res) => {
  try {
    const { id, profileId } = req.params;
    const postulant = await resolvePostulant(id);
    if (!postulant) {
      return res.status(404).json({ message: "Postulante no encontrado" });
    }
    const { postulantDocId, userId } = postulant;
    const postulantMatch = {
      $or: [
        { postulantId: postulantDocId },
        ...(userId ? [{ postulantId: userId }] : []),
      ],
    };

    const version = await ProfileProfileVersion.findOne({ _id: profileId }).lean();
    if (!version?.profileId) {
      return res.status(404).json({ message: "Versión de perfil no encontrada" });
    }
    const baseBelongsToPostulant = await PostulantProfile.findOne({
      _id: version.profileId,
      ...postulantMatch,
    });
    if (!baseBelongsToPostulant) {
      return res.status(404).json({ message: "Versión de perfil no encontrada" });
    }
    const deletedVersion = await ProfileProfileVersion.findOneAndDelete({
      _id: profileId,
      profileId: version.profileId,
    });
    if (!deletedVersion) {
      return res.status(404).json({ message: "Versión de perfil no encontrada" });
    }
    return res.json({ message: "Versión de perfil eliminada correctamente", deleted: deletedVersion._id, isVersion: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * Mapea el body de la petición a campos del schema (camelCase).
 */
function mapBodyToProfile(body) {
  if (!body || typeof body !== "object") return {};
  const mapped = {};
  const fields = [
    "studentCode", "academicUser", "academicId", "degreeOption", "emphasis",
    "yearsExperience", "filled", "lastTimeExperience", "totalTimeExperience",
    "acceptTerms", "cvVideoLink", "profileText", "skillsTechnicalSoftware",
    "conditionDiscapacity", "levelJob", "otherStudies", "possibilityFly",
    "salaryRangeMin", "salaryRangeMax", "retired", "employee", "independent",
    "haveBusiness", "companyName", "companySector", "webSiteCompany",
  ];
  for (const key of fields) {
    if (body[key] !== undefined) mapped[key] = body[key];
  }
  return mapped;
}

/** Verifica que el perfil pertenezca al postulante. Devuelve el perfil o null. */
async function findProfileForPostulant(postulantDocId, userId, profileId) {
  return PostulantProfile.findOne({
    _id: profileId,
    $or: [
      { postulantId: postulantDocId },
      ...(userId ? [{ postulantId: userId }] : []),
    ],
  });
}

/**
 * Resuelve versionId (body o query) a profileVersionId válido para este perfil base.
 * Retorna { profileVersionId: ObjectId | null }. Si versionId viene pero no es válido, lanza error con res.
 */
async function resolveProfileVersionId(profileId, versionId, res) {
  if (!versionId) return { profileVersionId: null };
  const version = await ProfileProfileVersion.findOne({ _id: versionId, profileId }).lean();
  if (!version) {
    res.status(400).json({ message: "La versión no existe o no pertenece a este perfil" });
    throw new Error("INVALID_VERSION");
  }
  return { profileVersionId: version._id };
}

/**
 * POST /postulants/:id/profiles/:profileId/enrolled-programs
 * Crea formación en curso registrada (programFacultyId null).
 */
export const createEnrolledProgram = async (req, res) => {
  try {
    const { id, profileId } = req.params;
    const postulant = await resolvePostulant(id);
    if (!postulant) return res.status(404).json({ message: "Postulante no encontrado" });
    const profile = await findProfileForPostulant(postulant.postulantDocId, postulant.userId, profileId);
    if (!profile) return res.status(404).json({ message: "Perfil no encontrado" });
    const { programId, university, anotherUniversity, countryId, stateId, cityId } = req.body;
    if (!programId) return res.status(400).json({ message: "programId es requerido" });
    const doc = await ProfileEnrolledProgram.create({
      profileId: profile._id,
      programId,
      programFacultyId: null,
      university: university || undefined,
      anotherUniversity: anotherUniversity || undefined,
      countryId: countryId || undefined,
      stateId: stateId || undefined,
      cityId: cityId || undefined,
      dateCreation: new Date(),
      userCreator: req.user?.name || req.user?.email || "api",
    });
    const populated = await ProfileEnrolledProgram.findById(doc._id)
      .populate("programId", "name code level labelLevel")
      .populate("countryId", "name")
      .populate("stateId", "name")
      .populate("cityId", "name")
      .lean();
    res.status(201).json(populated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * PUT /postulants/:id/profiles/:profileId/enrolled-programs/:enrolledId
 */
export const updateEnrolledProgram = async (req, res) => {
  try {
    const { id, profileId, enrolledId } = req.params;
    const postulant = await resolvePostulant(id);
    if (!postulant) return res.status(404).json({ message: "Postulante no encontrado" });
    const profile = await findProfileForPostulant(postulant.postulantDocId, postulant.userId, profileId);
    if (!profile) return res.status(404).json({ message: "Perfil no encontrado" });
    const enrolled = await ProfileEnrolledProgram.findOne({
      _id: enrolledId,
      profileId: profile._id,
    });
    if (!enrolled) return res.status(404).json({ message: "Formación en curso no encontrada" });
    const { programId, university, anotherUniversity, countryId, stateId, cityId } = req.body;
    if (programId !== undefined) enrolled.programId = programId;
    if (university !== undefined) enrolled.university = university;
    if (anotherUniversity !== undefined) enrolled.anotherUniversity = anotherUniversity;
    if (countryId !== undefined) enrolled.countryId = countryId;
    if (stateId !== undefined) enrolled.stateId = stateId;
    if (cityId !== undefined) enrolled.cityId = cityId;
    enrolled.dateUpdate = new Date();
    enrolled.userUpdater = req.user?.name || req.user?.email || "api";
    await enrolled.save();
    const populated = await ProfileEnrolledProgram.findById(enrolled._id)
      .populate("programId", "name code level labelLevel")
      .populate("countryId", "name")
      .populate("stateId", "name")
      .populate("cityId", "name")
      .lean();
    res.json(populated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * DELETE /postulants/:id/profiles/:profileId/enrolled-programs/:enrolledId
 */
export const deleteEnrolledProgram = async (req, res) => {
  try {
    const { id, profileId, enrolledId } = req.params;
    const postulant = await resolvePostulant(id);
    if (!postulant) return res.status(404).json({ message: "Postulante no encontrado" });
    const profile = await findProfileForPostulant(postulant.postulantDocId, postulant.userId, profileId);
    if (!profile) return res.status(404).json({ message: "Perfil no encontrado" });
    const deleted = await ProfileEnrolledProgram.findOneAndDelete({
      _id: enrolledId,
      profileId: profile._id,
    });
    if (!deleted) return res.status(404).json({ message: "Formación en curso no encontrada" });
    res.json({ message: "Eliminado correctamente", deleted: deleted._id });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * POST /postulants/:id/profiles/:profileId/graduate-programs
 */
export const createGraduateProgram = async (req, res) => {
  try {
    const { id, profileId } = req.params;
    const postulant = await resolvePostulant(id);
    if (!postulant) return res.status(404).json({ message: "Postulante no encontrado" });
    const profile = await findProfileForPostulant(postulant.postulantDocId, postulant.userId, profileId);
    if (!profile) return res.status(404).json({ message: "Perfil no encontrado" });
    const { programId, programFacultyId, title, endDate, university, anotherUniversity, countryId, stateId, cityId } = req.body;
    if (!programId) return res.status(400).json({ message: "programId es requerido" });
    const doc = await ProfileGraduateProgram.create({
      profileId: profile._id,
      programId,
      programFacultyId: programFacultyId || null,
      title: title || undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      university: university || undefined,
      anotherUniversity: anotherUniversity || undefined,
      countryId: countryId || undefined,
      stateId: stateId || undefined,
      cityId: cityId || undefined,
    });
    const populated = await ProfileGraduateProgram.findById(doc._id)
      .populate("programId", "name code level labelLevel")
      .populate("countryId", "name")
      .populate("stateId", "name")
      .populate("cityId", "name")
      .lean();
    res.status(201).json(populated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * PUT /postulants/:id/profiles/:profileId/graduate-programs/:graduateId
 */
export const updateGraduateProgram = async (req, res) => {
  try {
    const { id, profileId, graduateId } = req.params;
    const postulant = await resolvePostulant(id);
    if (!postulant) return res.status(404).json({ message: "Postulante no encontrado" });
    const profile = await findProfileForPostulant(postulant.postulantDocId, postulant.userId, profileId);
    if (!profile) return res.status(404).json({ message: "Perfil no encontrado" });
    const graduate = await ProfileGraduateProgram.findOne({
      _id: graduateId,
      profileId: profile._id,
    });
    if (!graduate) return res.status(404).json({ message: "Programa finalizado no encontrado" });
    const { programId, programFacultyId, title, endDate, university, anotherUniversity, countryId, stateId, cityId } = req.body;
    if (programId !== undefined) graduate.programId = programId;
    if (programFacultyId !== undefined) graduate.programFacultyId = programFacultyId;
    if (title !== undefined) graduate.title = title;
    if (endDate !== undefined) graduate.endDate = endDate ? new Date(endDate) : null;
    if (university !== undefined) graduate.university = university;
    if (anotherUniversity !== undefined) graduate.anotherUniversity = anotherUniversity;
    if (countryId !== undefined) graduate.countryId = countryId;
    if (stateId !== undefined) graduate.stateId = stateId;
    if (cityId !== undefined) graduate.cityId = cityId;
    await graduate.save();
    const populated = await ProfileGraduateProgram.findById(graduate._id)
      .populate("programId", "name code level labelLevel")
      .populate("countryId", "name")
      .populate("stateId", "name")
      .populate("cityId", "name")
      .lean();
    res.json(populated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * DELETE /postulants/:id/profiles/:profileId/graduate-programs/:graduateId
 */
export const deleteGraduateProgram = async (req, res) => {
  try {
    const { id, profileId, graduateId } = req.params;
    const postulant = await resolvePostulant(id);
    if (!postulant) return res.status(404).json({ message: "Postulante no encontrado" });
    const profile = await findProfileForPostulant(postulant.postulantDocId, postulant.userId, profileId);
    if (!profile) return res.status(404).json({ message: "Perfil no encontrado" });
    const deleted = await ProfileGraduateProgram.findOneAndDelete({
      _id: graduateId,
      profileId: profile._id,
    });
    if (!deleted) return res.status(404).json({ message: "Programa finalizado no encontrado" });
    res.json({ message: "Eliminado correctamente", deleted: deleted._id });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * POST /postulants/:id/profiles/:profileId/other-studies
 */
export const createOtherStudy = async (req, res) => {
  try {
    const { id, profileId } = req.params;
    const postulant = await resolvePostulant(id);
    if (!postulant) return res.status(404).json({ message: "Postulante no encontrado" });
    const profile = await findProfileForPostulant(postulant.postulantDocId, postulant.userId, profileId);
    if (!profile) return res.status(404).json({ message: "Perfil no encontrado" });
    const { studyName, studyInstitution, studyYear } = req.body;
    if (!studyName || !studyInstitution) return res.status(400).json({ message: "studyName y studyInstitution son requeridos" });
    const yearNum = studyYear != null && studyYear !== '' ? Number(studyYear) : NaN;
    const doc = await ProfileOtherStudy.create({
      profileId: profile._id,
      studyName: String(studyName).trim(),
      studyInstitution: String(studyInstitution).trim(),
      studyYear: Number.isFinite(yearNum) ? yearNum : new Date().getFullYear(),
      dateCreation: new Date(),
      userCreator: req.user?.name || req.user?.email || "api",
    });
    res.status(201).json(doc);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * PUT /postulants/:id/profiles/:profileId/other-studies/:otherStudyId
 */
export const updateOtherStudy = async (req, res) => {
  try {
    const { id, profileId, otherStudyId } = req.params;
    const postulant = await resolvePostulant(id);
    if (!postulant) return res.status(404).json({ message: "Postulante no encontrado" });
    const profile = await findProfileForPostulant(postulant.postulantDocId, postulant.userId, profileId);
    if (!profile) return res.status(404).json({ message: "Perfil no encontrado" });
    const other = await ProfileOtherStudy.findOne({ _id: otherStudyId, profileId: profile._id });
    if (!other) return res.status(404).json({ message: "Otro estudio no encontrado" });
    const { studyName, studyInstitution, studyYear } = req.body;
    if (studyName !== undefined) other.studyName = String(studyName).trim();
    if (studyInstitution !== undefined) other.studyInstitution = String(studyInstitution).trim();
    if (studyYear !== undefined) {
      const yearNum = studyYear != null ? Number(studyYear) : null;
      other.studyYear = Number.isFinite(yearNum) ? yearNum : null;
    }
    other.dateUpdate = new Date();
    other.userUpdater = req.user?.name || req.user?.email || "api";
    await other.save();
    res.json(other);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * DELETE /postulants/:id/profiles/:profileId/other-studies/:otherStudyId
 */
export const deleteOtherStudy = async (req, res) => {
  try {
    const { id, profileId, otherStudyId } = req.params;
    const postulant = await resolvePostulant(id);
    if (!postulant) return res.status(404).json({ message: "Postulante no encontrado" });
    const profile = await findProfileForPostulant(postulant.postulantDocId, postulant.userId, profileId);
    if (!profile) return res.status(404).json({ message: "Perfil no encontrado" });
    const deleted = await ProfileOtherStudy.findOneAndDelete({ _id: otherStudyId, profileId: profile._id });
    if (!deleted) return res.status(404).json({ message: "Otro estudio no encontrado" });
    res.json({ message: "Eliminado correctamente", deleted: deleted._id });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * POST /postulants/:id/profiles/:profileId/interest-areas
 * Body opcional: versionId — si se envía, el ítem pertenece a esa versión del perfil.
 */
export const createInterestArea = async (req, res) => {
  try {
    const { id, profileId } = req.params;
    const postulant = await resolvePostulant(id);
    if (!postulant) return res.status(404).json({ message: "Postulante no encontrado" });
    const profile = await findProfileForPostulant(postulant.postulantDocId, postulant.userId, profileId);
    if (!profile) return res.status(404).json({ message: "Perfil no encontrado" });
    const { area, versionId } = req.body;
    if (!area) return res.status(400).json({ message: "area es requerido" });
    let profileVersionId = null;
    try {
      const resolved = await resolveProfileVersionId(profile._id, versionId, res);
      profileVersionId = resolved.profileVersionId;
    } catch (e) {
      if (e.message === "INVALID_VERSION") return;
      throw e;
    }
    const doc = await ProfileInterestArea.create({
      profileId: profile._id,
      profileVersionId: profileVersionId || undefined,
      area,
      dateCreation: new Date(),
      userCreator: req.user?.name || req.user?.email || "api",
    });
    const populated = await ProfileInterestArea.findById(doc._id).populate("area", "value name").lean();
    res.status(201).json(populated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * DELETE /postulants/:id/profiles/:profileId/interest-areas/:interestAreaId
 * Query opcional: versionId — si se envía, solo se elimina el ítem de esa versión.
 */
export const deleteInterestArea = async (req, res) => {
  try {
    const { id, profileId, interestAreaId } = req.params;
    const versionId = req.query.versionId;
    const postulant = await resolvePostulant(id);
    if (!postulant) return res.status(404).json({ message: "Postulante no encontrado" });
    const profile = await findProfileForPostulant(postulant.postulantDocId, postulant.userId, profileId);
    if (!profile) return res.status(404).json({ message: "Perfil no encontrado" });
    let profileVersionId = null;
    try {
      const resolved = await resolveProfileVersionId(profile._id, versionId, res);
      profileVersionId = resolved.profileVersionId;
    } catch (e) {
      if (e.message === "INVALID_VERSION") return;
      throw e;
    }
    const filter = { _id: interestAreaId, profileId: profile._id };
    if (profileVersionId != null) filter.profileVersionId = profileVersionId;
    else filter.$or = [{ profileVersionId: null }, { profileVersionId: { $exists: false } }];
    const deleted = await ProfileInterestArea.findOneAndDelete(filter);
    if (!deleted) return res.status(404).json({ message: "Área de interés no encontrada" });
    res.json({ message: "Eliminado correctamente", deleted: deleted._id });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * POST /postulants/:id/profiles/:profileId/skills
 * Body opcional: versionId — si se envía, el ítem pertenece a esa versión del perfil.
 */
export const createSkill = async (req, res) => {
  try {
    const { id, profileId } = req.params;
    const postulant = await resolvePostulant(id);
    if (!postulant) return res.status(404).json({ message: "Postulante no encontrado" });
    const profile = await findProfileForPostulant(postulant.postulantDocId, postulant.userId, profileId);
    if (!profile) return res.status(404).json({ message: "Perfil no encontrado" });
    const { skillId, experienceYears, versionId } = req.body;
    if (!skillId) return res.status(400).json({ message: "skillId es requerido" });
    let profileVersionId = null;
    try {
      const resolved = await resolveProfileVersionId(profile._id, versionId, res);
      profileVersionId = resolved.profileVersionId;
    } catch (e) {
      if (e.message === "INVALID_VERSION") return;
      throw e;
    }
    const years = experienceYears != null ? Number(experienceYears) : 0;
    const doc = await ProfileSkill.create({
      profileId: profile._id,
      profileVersionId: profileVersionId || undefined,
      skillId,
      experienceYears: Number.isFinite(years) ? years : 0,
      dateCreation: new Date(),
      userCreator: req.user?.name || req.user?.email || "api",
    });
    const populated = await ProfileSkill.findById(doc._id).populate("skillId", "name").lean();
    res.status(201).json(populated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * DELETE /postulants/:id/profiles/:profileId/skills/:skillId
 * Query opcional: versionId — si se envía, solo se elimina el ítem de esa versión.
 */
export const deleteSkill = async (req, res) => {
  try {
    const { id, profileId, skillId } = req.params;
    const versionId = req.query.versionId;
    const postulant = await resolvePostulant(id);
    if (!postulant) return res.status(404).json({ message: "Postulante no encontrado" });
    const profile = await findProfileForPostulant(postulant.postulantDocId, postulant.userId, profileId);
    if (!profile) return res.status(404).json({ message: "Perfil no encontrado" });
    let profileVersionId = null;
    try {
      const resolved = await resolveProfileVersionId(profile._id, versionId, res);
      profileVersionId = resolved.profileVersionId;
    } catch (e) {
      if (e.message === "INVALID_VERSION") return;
      throw e;
    }
    const filter = { _id: skillId, profileId: profile._id };
    if (profileVersionId != null) filter.profileVersionId = profileVersionId;
    else filter.$or = [{ profileVersionId: null }, { profileVersionId: { $exists: false } }];
    const deleted = await ProfileSkill.findOneAndDelete(filter);
    if (!deleted) return res.status(404).json({ message: "Competencia no encontrada" });
    res.json({ message: "Eliminado correctamente", deleted: deleted._id });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * POST /postulants/:id/profiles/:profileId/languages
 * Body opcional: versionId — si se envía, el ítem pertenece a esa versión del perfil.
 */
export const createLanguage = async (req, res) => {
  try {
    const { id, profileId } = req.params;
    const postulant = await resolvePostulant(id);
    if (!postulant) return res.status(404).json({ message: "Postulante no encontrado" });
    const profile = await findProfileForPostulant(postulant.postulantDocId, postulant.userId, profileId);
    if (!profile) return res.status(404).json({ message: "Perfil no encontrado" });
    const { language, level, certificationExam, certificationExamName, versionId } = req.body;
    if (!language) return res.status(400).json({ message: "language es requerido" });
    let profileVersionId = null;
    try {
      const resolved = await resolveProfileVersionId(profile._id, versionId, res);
      profileVersionId = resolved.profileVersionId;
    } catch (e) {
      if (e.message === "INVALID_VERSION") return;
      throw e;
    }
    const doc = await ProfileLanguage.create({
      profileId: profile._id,
      profileVersionId: profileVersionId || undefined,
      language,
      level: level || undefined,
      certificationExam: certificationExam === true || certificationExam === "true",
      certificationExamName: certificationExamName ? String(certificationExamName).trim() : undefined,
      dateCreation: new Date(),
      userCreator: req.user?.name || req.user?.email || "api",
    });
    const populated = await ProfileLanguage.findById(doc._id)
      .populate("language", "value name")
      .populate("level", "value name")
      .lean();
    res.status(201).json(populated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * DELETE /postulants/:id/profiles/:profileId/languages/:languageId
 * Query opcional: versionId — si se envía, solo se elimina el ítem de esa versión.
 */
export const deleteLanguage = async (req, res) => {
  try {
    const { id, profileId, languageId } = req.params;
    const versionId = req.query.versionId;
    const postulant = await resolvePostulant(id);
    if (!postulant) return res.status(404).json({ message: "Postulante no encontrado" });
    const profile = await findProfileForPostulant(postulant.postulantDocId, postulant.userId, profileId);
    if (!profile) return res.status(404).json({ message: "Perfil no encontrado" });
    let profileVersionId = null;
    try {
      const resolved = await resolveProfileVersionId(profile._id, versionId, res);
      profileVersionId = resolved.profileVersionId;
    } catch (e) {
      if (e.message === "INVALID_VERSION") return;
      throw e;
    }
    const filter = { _id: languageId, profileId: profile._id };
    if (profileVersionId != null) filter.profileVersionId = profileVersionId;
    else filter.$or = [{ profileVersionId: null }, { profileVersionId: { $exists: false } }];
    const deleted = await ProfileLanguage.findOneAndDelete(filter);
    if (!deleted) return res.status(404).json({ message: "Idioma no encontrado" });
    res.json({ message: "Eliminado correctamente", deleted: deleted._id });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ---------- Experiencias laborales / otras experiencias ----------
export const createWorkExperience = async (req, res) => {
  try {
    const { id, profileId } = req.params;
    const postulant = await resolvePostulant(id);
    if (!postulant) return res.status(404).json({ message: "Postulante no encontrado" });
    const profile = await findProfileForPostulant(postulant.postulantDocId, postulant.userId, profileId);
    if (!profile) return res.status(404).json({ message: "Perfil no encontrado" });
    let profileVersionId = null;
    const versionId = req.body.versionId;
    if (versionId) {
      try {
        const resolved = await resolveProfileVersionId(profile._id, versionId, res);
        profileVersionId = resolved.profileVersionId;
      } catch (e) {
        if (e.message === "INVALID_VERSION") return;
        throw e;
      }
    }
    const body = req.body;
    const doc = await ProfileWorkExperience.create({
      profileId: profile._id,
      profileVersionId: profileVersionId || undefined,
      experienceType: body.experienceType || "JOB_EXP",
      companyName: body.companyName || undefined,
      companySector: body.companySector || undefined,
      jobTitle: body.jobTitle || undefined,
      profession: body.profession || undefined,
      contact: body.contact || undefined,
      achievements: body.achievements || undefined,
      activities: body.activities || undefined,
      investigationLine: body.investigationLine || undefined,
      course: body.course || undefined,
      countryId: body.countryId || undefined,
      stateId: body.stateId || undefined,
      cityId: body.cityId || undefined,
      startDate: body.startDate ? new Date(body.startDate) : undefined,
      endDate: body.endDate ? new Date(body.endDate) : undefined,
      noEndDate: body.noEndDate === true || body.noEndDate === "true",
      creationDate: new Date(),
    });
    const populated = await ProfileWorkExperience.findById(doc._id)
      .populate("companySector", "value name")
      .populate("countryId", "name")
      .populate("stateId", "name")
      .populate("cityId", "name")
      .lean();
    res.status(201).json(populated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateWorkExperience = async (req, res) => {
  try {
    const { id, profileId, workExperienceId } = req.params;
    const postulant = await resolvePostulant(id);
    if (!postulant) return res.status(404).json({ message: "Postulante no encontrado" });
    const profile = await findProfileForPostulant(postulant.postulantDocId, postulant.userId, profileId);
    if (!profile) return res.status(404).json({ message: "Perfil no encontrado" });
    const work = await ProfileWorkExperience.findOne({ _id: workExperienceId, profileId: profile._id });
    if (!work) return res.status(404).json({ message: "Experiencia no encontrada" });
    const body = req.body;
    if (body.experienceType !== undefined) work.experienceType = body.experienceType;
    if (body.companyName !== undefined) work.companyName = body.companyName;
    if (body.companySector !== undefined) work.companySector = body.companySector;
    if (body.jobTitle !== undefined) work.jobTitle = body.jobTitle;
    if (body.profession !== undefined) work.profession = body.profession;
    if (body.contact !== undefined) work.contact = body.contact;
    if (body.achievements !== undefined) work.achievements = body.achievements;
    if (body.activities !== undefined) work.activities = body.activities;
    if (body.investigationLine !== undefined) work.investigationLine = body.investigationLine;
    if (body.course !== undefined) work.course = body.course;
    if (body.countryId !== undefined) work.countryId = body.countryId;
    if (body.stateId !== undefined) work.stateId = body.stateId;
    if (body.cityId !== undefined) work.cityId = body.cityId;
    if (body.startDate !== undefined) work.startDate = body.startDate ? new Date(body.startDate) : null;
    if (body.endDate !== undefined) work.endDate = body.endDate ? new Date(body.endDate) : null;
    if (body.noEndDate !== undefined) work.noEndDate = body.noEndDate === true || body.noEndDate === "true";
    work.updateDate = new Date();
    await work.save();
    const populated = await ProfileWorkExperience.findById(work._id)
      .populate("companySector", "value name")
      .populate("countryId", "name")
      .populate("stateId", "name")
      .populate("cityId", "name")
      .lean();
    res.json(populated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteWorkExperience = async (req, res) => {
  try {
    const { id, profileId, workExperienceId } = req.params;
    const postulant = await resolvePostulant(id);
    if (!postulant) return res.status(404).json({ message: "Postulante no encontrado" });
    const profile = await findProfileForPostulant(postulant.postulantDocId, postulant.userId, profileId);
    if (!profile) return res.status(404).json({ message: "Perfil no encontrado" });
    const deleted = await ProfileWorkExperience.findOneAndDelete({
      _id: workExperienceId,
      profileId: profile._id,
    });
    if (!deleted) return res.status(404).json({ message: "Experiencia no encontrada" });
    res.json({ message: "Eliminado correctamente", deleted: deleted._id });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/** Obtiene los profileId (base) del postulante excluyendo el actual. */
async function getOtherProfileIdsForPostulant(postulantDocId, userId, currentProfileId) {
  const match = {
    $or: [
      { postulantId: postulantDocId },
      ...(userId ? [{ postulantId: userId }] : []),
    ],
    _id: { $ne: currentProfileId },
  };
  const others = await PostulantProfile.find(match).select("_id").lean();
  return others.map((p) => p._id);
}

/**
 * Filtro para listar ítems "disponibles" (traer de otro perfil): otros perfiles base Y otras versiones del mismo perfil.
 * versionIdActual = req.query.versionId (null si se está viendo el perfil base).
 */
function buildAvailableFilter(profileId, otherProfileIds, versionIdActual) {
  const conditions = [];
  if (otherProfileIds.length > 0) {
    conditions.push({ profileId: { $in: otherProfileIds } });
  }
  if (versionIdActual) {
    conditions.push({
      profileId,
      $or: [
        { profileVersionId: null },
        { profileVersionId: { $exists: false } },
        { profileVersionId: { $ne: versionIdActual } },
      ],
    });
  } else {
    conditions.push({
      profileId,
      profileVersionId: { $exists: true, $ne: null },
    });
  }
  return conditions.length === 0 ? { _id: null } : { $or: conditions };
}

/**
 * GET /postulants/:id/profiles/:profileId/available-work-experiences
 * Lista experiencias de otros perfiles base o de otras versiones del mismo perfil (para traer/copiar al actual).
 * Query opcional: versionId — si se envía, se excluyen las del perfil base y otras versiones; si no, se listan las de las versiones.
 */
export const getAvailableWorkExperiences = async (req, res) => {
  try {
    const { id, profileId } = req.params;
    const versionIdActual = req.query.versionId || null;
    const postulant = await resolvePostulant(id);
    if (!postulant) return res.status(404).json({ message: "Postulante no encontrado" });
    const profile = await findProfileForPostulant(postulant.postulantDocId, postulant.userId, profileId);
    if (!profile) return res.status(404).json({ message: "Perfil no encontrado" });
    const otherIds = await getOtherProfileIdsForPostulant(postulant.postulantDocId, postulant.userId, profile._id);
    const filter = buildAvailableFilter(profile._id, otherIds, versionIdActual);
    if (filter._id === null) return res.json([]);
    const list = await ProfileWorkExperience.find(filter)
      .populate("companySector", "value name")
      .populate("countryId", "name")
      .populate("stateId", "name")
      .populate("cityId", "name")
      .sort({ startDate: -1 })
      .lean();
    res.json(list);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * POST /postulants/:id/profiles/:profileId/work-experiences/copy-from/:sourceWorkExperienceId
 * Duplica una experiencia del perfil origen (A) al perfil actual (B). Se crea un NUEVO documento
 * con profileId = B (perfil destino), para que pertenezca solo a B y no se comparta el registro con A.
 */
export const copyWorkExperienceToProfile = async (req, res) => {
  try {
    const { id, profileId, sourceWorkExperienceId } = req.params;
    const postulant = await resolvePostulant(id);
    if (!postulant) return res.status(404).json({ message: "Postulante no encontrado" });
    const profile = await findProfileForPostulant(postulant.postulantDocId, postulant.userId, profileId);
    if (!profile) return res.status(404).json({ message: "Perfil no encontrado" });
    const source = await ProfileWorkExperience.findById(sourceWorkExperienceId).lean();
    if (!source) return res.status(404).json({ message: "Experiencia origen no encontrada" });
    const sourceProfile = await PostulantProfile.findOne({
      _id: source.profileId,
      $or: [
        { postulantId: postulant.postulantDocId },
        ...(postulant.userId ? [{ postulantId: postulant.userId }] : []),
      ],
    });
    if (!sourceProfile) return res.status(403).json({ message: "La experiencia no pertenece a sus perfiles" });
    const versionId = req.body.versionId;
    const sameProfile = source.profileId.toString() === profile._id.toString();
    const sourceVersionStr = source.profileVersionId ? source.profileVersionId.toString() : null;
    const sameVersion = (sourceVersionStr == null && !versionId) || (sourceVersionStr && versionId && sourceVersionStr === (typeof versionId === "string" ? versionId : versionId?.toString?.()));
    if (sameProfile && sameVersion) {
      return res.status(400).json({ message: "La experiencia ya pertenece a este perfil" });
    }
    let profileVersionId = null;
    if (versionId) {
      try {
        const resolved = await resolveProfileVersionId(profile._id, versionId, res);
        profileVersionId = resolved.profileVersionId;
      } catch (e) {
        if (e.message === "INVALID_VERSION") return;
        throw e;
      }
    }
    const { _id, profileId: _p, profileVersionId: _pv, mysqlId, creationDate, updateDate, ...rest } = source;
    const doc = await ProfileWorkExperience.create({
      ...rest,
      profileId: profile._id,
      profileVersionId: profileVersionId || undefined,
      creationDate: new Date(),
    });
    const populated = await ProfileWorkExperience.findById(doc._id)
      .populate("companySector", "value name")
      .populate("countryId", "name")
      .populate("stateId", "name")
      .populate("cityId", "name")
      .lean();
    res.status(201).json(populated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ---------- Logros (awards) ----------
export const createAward = async (req, res) => {
  try {
    const { id, profileId } = req.params;
    const postulant = await resolvePostulant(id);
    if (!postulant) return res.status(404).json({ message: "Postulante no encontrado" });
    const profile = await findProfileForPostulant(postulant.postulantDocId, postulant.userId, profileId);
    if (!profile) return res.status(404).json({ message: "Perfil no encontrado" });
    const { awardType, name, description, awardDate } = req.body;
    if (!awardType || !name) return res.status(400).json({ message: "awardType y name son requeridos" });
    const doc = await ProfileAward.create({
      profileId: profile._id,
      awardType,
      name: String(name).trim(),
      description: description ? String(description).trim() : undefined,
      awardDate: awardDate ? new Date(awardDate) : undefined,
      dateCreation: new Date(),
      userCreator: req.user?.name || req.user?.email || "api",
    });
    const populated = await ProfileAward.findById(doc._id).populate("awardType", "value name").lean();
    res.status(201).json(populated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateAward = async (req, res) => {
  try {
    const { id, profileId, awardId } = req.params;
    const postulant = await resolvePostulant(id);
    if (!postulant) return res.status(404).json({ message: "Postulante no encontrado" });
    const profile = await findProfileForPostulant(postulant.postulantDocId, postulant.userId, profileId);
    if (!profile) return res.status(404).json({ message: "Perfil no encontrado" });
    const award = await ProfileAward.findOne({ _id: awardId, profileId: profile._id });
    if (!award) return res.status(404).json({ message: "Logro no encontrado" });
    const { awardType, name, description, awardDate } = req.body;
    if (awardType !== undefined) award.awardType = awardType;
    if (name !== undefined) award.name = String(name).trim();
    if (description !== undefined) award.description = description ? String(description).trim() : undefined;
    if (awardDate !== undefined) award.awardDate = awardDate ? new Date(awardDate) : null;
    award.dateUpdate = new Date();
    award.userUpdater = req.user?.name || req.user?.email || "api";
    await award.save();
    const populated = await ProfileAward.findById(award._id).populate("awardType", "value name").lean();
    res.json(populated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteAward = async (req, res) => {
  try {
    const { id, profileId, awardId } = req.params;
    const postulant = await resolvePostulant(id);
    if (!postulant) return res.status(404).json({ message: "Postulante no encontrado" });
    const profile = await findProfileForPostulant(postulant.postulantDocId, postulant.userId, profileId);
    if (!profile) return res.status(404).json({ message: "Perfil no encontrado" });
    const deleted = await ProfileAward.findOneAndDelete({ _id: awardId, profileId: profile._id });
    if (!deleted) return res.status(404).json({ message: "Logro no encontrado" });
    res.json({ message: "Eliminado correctamente", deleted: deleted._id });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * GET /postulants/:id/profiles/:profileId/available-awards
 * Lista logros de otros perfiles del mismo postulante (para traer/copiar al perfil actual).
 */
export const getAvailableAwards = async (req, res) => {
  try {
    const { id, profileId } = req.params;
    const postulant = await resolvePostulant(id);
    if (!postulant) return res.status(404).json({ message: "Postulante no encontrado" });
    const profile = await findProfileForPostulant(postulant.postulantDocId, postulant.userId, profileId);
    if (!profile) return res.status(404).json({ message: "Perfil no encontrado" });
    const otherIds = await getOtherProfileIdsForPostulant(postulant.postulantDocId, postulant.userId, profile._id);
    if (otherIds.length === 0) return res.json([]);
    const list = await ProfileAward.find({ profileId: { $in: otherIds } })
      .populate("awardType", "value name")
      .sort({ awardDate: -1 })
      .lean();
    res.json(list);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * POST /postulants/:id/profiles/:profileId/awards/copy-from/:sourceAwardId
 * Duplica un logro del perfil origen (A) al perfil actual (B). Nuevo documento con profileId = B.
 */
export const copyAwardToProfile = async (req, res) => {
  try {
    const { id, profileId, sourceAwardId } = req.params;
    const postulant = await resolvePostulant(id);
    if (!postulant) return res.status(404).json({ message: "Postulante no encontrado" });
    const profile = await findProfileForPostulant(postulant.postulantDocId, postulant.userId, profileId);
    if (!profile) return res.status(404).json({ message: "Perfil no encontrado" });
    const source = await ProfileAward.findById(sourceAwardId).lean();
    if (!source) return res.status(404).json({ message: "Logro origen no encontrado" });
    const sourceProfile = await PostulantProfile.findOne({
      _id: source.profileId,
      $or: [
        { postulantId: postulant.postulantDocId },
        ...(postulant.userId ? [{ postulantId: postulant.userId }] : []),
      ],
    });
    if (!sourceProfile) return res.status(403).json({ message: "El logro no pertenece a sus perfiles" });
    if (source.profileId.toString() === profile._id.toString()) {
      return res.status(400).json({ message: "El logro ya pertenece a este perfil" });
    }
    const { _id, profileId: _p, mysqlId, dateCreation, dateUpdate, ...rest } = source;
    const doc = await ProfileAward.create({
      ...rest,
      profileId: profile._id,
      dateCreation: new Date(),
      userCreator: req.user?.name || req.user?.email || "api",
    });
    const populated = await ProfileAward.findById(doc._id).populate("awardType", "value name").lean();
    res.status(201).json(populated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ---------- Referencias ----------
export const createReference = async (req, res) => {
  try {
    const { id, profileId } = req.params;
    const postulant = await resolvePostulant(id);
    if (!postulant) return res.status(404).json({ message: "Postulante no encontrado" });
    const profile = await findProfileForPostulant(postulant.postulantDocId, postulant.userId, profileId);
    if (!profile) return res.status(404).json({ message: "Perfil no encontrado" });
    let profileVersionId = null;
    const versionId = req.body.versionId;
    if (versionId) {
      try {
        const resolved = await resolveProfileVersionId(profile._id, versionId, res);
        profileVersionId = resolved.profileVersionId;
      } catch (e) {
        if (e.message === "INVALID_VERSION") return;
        throw e;
      }
    }
    const { firstname, lastname, occupation, phone } = req.body;
    if (!firstname || !lastname || !occupation || !phone) {
      return res.status(400).json({ message: "firstname, lastname, occupation y phone son requeridos" });
    }
    const doc = await ProfileReference.create({
      profileId: profile._id,
      profileVersionId: profileVersionId || undefined,
      firstname: String(firstname).trim(),
      lastname: String(lastname).trim(),
      occupation: String(occupation).trim(),
      phone: String(phone).trim(),
      dateCreation: new Date(),
      userCreator: req.user?.name || req.user?.email || "api",
    });
    res.status(201).json(doc);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateReference = async (req, res) => {
  try {
    const { id, profileId, referenceId } = req.params;
    const postulant = await resolvePostulant(id);
    if (!postulant) return res.status(404).json({ message: "Postulante no encontrado" });
    const profile = await findProfileForPostulant(postulant.postulantDocId, postulant.userId, profileId);
    if (!profile) return res.status(404).json({ message: "Perfil no encontrado" });
    const ref = await ProfileReference.findOne({ _id: referenceId, profileId: profile._id });
    if (!ref) return res.status(404).json({ message: "Referencia no encontrada" });
    const { firstname, lastname, occupation, phone } = req.body;
    if (firstname !== undefined) ref.firstname = String(firstname).trim();
    if (lastname !== undefined) ref.lastname = String(lastname).trim();
    if (occupation !== undefined) ref.occupation = String(occupation).trim();
    if (phone !== undefined) ref.phone = String(phone).trim();
    ref.dateUpdate = new Date();
    ref.userUpdater = req.user?.name || req.user?.email || "api";
    await ref.save();
    res.json(ref);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteReference = async (req, res) => {
  try {
    const { id, profileId, referenceId } = req.params;
    const postulant = await resolvePostulant(id);
    if (!postulant) return res.status(404).json({ message: "Postulante no encontrado" });
    const profile = await findProfileForPostulant(postulant.postulantDocId, postulant.userId, profileId);
    if (!profile) return res.status(404).json({ message: "Perfil no encontrado" });
    const deleted = await ProfileReference.findOneAndDelete({ _id: referenceId, profileId: profile._id });
    if (!deleted) return res.status(404).json({ message: "Referencia no encontrada" });
    res.json({ message: "Eliminado correctamente", deleted: deleted._id });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * GET /postulants/:id/profiles/:profileId/available-references
 * Lista referencias de otros perfiles base o de otras versiones del mismo perfil (para traer/copiar al actual).
 * Query opcional: versionId — si se envía, se excluyen las del perfil base y otras versiones; si no, se listan las de las versiones.
 */
export const getAvailableReferences = async (req, res) => {
  try {
    const { id, profileId } = req.params;
    const versionIdActual = req.query.versionId || null;
    const postulant = await resolvePostulant(id);
    if (!postulant) return res.status(404).json({ message: "Postulante no encontrado" });
    const profile = await findProfileForPostulant(postulant.postulantDocId, postulant.userId, profileId);
    if (!profile) return res.status(404).json({ message: "Perfil no encontrado" });
    const otherIds = await getOtherProfileIdsForPostulant(postulant.postulantDocId, postulant.userId, profile._id);
    const filter = buildAvailableFilter(profile._id, otherIds, versionIdActual);
    if (filter._id === null) return res.json([]);
    const list = await ProfileReference.find(filter).lean();
    res.json(list);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * POST /postulants/:id/profiles/:profileId/references/copy-from/:sourceReferenceId
 * Duplica una referencia del perfil origen (A) al perfil actual (B). Nuevo documento con profileId = B.
 */
export const copyReferenceToProfile = async (req, res) => {
  try {
    const { id, profileId, sourceReferenceId } = req.params;
    const postulant = await resolvePostulant(id);
    if (!postulant) return res.status(404).json({ message: "Postulante no encontrado" });
    const profile = await findProfileForPostulant(postulant.postulantDocId, postulant.userId, profileId);
    if (!profile) return res.status(404).json({ message: "Perfil no encontrado" });
    const source = await ProfileReference.findById(sourceReferenceId).lean();
    if (!source) return res.status(404).json({ message: "Referencia origen no encontrada" });
    const sourceProfile = await PostulantProfile.findOne({
      _id: source.profileId,
      $or: [
        { postulantId: postulant.postulantDocId },
        ...(postulant.userId ? [{ postulantId: postulant.userId }] : []),
      ],
    });
    if (!sourceProfile) return res.status(403).json({ message: "La referencia no pertenece a sus perfiles" });
    const versionId = req.body.versionId;
    const sameProfile = source.profileId.toString() === profile._id.toString();
    const sourceVersionStr = source.profileVersionId ? source.profileVersionId.toString() : null;
    const sameVersion = (sourceVersionStr == null && !versionId) || (sourceVersionStr && versionId && sourceVersionStr === (typeof versionId === "string" ? versionId : versionId?.toString?.()));
    if (sameProfile && sameVersion) {
      return res.status(400).json({ message: "La referencia ya pertenece a este perfil" });
    }
    let profileVersionId = null;
    if (versionId) {
      try {
        const resolved = await resolveProfileVersionId(profile._id, versionId, res);
        profileVersionId = resolved.profileVersionId;
      } catch (e) {
        if (e.message === "INVALID_VERSION") return;
        throw e;
      }
    }
    const { _id, profileId: _p, profileVersionId: _pv, mysqlId, dateCreation, dateUpdate, ...rest } = source;
    const doc = await ProfileReference.create({
      ...rest,
      profileId: profile._id,
      profileVersionId: profileVersionId || undefined,
      dateCreation: new Date(),
      userCreator: req.user?.name || req.user?.email || "api",
    });
    res.status(201).json(doc);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const S3_PREFIX_HOJAS_VIDA = "hojas-vida";

/**
 * DELETE /postulants/:id/profiles/:profileId/cvs/:profileCvId
 * Elimina una hoja de vida (documento CV) del perfil: borra ProfileCv, el Attachment y el archivo en S3 si aplica.
 */
export const deleteProfileCv = async (req, res) => {
  try {
    const { id, profileId, profileCvId } = req.params;
    const postulant = await resolvePostulant(id);
    if (!postulant) return res.status(404).json({ message: "Postulante no encontrado" });
    const profile = await findProfileForPostulant(postulant.postulantDocId, postulant.userId, profileId);
    if (!profile) return res.status(404).json({ message: "Perfil no encontrado" });
    const deleted = await ProfileCv.findOneAndDelete({ _id: profileCvId, profileId: profile._id });
    if (!deleted) return res.status(404).json({ message: "Hoja de vida no encontrada" });

    const attachmentId = deleted.attachmentId;
    if (attachmentId) {
      const attachment = await Attachment.findById(attachmentId).lean();
      if (attachment?.filepath && s3Config.isConfigured && attachment.filepath.startsWith(`${S3_PREFIX_HOJAS_VIDA}/`)) {
        try {
          await deleteFromS3(attachment.filepath);
        } catch (err) {
          console.error("[deleteProfileCv] Error eliminando archivo en S3:", err);
        }
      }
      await Attachment.findByIdAndDelete(attachmentId);
    }

    res.json({ message: "Eliminado correctamente", deleted: deleted._id });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * DELETE /postulants/:id/profiles/:profileId/supports/:profileSupportId
 * Elimina un documento de soporte del perfil.
 */
export const deleteProfileSupport = async (req, res) => {
  try {
    const { id, profileId, profileSupportId } = req.params;
    const postulant = await resolvePostulant(id);
    if (!postulant) return res.status(404).json({ message: "Postulante no encontrado" });
    const profile = await findProfileForPostulant(postulant.postulantDocId, postulant.userId, profileId);
    if (!profile) return res.status(404).json({ message: "Perfil no encontrado" });
    const deleted = await ProfileSupport.findOneAndDelete({ _id: profileSupportId, profileId: profile._id });
    if (!deleted) return res.status(404).json({ message: "Documento de soporte no encontrado" });
    res.json({ message: "Eliminado correctamente", deleted: deleted._id });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
