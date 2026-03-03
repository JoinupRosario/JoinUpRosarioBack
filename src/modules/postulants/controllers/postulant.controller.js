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
import Faculty from "../../faculty/model/faculty.model.js";
import ProgramFaculty from "../../program/model/programFaculty.model.js";
import { MAX_PROFILES_PER_POSTULANT } from "./postulantProfile.controller.js";
import { consultaInfEstudiante, consultaInfAcademica } from "../../../services/uxxiIntegration.service.js";
import Program from "../../program/model/program.model.js";
import Item from "../../shared/reference-data/models/item.schema.js";
import Attachment from "../../shared/attachment/attachment.schema.js";
import DocumentParametrization from "../../parametrizacionDocumentos/documentParametrization.schema.js";
import { buildHojaVidaPdf } from "../../../services/hojaVidaPdf.service.js";
import { buildCartaPresentacionPdf } from "../../../services/cartaPresentacionPdf.service.js";
import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";
import { log } from "console";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Raíz de directorio para subidas (PDFs de hoja de vida, etc.).
 * En Vercel/serverless el filesystem es de solo lectura excepto /tmp, por eso se usa os.tmpdir().
 * Nota: en Vercel los archivos en /tmp son efímeros; una descarga posterior puede fallar si el archivo ya no existe.
 * Para persistencia real en producción conviene usar Vercel Blob o S3 y guardar la URL/key en Attachment.
 */
function getUploadsRoot() {
  if (process.env.VERCEL === "1") {
    return path.join(os.tmpdir(), "uploads");
  }
  return path.join(__dirname, "..", "..", "..", "uploads");
}

