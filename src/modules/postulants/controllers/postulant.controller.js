import Postulant from "../models/postulants.schema.js";
import PostulantProfile from "../models/postulant_profile.schema.js";
import User from "../../users/user.model.js";
import PostulantStatusHistory from "../models/logs/postulantLogStatus.schema.js";
import {
  ProfileEnrolledProgram,
  ProfileGraduateProgram,
  ProfileProgramExtraInfo,
  ProfileWorkExperience,
  ProfileSkill,
  ProfileLanguage,
  ProfileAward,
  ProfileReference,
  ProfileOtherStudy,
  ProfileInterestArea,
} from "../models/profile/index.js";
import "../../faculty/model/faculty.model.js"; // Registra modelo Faculty para populate programFacultyId.facultyId
import fs from "fs";
import path from "path";

export const getPostulants = async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const { status, search } = req.query;

    const postulantFilter = {};
    if (status && String(status).trim()) postulantFilter.estatePostulant = String(status).trim();

    if (search && String(search).trim()) {
      const term = String(search).trim();
      const users = await User.find({
        $or: [
          { name: { $regex: term, $options: "i" } },
          { email: { $regex: term, $options: "i" } },
          { code: { $regex: term, $options: "i" } },
        ],
      })
        .select("_id")
        .lean();
      const userIds = users.map((u) => u._id);
      if (userIds.length) postulantFilter.postulantId = { $in: userIds };
      else postulantFilter.postulantId = { $in: [] };
    }

    const [postulants, total] = await Promise.all([
      Postulant.find(postulantFilter)
        .populate("postulantId", "_id name email code")
        .sort({ updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Postulant.countDocuments(postulantFilter),
    ]);

    const data = postulants.map((p) => ({
      _id: p._id,
      identity_postulant: p.postulantId?.code ?? null,
      estate_postulant: p.estatePostulant ?? null,
      full_profile: p.filled ?? false,
      filling_percentage: p.fillingPercentage ?? calculateCompleteness(p),
      updatedAt: p.updatedAt,
      user: p.postulantId
        ? {
            _id: p.postulantId._id,
            name: p.postulantId.name || "",
            lastname: "",
            email: p.postulantId.email || "",
            code: p.postulantId.code || null,
          }
        : null,
    }));

    res.json({
      data,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const createPostulant = async (req, res) => {
  try {
    const { identity_postulant, user } = req.body;

    let userId = user;
    if (!userId && identity_postulant) {
      const foundUser = await User.findOne({ code: identity_postulant.trim() });
      if (!foundUser) {
        return res.status(404).json({
          message: `No se encontró un usuario con código/identificación: ${identity_postulant}. Debe crear el usuario primero.`,
        });
      }
      userId = foundUser._id;
    }

    if (!userId) {
      return res.status(400).json({
        message:
          "Se requiere un usuario. Proporcione 'user' o 'identity_postulant' para buscar el usuario.",
      });
    }

    const postulantExists = await Postulant.findOne({
      postulantId: userId,
    });

    if (postulantExists) {
      return res.status(400).json({
        message: "Este usuario ya tiene un postulante asociado",
      });
    }

    const postulantData = {
      ...req.body,
      postulantId: userId,
    };

    const postulant = new Postulant(postulantData);
    postulant.fillingPercentage = calculateCompleteness(postulant);
    await postulant.save();

    await postulant.populate("postulantId", "_id name email code");

    res.status(201).json(postulant);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getPostulantById = async (req, res) => {
  try {
    const { id } = req.params;

    let postulant = await Postulant.findById(id)
      .populate("postulantId", "name email code")
      .populate("countryBirthId", "name")
      .populate("stateBirthId", "name")
      .populate({ path: "cityBirthId", select: "name", populate: { path: "state", select: "name" } })
      .populate("countryResidenceId", "name")
      .populate("stateResidenceId", "name")
      .populate({ path: "cityResidenceId", select: "name", populate: { path: "state", select: "name" } })
      .populate("typeOfIdentification", "name value")
      .populate("gender", "name value")
      .lean();

    if (!postulant) {
      postulant = await Postulant.findOne({ postulantId: id })
        .populate("postulantId", "name email code")
        .populate("countryBirthId", "name")
        .populate("stateBirthId", "name")
        .populate({ path: "cityBirthId", select: "name", populate: { path: "state", select: "name" } })
        .populate("countryResidenceId", "name")
        .populate("stateResidenceId", "name")
        .populate({ path: "cityResidenceId", select: "name", populate: { path: "state", select: "name" } })
        .populate("typeOfIdentification", "name value")
        .populate("gender", "name value")
        .lean();
    }

    if (!postulant) {
      return res.status(404).json({ message: "postulant not found" });
    }

    const fillingPercentage = postulant.fillingPercentage ?? calculateCompleteness(postulant);
    const user = postulant.postulantId
      ? { name: postulant.postulantId.name, email: postulant.postulantId.email, code: postulant.postulantId.code }
      : null;

    res.json(formatPostulantProfileResponse(postulant));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/** GET /postulants/:id/profile-data — Datos migrados del perfil (PostulantProfile + profile_*) */
export const getPostulantProfileData = async (req, res) => {
  try {
    const { id } = req.params;
    let postulant = await Postulant.findById(id).select("_id").lean();
    if (!postulant) {
      postulant = await Postulant.findOne({ postulantId: id }).select("_id").lean();
    }
    if (!postulant) {
      return res.status(404).json({ message: "Postulante no encontrado" });
    }
    const postulantDocId = postulant._id;

    const postulantProfile = await PostulantProfile.findOne({ postulantId: postulantDocId })
      .populate("levelJob", "value name")
      .populate("companySector", "value name")
      .lean();
    if (!postulantProfile) {
      return res.json({
        postulantProfile: null,
        enrolledPrograms: [],
        graduatePrograms: [],
        programExtraInfo: [],
        workExperiences: [],
        skills: [],
        languages: [],
        awards: [],
        references: [],
        otherStudies: [],
        interestAreas: [],
      });
    }

    const profileId = postulantProfile._id;
    const [
      enrolledPrograms,
      graduatePrograms,
      workExperiences,
      skills,
      languages,
      awards,
      references,
      otherStudies,
      interestAreas,
    ] = await Promise.all([
      ProfileEnrolledProgram.find({ profileId })
        .populate("programId", "name code")
        .populate({ path: "programFacultyId", select: "code facultyId", populate: { path: "facultyId", select: "name" } })
        .populate("countryId", "name")
        .populate("stateId", "name")
        .populate("cityId", "name")
        .lean(),
      ProfileGraduateProgram.find({ profileId })
        .populate("programId", "name code")
        .populate({ path: "programFacultyId", select: "code facultyId", populate: { path: "facultyId", select: "name" } })
        .populate("countryId", "name")
        .populate("stateId", "name")
        .populate("cityId", "name")
        .lean(),
      ProfileWorkExperience.find({ profileId })
        .populate("companySector", "value name")
        .populate("countryId", "name")
        .populate("stateId", "name")
        .populate("cityId", "name")
        .lean(),
      ProfileSkill.find({ profileId }).populate("skillId", "name").lean(),
      ProfileLanguage.find({ profileId })
        .populate("language", "value name")
        .populate("level", "value name")
        .lean(),
      ProfileAward.find({ profileId }).populate("awardType", "value name").lean(),
      ProfileReference.find({ profileId }).lean(),
      ProfileOtherStudy.find({ profileId }).lean(),
      ProfileInterestArea.find({ profileId }).populate("area", "value name").lean(),
    ]);

    const enrolledIds = enrolledPrograms.map((e) => e._id);
    const programExtraInfoFiltered =
      enrolledIds.length > 0
        ? await ProfileProgramExtraInfo.find({ enrolledProgramId: { $in: enrolledIds } }).lean()
        : [];

    res.json({
      postulantProfile,
      enrolledPrograms,
      graduatePrograms,
      programExtraInfo: programExtraInfoFiltered,
      workExperiences,
      skills,
      languages,
      awards,
      references,
      otherStudies,
      interestAreas,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

function mapProfileBodyToPostulant(body) {
  const mapped = { ...body };
  if (mapped.date_nac_postulant !== undefined) {
    mapped.dateBirth = mapped.date_nac_postulant;
    delete mapped.date_nac_postulant;
  }
  if (mapped.nac_country !== undefined) {
    mapped.countryBirthId = mapped.nac_country || null;
    delete mapped.nac_country;
  }
  if (mapped.nac_department !== undefined) {
    mapped.stateBirthId = mapped.nac_department || null;
    delete mapped.nac_department;
  }
  if (mapped.nac_city !== undefined) {
    mapped.cityBirthId = mapped.nac_city || null;
    delete mapped.nac_city;
  }
  if (mapped.residence_country !== undefined) {
    mapped.countryResidenceId = mapped.residence_country || null;
    delete mapped.residence_country;
  }
  if (mapped.residence_department !== undefined) {
    mapped.stateResidenceId = mapped.residence_department || null;
    delete mapped.residence_department;
  }
  if (mapped.residence_city !== undefined) {
    mapped.cityResidenceId = mapped.residence_city || null;
    delete mapped.residence_city;
  }
  if (mapped.phone_number !== undefined) {
    mapped.phone = mapped.phone_number || null;
    delete mapped.phone_number;
  }
  if (mapped.mobile_number !== undefined) {
    mapped.phone = mapped.mobile_number || mapped.phone || null;
    delete mapped.mobile_number;
  }
  if (mapped.linkedin_url !== undefined) {
    mapped.linkedinLink = mapped.linkedin_url || null;
    delete mapped.linkedin_url;
  }
  if (mapped.twitter_url !== undefined) {
    mapped.twitter = mapped.twitter_url || null;
    delete mapped.twitter_url;
  }
  if (mapped.instagram_url !== undefined) {
    mapped.instagram = mapped.instagram_url || null;
    delete mapped.instagram_url;
  }
  if (mapped.website_url !== undefined) {
    mapped.personalWebsite = mapped.website_url || null;
    delete mapped.website_url;
  }
  if (mapped.profile_picture !== undefined) {
    mapped.photoId = mapped.profile_picture;
    delete mapped.profile_picture;
  }
  if (mapped.type_doc_postulant !== undefined) {
    mapped.typeOfIdentification = mapped.type_doc_postulant || null;
    delete mapped.type_doc_postulant;
  }
  delete mapped.identity_postulant;
  delete mapped.user;
  delete mapped.full_profile;
  delete mapped.filling_percentage;
  delete mapped.acept_terms;
  return mapped;
}

export const updatePostulant = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const postulant = await Postulant.findById(id);

    if (!postulant) {
      return res.status(404).json({ message: "postulant not found" });
    }

    const previousStatus = postulant.estatePostulant;
    const newStatus = req.body.estate_postulant ?? req.body.estatePostulant;

    const body = { ...req.body };
    if (body.estate_postulant !== undefined) {
      body.estatePostulant = body.estate_postulant;
      delete body.estate_postulant;
    }
    const mapped = mapProfileBodyToPostulant(body);
    Object.assign(postulant, mapped);
    postulant.fillingPercentage = calculateCompleteness(postulant);
    await postulant.save();

    if (newStatus && previousStatus !== newStatus) {
      await PostulantStatusHistory.create({
        postulant: postulant._id,
        status_before: previousStatus,
        status_after: newStatus,
        reason: req.body.reason || null,
        changed_by: userId,
        user_type: req.user.role,
      });
    }

    const updated = await Postulant.findById(postulant._id)
      .populate("postulantId", "name email code")
      .populate("countryBirthId", "name")
      .populate("stateBirthId", "name")
      .populate({ path: "cityBirthId", select: "name", populate: { path: "state", select: "name" } })
      .populate("countryResidenceId", "name")
      .populate("stateResidenceId", "name")
      .populate({ path: "cityResidenceId", select: "name", populate: { path: "state", select: "name" } })
      .populate("typeOfIdentification", "name value")
      .populate("gender", "name value")
      .lean();
    res.json(formatPostulantProfileResponse(updated));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * Resuelve el departamento (state) para mostrar: siempre país → departamento → ciudad.
 * Usa state cuando existe; si no, deriva del estado padre de la ciudad.
 * Si departamento y ciudad tienen el mismo nombre (ej. Bogotá D.C.), devuelve etiqueta
 * que distingue el nivel departamento para evitar confusión.
 */
function resolveDepartmentDisplay(stateDoc, cityDoc) {
  const state = stateDoc || cityDoc?.state;
  if (!state) return null;
  const stateName = (state && state.name) ? state.name : (typeof state === "string" ? state : null);
  if (!stateName) return null;
  const cityName = cityDoc?.name;
  const sameName = cityName && String(stateName).trim() === String(cityName).trim();
  const id = state._id || state;
  if (sameName && /bogotá\s*d\.?\s*c\.?/i.test(stateName)) {
    return { _id: id, name: "Bogotá D.C. (Distrito Capital)" };
  }
  if (sameName) {
    return { _id: id, name: `${stateName} (departamento)` };
  }
  return { _id: id, name: stateName };
}

function formatPostulantProfileResponse(p) {
  if (!p) return null;
  const fillingPercentage = p.fillingPercentage ?? calculateCompleteness(p);
  const user = p.postulantId
    ? { name: p.postulantId.name, email: p.postulantId.email, code: p.postulantId.code }
    : null;
  const photoId = p.photoId;
  const profilePicture =
    typeof photoId === "string" && photoId.length > 0 && (photoId.includes("upload") || photoId.startsWith("src/"))
      ? photoId
      : null;
  const nac_department = resolveDepartmentDisplay(p.stateBirthId, p.cityBirthId);
  const residence_department = resolveDepartmentDisplay(p.stateResidenceId, p.cityResidenceId);
  return {
    ...p,
    profile_picture: profilePicture,
    identity_postulant: p.postulantId?.code ?? null,
    user,
    full_profile: p.filled ?? false,
    filling_percentage: fillingPercentage,
    type_doc_postulant: p.typeOfIdentification,
    gender_postulant: p.gender,
    date_nac_postulant: p.dateBirth,
    nac_country: p.countryBirthId,
    nac_department,
    nac_city: p.cityBirthId,
    residence_country: p.countryResidenceId,
    residence_department: residence_department,
    residence_city: p.cityResidenceId,
    phone_number: p.phone ?? null,
    mobile_number: p.phone ?? null,
    linkedin_url: p.linkedinLink ?? null,
    twitter_url: p.twitter ?? null,
    instagram_url: p.instagram ?? null,
    website_url: p.personalWebsite ?? null,
    acept_terms: false,
  };
}

/**
 * Calcula el porcentaje de completitud del perfil del postulante (0-100)
 * según datos básicos del documento Postulant.
 */
function calculateCompleteness(postulant) {
  const fields = [
    postulant.postulantId,
    postulant.typeOfIdentification,
    postulant.gender,
    postulant.dateBirth,
    postulant.phone,
    postulant.address,
    postulant.alternateEmail,
    postulant.countryBirthId,
    postulant.stateBirthId,
    postulant.cityBirthId,
    postulant.countryResidenceId,
    postulant.stateResidenceId,
    postulant.cityResidenceId,
  ];
  const completed = fields.filter(Boolean).length;
  return Math.min(100, Math.round((completed / fields.length) * 100));
}

export const uploadProfilePicture = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No se proporcionó archivo" });
    }

    const { id } = req.params;
    const postulant = await Postulant.findById(id);

    if (!postulant) {
      return res.status(404).json({ message: "Postulante no encontrado" });
    }

    if (postulant.photoId && typeof postulant.photoId === "string") {
      const oldPath = postulant.photoId.startsWith("src/")
        ? postulant.photoId
        : `src/${postulant.photoId}`;
      const filePath = path.resolve(oldPath);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (err) {
          console.error("Error al eliminar foto anterior:", err);
        }
      }
    }

    const rawPath = req.file.path;
    const imagePath = rawPath.replace(/^src[/\\]/, "").replace(/\\/g, "/");
    postulant.photoId = imagePath;
    await postulant.save();

    res.json({
      message: "Foto de perfil subida correctamente",
      profile_picture: postulant.photoId,
    });
  } catch (error) {
    console.error("Error en uploadProfilePicture:", error);
    res.status(500).json({
      message: error.message || "Error interno del servidor al subir la foto",
      error: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
};
