import Postulant from "../models/postulants.schema.js";
import PostulantProfile from "../models/profile/profile.schema.js";
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
  ProfileCv,
  ProfileSupport,
  ProfileInfoPermission,
  ProfileProfileVersion,
} from "../models/profile/index.js";
import "../../faculty/model/faculty.model.js"; // Registra modelo Faculty para populate programFacultyId.facultyId
import { MAX_PROFILES_PER_POSTULANT } from "./postulantProfile.controller.js";
import { consultaInfEstudiante, consultaInfAcademica } from "../../../services/uxxiIntegration.service.js";
import Program from "../../program/model/program.model.js";
import Item from "../../shared/reference-data/models/item.schema.js";
import Attachment from "../../shared/attachment/attachment.schema.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const getPostulants = async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const { status, search } = req.query;

    const postulantFilter = {};
    if (status && String(status).trim()) postulantFilter.estatePostulant = String(status).trim();

    if (search && String(search).trim()) {
      const term = String(search).trim();
      const regexOpt = { $regex: term, $options: "i" };
      const [users, profilesWithStudentCode] = await Promise.all([
        User.find({
          $or: [
            { name: regexOpt },
            { email: regexOpt },
            { code: regexOpt },
          ],
        })
          .select("_id")
          .lean(),
        PostulantProfile.find({ studentCode: regexOpt }).select("postulantId").lean(),
      ]);
      const userIds = users.map((u) => u._id);
      const postulantDocIds = profilesWithStudentCode.map((p) => p.postulantId).filter(Boolean);
      const orClause = [];
      if (userIds.length) orClause.push({ postulantId: { $in: userIds } });
      if (postulantDocIds.length) orClause.push({ _id: { $in: postulantDocIds } });
      if (orClause.length) postulantFilter.$or = orClause;
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

    const postulantIds = postulants.map((p) => p._id);
    const [profileCounts, profileStudentCodes] = await Promise.all([
      postulantIds.length > 0
        ? PostulantProfile.aggregate([
            { $match: { postulantId: { $in: postulantIds } } },
            { $group: { _id: "$postulantId", count: { $sum: 1 } } },
          ])
        : [],
      postulantIds.length > 0
        ? PostulantProfile.aggregate([
            { $match: { postulantId: { $in: postulantIds } } },
            { $sort: { createdAt: -1 } },
            { $group: { _id: "$postulantId", studentCode: { $first: "$studentCode" } } },
          ])
        : [],
    ]);
    const countByPostulantId = new Map(profileCounts.map((c) => [c._id.toString(), c.count]));
    const studentCodeByPostulantId = new Map(
      profileStudentCodes.map((s) => [s._id.toString(), s.studentCode != null && s.studentCode !== "" ? String(s.studentCode).trim() : null])
    );

    const data = postulants.map((p) => ({
      _id: p._id,
      identity_postulant: p.postulantId?.code ?? null,
      student_code: studentCodeByPostulantId.get(p._id.toString()) ?? null,
      estate_postulant: p.estatePostulant ?? null,
      full_profile: p.filled ?? false,
      filling_percentage: p.fillingPercentage ?? calculateCompleteness(p),
      updatedAt: p.updatedAt,
      profileCount: countByPostulantId.get(p._id.toString()) ?? 0,
      maxProfilesAllowed: MAX_PROFILES_PER_POSTULANT,
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

const UNIVERSITAS_FIELD_LABELS = {
  nombre_completo: "Nombre completo",
  tipo_documento: "Tipo de documento",
  sexo: "Sexo",
  telefono: "Teléfono",
  celular: "Celular",
  direccion: "Dirección",
  correo_personal: "Correo (personal)",
  correo_institucional: "Correo institucional",
};
const LIST_ID_TYPE_DOC = "L_IDENTIFICATIONTYPE";
const LIST_ID_GENDER = "L_GENDER";

function normalizeStr(v) {
  if (v == null || v === "") return "";
  return String(v).trim();
}

/**
 * Compara datos del postulante (BD) con datos de Universitas. currentAcademicUser = academicUser del PostulantProfile.
 */
function comparePostulantWithUniversitas(postulant, uni, currentAcademicUser = "") {
  const changes = [];
  const nombreCompletoUni = [uni.nombre, uni.primer_apellido, uni.segundo_apellido].filter(Boolean).join(" ").trim();
  const currentNombre = normalizeStr(postulant.postulantId?.name);
  if (nombreCompletoUni && nombreCompletoUni !== currentNombre) {
    changes.push({ label: UNIVERSITAS_FIELD_LABELS.nombre_completo, valorActual: currentNombre || "—", valorNuevo: nombreCompletoUni });
  }
  const currentType = normalizeStr(postulant.typeOfIdentification?.value ?? postulant.typeOfIdentification?.name);
  const tipoDocUni = normalizeStr(uni.tipo_documento);
  if (tipoDocUni && tipoDocUni !== currentType) {
    changes.push({ label: UNIVERSITAS_FIELD_LABELS.tipo_documento, valorActual: currentType || "—", valorNuevo: tipoDocUni });
  }
  const currentPhone = normalizeStr(postulant.phone);
  const telefonoUni = normalizeStr(uni.telefono);
  const celularUni = normalizeStr(uni.celular);
  const phoneUni = telefonoUni || celularUni;
  if (phoneUni && phoneUni !== currentPhone) {
    changes.push({ label: UNIVERSITAS_FIELD_LABELS.telefono, valorActual: currentPhone || "—", valorNuevo: phoneUni });
  }
  if (celularUni && celularUni !== currentPhone && celularUni !== telefonoUni) {
    changes.push({ label: UNIVERSITAS_FIELD_LABELS.celular, valorActual: currentPhone || "—", valorNuevo: celularUni });
  }
  const direccionUni = normalizeStr(uni.direccion);
  const currentAddress = normalizeStr(postulant.address);
  if (direccionUni !== currentAddress) {
    changes.push({ label: UNIVERSITAS_FIELD_LABELS.direccion, valorActual: currentAddress || "—", valorNuevo: direccionUni });
  }
  const currentSexo = normalizeStr(postulant.gender?.value ?? postulant.gender?.name);
  const sexoUni = normalizeStr(uni.sexo);
  if (sexoUni && sexoUni !== currentSexo) {
    changes.push({ label: UNIVERSITAS_FIELD_LABELS.sexo, valorActual: currentSexo || "—", valorNuevo: sexoUni });
  }
  const correoPersonalUni = normalizeStr(uni.correo_personal);
  const currentEmail = normalizeStr(postulant.postulantId?.email);
  if (correoPersonalUni && correoPersonalUni !== currentEmail) {
    changes.push({ label: UNIVERSITAS_FIELD_LABELS.correo_personal, valorActual: currentEmail || "—", valorNuevo: correoPersonalUni });
  }
  const correoInstUni = normalizeStr(uni.correo_institucioinal);
  const currentAcademic = normalizeStr(currentAcademicUser);
  if (correoInstUni !== currentAcademic) {
    changes.push({ label: UNIVERSITAS_FIELD_LABELS.correo_institucional, valorActual: currentAcademic || "—", valorNuevo: correoInstUni });
  }
  return changes;
}

/**
 * GET test: prueba la API OSB Consulta_inf_estudiante con un documento.
 * Query: documento= (ej. studentCode). Útil para probar desde Postman/curl.
 */
export const testConsultaUniversitas = async (req, res) => {
  try {
    const documento = (req.query.documento || req.body?.documento || "").toString().trim();
    if (!documento) return res.status(400).json({ message: "Query documento es requerido (ej. ?documento=80196661)." });
    const data = await consultaInfEstudiante(documento);
    if (!data) return res.status(404).json({ message: "No se encontró información del estudiante en Universitas.", documento });
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * GET test: prueba la API OSB Consulta_inf_academica con un documento.
 * Query: documento= (ej. 1107524684). Sin auth. Útil para verificar que la petición a Universitas funciona.
 */
export const testConsultaAcademicaUniversitas = async (req, res) => {
  try {
    const documento = (req.query.documento || req.body?.documento || "").toString().trim();
    if (!documento) return res.status(400).json({ message: "Query documento es requerido (ej. ?documento=1107524684)." });
    const items = await consultaInfAcademica(documento);
    if (!items || items.length === 0) {
      return res.status(404).json({
        message: "No se encontró información académica del estudiante en Universitas.",
        documento,
      });
    }
    res.json({ documento, count: items.length, items });
  } catch (error) {
    res.status(502).json({
      message: error.message || "Error al conectar con Universitas (Consulta_inf_academica).",
      documento: (req.query.documento || req.body?.documento || "").toString().trim(),
    });
  }
};

/**
 * Resuelve el documento para consultar Universitas: solo studentCode del PostulantProfile (es el que solicita la API).
 * Usa String() por si studentCode viene como número desde BD; prefiere un perfil que tenga studentCode no vacío.
 */
async function getDocumentoForUniversitas(postulantId) {
  const profiles = await PostulantProfile.find({ postulantId }).select("studentCode").lean();
  for (const p of profiles) {
    const doc = (p?.studentCode != null && p.studentCode !== "") ? String(p.studentCode).trim() : "";
    if (doc) return doc;
  }
  return null;
}

/**
 * GET consulta información del estudiante en Universitas (OSB) y compara con el postulante en BD.
 * Documento = studentCode de PostulantProfile del postulante (requerido).
 * Devuelve { changes, universitasData }.
 */
export const consultaInfEstudianteUniversitas = async (req, res) => {
  try {
    const { id } = req.params;
    const postulant = await Postulant.findById(id)
      .populate("postulantId", "name email code")
      .populate("typeOfIdentification", "name value")
      .populate("gender", "name value")
      .lean();
    if (!postulant) return res.status(404).json({ message: "postulant not found" });
    const documento = await getDocumentoForUniversitas(id);
    if (!documento) return res.status(400).json({ message: "El postulante debe tener un perfil con studentCode para consultar Universitas." });
    const universitasData = await consultaInfEstudiante(documento);
    if (!universitasData) return res.status(404).json({ message: "No se encontró información del estudiante en Universitas." });
    const profile = await PostulantProfile.findOne({ postulantId: id }).select("academicUser").lean();
    const currentAcademicUser = profile?.academicUser ?? "";
    const changes = comparePostulantWithUniversitas(postulant, universitasData, currentAcademicUser);
    res.json({ changes, universitasData });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
/** Busca un ítem por listId y value (case-insensitive). Opcionalmente coincide también con description. */
async function findItemByValue(listId, value, alsoDescription = false) {
  if (!value || !listId) return null;
  const v = String(value).trim();
  const listIdNorm = String(listId).trim();
  const valueRegex = new RegExp(`^${escapeRegex(v)}$`, "i");
  const filter = {
    listId: { $regex: new RegExp(`^${escapeRegex(listIdNorm)}$`, "i") },
  };
  if (alsoDescription) {
    filter.$or = [
      { value: { $regex: valueRegex } },
      { description: { $regex: valueRegex } },
    ];
  } else {
    filter.value = { $regex: valueRegex };
  }
  const doc = await Item.findOne(filter).select("_id").lean();
  return doc;
}
/** Busca ítem en L_IDENTIFICATIONTYPE por value (CC, CE, CEX, PA, CA, ID, DNI, etc.) o description. */
async function findItemTypeDoc(value) {
  if (!value) return null;
  const v = String(value).trim().toUpperCase();
  const valuesToTry = [v];
  if (v === "CEX") valuesToTry.push("CE");
  if (v === "CE") valuesToTry.push("CEX");
  for (const val of valuesToTry) {
    let found = await findItemByValue(LIST_ID_TYPE_DOC, val);
    if (!found) found = await findItemByValue(LIST_ID_TYPE_DOC, val, true);
    if (found) return found;
  }
  return null;
}
/**
 * Busca ítem en L_GENDER. En BD suele ser value "M" (Masculino) y "F" (Femenino).
 * Universitas envía "H" (hombre) → buscar value "M"; "M" (mujer) → buscar value "F".
 */
async function findItemGender(value) {
  if (!value) return null;
  const v = String(value).trim().toUpperCase();
  let valuesToTry = [v];
  if (v === "H" || v === "HOMBRE" || v === "MASCULINO") {
    valuesToTry = ["M", "H", "Hombre", "Masculino"];
  } else if (v === "M" || v === "MUJER" || v === "FEMENINO") {
    valuesToTry = ["F", "Mujer", "Femenino"];
  }
  for (const val of valuesToTry) {
    const found = await findItemByValue(LIST_ID_GENDER, val);
    if (found) return found;
  }
  return null;
}

/**
 * PUT aplica la información de Universitas: User (name, email), Postulant (phone, address, typeOfIdentification, gender), PostulantProfile (academicUser).
 * Documento = studentCode de PostulantProfile (requerido).
 */
export const aplicarInfoUniversitas = async (req, res) => {
  try {
    const { id } = req.params;
    const postulantDoc = await Postulant.findById(id).populate("postulantId", "code name email");
    if (!postulantDoc) return res.status(404).json({ message: "postulant not found" });
    const documento = await getDocumentoForUniversitas(id);
    if (!documento) return res.status(400).json({ message: "El postulante debe tener un perfil con studentCode para consultar Universitas." });
    const universitasData = await consultaInfEstudiante(documento);
    if (!universitasData) return res.status(404).json({ message: "No se encontró información del estudiante en Universitas." });

    const uni = universitasData;
    const userId = postulantDoc.postulantId?._id;
    if (userId) {
      const nameUni = [uni.nombre, uni.primer_apellido, uni.segundo_apellido].filter(Boolean).join(" ").trim();
      const emailUni = normalizeStr(uni.correo_personal);
      const updateUser = {};
      if (nameUni) updateUser.name = nameUni;
      if (emailUni) updateUser.email = emailUni;
      if (Object.keys(updateUser).length) await User.findByIdAndUpdate(userId, updateUser);
    }

    const phoneUni = normalizeStr(uni.telefono || uni.celular);
    const addressUni = normalizeStr(uni.direccion);
    const tipoDocUni = normalizeStr(uni.tipo_documento);
    const sexoUni = normalizeStr(uni.sexo);

    const updatePostulant = {
      phone: phoneUni || null,
      address: addressUni || null,
    };
    if (tipoDocUni) {
      const itemType = await findItemTypeDoc(tipoDocUni);
      if (itemType) updatePostulant.typeOfIdentification = itemType._id;
    }
    if (sexoUni) {
      const itemGender = await findItemGender(sexoUni);
      if (itemGender) updatePostulant.gender = itemGender._id;
    }

    const postulantForCompleteness = await Postulant.findById(id).lean();
    const merged = { ...postulantForCompleteness, ...updatePostulant };
    updatePostulant.fillingPercentage = calculateCompleteness(merged);

    await Postulant.findByIdAndUpdate(id, { $set: updatePostulant }, { runValidators: true });

    const correoInstUni = normalizeStr(uni.correo_institucioinal);
    if (correoInstUni !== undefined) {
      await PostulantProfile.updateMany({ postulantId: id }, { $set: { academicUser: correoInstUni || null } });
    }
    const updated = await Postulant.findById(id)
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

/** Busca programa por codigoprograma o nombreprograma; si no existe, lo crea. */
async function findOrCreateProgram(codigoprograma, nombreprograma, tipoEstudio) {
  const code = (codigoprograma || "").toString().trim();
  const name = (nombreprograma || "").toString().trim();
  if (!name) return null;
  let program = await Program.findOne({
    $or: [
      ...(code ? [{ code }] : []),
      { name: { $regex: new RegExp(`^${escapeRegex(name)}$`, "i") } },
    ],
  }).lean();
  if (!program) {
    const level = (tipoEstudio || "").toUpperCase() === "MOF" ? "Maestría" : "Pregrado";
    const created = await Program.create({
      code: code || undefined,
      name,
      level,
      status: "active",
    });
    program = created.toObject();
  }
  return program;
}

/**
 * Compara programas actuales del perfil (enrolled + graduate) con los ítems académicos de Universitas.
 * Devuelve array de { label, valorActual, valorNuevo } para mostrar en el modal.
 */
function comparePostulantAcademicWithUniversitas(enrolledPrograms, graduatePrograms, universitasItems) {
  const changes = [];
  const enrolledNames = (enrolledPrograms || [])
    .map((e) => e.programId?.name || e.programId?.code)
    .filter(Boolean);
  const graduateNames = (graduatePrograms || [])
    .map((g) => g.programId?.name || g.programId?.code)
    .filter(Boolean);
  const uniEnrolled = (universitasItems || []).filter((i) => (i.egresado || "").toString().toUpperCase() === "N");
  const uniGraduate = (universitasItems || []).filter((i) => (i.egresado || "").toString().toUpperCase() === "S");
  const uniEnrolledNames = uniEnrolled.map((i) => i.nombreprograma || i.nombreplan || "—").filter(Boolean);
  const uniGraduateNames = uniGraduate.map((i) => i.nombreprograma || i.nombreplan || "—").filter(Boolean);
  const actualEnrolled = [...new Set(enrolledNames)].join(", ") || "—";
  const nuevoEnrolled = [...new Set(uniEnrolledNames)].join(", ") || "—";
  const actualGraduate = [...new Set(graduateNames)].join(", ") || "—";
  const nuevoGraduate = [...new Set(uniGraduateNames)].join(", ") || "—";
  if (actualEnrolled !== nuevoEnrolled) {
    changes.push({ label: "Programas en curso", valorActual: actualEnrolled, valorNuevo: nuevoEnrolled });
  }
  if (actualGraduate !== nuevoGraduate) {
    changes.push({ label: "Programas finalizados", valorActual: actualGraduate, valorNuevo: nuevoGraduate });
  }
  return changes;
}

/**
 * GET consulta información académica en Universitas y compara con el perfil del postulante.
 * Documento = studentCode del PostulantProfile (requerido).
 * Devuelve { changes, universitasData } (universitasData = array de programas).
 */
export const consultaInfAcademicaUniversitas = async (req, res) => {
  let documento = null;
  try {
    const { id } = req.params;
    const postulant = await Postulant.findById(id).select("_id postulantId").lean();
    if (!postulant) return res.status(404).json({ message: "postulant not found" });
    documento = await getDocumentoForUniversitas(id);
    if (!documento) return res.status(400).json({ message: "El postulante debe tener un perfil con studentCode para consultar Universitas." });

    let universitasItems;
    try {
      universitasItems = await consultaInfAcademica(documento);
    } catch (err) {
      return res.status(502).json({
        message: err.message || "Error al conectar con Universitas (Consulta_inf_academica).",
        documento,
      });
    }

    if (!universitasItems || universitasItems.length === 0) {
      return res.status(404).json({
        message: "No se encontró información académica del estudiante en Universitas.",
        documento,
      });
    }
    const profileFilter = postulant.postulantId
      ? { $or: [{ postulantId: id }, { postulantId: postulant.postulantId }] }
      : { postulantId: id };
    const profile = await PostulantProfile.findOne(profileFilter).select("_id").lean();
    let enrolledPrograms = [];
    let graduatePrograms = [];
    if (profile) {
      [enrolledPrograms, graduatePrograms] = await Promise.all([
        ProfileEnrolledProgram.find({ profileId: profile._id }).populate("programId", "name code").lean(),
        ProfileGraduateProgram.find({ profileId: profile._id }).populate("programId", "name code").lean(),
      ]);
    }
    const changes = comparePostulantAcademicWithUniversitas(enrolledPrograms, graduatePrograms, universitasItems);
    res.json({ changes, universitasData: universitasItems });
  } catch (error) {
    res.status(500).json({
      message: error.message,
      ...(documento != null && { documento }),
    });
  }
};

/**
 * PUT aplica la información académica de Universitas al perfil del postulante.
 * Crea/asegura ProfileEnrolledProgram (egresado N) y ProfileGraduateProgram (egresado S) por cada ítem de Universitas.
 */
export const aplicarInfoAcademicaUniversitas = async (req, res) => {
  let documento = null;
  try {
    const { id } = req.params;
    const postulant = await Postulant.findById(id).select("_id postulantId").lean();
    if (!postulant) return res.status(404).json({ message: "postulant not found" });
    documento = await getDocumentoForUniversitas(id);
    if (!documento) return res.status(400).json({ message: "El postulante debe tener un perfil con studentCode para consultar Universitas." });

    let universitasItems;
    try {
      universitasItems = await consultaInfAcademica(documento);
    } catch (err) {
      return res.status(502).json({
        message: err.message || "Error al conectar con Universitas (Consulta_inf_academica).",
        documento,
      });
    }
    if (!universitasItems || universitasItems.length === 0) {
      return res.status(404).json({
        message: "No se encontró información académica del estudiante en Universitas.",
        documento,
      });
    }
    const profileFilter = postulant.postulantId
      ? { $or: [{ postulantId: id }, { postulantId: postulant.postulantId }] }
      : { postulantId: id };
    let profile = await PostulantProfile.findOne(profileFilter);
    if (!profile) {
      profile = new PostulantProfile({
        postulantId: id,
        studentCode: documento,
        dateCreation: new Date(),
        userCreator: req.user?.name || req.user?.email || "api",
      });
      await profile.save();
    }
    const userLabel = req.user?.name || req.user?.email || "api";
    for (const item of universitasItems) {
      const egresado = (item.egresado || "").toString().toUpperCase() === "S";
      const program = await findOrCreateProgram(item.codigoprograma, item.nombreprograma || item.nombreplan, item.tipo_estudio);
      if (!program) continue;
      if (egresado) {
        const exists = await ProfileGraduateProgram.findOne({ profileId: profile._id, programId: program._id });
        if (!exists) {
          await ProfileGraduateProgram.create({
            profileId: profile._id,
            programId: program._id,
            programFacultyId: null,
          });
        }
      } else {
        const exists = await ProfileEnrolledProgram.findOne({ profileId: profile._id, programId: program._id });
        if (!exists) {
          await ProfileEnrolledProgram.create({
            profileId: profile._id,
            programId: program._id,
            programFacultyId: null,
            dateCreation: new Date(),
            userCreator: userLabel,
          });
        }
      }
    }
    const [enrolledPrograms, graduatePrograms] = await Promise.all([
      ProfileEnrolledProgram.find({ profileId: profile._id }).populate("programId", "name code").lean(),
      ProfileGraduateProgram.find({ profileId: profile._id }).populate("programId", "name code").lean(),
    ]);
    res.json({
      message: "Información académica aplicada.",
      enrolledPrograms,
      graduatePrograms,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/** GET /postulants/:id/profile-data — Datos migrados del perfil (PostulantProfile + profile_*). Query opcionales: profileId (perfil base), versionId (versión de profile_profile_version para mostrar nombre/texto). */
export const getPostulantProfileData = async (req, res) => {
  try {
    const { id } = req.params;
    const { profileId: queryProfileId, versionId: queryVersionId } = req.query;
    let postulant = await Postulant.findById(id).select("_id postulantId").lean();
    if (!postulant) {
      postulant = await Postulant.findOne({ postulantId: id }).select("_id postulantId").lean();
    }
    if (!postulant) {
      return res.status(404).json({ message: "Postulante no encontrado" });
    }
    const postulantDocId = postulant._id;
    const userId = postulant.postulantId ?? null;
    const profileFilter = userId
      ? { $or: [{ postulantId: postulantDocId }, { postulantId: userId }] }
      : { postulantId: postulantDocId };

    let postulantProfile;
    if (queryProfileId) {
      postulantProfile = await PostulantProfile.findOne({
        _id: queryProfileId,
        ...profileFilter,
      })
        .populate("levelJob", "value name")
        .populate("companySector", "value name")
        .lean();
    } else {
      postulantProfile = await PostulantProfile.findOne(profileFilter)
        .populate("levelJob", "value name")
        .populate("companySector", "value name")
        .sort({ createdAt: -1 })
        .lean();
    }
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
        profileCvs: [],
        profileSupports: [],
        profileInfoPermissions: [],
        profileProfileVersions: [],
      });
    }

    const profileId = postulantProfile._id;
    const allBaseProfiles = await PostulantProfile.find(profileFilter).select("_id").lean();
    const allProfileIds = allBaseProfiles.map((p) => p._id);

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
      profileCvs,
      profileSupports,
      profileInfoPermissions,
      profileProfileVersions,
    ] = await Promise.all([
      ProfileEnrolledProgram.find({ profileId })
        .populate("programId", "name code")
        .populate({ path: "programFacultyId", select: "code facultyId", populate: { path: "facultyId", select: "name" } })
        .populate("university", "value description")
        .populate("countryId", "name")
        .populate("stateId", "name")
        .populate("cityId", "name")
        .lean(),
      ProfileGraduateProgram.find({ profileId })
        .populate("programId", "name code")
        .populate({ path: "programFacultyId", select: "code facultyId", populate: { path: "facultyId", select: "name" } })
        .populate("university", "value description")
        .populate("countryId", "name")
        .populate("stateId", "name")
        .populate("cityId", "name")
        .lean(),
      ProfileWorkExperience.find({ profileId: allProfileIds.length ? { $in: allProfileIds } : profileId })
        .populate("companySector", "value name")
        .populate("countryId", "name")
        .populate("stateId", "name")
        .populate("cityId", "name")
        .sort({ startDate: -1 })
        .lean(),
      ProfileSkill.find({ profileId }).populate("skillId", "name").lean(),
      ProfileLanguage.find({ profileId })
        .populate("language", "value name")
        .populate("level", "value name")
        .lean(),
      ProfileAward.find({ profileId: allProfileIds.length ? { $in: allProfileIds } : profileId })
        .populate("awardType", "value name")
        .sort({ awardDate: -1, dateCreation: -1 })
        .lean(),
      ProfileReference.find({ profileId: allProfileIds.length ? { $in: allProfileIds } : profileId }).lean(),
      ProfileOtherStudy.find({ profileId }).lean(),
      ProfileInterestArea.find({ profileId }).populate("area", "value name").lean(),
      ProfileCv.find({ profileId }).populate("attachmentId", "name filepath contentType").lean(),
      ProfileSupport.find({ profileId }).populate("attachmentId", "name filepath contentType").lean(),
      ProfileInfoPermission.find({ profileId }).lean(),
      ProfileProfileVersion.find({ profileId }).lean(),
    ]);

    const enrolledIds = enrolledPrograms.map((e) => e._id);
    const programExtraInfoFiltered =
      enrolledIds.length > 0
        ? await ProfileProgramExtraInfo.find({ enrolledProgramId: { $in: enrolledIds } }).lean()
        : [];

    let selectedProfileVersion = null;
    if (queryVersionId && profileId) {
      const versionDoc = await ProfileProfileVersion.findOne({
        _id: queryVersionId,
        profileId,
      }).lean();
      if (versionDoc) selectedProfileVersion = versionDoc;
    }

    res.json({
      postulantProfile,
      selectedProfileVersion,
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
      profileCvs,
      profileSupports,
      profileInfoPermissions,
      profileProfileVersions,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/** GET /postulants/:id/attachments/:attachmentId/download — Descarga un CV o documento soporte del postulante. */
export const downloadAttachment = async (req, res) => {
  try {
    const { id, attachmentId } = req.params;
    let postulant = await Postulant.findById(id).select("_id postulantId").lean();
    if (!postulant) {
      postulant = await Postulant.findOne({ postulantId: id }).select("_id postulantId").lean();
    }
    if (!postulant) {
      return res.status(404).json({ message: "Postulante no encontrado" });
    }
    const postulantDocId = postulant._id;
    const userId = postulant.postulantId ?? null;
    const profileFilter = userId
      ? { $or: [{ postulantId: postulantDocId }, { postulantId: userId }] }
      : { postulantId: postulantDocId };

    const profiles = await PostulantProfile.find(profileFilter).select("_id").lean();
    const profileIds = profiles.map((p) => p._id);

    const [cvLink, supportLink] = await Promise.all([
      ProfileCv.findOne({ attachmentId, profileId: { $in: profileIds } }).lean(),
      ProfileSupport.findOne({ attachmentId, profileId: { $in: profileIds } }).lean(),
    ]);
    if (!cvLink && !supportLink) {
      return res.status(404).json({ message: "Documento no encontrado o no pertenece a este postulante" });
    }

    const attachment = await Attachment.findById(attachmentId).lean();
    if (!attachment || !attachment.filepath) {
      return res.status(404).json({ message: "Archivo no encontrado" });
    }

    const uploadsDir = path.join(__dirname, "..", "..", "..", "uploads");
    const fullPath = path.join(uploadsDir, attachment.filepath);
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ message: "Archivo no encontrado en el servidor" });
    }

    const downloadName = attachment.name || path.basename(attachment.filepath);
    res.download(fullPath, downloadName);
  } catch (error) {
    res.status(500).json({ message: error.message || "Error al descargar" });
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