/** Dominio obligatorio para el correo principal de estudiantes postulantes (Universidad del Rosario). */
const ALLOWED_EMAIL_DOMAIN = "@urosario.edu.co";
function isAllowedPostulantEmail(email) {
  if (!email || typeof email !== "string") return false;
  return String(email).trim().toLowerCase().endsWith(ALLOWED_EMAIL_DOMAIN.toLowerCase());
}

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
    let userDoc = null;
    if (!userId && identity_postulant) {
      const foundUser = await User.findOne({ code: identity_postulant.trim() });
      if (!foundUser) {
        return res.status(404).json({
          message: `No se encontró un usuario con código/identificación: ${identity_postulant}. Debe crear el usuario primero.`,
        });
      }
      userId = foundUser._id;
      userDoc = foundUser;
    }

    if (!userId) {
      return res.status(400).json({
        message:
          "Se requiere un usuario. Proporcione 'user' o 'identity_postulant' para buscar el usuario.",
      });
    }

    if (!userDoc) userDoc = await User.findById(userId).select("email").lean();
    if (userDoc && !isAllowedPostulantEmail(userDoc.email)) {
      return res.status(400).json({
        message: `El correo principal del estudiante postulante debe ser del dominio ${ALLOWED_EMAIL_DOMAIN}.`,
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

const postulantPopulate = [
  { path: "postulantId", select: "name email code estado" },
  { path: "countryBirthId", select: "name" },
  { path: "stateBirthId", select: "name" },
  { path: "cityBirthId", select: "name", populate: { path: "state", select: "name" } },
  { path: "countryResidenceId", select: "name" },
  { path: "stateResidenceId", select: "name" },
  { path: "cityResidenceId", select: "name", populate: { path: "state", select: "name" } },
  { path: "typeOfIdentification", select: "name value" },
  { path: "gender", select: "name value" },
];

export const getPostulantById = async (req, res) => {
  try {
    const { id } = req.params;
    const idStr = id && String(id).trim();
    if (!idStr) {
      return res.status(400).json({ message: "ID de postulante es requerido" });
    }

    const isValidObjectId = mongoose.Types.ObjectId.isValid(idStr) && String(new mongoose.Types.ObjectId(idStr)) === idStr;
    let postulant = null;

    if (isValidObjectId) {
      postulant = await Postulant.findById(idStr).populate(postulantPopulate).lean();
    }
    if (!postulant) {
      postulant = await Postulant.findOne({ postulantId: idStr }).populate(postulantPopulate).lean();
    }

    if (!postulant) {
      return res.status(404).json({ message: "Postulante no encontrado" });
    }

    const fillingPercentage = postulant.fillingPercentage ?? calculateCompleteness(postulant);
    const user = postulant.postulantId
      ? { name: postulant.postulantId.name, email: postulant.postulantId.email, code: postulant.postulantId.code }
      : null;

    res.json(formatPostulantProfileResponse(postulant));
  } catch (error) {
    console.error("[getPostulantById]", error?.message || error);
    if (process.env.NODE_ENV !== "production") {
      console.error(error?.stack);
    }
    res.status(500).json({
      message: process.env.NODE_ENV === "production"
        ? "Error al cargar el perfil del postulante. Intente de nuevo."
        : (error?.message || "Error interno"),
    });
  }
};

/** PUT /postulants/:id/toggle-estado — Alterna estado habilitado/inhabilitado del usuario del postulante y registra log. */
export const togglePostulantEstado = async (req, res) => {
  try {
    const { id } = req.params;
    const idStr = id && String(id).trim();
    if (!idStr) {
      return res.status(400).json({ message: "ID de postulante es requerido" });
    }

    const isValidObjectId = mongoose.Types.ObjectId.isValid(idStr) && String(new mongoose.Types.ObjectId(idStr)) === idStr;
    let postulant = null;

    if (isValidObjectId) {
      postulant = await Postulant.findById(idStr).populate("postulantId", "name email code estado").lean();
    }
    if (!postulant) {
      postulant = await Postulant.findOne({ postulantId: idStr }).populate("postulantId", "name email code estado").lean();
    }

    if (!postulant) {
      return res.status(404).json({ message: "Postulante no encontrado" });
    }

    const userId = postulant.postulantId?._id || postulant.postulantId;
    if (!userId) {
      return res.status(400).json({ message: "El postulante no tiene usuario asociado" });
    }

    const userDoc = await User.findById(userId);
    if (!userDoc) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    const statusBefore = userDoc.estado ? "Habilitado" : "Inhabilitado";
    const statusAfter = userDoc.estado ? "Inhabilitado" : "Habilitado";
    userDoc.estado = !userDoc.estado;
    await userDoc.save();

    await PostulantStatusHistory.create({
      postulant: postulant._id,
      status_before: statusBefore,
      status_after: statusAfter,
      changed_by: req.user?._id || null,
    });

    const updated = await Postulant.findById(postulant._id).populate(postulantPopulate).lean();
    res.json(formatPostulantProfileResponse(updated));
  } catch (error) {
    console.error("[togglePostulantEstado]", error?.message || error);
    if (process.env.NODE_ENV !== "production") {
      console.error(error?.stack);
    }
    res.status(500).json({
      message: process.env.NODE_ENV === "production"
        ? "Error al cambiar el estado. Intente de nuevo."
        : (error?.message || "Error interno"),
    });
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

/** Ficha técnica UXXI: tipo_documento viene como CEX, TID, NCE, PAS, PRT. Nuestra BD usa CE, TI, CC, PS, PRT. */
const UXXI_TO_OURS_TIPO_DOC = {
  CEX: "CE",
  TID: "TI",
  NCE: "CC",
  PAS: "PS",
  PRT: "PRT",
};
/** Ficha técnica UXXI: sexo viene como D (Femenino), H (Masculino), X (No binario), T (Trans). Nuestra BD: F, M, NB, T. */
const UXXI_TO_OURS_SEXO = {
  D: "F",
  H: "M",
  X: "NB",
  T: "T",
};

function normalizeStr(v) {
  if (v == null || v === "") return "";
  return String(v).trim();
}

/** Convierte código UXXI de tipo documento al valor que tenemos en nuestra BD (para buscar en ítems). */
function mapTipoDocUxxiToOurs(uxxiCode) {
  if (!uxxiCode) return null;
  const key = String(uxxiCode).trim().toUpperCase();
  return UXXI_TO_OURS_TIPO_DOC[key] ?? key;
}
/** Convierte código UXXI de sexo al valor que tenemos en nuestra BD (para buscar en ítems). */
function mapSexoUxxiToOurs(uxxiCode) {
  if (!uxxiCode) return null;
  const key = String(uxxiCode).trim().toUpperCase();
  return UXXI_TO_OURS_SEXO[key] ?? key;
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
  const currentType = normalizeStr(postulant.typeOfIdentification?.value ?? postulant.typeOfIdentification?.name).toUpperCase();
  const tipoDocUniRaw = normalizeStr(uni.tipo_documento);
  const tipoDocUniMapped = mapTipoDocUxxiToOurs(tipoDocUniRaw) || tipoDocUniRaw;
  if (tipoDocUniRaw && tipoDocUniMapped !== currentType) {
    changes.push({ label: UNIVERSITAS_FIELD_LABELS.tipo_documento, valorActual: currentType || "—", valorNuevo: tipoDocUniRaw });
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
  const currentSexo = normalizeStr(postulant.gender?.value ?? postulant.gender?.name).toUpperCase();
  const sexoUniRaw = normalizeStr(uni.sexo);
  const sexoUniMapped = mapSexoUxxiToOurs(sexoUniRaw) || sexoUniRaw;
  if (sexoUniRaw && sexoUniMapped !== currentSexo) {
    changes.push({ label: UNIVERSITAS_FIELD_LABELS.sexo, valorActual: currentSexo || "—", valorNuevo: sexoUniRaw });
  }
  const correoPersonalUni = normalizeStr(uni.correo_personal);
  const currentAlternate = normalizeStr(postulant.alternateEmail);
  if (correoPersonalUni !== undefined && correoPersonalUni !== currentAlternate) {
    changes.push({ label: UNIVERSITAS_FIELD_LABELS.correo_personal, valorActual: currentAlternate || "—", valorNuevo: correoPersonalUni });
  }
  const correoInstUni = normalizeStr(uni.correo_institucioinal);
  const currentAcademic = normalizeStr(currentAcademicUser);
  if (correoInstUni !== currentAcademic) {
    changes.push({ label: UNIVERSITAS_FIELD_LABELS.correo_institucional, valorActual: currentAcademic || "—", valorNuevo: correoInstUni });
  }
  return changes;
}



/**
 * Resuelve el documento (studentCode) para consultar Universitas.
 * Busca PostulantProfile por postulantId = Postulant._id o postulantId = Postulant.postulantId (User).
 */
async function getDocumentoForUniversitas(postulant) {
  const idPostulant = postulant?._id ?? postulant?.id;
  const refUser = postulant?.postulantId;
  const idUser = refUser != null ? (refUser._id ?? refUser) : null;
  const ids = [...new Set([idPostulant, idUser].filter(Boolean))];
  if (ids.length === 0) return null;
  const profiles = await PostulantProfile.find({ postulantId: { $in: ids } })
    .select("studentCode")
    .sort({ updatedAt: -1 })
    .lean();
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
    const documento = await getDocumentoForUniversitas(postulant);
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
/** Busca ítem en L_IDENTIFICATIONTYPE. UXXI envía CEX, TID, NCE, PAS, PRT → nosotros tenemos CE, TI, CC, PS, PRT. */
async function findItemTypeDoc(value) {
  if (!value) return null;
  const v = String(value).trim().toUpperCase();
  const ours = mapTipoDocUxxiToOurs(v) || v;
  const valuesToTry = [ours, v];
  if (ours !== v) valuesToTry.push(v);
  for (const val of valuesToTry) {
    let found = await findItemByValue(LIST_ID_TYPE_DOC, val);
    if (!found) found = await findItemByValue(LIST_ID_TYPE_DOC, val, true);
    if (found) return found;
  }
  return null;
}
/**
 * Busca ítem en L_GENDER. Ficha UXXI: D=Femenino, H=Masculino, X=No binario, T=Trans.
 * Nuestra BD: F, M, NB, T. Mapeo: H→M, D→F, X→NB, T→T.
 */
async function findItemGender(value) {
  if (!value) return null;
  const v = String(value).trim().toUpperCase();
  const ours = mapSexoUxxiToOurs(v) || v;
  const valuesToTry = [ours, v];
  if (ours !== v) valuesToTry.push(v);
  if (v === "H" || v === "HOMBRE" || v === "MASCULINO") valuesToTry.push("M", "Masculino");
  if (v === "D" || v === "MUJER" || v === "FEMENINO") valuesToTry.push("F", "Femenino");
  if (v === "X") valuesToTry.push("NB", "No binario");
  if (v === "T") valuesToTry.push("Trans");
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
    const documento = await getDocumentoForUniversitas(postulantDoc);
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
      if (emailUni && isAllowedPostulantEmail(emailUni)) updateUser.email = emailUni;
      if (Object.keys(updateUser).length) await User.findByIdAndUpdate(userId, updateUser);
    }

    const phoneUni = normalizeStr(uni.telefono || uni.celular);
    const addressUni = normalizeStr(uni.direccion);
    const tipoDocUni = normalizeStr(uni.tipo_documento);
    const sexoUni = normalizeStr(uni.sexo);

    const correoPersonalUni = normalizeStr(uni.correo_personal);
    const updatePostulant = {
      phone: phoneUni || null,
      address: addressUni || null,
    };
    if (correoPersonalUni !== undefined) updatePostulant.alternateEmail = correoPersonalUni || null;
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
      if (!isAllowedPostulantEmail(correoInstUni)) {
        return res.status(400).json({
          message: `El correo institucional debe ser del dominio ${ALLOWED_EMAIL_DOMAIN}. No se aplicó el cambio.`,
        });
      }
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

/** tipo_estudio según ficha: PSC = Pregrado, MOF = Posgrado, TCL = Doctorado. */
function mapTipoEstudioToLevel(tipoEstudio) {
  const t = (tipoEstudio || "").toString().toUpperCase().trim();
  if (t === "MOF") return "Maestría";
  if (t === "TCL") return "Doctorado";
  return "Pregrado"; // PSC u otro
}

/**
 * Busca programa en la tabla programs por código(s) o nombre.
 * Prioridad: codigoplan (plan) > codigoprograma > nombre. Así se alinea con UXXI donde codigoplan es el identificador que coincide con Program.code en BD.
 */
async function findProgramByCodeOrName(codigoplan, nombreprograma, codigoprograma) {
  const planCode = (codigoplan || "").toString().trim();
  const progCode = (codigoprograma || "").toString().trim();
  const name = (nombreprograma || "").toString().trim();
  if (!name && !planCode && !progCode) return null;
  if (planCode) {
    const program = await Program.findOne({ code: planCode }).lean();
    if (program) return program;
  }
  if (progCode) {
    const program = await Program.findOne({ code: progCode }).lean();
    if (program) return program;
  }
  if (name) {
    const program = await Program.findOne({ name: { $regex: new RegExp(`^${escapeRegex(name)}$`, "i") } }).lean();
    if (program) return program;
  }
  return null;
}

/**
 * Normaliza valor numérico desde UXXI (puede venir como string).
 */
function toNum(val) {
  if (val == null) return undefined;
  const n = Number(val);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Normaliza valor booleano desde UXXI (S/N, true/false, 1/0).
 */
function toBoolUxxi(val) {
  if (val == null) return undefined;
  const s = String(val).trim().toUpperCase();
  if (s === "S" || s === "TRUE" || s === "1" || s === "SI") return true;
  if (s === "N" || s === "FALSE" || s === "0" || s === "NO") return false;
  return undefined;
}

/**
 * Clave única por ítem UXXI: prioridad codigoplan (plan) para que coincida con Program.code en BD.
 */
function getPlanCodeFromItem(item) {
  return (item.codigoplan ?? item.codigoPlan ?? item.planestudio ?? item.planEstudio ?? item.codigoprograma ?? item.codigoPrograma ?? "").toString().trim();
}

/**
 * Agrupa ítems de Universitas por codigoplan (plan); si no viene, por codigoprograma.
 * Si el mismo código aparece "en curso" (N) y "finalizado" (S), se prefiere "en curso".
 * Guarda también codigoprograma para búsqueda de programa y todos los campos extra.
 * @returns {Map<string, { planCode, codigoprograma, egresado, nombre, ... }>}
 */
function groupUniversitasItemsByCode(universitasItems) {
  const byCode = new Map();
  for (const item of universitasItems || []) {
    const planCode = getPlanCodeFromItem(item);
    const codigoprograma = (item.codigoprograma ?? item.codigoPrograma ?? "").toString().trim();
    const code = planCode || codigoprograma;
    if (!code) continue;
    const egresado = (item.egresado ?? item.Egresado ?? "").toString().toUpperCase() === "S";
    const nombre = (item.nombreprograma ?? item.nombrePrograma ?? item.nombreplan ?? item.nombrePlan ?? "").toString().trim();
    const tipoEstudio = item.tipo_estudio ?? item.tipoEstudio ?? "";
    const codFacultad = item.cod_facultad ?? item.codFacultad;
    const nombreFacultad = (item.facultad ?? item.nombreFacultad ?? "").toString().trim();
    const sede = (item.centrobeneficio ?? item.centro_beneficio ?? item.sede ?? "").toString().trim() || undefined;
    const promedioacumulado = toNum(item.promedioacumulado ?? item.promedio_acumulado);
    const creditos_conseguidos = item.creditos_conseguidos ?? item.creditosConseguidos ?? item.creditos_aprobados ?? item.creditosAprobados ?? item.approved_credits;
    const creditos_plan = item.creditos_plan ?? item.creditosPlan ?? item.total_credits;
    const creditos_matriculados = item.creditos_matriculados ?? item.creditosMatriculados;
    const semestre = item.semestre ?? item.expediente ?? item.cohorte;
    const matriculado = toBoolUxxi(item.matriculado ?? item.enrolled);
    const canPractice = toBoolUxxi(item.puede_practica ?? item.puedePractica ?? item.can_practice ?? item.canPractice);
    const suspensiones = toBoolUxxi(item.suspensiones ?? item.disciplinary_suspension ?? item.bloqueado);
    const currentCourses = (item.cursos_actuales ?? item.cursosActuales ?? item.current_courses ?? "").toString().trim() || undefined;
    const approvedCourses = (item.cursos_aprobados ?? item.cursosAprobados ?? item.approved_courses ?? "").toString().trim() || undefined;
    const existing = byCode.get(code);
    if (!existing) {
      byCode.set(code, {
        planCode: planCode || code,
        codigoprograma: codigoprograma || code,
        egresado,
        nombre,
        tipoEstudio,
        codFacultad,
        nombreFacultad,
        sede,
        promedioacumulado,
        creditos_conseguidos,
        creditos_plan,
        creditos_matriculados,
        semestre,
        matriculado,
        canPractice,
        suspensiones,
        currentCourses,
        approvedCourses,
      });
    } else {
      if (!egresado) existing.egresado = false;
      if (sede !== undefined) existing.sede = sede;
      if (promedioacumulado !== undefined) existing.promedioacumulado = promedioacumulado;
      if (creditos_conseguidos !== undefined) existing.creditos_conseguidos = creditos_conseguidos;
      if (creditos_plan !== undefined) existing.creditos_plan = creditos_plan;
      if (semestre !== undefined) existing.semestre = semestre;
      if (matriculado !== undefined) existing.matriculado = matriculado;
      if (canPractice !== undefined) existing.canPractice = canPractice;
      if (suspensiones !== undefined) existing.suspensiones = suspensiones;
      if (currentCourses !== undefined) existing.currentCourses = currentCourses;
      if (approvedCourses !== undefined) existing.approvedCourses = approvedCourses;
    }
  }
  return byCode;
}

/**
 * Busca Faculty por code (cod_facultad de Universitas) en la tabla faculties; obtiene el id y devuelve la relación
 * ProgramFaculty (programId + facultyId). Si existe cod_facultad y la facultad existe pero no hay ProgramFaculty,
 * se crea para poder asociar programFacultyId en la formación en curso (así no queda como "registrada" sino con facultad).
 */
async function findOrCreateProgramFacultyForProgram(programId, codFacultad, nombreFacultad, userLabel = "api") {
  try {
    if (!programId) return null;
    const codeStr = (codFacultad != null && codFacultad !== "") ? String(codFacultad).trim() : "";
    const nameStr = (nombreFacultad != null && nombreFacultad !== "") ? String(nombreFacultad).trim().substring(0, 255) : "";
    let faculty = null;
    if (codeStr) {
      faculty = await Faculty.findOne({ code: codeStr }).select("_id code").lean();
    }
    if (!faculty && nameStr) {
      faculty = await Faculty.findOne({ name: { $regex: new RegExp(`^${escapeRegex(nameStr)}$`, "i") } }).select("_id code").lean();
    }
    if (!faculty) return null;
    let pf = await ProgramFaculty.findOne({ programId, facultyId: faculty._id }).select("_id").lean();
    if (!pf) {
      const created = await ProgramFaculty.create({
        programId,
        facultyId: faculty._id,
        code: codeStr || faculty.code || undefined,
        status: "ACTIVE",
        dateCreation: new Date(),
        userCreator: userLabel,
      });
      pf = { _id: created._id };
    }
    return pf._id;
  } catch (err) {
    console.error("findOrCreateProgramFacultyForProgram:", err.message);
    return null;
  }
}

/**
 * Clave normalizada "codigoPrograma|codigoFacultad" para un ítem (enrolled o UXXI).
 * Si no hay facultad, queda "CODE|" (no "CODE|undefined").
 */
function normalizeProgramFacultyKey(programCode, facultyCode) {
  const p = String(programCode ?? "").trim();
  const f = (facultyCode != null && facultyCode !== "") ? String(facultyCode).trim() : "";
  if (!p) return "";
  return p + "|" + f;
}

/**
 * Conjunto de claves "CODE|FAC" ordenado para comparación.
 */
function toSortedProgramFacultyKeySet(items, getProgramCode, getFacultyCode) {
  const keys = (items || [])
    .map((item) => normalizeProgramFacultyKey(getProgramCode(item), getFacultyCode(item)))
    .filter((k) => k !== "" && !k.startsWith("|"));
  return [...new Set(keys)].sort();
}

/**
 * Compara dos conjuntos de claves "CODE|FAC" considerando que "CODE|" (sin facultad en BD)
 * equivale a "CODE|FAC" de UXXI. Así no se marca cambio cuando el programa es el mismo
 * pero en BD no tenemos facultad guardada.
 * Devuelve true si los conjuntos representan los mismos programas (mismo código de programa).
 */
function sameProgramSetByCode(actualKeys, nuevoKeys) {
  const actualCodes = [...new Set(actualKeys.map((k) => k.split("|")[0]).filter(Boolean))].sort().join(", ");
  const nuevoCodes = [...new Set(nuevoKeys.map((k) => k.split("|")[0]).filter(Boolean))].sort().join(", ");
  return actualCodes === nuevoCodes;
}

/** Valor normalizado para comparar (string vacío, número, boolean). */
function normVal(v) {
  if (v == null || v === "") return null;
  if (typeof v === "boolean") return v;
  const n = Number(v);
  if (Number.isFinite(n)) return n;
  return String(v).trim() || null;
}

/** Compara dos valores normalizados; devuelve true si son equivalentes. */
function eqVal(a, b) {
  const na = normVal(a);
  const nb = normVal(b);
  if (na === nb) return true;
  if (na === null && nb === null) return true;
  if (typeof na === "number" && typeof nb === "number") return na === nb;
  return na === nb;
}

/**
 * Compara datos extra de un programa en curso: BD (ProfileProgramExtraInfo) vs UXXI (byCode value).
 * Añade a changes una entrada por cada campo que difiera (semestre, créditos, promedio, etc.).
 */
function compareExtraFieldsForProgram(changes, programName, actualExtra, uxxiData) {
  const programLabel = programName ? ` (${programName})` : "";
  const fields = [
    { key: "semestre", label: `Semestre / SSC${programLabel}`, actual: actualExtra?.accordingCreditSemester, nuevo: uxxiData?.semestre != null ? toNum(uxxiData.semestre) : undefined },
    { key: "creditos", label: `Créditos aprobados${programLabel}`, actual: actualExtra?.approvedCredits != null ? String(actualExtra.approvedCredits).trim() : null, nuevo: uxxiData?.creditos_conseguidos != null ? String(uxxiData.creditos_conseguidos).trim() : null },
    { key: "promedio", label: `Promedio acumulado${programLabel}`, actual: actualExtra?.cumulativeAverage, nuevo: uxxiData?.promedioacumulado },
    { key: "cursosActuales", label: `Cursos actuales${programLabel}`, actual: actualExtra?.currentCourses != null ? String(actualExtra.currentCourses).trim() : null, nuevo: uxxiData?.currentCourses != null ? String(uxxiData.currentCourses).trim() : null },
    { key: "practica", label: `Práctica${programLabel}`, actual: actualExtra?.canPractice, nuevo: uxxiData?.canPractice },
    { key: "matriculado", label: `Matriculado${programLabel}`, actual: actualExtra?.enrolled, nuevo: uxxiData?.matriculado },
    { key: "suspensiones", label: `Suspensiones${programLabel}`, actual: actualExtra?.disciplinarySuspension, nuevo: uxxiData?.suspensiones },
  ];
  for (const f of fields) {
    if (f.nuevo === undefined || f.nuevo === null) continue;
    if (eqVal(f.actual, f.nuevo)) continue;
    const valorActual = f.actual !== undefined && f.actual !== null ? String(f.actual) : "—";
    const valorNuevo = String(f.nuevo);
    changes.push({ label: f.label, valorActual, valorNuevo });
  }
}

/**
 * Compara programas actuales del perfil (enrolled + graduate) con los ítems académicos de Universitas.
 * 1) Compara listas de programas (en curso y finalizados) por código.
 * 2) Para cada programa en curso que exista en ambos lados, compara datos extra (semestre, créditos, promedio, cursos actuales, práctica, matriculado, suspensiones).
 * Si todo coincide, devuelve [] y el front mostrará "La información académica coincide con Universitas. No hay nada que actualizar."
 */
function comparePostulantAcademicWithUniversitas(enrolledPrograms, graduatePrograms, universitasItems, programExtraInfoList = []) {
  const changes = [];
  const byCode = groupUniversitasItemsByCode(universitasItems);
  const nuevoEnrolledEntries = [...byCode.entries()].filter(([, v]) => !v.egresado);
  const nuevoGraduateEntries = [...byCode.entries()].filter(([, v]) => v.egresado);

  const actualEnrolledKeys = toSortedProgramFacultyKeySet(
    enrolledPrograms || [],
    (e) => e.programId?.code,
    (e) => e.programFacultyId?.code
  );
  const actualGraduateKeys = toSortedProgramFacultyKeySet(
    graduatePrograms || [],
    (g) => g.programId?.code,
    (g) => g.programFacultyId?.code
  );
  const nuevoEnrolledKeys = toSortedProgramFacultyKeySet(
    nuevoEnrolledEntries.map(([code, v]) => ({ code, codFacultad: v.codFacultad })),
    (x) => x.code,
    (x) => x.codFacultad
  );
  const nuevoGraduateKeys = toSortedProgramFacultyKeySet(
    nuevoGraduateEntries.map(([code, v]) => ({ code, codFacultad: v.codFacultad })),
    (x) => x.code,
    (x) => x.codFacultad
  );

  const actualEnrolledNames = [...new Set((enrolledPrograms || []).map((e) => e.programId?.name || e.programId?.code).filter(Boolean))].join(", ") || "—";
  const actualGraduateNames = [...new Set((graduatePrograms || []).map((g) => g.programId?.name || g.programId?.code).filter(Boolean))].join(", ") || "—";
  const nuevoEnrolledNames = [...new Set(nuevoEnrolledEntries.map(([, v]) => v.nombre || "—").filter((n) => n !== "—"))].join(", ") || "—";
  const nuevoGraduateNames = [...new Set(nuevoGraduateEntries.map(([, v]) => v.nombre || "—").filter((n) => n !== "—"))].join(", ") || "—";

  const sameNames = (a, b) => (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();

  if (!sameProgramSetByCode(actualEnrolledKeys, nuevoEnrolledKeys) && !sameNames(actualEnrolledNames, nuevoEnrolledNames)) {
    changes.push({ label: "Programas en curso", valorActual: actualEnrolledNames, valorNuevo: nuevoEnrolledNames });
  }
  if (!sameProgramSetByCode(actualGraduateKeys, nuevoGraduateKeys) && !sameNames(actualGraduateNames, nuevoGraduateNames)) {
    changes.push({ label: "Programas finalizados", valorActual: actualGraduateNames, valorNuevo: nuevoGraduateNames });
  }

  const extraByEnrolledId = new Map(
    (programExtraInfoList || []).map((ex) => [ex.enrolledProgramId?.toString?.() ?? ex.enrolledProgramId, ex])
  );
  const enrolledByCode = new Map(
    (enrolledPrograms || []).map((e) => [String(e.programId?.code ?? "").trim(), e]).filter(([c]) => c !== "")
  );
  const normalizedName = (s) => (s != null ? String(s).trim().toLowerCase().replace(/\s+/g, " ") : "");
  const enrolledByName = new Map(
    (enrolledPrograms || [])
      .map((e) => [normalizedName(e.programId?.name ?? e.programId?.code), e])
      .filter(([k]) => k !== "")
  );

  for (const [code, uxxiData] of nuevoEnrolledEntries) {
    let enrolled = enrolledByCode.get(code);
    if (!enrolled && uxxiData.nombre) {
      enrolled = enrolledByName.get(normalizedName(uxxiData.nombre));
    }
    if (!enrolled) continue;
    const actualExtra = extraByEnrolledId.get(enrolled._id?.toString?.());
    const programName = enrolled.programId?.name || enrolled.programId?.code || uxxiData.nombre || code;
    compareExtraFieldsForProgram(changes, programName, actualExtra, uxxiData);
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
    documento = await getDocumentoForUniversitas(postulant);
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
    const profileIdFromReq = req.query.profileId ?? req.body?.profileId;
    let profile = null;
    if (profileIdFromReq) {
      const pid = typeof profileIdFromReq === "string" ? profileIdFromReq.trim() : profileIdFromReq;
      if (pid && mongoose.Types.ObjectId.isValid(pid)) {
        profile = await PostulantProfile.findOne({ _id: new mongoose.Types.ObjectId(pid), ...profileFilter }).select("_id").lean();
      }
    }
    if (!profile) {
      profile = await PostulantProfile.findOne(profileFilter).select("_id").lean();
    }
    let enrolledPrograms = [];
    let graduatePrograms = [];
    let programExtraInfoList = [];
    if (profile) {
      [enrolledPrograms, graduatePrograms] = await Promise.all([
        ProfileEnrolledProgram.find({ profileId: profile._id })
          .populate("programId", "name code level")
          .populate("programFacultyId", "code")
          .lean(),
        ProfileGraduateProgram.find({ profileId: profile._id })
          .populate("programId", "name code level")
          .populate("programFacultyId", "code")
          .lean(),
      ]);
      const enrolledIds = enrolledPrograms.map((e) => e._id);
      if (enrolledIds.length > 0) {
        programExtraInfoList = await ProfileProgramExtraInfo.find({ enrolledProgramId: { $in: enrolledIds } }).lean();
      }
    }
    const changes = comparePostulantAcademicWithUniversitas(
      enrolledPrograms,
      graduatePrograms,
      universitasItems,
      programExtraInfoList
    );
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
 * Reemplaza programas en curso y finalizados por los que devuelve Universitas (mismo perfil que se consulta si se envía profileId).
 */
export const aplicarInfoAcademicaUniversitas = async (req, res) => {
  let documento = null;
  try {
    const { id } = req.params;
    const postulant = await Postulant.findById(id).select("_id postulantId").lean();
    if (!postulant) return res.status(404).json({ message: "postulant not found" });
    documento = await getDocumentoForUniversitas(postulant);
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
    const profileIdFromReq = req.query.profileId ?? req.body?.profileId;
    let profile = null;
    if (profileIdFromReq) {
      const pid = typeof profileIdFromReq === "string" ? profileIdFromReq.trim() : profileIdFromReq;
      if (!pid || !mongoose.Types.ObjectId.isValid(pid)) {
        return res.status(400).json({ message: "profileId inválido." });
      }
      profile = await PostulantProfile.findOne({ _id: new mongoose.Types.ObjectId(pid), ...profileFilter });
      if (!profile) {
        return res.status(400).json({
          message: "El profileId no corresponde al postulante o no existe. Usa el perfil que estás viendo.",
        });
      }
    } else {
      profile = await PostulantProfile.findOne(profileFilter);
    }
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

    // Agrupar por codigoprograma y preferir "en curso" si el mismo código aparece N y S. Resolver programa por code en tabla programas (no se crean; si no existe, se informa).
    const byCode = groupUniversitasItemsByCode(universitasItems);
    const enrolledList = [];
    const graduateList = [];
    const missingPrograms = [];
    for (const [codigo, data] of byCode) {
      const program = await findProgramByCodeOrName(data.planCode ?? codigo, data.nombre, data.codigoprograma);
      if (!program) {
        missingPrograms.push({ code: codigo, name: data.nombre || codigo });
        continue;
      }
      const programFacultyId = await findOrCreateProgramFacultyForProgram(program._id, data.codFacultad, data.nombreFacultad, userLabel);
      const entry = { programId: program._id, programFacultyId: programFacultyId || undefined, extra: data };
      if (data.egresado) {
        graduateList.push(entry);
      } else {
        enrolledList.push(entry);
      }
    }
    if (missingPrograms.length > 0) {
      const list = missingPrograms.map((p) => (p.name ? `${p.name} (cód. ${p.code})` : p.code)).join("; ");
      return res.status(400).json({
        message: "No existen los siguientes programas en el sistema. Deben darse de alta en la tabla de programas antes de aplicar.",
        missingPrograms: missingPrograms.map((p) => ({ code: p.code, name: p.name })),
        detail: list,
      });
    }
    const programIdsEnrolled = enrolledList.map((e) => e.programId);
    const programIdsGraduate = graduateList.map((e) => e.programId);

    // Quitar del perfil los que ya no vienen en Universitas. Borrar también su ProfileProgramExtraInfo.
    const toRemoveEnrolled = await ProfileEnrolledProgram.find({
      profileId: profile._id,
      programId: { $nin: programIdsEnrolled },
    })
      .select("_id")
      .lean();
    const toRemoveEnrolledIds = toRemoveEnrolled.map((e) => e._id);
    if (toRemoveEnrolledIds.length > 0) {
      await ProfileProgramExtraInfo.deleteMany({ enrolledProgramId: { $in: toRemoveEnrolledIds } });
    }
    await ProfileEnrolledProgram.deleteMany({
      profileId: profile._id,
      programId: { $nin: programIdsEnrolled },
    });
    await ProfileGraduateProgram.deleteMany({
      profileId: profile._id,
      ...(programIdsGraduate.length > 0 ? { programId: { $nin: programIdsGraduate } } : {}),
    });

    // Añadir o actualizar programas en curso y su ProfileProgramExtraInfo (sede, cursos actuales, créditos aprobados, practica, matriculado, suspensiones, promedio acumulado, ssc/semestre).
    for (const entry of enrolledList) {
      let enrolledDoc = await ProfileEnrolledProgram.findOne({ profileId: profile._id, programId: entry.programId });
      if (!enrolledDoc) {
        enrolledDoc = await ProfileEnrolledProgram.create({
          profileId: profile._id,
          programId: entry.programId,
          programFacultyId: entry.programFacultyId ?? null,
          dateCreation: new Date(),
          userCreator: userLabel,
        });
      } else if (entry.programFacultyId != null) {
        await ProfileEnrolledProgram.updateOne(
          { profileId: profile._id, programId: entry.programId },
          { $set: { programFacultyId: entry.programFacultyId } }
        );
      }
      const extra = entry.extra || {};
      const updateExtra = {
        sede: extra.sede ?? null,
        cumulativeAverage: extra.promedioacumulado != null ? extra.promedioacumulado : undefined,
        approvedCredits: extra.creditos_conseguidos != null ? String(extra.creditos_conseguidos).trim() : undefined,
        currentCourses: extra.currentCourses ?? undefined,
        enrolled: extra.matriculado !== undefined ? extra.matriculado : undefined,
        canPractice: extra.canPractice !== undefined ? extra.canPractice : undefined,
        disciplinarySuspension: extra.suspensiones !== undefined ? extra.suspensiones : undefined,
        accordingCreditSemester: extra.semestre != null ? toNum(extra.semestre) : undefined,
        totalCredits: extra.creditos_plan != null ? toNum(extra.creditos_plan) : undefined,
        approvedCourses: extra.approvedCourses ?? undefined,
      };
      const cleanExtra = Object.fromEntries(Object.entries(updateExtra).filter(([, v]) => v !== undefined));
      const now = new Date();
      const existingExtra = await ProfileProgramExtraInfo.findOne({ enrolledProgramId: enrolledDoc._id });
      if (!existingExtra) {
        await ProfileProgramExtraInfo.create({
          enrolledProgramId: enrolledDoc._id,
          dateCreation: now,
          userCreator: userLabel,
          ...cleanExtra,
        });
      } else {
        const setFields = { ...cleanExtra, dateUpdate: now, userUpdater: userLabel };
        if (Object.keys(cleanExtra).length > 0) {
          await ProfileProgramExtraInfo.updateOne(
            { enrolledProgramId: enrolledDoc._id },
            { $set: setFields }
          );
        }
      }
    }
    for (const entry of graduateList) {
      const exists = await ProfileGraduateProgram.findOne({ profileId: profile._id, programId: entry.programId });
      if (!exists) {
        await ProfileGraduateProgram.create({
          profileId: profile._id,
          programId: entry.programId,
          programFacultyId: entry.programFacultyId ?? null,
        });
      } else if (entry.programFacultyId != null) {
        await ProfileGraduateProgram.updateOne(
          { profileId: profile._id, programId: entry.programId },
          { $set: { programFacultyId: entry.programFacultyId } }
        );
      }
    }

    const [enrolledPrograms, graduatePrograms] = await Promise.all([
      ProfileEnrolledProgram.find({ profileId: profile._id }).populate("programId", "name code level").lean(),
      ProfileGraduateProgram.find({ profileId: profile._id }).populate("programId", "name code level").lean(),
    ]);
    const enrolledIds = enrolledPrograms.map((e) => e._id);
    const programExtraInfo =
      enrolledIds.length > 0
        ? await ProfileProgramExtraInfo.find({ enrolledProgramId: { $in: enrolledIds } }).lean()
        : [];
    res.json({
      message: "Información académica aplicada.",
      enrolledPrograms,
      graduatePrograms,
      programExtraInfo,
    });
  } catch (error) {
    const errMsg = (error && (error.message || error.stack)) || String(error) || "Error al aplicar información académica.";
    console.error("aplicarInfoAcademicaUniversitas:", errMsg, error);
    if (!res.headersSent) {
      res.status(500).json({ message: errMsg });
    }
  }
};

/** GET /postulants/:id/profile-data — Datos migrados del perfil (PostulantProfile + profile_*). Query opcionales: profileId (perfil base), versionId (versión de profile_profile_version para mostrar nombre/texto). */
export const getPostulantProfileData = async (req, res) => {
  try {
    const { id } = req.params;
    const idStr = id && String(id).trim();
    const { profileId: queryProfileId, versionId: queryVersionId } = req.query;
    if (!idStr) return res.status(400).json({ message: "ID de postulante es requerido" });
    const isValidObjectId = mongoose.Types.ObjectId.isValid(idStr) && String(new mongoose.Types.ObjectId(idStr)) === idStr;
    let postulant = null;
    if (isValidObjectId) postulant = await Postulant.findById(idStr).select("_id postulantId").lean();
    if (!postulant) postulant = await Postulant.findOne({ postulantId: idStr }).select("_id postulantId").lean();
    if (!postulant) return res.status(404).json({ message: "Postulante no encontrado" });
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

    let selectedProfileVersion = null;
    if (queryVersionId && profileId) {
      const versionDoc = await ProfileProfileVersion.findOne({
        _id: queryVersionId,
        profileId,
      }).lean();
      if (versionDoc) selectedProfileVersion = versionDoc;
    }
    const versionFilter = selectedProfileVersion
      ? { profileId, profileVersionId: selectedProfileVersion._id }
      : { profileId, $or: [{ profileVersionId: null }, { profileVersionId: { $exists: false } }] };

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
        .populate("programId", "name code level")
        .populate({ path: "programFacultyId", select: "code facultyId", populate: { path: "facultyId", select: "name sucursalId", populate: { path: "sucursalId", select: "nombre codigo" } } })
        .populate("university", "value description")
        .populate("countryId", "name")
        .populate("stateId", "name")
        .populate("cityId", "name")
        .lean(),
      ProfileGraduateProgram.find({ profileId })
        .populate("programId", "name code level")
        .populate({ path: "programFacultyId", select: "code facultyId", populate: { path: "facultyId", select: "name sucursalId", populate: { path: "sucursalId", select: "nombre codigo" } } })
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
      ProfileSkill.find(versionFilter).populate("skillId", "name").lean(),
      ProfileLanguage.find(versionFilter)
        .populate("language", "value name")
        .populate("level", "value name")
        .lean(),
      ProfileAward.find({ profileId: allProfileIds.length ? { $in: allProfileIds } : profileId })
        .populate("awardType", "value name")
        .sort({ awardDate: -1, dateCreation: -1 })
        .lean(),
      ProfileReference.find({ profileId: allProfileIds.length ? { $in: allProfileIds } : profileId }).lean(),
      ProfileOtherStudy.find({ profileId }).lean(),
      ProfileInterestArea.find(versionFilter).populate("area", "value name").lean(),
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
    console.error("[getPostulantProfileData]", error?.message || error);
    if (process.env.NODE_ENV !== "production") console.error(error?.stack);
    res.status(500).json({
      message: process.env.NODE_ENV === "production"
        ? "Error al cargar los datos del perfil. Intente de nuevo."
        : (error?.message || "Error interno"),
    });
  }
};

/** GET /postulants/:id/generate-hoja-vida-pdf?profileId=...&versionId=... — Genera y devuelve el PDF de la hoja de vida según parametrización. */
export const generateHojaVidaPdf = async (req, res) => {
  try {
    const { id } = req.params;
    const { profileId: queryProfileId, versionId: queryVersionId } = req.query;
    let postulant = await Postulant.findById(id).select("_id postulantId").lean();
    if (!postulant) postulant = await Postulant.findOne({ postulantId: id }).select("_id postulantId").lean();
    if (!postulant) return res.status(404).json({ message: "Postulante no encontrado" });
    if (!queryProfileId) return res.status(400).json({ message: "profileId es requerido" });

    const postulantDocId = postulant._id;
    const userId = postulant.postulantId ?? null;
    const profileFilter = userId
      ? { $or: [{ postulantId: postulantDocId }, { postulantId: userId }] }
      : { postulantId: postulantDocId };

    const postulantProfile = await PostulantProfile.findOne({
      _id: queryProfileId,
      ...profileFilter,
    })
      .populate("levelJob", "value name")
      .populate("companySector", "value name")
      .lean();
    if (!postulantProfile) return res.status(404).json({ message: "Perfil no encontrado" });

    const profileId = postulantProfile._id;
    const allBaseProfiles = await PostulantProfile.find(profileFilter).select("_id").lean();
    const allProfileIds = allBaseProfiles.map((p) => p._id);

    let selectedProfileVersion = null;
    if (queryVersionId && profileId) {
      const versionDoc = await ProfileProfileVersion.findOne({
        _id: queryVersionId,
        profileId,
      }).lean();
      if (versionDoc) selectedProfileVersion = versionDoc;
    }
    const versionFilter = selectedProfileVersion
      ? { profileId, profileVersionId: selectedProfileVersion._id }
      : { profileId, $or: [{ profileVersionId: null }, { profileVersionId: { $exists: false } }] };

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
        .populate("programId", "name code level")
        .populate({ path: "programFacultyId", select: "code facultyId", populate: { path: "facultyId", select: "name sucursalId", populate: { path: "sucursalId", select: "nombre codigo" } } })
        .populate("university", "value description")
        .populate("countryId", "name")
        .populate("stateId", "name")
        .populate("cityId", "name")
        .lean(),
      ProfileGraduateProgram.find({ profileId })
        .populate("programId", "name code level")
        .populate({ path: "programFacultyId", select: "code facultyId", populate: { path: "facultyId", select: "name sucursalId", populate: { path: "sucursalId", select: "nombre codigo" } } })
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
      ProfileSkill.find(versionFilter).populate("skillId", "name").lean(),
      ProfileLanguage.find(versionFilter)
        .populate("language", "value name")
        .populate("level", "value name")
        .lean(),
      ProfileAward.find({ profileId: allProfileIds.length ? { $in: allProfileIds } : profileId })
        .populate("awardType", "value name")
        .sort({ awardDate: -1, dateCreation: -1 })
        .lean(),
      ProfileReference.find({ profileId: allProfileIds.length ? { $in: allProfileIds } : profileId }).lean(),
      ProfileOtherStudy.find({ profileId }).lean(),
      ProfileInterestArea.find(versionFilter).populate("area", "value name").lean(),
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

    const profileData = {
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
    };

    const postulantFull = await Postulant.findById(postulantDocId)
      .populate("postulantId", "name email")
      .populate("typeOfIdentification", "name value")
      .lean();
    if (!postulantFull) return res.status(404).json({ message: "Postulante no encontrado" });

    let parametrizacion = await DocumentParametrization.findOne({ type: "hoja_vida" }).lean();
    if (!parametrizacion) {
      parametrizacion = { logoBase64: null, formatSecciones: [], camposObligatorios: {} };
    }

    const pdfBuffer = await buildHojaVidaPdf(postulantFull, profileData, parametrizacion);
    const baseName = (selectedProfileVersion?.profileName || postulantFull?.postulantId?.name || "Hoja de vida").replace(/[^\w\s\u00C0-\u00FF-]/g, "").trim() || "Hoja de vida";
    const displayName = `${baseName}.pdf`;

    const uploadsDir = getUploadsRoot();
    const cvDir = path.join(uploadsDir, "cv");
    if (!fs.existsSync(cvDir)) fs.mkdirSync(cvDir, { recursive: true });
    const safeFileName = `hoja-vida-${String(profileId).slice(-8)}-${Date.now()}.pdf`;
    const relativePath = path.join("cv", safeFileName);
    const fullPath = path.join(uploadsDir, relativePath);
    fs.writeFileSync(fullPath, pdfBuffer);

    const attachment = await Attachment.create({
      name: displayName,
      contentType: "application/pdf",
      filepath: relativePath.replace(/\\/g, "/"),
      status: "active",
      dateCreation: new Date(),
      userCreator: req.user?.name || req.user?.email || "api",
    });

    await ProfileCv.create({
      profileId,
      attachmentId: attachment._id,
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${displayName}"`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error("[generateHojaVidaPdf]", error);
    res.status(500).json({ message: error.message || "Error al generar el PDF" });
  }
};

/** GET /postulants/:id/generate-carta-presentacion-pdf?empresa=...&ciudad=... — Genera y devuelve el PDF de la carta de presentación. */
export const generateCartaPresentacionPdf = async (req, res) => {
  try {
    const { id } = req.params;
    const empresa = (req.query.empresa && String(req.query.empresa).trim()) || "";
    const ciudad = (req.query.ciudad && String(req.query.ciudad).trim()) || "";
    if (!empresa || !ciudad) {
      return res.status(400).json({ message: "Los parámetros empresa y ciudad son requeridos" });
    }

    let postulant = await Postulant.findById(id).select("_id postulantId").lean();
    if (!postulant) postulant = await Postulant.findOne({ postulantId: id }).select("_id postulantId").lean();
    if (!postulant) return res.status(404).json({ message: "Postulante no encontrado" });

    const postulantDocId = postulant._id;
    const userId = postulant.postulantId ?? null;
    const profileFilter = userId
      ? { $or: [{ postulantId: postulantDocId }, { postulantId: userId }] }
      : { postulantId: postulantDocId };

    const firstProfile = await PostulantProfile.findOne(profileFilter).select("_id").lean();
    if (!firstProfile) return res.status(404).json({ message: "El postulante no tiene perfil. Debe crear al menos un perfil." });

    const profileId = firstProfile._id;
    const enrolledPrograms = await ProfileEnrolledProgram.find({ profileId })
      .populate("programId", "name code level")
      .populate({
        path: "programFacultyId",
        select: "code facultyId",
        populate: {
          path: "facultyId",
          select: "name sucursalId",
          populate: { path: "sucursalId", select: "nombre codigo" },
        },
      })
      .lean();

    const enrolledIds = enrolledPrograms.map((e) => e._id);
    const programExtraInfoFiltered =
      enrolledIds.length > 0
        ? await ProfileProgramExtraInfo.find({ enrolledProgramId: { $in: enrolledIds } }).lean()
        : [];

    const profileData = {
      enrolledPrograms,
      programExtraInfo: programExtraInfoFiltered,
    };

    const postulantFull = await Postulant.findById(postulantDocId)
      .populate("postulantId", "name email code")
      .populate("typeOfIdentification", "name value")
      .lean();
    if (!postulantFull) return res.status(404).json({ message: "Postulante no encontrado" });

    let parametrizacion = await DocumentParametrization.findOne({ type: "carta_presentacion" }).lean();
    if (!parametrizacion) {
      parametrizacion = {
        logoBase64: null,
        textosInternos: { encabezado: "", cuerpo: "", cierre: "" },
        firmaBase64: null,
        firmaDatos: { nombre: "", cargo: "", unidad: "" },
        opcionFechaCarta: "fecha_actual",
      };
    }

    const pdfBuffer = await buildCartaPresentacionPdf(postulantFull, profileData, parametrizacion, { empresa, ciudad });
    const baseName = (postulantFull?.postulantId?.name || "Carta de presentación").replace(/[^\w\s\u00C0-\u00FF-]/g, "").trim() || "Carta de presentación";
    const displayName = `${baseName}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${displayName}"`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error("[generateCartaPresentacionPdf]", error);
    res.status(500).json({ message: error.message || "Error al generar el PDF de la carta de presentación" });
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

    const uploadsDir = getUploadsRoot();
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
  if (mapped.gender_postulant !== undefined) {
    mapped.gender = mapped.gender_postulant || null;
    delete mapped.gender_postulant;
  }
  delete mapped.identity_postulant;
  delete mapped.student_code;
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
    ? { name: p.postulantId.name, email: p.postulantId.email, code: p.postulantId.code, estado: p.postulantId.estado }
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
