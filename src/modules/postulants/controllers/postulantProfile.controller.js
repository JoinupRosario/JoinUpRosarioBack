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
 * Lista solo las versiones de perfil (profile_profile_version) del postulante.
 * El perfil principal (postulant_profile) no se lista ni se elimina desde aquí.
 */
export const getProfilesByPostulantId = async (req, res) => {
  try {
    const { id } = req.params;
    const postulant = await resolvePostulant(id);
    if (!postulant) {
      return res.status(404).json({ message: "Postulante no encontrado" });
    }
    const { postulantDocId, userId } = postulant;
    const baseProfiles = await PostulantProfile.find({
      $or: [
        { postulantId: postulantDocId },
        ...(userId ? [{ postulantId: userId }] : []),
      ],
    })
      .select("_id")
      .lean();
    const profileIds = baseProfiles.map((p) => p._id);
    const versions =
      profileIds.length > 0
        ? await ProfileProfileVersion.find({ profileId: { $in: profileIds } })
            .sort({ dateCreation: 1 })
            .lean()
        : [];

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
    }));

    res.json({
      postulantId: postulantDocId,
      count: profiles.length,
      totalVersions: profiles.length,
      maxAllowed: MAX_PROFILES_PER_POSTULANT,
      profiles,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * POST /postulants/:id/profiles
 * Crea una nueva versión de perfil (profile_profile_version). No crea perfil base (postulant_profile).
 * Usa o crea un perfil base del postulante como padre. Máximo MAX_PROFILES_PER_POSTULANT versiones.
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
 * Elimina solo una versión (profile_profile_version). No se elimina nunca el perfil principal (postulant_profile).
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
    return res.json({ message: "Versión de perfil eliminada correctamente", deleted: deletedVersion._id });
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
      .populate("programId", "name code")
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
      .populate("programId", "name code")
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
      .populate("programId", "name code")
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
      .populate("programId", "name code")
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
 */
export const createInterestArea = async (req, res) => {
  try {
    const { id, profileId } = req.params;
    const postulant = await resolvePostulant(id);
    if (!postulant) return res.status(404).json({ message: "Postulante no encontrado" });
    const profile = await findProfileForPostulant(postulant.postulantDocId, postulant.userId, profileId);
    if (!profile) return res.status(404).json({ message: "Perfil no encontrado" });
    const { area } = req.body;
    if (!area) return res.status(400).json({ message: "area es requerido" });
    const doc = await ProfileInterestArea.create({
      profileId: profile._id,
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
 */
export const deleteInterestArea = async (req, res) => {
  try {
    const { id, profileId, interestAreaId } = req.params;
    const postulant = await resolvePostulant(id);
    if (!postulant) return res.status(404).json({ message: "Postulante no encontrado" });
    const profile = await findProfileForPostulant(postulant.postulantDocId, postulant.userId, profileId);
    if (!profile) return res.status(404).json({ message: "Perfil no encontrado" });
    const deleted = await ProfileInterestArea.findOneAndDelete({
      _id: interestAreaId,
      profileId: profile._id,
    });
    if (!deleted) return res.status(404).json({ message: "Área de interés no encontrada" });
    res.json({ message: "Eliminado correctamente", deleted: deleted._id });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * POST /postulants/:id/profiles/:profileId/skills
 */
export const createSkill = async (req, res) => {
  try {
    const { id, profileId } = req.params;
    const postulant = await resolvePostulant(id);
    if (!postulant) return res.status(404).json({ message: "Postulante no encontrado" });
    const profile = await findProfileForPostulant(postulant.postulantDocId, postulant.userId, profileId);
    if (!profile) return res.status(404).json({ message: "Perfil no encontrado" });
    const { skillId, experienceYears } = req.body;
    if (!skillId) return res.status(400).json({ message: "skillId es requerido" });
    const years = experienceYears != null ? Number(experienceYears) : 0;
    const doc = await ProfileSkill.create({
      profileId: profile._id,
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
 */
export const deleteSkill = async (req, res) => {
  try {
    const { id, profileId, skillId } = req.params;
    const postulant = await resolvePostulant(id);
    if (!postulant) return res.status(404).json({ message: "Postulante no encontrado" });
    const profile = await findProfileForPostulant(postulant.postulantDocId, postulant.userId, profileId);
    if (!profile) return res.status(404).json({ message: "Perfil no encontrado" });
    const deleted = await ProfileSkill.findOneAndDelete({
      _id: skillId,
      profileId: profile._id,
    });
    if (!deleted) return res.status(404).json({ message: "Competencia no encontrada" });
    res.json({ message: "Eliminado correctamente", deleted: deleted._id });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * POST /postulants/:id/profiles/:profileId/languages
 */
export const createLanguage = async (req, res) => {
  try {
    const { id, profileId } = req.params;
    const postulant = await resolvePostulant(id);
    if (!postulant) return res.status(404).json({ message: "Postulante no encontrado" });
    const profile = await findProfileForPostulant(postulant.postulantDocId, postulant.userId, profileId);
    if (!profile) return res.status(404).json({ message: "Perfil no encontrado" });
    const { language, level, certificationExam, certificationExamName } = req.body;
    if (!language) return res.status(400).json({ message: "language es requerido" });
    const doc = await ProfileLanguage.create({
      profileId: profile._id,
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
 */
export const deleteLanguage = async (req, res) => {
  try {
    const { id, profileId, languageId } = req.params;
    const postulant = await resolvePostulant(id);
    if (!postulant) return res.status(404).json({ message: "Postulante no encontrado" });
    const profile = await findProfileForPostulant(postulant.postulantDocId, postulant.userId, profileId);
    if (!profile) return res.status(404).json({ message: "Perfil no encontrado" });
    const deleted = await ProfileLanguage.findOneAndDelete({
      _id: languageId,
      profileId: profile._id,
    });
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
    const body = req.body;
    const doc = await ProfileWorkExperience.create({
      profileId: profile._id,
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

// ---------- Referencias ----------
export const createReference = async (req, res) => {
  try {
    const { id, profileId } = req.params;
    const postulant = await resolvePostulant(id);
    if (!postulant) return res.status(404).json({ message: "Postulante no encontrado" });
    const profile = await findProfileForPostulant(postulant.postulantDocId, postulant.userId, profileId);
    if (!profile) return res.status(404).json({ message: "Perfil no encontrado" });
    const { firstname, lastname, occupation, phone } = req.body;
    if (!firstname || !lastname || !occupation || !phone) {
      return res.status(400).json({ message: "firstname, lastname, occupation y phone son requeridos" });
    }
    const doc = await ProfileReference.create({
      profileId: profile._id,
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
