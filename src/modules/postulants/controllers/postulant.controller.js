import bcrypt from "bcryptjs";
import Postulant from "../models/postulants.schema.js";
import PostulantProfile from "../models/profile/profile.schema.js";
import PostulantAcademic from "../models/postulant_academic.schema.js";
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
import Country from "../../shared/location/models/country.schema.js";
import State from "../../shared/location/models/state.schema.js";
import City from "../../shared/location/models/city.schema.js";
import { MAX_PROFILES_PER_POSTULANT } from "./postulantProfile.controller.js";
import { consultaInfEstudiante, consultaInfAcademica } from "../../../services/uxxiIntegration.service.js";
import { descargarYFiltrarPostulantes } from "../../estudiantesHabilitados/carguePostulantes.sftp.js";
import Program from "../../program/model/program.model.js";
import Item from "../../shared/reference-data/models/item.schema.js";
import Attachment from "../../shared/attachment/attachment.schema.js";
import DocumentParametrization from "../../parametrizacionDocumentos/documentParametrization.schema.js";
import Periodo from "../../periodos/periodo.model.js";
import EstudianteHabilitado from "../../estudiantesHabilitados/estudianteHabilitado.model.js";
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
    const { status, search, userEstado } = req.query;

    const postulantFilter = {};
    if (status && String(status).trim()) postulantFilter.estatePostulant = String(status).trim();

    // Filtrar por User.estado (activos/inactivos) — sin restringir por modulo
    let allowedUserIds = null; // null = sin restricción de tab
    if (userEstado !== undefined && userEstado !== "") {
      const estadoBoolean = userEstado === "true" || userEstado === "1";
      const usersConEstado = await User.find({ estado: estadoBoolean }).select("_id").lean();
      allowedUserIds = usersConEstado.map((u) => u._id);
    }

    if (search && String(search).trim()) {
      const term = String(search).trim();
      const regexOpt = { $regex: term, $options: "i" };

      // Búsqueda de usuarios, acotada a los permitidos por el tab si aplica
      const userSearchFilter = { $or: [{ name: regexOpt }, { email: regexOpt }, { code: regexOpt }] };
      if (allowedUserIds !== null) userSearchFilter._id = { $in: allowedUserIds };

      const [users, profilesWithStudentCode] = await Promise.all([
        User.find(userSearchFilter).select("_id").lean(),
        PostulantProfile.find({ studentCode: regexOpt }).select("postulantId").lean(),
      ]);
      const userIds = users.map((u) => u._id);
      const postulantDocIds = profilesWithStudentCode.map((p) => p.postulantId).filter(Boolean);
      const orClause = [];
      if (userIds.length) orClause.push({ postulantId: { $in: userIds } });
      if (postulantDocIds.length) orClause.push({ _id: { $in: postulantDocIds } });
      if (orClause.length) postulantFilter.$or = orClause;
      else postulantFilter.postulantId = { $in: [] };
    } else if (allowedUserIds !== null) {
      // Sin búsqueda pero con filtro de tab: aplicar directamente
      postulantFilter.postulantId = { $in: allowedUserIds };
    }

    const [postulants, total] = await Promise.all([
      Postulant.find(postulantFilter)
        .populate("postulantId", "_id name email code estado")
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
      user_estado: p.postulantId?.estado ?? true,
      user: p.postulantId
        ? {
            _id: p.postulantId._id,
            name: p.postulantId.name || "",
            lastname: "",
            email: p.postulantId.email || "",
            code: p.postulantId.code || null,
            estado: p.postulantId.estado ?? true,
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

    const profile = await PostulantProfile.findOne({ postulantId: postulant._id }).select("acceptTerms").lean();
    const response = formatPostulantProfileResponse(postulant);
    response.acept_terms = profile?.acceptTerms ?? false;
    res.json(response);
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
 * Aplica los ítems de Universitas al perfil (programas en curso, finalizados y extra info).
 * Usado por aplicarInfoAcademicaUniversitas y por generateCartaPresentacionPdf.
 * @returns {{ ok: true, enrolledPrograms, graduatePrograms, programExtraInfo } | { ok: false, message: string, missingPrograms?: Array }}
 */
async function applyUniversitasItemsToProfile(universitasItems, profile, userLabel) {
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
    return {
      ok: false,
      message: "No existen los siguientes programas en el sistema. Deben darse de alta en la tabla de programas antes de aplicar.",
      missingPrograms: missingPrograms.map((p) => ({ code: p.code, name: p.name })),
      detail: list,
    };
  }
  const programIdsEnrolled = enrolledList.map((e) => e.programId);
  const programIdsGraduate = graduateList.map((e) => e.programId);

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
  return { ok: true, enrolledPrograms, graduatePrograms, programExtraInfo };
}

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

    const result = await applyUniversitasItemsToProfile(universitasItems, profile, userLabel);
    if (!result.ok) {
      return res.status(400).json({
        message: result.message,
        missingPrograms: result.missingPrograms,
        detail: result.detail,
      });
    }
    res.json({
      message: "Información académica aplicada.",
      enrolledPrograms: result.enrolledPrograms,
      graduatePrograms: result.graduatePrograms,
      programExtraInfo: result.programExtraInfo,
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

/**
 * Comprueba si el estudiante puede generar carta de presentación:
 * - Solo durante el periodo en que está autorizado para práctica (fechaAutorizacion del periodo activo).
 * - Debe estar en estudiantes_habilitados con estadoFinal "AUTORIZADO" para ese periodo.
 * Busca por postulant, user o identificacion (documento), por si el registro solo tiene identificacion.
 * @returns {{ allowed: boolean, message?: string }}
 */
async function checkCanGenerateCartaPresentacion(postulantDocId, userId, identificacion) {
  const now = new Date();
  const periodosActivos = await Periodo.find({
    tipo: "practica",
    estado: { $in: ["Activo", "activo"] },
  })
    .select("_id fechaAutorizacion")
    .lean();
  const periodoIds = (periodosActivos || [])
    .filter((p) => {
      const ini = p.fechaAutorizacion?.inicio;
      const fin = p.fechaAutorizacion?.fin;
      if (ini == null && fin == null) return true;
      if (ini != null && fin != null) return ini <= now && fin >= now;
      if (ini != null && fin == null) return ini <= now;
      if (ini == null && fin != null) return fin >= now;
      return false;
    })
    .map((p) => p._id);
  if (periodoIds.length === 0) {
    return {
      allowed: false,
      message:
        "La generación de carta de presentación solo está habilitada durante los periodos de autorización para práctica. No hay un periodo activo en este momento.",
    };
  }
  const orConditions = [];
  if (postulantDocId) orConditions.push({ postulant: postulantDocId });
  if (userId) orConditions.push({ user: userId });
  const idDoc = identificacion != null && String(identificacion).trim() !== "" ? String(identificacion).trim() : null;
  if (idDoc) orConditions.push({ identificacion: idDoc });
  if (orConditions.length === 0) {
    return {
      allowed: false,
      message:
        "No se pudo verificar la habilitación del estudiante (falta postulante o documento).",
    };
  }
  const filter = {
    periodo: { $in: periodoIds },
    $and: [
      { $or: [{ estadoFinal: "AUTORIZADO" }, { estadoCurricular: "AUTORIZADO" }] },
      { $or: orConditions },
    ],
  };
  const habilitado = await EstudianteHabilitado.findOne(filter).select("_id codigoPrograma").lean();
  if (!habilitado) {
    return {
      allowed: false,
      message:
        "Solo los estudiantes autorizados para práctica en el periodo actual pueden generar carta de presentación. Si ya finalizó su práctica, debe ser habilitado nuevamente para un nuevo periodo académico.",
    };
  }
  const codigoPrograma =
    habilitado.codigoPrograma != null && String(habilitado.codigoPrograma).trim() !== ""
      ? String(habilitado.codigoPrograma).trim()
      : null;
  return { allowed: true, codigoPrograma };
}

/** GET /postulants/:id/can-generate-carta-presentacion — Indica si el estudiante puede generar carta (autorizado en periodo actual). Identificación = studentCode del perfil, no user.code. */
export const canGenerateCartaPresentacion = async (req, res) => {
  try {
    const { id } = req.params;
    let postulant = await Postulant.findById(id).select("_id postulantId").lean();
    if (!postulant) postulant = await Postulant.findOne({ postulantId: id }).select("_id postulantId").lean();
    if (!postulant) return res.status(404).json({ message: "Postulante no encontrado" });
    const postulantProfile = await PostulantProfile.findOne({ postulantId: postulant._id }).select("studentCode").lean();
    const identificacion =
      postulantProfile?.studentCode != null && String(postulantProfile.studentCode).trim() !== ""
        ? String(postulantProfile.studentCode).trim()
        : null;
    const result = await checkCanGenerateCartaPresentacion(
      postulant._id,
      postulant.postulantId ?? null,
      identificacion
    );
    return res.json({ allowed: result.allowed, message: result.message || null });
  } catch (error) {
    console.error("[canGenerateCartaPresentacion]", error);
    return res.status(500).json({ message: error.message || "Error al verificar" });
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
    const postulantProfile = await PostulantProfile.findOne({ postulantId: postulantDocId })
      .select("_id studentCode")
      .lean();
    if (!postulantProfile) return res.status(404).json({ message: "El postulante no tiene perfil. Debe crear al menos un perfil." });

    const identificacion =
      postulantProfile.studentCode != null && String(postulantProfile.studentCode).trim() !== ""
        ? String(postulantProfile.studentCode).trim()
        : null;
    const check = await checkCanGenerateCartaPresentacion(
      postulant._id,
      postulant.postulantId ?? null,
      identificacion
    );
    if (!check.allowed) {
      return res.status(403).json({ message: check.message || "No está habilitado para generar carta de presentación." });
    }

    if (!identificacion) {
      return res.status(400).json({ message: "El perfil del postulante debe tener studentCode (cédula) para actualizar la información académica y generar la carta." });
    }

    // Siempre actualizar la información académica con la integración (getInfoAcademica) antes de generar la carta
    let universitasItems;
    try {
      universitasItems = await consultaInfAcademica(identificacion);
    } catch (err) {
      return res.status(502).json({
        message: err.message || "Error al conectar con Universitas al obtener información académica. Intente de nuevo.",
      });
    }
    if (!universitasItems || universitasItems.length === 0) {
      return res.status(400).json({
        message: "No se encontró información académica del estudiante en Universitas. Verifique que tenga programa en curso y vuelva a intentar.",
      });
    }
    const userLabel = req.user?.name || req.user?.email || "sistema";
    const applyResult = await applyUniversitasItemsToProfile(universitasItems, postulantProfile, userLabel);
    if (!applyResult.ok) {
      return res.status(400).json({
        message: applyResult.message || "No se pudo actualizar la información académica. " + (applyResult.detail || ""),
      });
    }

    const profileId = postulantProfile._id;
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

    const enrolledWithFaculty = enrolledPrograms.filter((e) => e.programFacultyId != null);
    if (enrolledWithFaculty.length === 0) {
      return res.status(400).json({
        message: "El estudiante no tiene un programa en curso con facultad asociada. Actualice la información académica desde la pestaña correspondiente.",
      });
    }
    const hasValidExtra = enrolledWithFaculty.some((ep) => {
      const extra = programExtraInfoFiltered.find(
        (ex) => ex.enrolledProgramId?.toString?.() === ep._id?.toString?.()
      );
      return (
        (extra?.approvedCredits != null && extra.approvedCredits !== "") ||
        (extra?.totalCredits != null && extra.totalCredits !== "") ||
        (extra?.cumulativeAverage != null && extra.cumulativeAverage !== "")
      );
    });
    if (!hasValidExtra) {
      return res.status(400).json({
        message: "El estudiante no tiene información de créditos o promedio acumulado para el programa en curso. Actualice la información académica desde la pestaña correspondiente.",
      });
    }

    const profileData = {
      postulantProfile,
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

    const codigoPrograma = check.codigoPrograma || null;
    const pdfBuffer = await buildCartaPresentacionPdf(postulantFull, profileData, parametrizacion, { empresa, ciudad, codigoPrograma });
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

    // Activar / inactivar el User asociado (toggle de la tabla)
    if (req.body.user_estado !== undefined) {
      const nuevoEstadoUser = req.body.user_estado === true || req.body.user_estado === "true";
      await User.findByIdAndUpdate(postulant.postulantId, { estado: nuevoEstadoUser });
      return res.json({ message: "Estado del usuario actualizado", user_estado: nuevoEstadoUser });
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
    if (req.body.full_profile !== undefined) {
      postulant.filled = req.body.full_profile === true || req.body.full_profile === "true";
    }
    postulant.fillingPercentage = calculateCompleteness(postulant);
    await postulant.save();

    if (req.body.acept_terms !== undefined) {
      const aceptTermsVal = req.body.acept_terms === true || req.body.acept_terms === "true";
      await PostulantProfile.updateMany(
        { postulantId: postulant._id },
        { $set: { acceptTerms: aceptTermsVal } }
      );
    }

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
    const response = formatPostulantProfileResponse(updated);
    const profile = await PostulantProfile.findOne({ postulantId: updated._id }).select("acceptTerms").lean();
    response.acept_terms = profile?.acceptTerms ?? false;
    res.json(response);
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
    acept_terms: false, // Sobrescrito en getPostulantById desde PostulantProfile.acceptTerms
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

/** Calcula el diff entre el archivo UXXI y la BD sin aplicar cambios.
 *  Clave de comparación: Excel.identificacion  ↔  PostulantProfile.studentCode
 *
 *  Estrategia optimizada:
 *  - Query 1: solo los studentCodes (lean, sin populate) → O(n) muy rápido
 *  - Query 2: solo para los códigos a inactivar → aggregation $lookup acotado
 *  - Query 1 y el parseo SFTP corren en paralelo
 */
async function calcularDiffUxxi() {
  const t0 = Date.now();

  // 1. SFTP + query lean de códigos en PARALELO ──────────────────────────────
  const [filasExcel, codesEnBD] = await Promise.all([
    descargarYFiltrarPostulantes(),
    // Solo traemos studentCode — sin populate ni campos extra
    PostulantProfile
      .find({ studentCode: { $exists: true, $ne: "" } })
      .select("studentCode")
      .lean(),
  ]);

  console.log(`[calcularDiffUxxi] SFTP+DB lean en ${Date.now() - t0}ms | Excel: ${filasExcel.length} | Perfiles BD: ${codesEnBD.length}`);

  // Set de códigos en BD (lookup O(1))
  const setBD = new Set(codesEnBD.map(p => String(p.studentCode || "").trim().toLowerCase()));

  // Set de identificaciones únicas en el archivo
  const idEnArchivo = new Set(
    filasExcel.map(f => String(f.identificacion || "").trim()).filter(Boolean)
  );

  // Cargar User.code y User.email para detectar usuarios que ya existen en la
  // colección users aunque no tengan PostulantProfile (evitar duplicado de User)
  const userCodesRaw  = await User.find({}, { code: 1, email: 1 }).lean();
  // Mapa code→User._id y email→User._id para poder reusar el _id en la creación de perfil
  const mapUserByCode  = new Map(userCodesRaw.filter(u => u.code ).map(u => [String(u.code ).trim().toLowerCase(), u._id]));
  const mapUserByEmail = new Map(userCodesRaw.filter(u => u.email).map(u => [String(u.email).trim().toLowerCase(), u._id]));
  console.log(`[calcularDiffUxxi] Users en BD: ${userCodesRaw.length}`);

  // 2. Diff directo ──────────────────────────────────────────────────────────
  const porCrear      = []; // No existe ni en User ni en Profile → crear todo
  const porCompletar  = []; // Existe en User pero NO en Profile → crear solo Postulant + Profile + dependientes
  const existentes    = []; // Existe en Profile → ignorar
  const vistos        = new Set();

  for (const fila of filasExcel) {
    const id    = String(fila.identificacion || "").trim();
    const email = String(fila.correo        || "").toLowerCase().trim();
    if (!id || vistos.has(id.toLowerCase())) continue;
    vistos.add(id.toLowerCase());

    const enProfile = setBD.has(id.toLowerCase());
    if (enProfile) {
      existentes.push({ identificacion: id });
      continue;
    }

    // Buscar si ya existe como User (por code o email)
    const existingUserId = mapUserByCode.get(id.toLowerCase())
      || (email ? mapUserByEmail.get(email) : null);

    if (existingUserId) {
      // User existe pero sin perfil → completar solo los documentos dependientes
      porCompletar.push({
        identificacion: id,
        nombre:         [fila.nombres, fila.apellidos].filter(Boolean).join(" ").trim() || id,
        correo:         fila.correo,
        programa:       fila.codProgramaCurso,
        existingUserId, // _id del User ya existente
      });
    } else {
      // Completamente nuevo
      porCrear.push({
        identificacion: id,
        nombre:         [fila.nombres, fila.apellidos].filter(Boolean).join(" ").trim() || id,
        correo:         fila.correo,
        programa:       fila.codProgramaCurso,
      });
    }
  }

  // Códigos que están en BD pero ya NO están en el archivo
  const codesAInactivar = codesEnBD
    .map(p => String(p.studentCode || "").trim())
    .filter(code => code && !idEnArchivo.has(code));

  console.log(`[calcularDiffUxxi] Diff en ${Date.now() - t0}ms | porCrear=${porCrear.length} | porCompletar=${porCompletar.length} | codesAInactivar=${codesAInactivar.length}`);

  // 3. Para los que hay que inactivar: obtener userId vía aggregation acotada ─
  //    Solo procesamos los códigos que realmente van a cambiar.
  let porInactivar = [];
  if (codesAInactivar.length > 0) {
    const t1 = Date.now();
    // $lookup en una sola query: Profile → Postulant → User
    const inactivarDocs = await PostulantProfile.aggregate([
      { $match: { studentCode: { $in: codesAInactivar } } },
      { $project: { studentCode: 1, postulantId: 1 } },
      // Profile.postulantId → Postulant._id
      { $lookup: {
          from: "postulants",
          localField: "postulantId",
          foreignField: "_id",
          as: "postulant",
          pipeline: [{ $project: { postulantId: 1 } }],
      }},
      { $unwind: { path: "$postulant", preserveNullAndEmptyArrays: false } },
      // Postulant.postulantId → User._id
      { $lookup: {
          from: "users",
          localField: "postulant.postulantId",
          foreignField: "_id",
          as: "user",
          pipeline: [{ $project: { name: 1, estado: 1 } }],
      }},
      { $unwind: { path: "$user", preserveNullAndEmptyArrays: false } },
      { $match: { "user.estado": { $ne: false } } }, // solo activos
      { $project: { studentCode: 1, userId: "$user._id", nombre: "$user.name" } },
    ]);

    porInactivar = inactivarDocs.map(d => ({
      identificacion: d.studentCode,
      nombre:         d.nombre || d.studentCode,
      userId:         d.userId,
    }));
    console.log(`[calcularDiffUxxi] Aggregation inactivar en ${Date.now() - t1}ms → ${porInactivar.length} usuarios activos`);
  }

  // perfilPorCode para el paso de creación (solo necesitamos saber si existe)
  const perfilPorCode = setBD;

  console.log(`[calcularDiffUxxi] TOTAL ${Date.now() - t0}ms`);

  return {
    totalArchivo:  filasExcel.length,
    totalBD:       codesEnBD.length,
    porCrear,
    porCompletar,
    existentes,        // array con { identificacion } — para la fase de actualización
    porInactivar,
    filasExcel,
    perfilPorCode, // Set — .has(id.toLowerCase())
  };
}

/**
 * Carga en memoria todos los catálogos necesarios para el mapeo de datos del Excel.
 * Se llama UNA sola vez antes del loop de creación para evitar miles de queries.
 */
async function buildCatalogosUxxi() {
  // Géneros L_GENDER: H→M, F→F, X→NB, T→T
  const genderItems = await Item.find({ listId: "L_GENDER", status: "ACTIVE" }).lean();
  const genderMap = new Map(genderItems.map(i => [String(i.value || "").toUpperCase(), i._id]));
  // Excel usa H para Masculino (value "M" en BD)
  const excelGenderMap = {
    H: genderMap.get("M"),
    F: genderMap.get("F"),
    X: genderMap.get("NB"),
    T: genderMap.get("T"),
  };

  // Países: isoNumeric → _id
  const countries = await Country.find({}).select("_id isoNumeric").lean();
  const countryByIso = new Map(
    countries.filter(c => c.isoNumeric != null).map(c => [Number(c.isoNumeric), c._id])
  );

  // Estados: dianCode (string, p.ej "05") → _id
  const states = await State.find({}).select("_id dianCode").lean();
  const stateByDian = new Map(
    states.filter(s => s.dianCode).map(s => [String(s.dianCode).trim(), s._id])
  );

  // Ciudades: codDian → _id  (codDian es el compuesto de 5 dígitos)
  const cities = await City.find({}).select("_id codDian").lean();
  const cityByCodDian = new Map(
    cities.filter(c => c.codDian).map(c => [String(c.codDian).trim(), c._id])
  );

  // ProgramFaculty: code → { _id, programId }
  const programFaculties = await ProgramFaculty.find({ activo: "SI" })
    .select("_id code programId")
    .lean();
  const pfByCode = new Map(
    programFaculties.map(pf => [String(pf.code || "").trim().toUpperCase(), pf])
  );

  return { excelGenderMap, countryByIso, stateByDian, cityByCodDian, pfByCode };
}

/** Convierte el código de departamento (dianCode) + código de ciudad del Excel al codDian completo de 5 dígitos.
 *  Ejemplo: dept="23", city="1" → "23001"; dept="23", city="568" → "23568" */
function buildCodDian(deptCode, cityCode) {
  if (!deptCode || !cityCode) return null;
  const dept = String(deptCode).trim();
  const city = String(cityCode).trim();
  if (!dept || !city) return null;
  // El cod DIAN de ciudad tiene 5 dígitos: los primeros 2 son el depto, los últimos 3 la ciudad
  const cityPart = city.padStart(3, "0");
  return `${dept}${cityPart}`;
}

/**
 * POST /postulants/preview-sincronizar-uxxi
 * Solo lee el archivo y la BD, devuelve el resumen sin modificar nada.
 */
export const previewSincronizarUxxi = async (req, res) => {
  console.log("[previewSincronizarUxxi] Calculando diff...");
  try {
    const diff = await calcularDiffUxxi();
    res.json({
      totalArchivo:           diff.totalArchivo,
      totalBD:                diff.totalBD,
      porCrear:               diff.porCrear,
      porCompletar:           diff.porCompletar,
      porInactivar:           diff.porInactivar,
      existentes:             diff.existentes.length,
      cantidadExistentes:     diff.existentes.length,
      cantidadPorCrear:       diff.porCrear.length,
      cantidadPorCompletar:   diff.porCompletar.length,
      cantidadPorInactivar:   diff.porInactivar.length,
    });
  } catch (err) {
    console.error("[previewSincronizarUxxi] ERROR:", err.message);
    res.status(500).json({ message: "Error al calcular preview", error: err.message });
  }
};

/**
 * POST /postulants/sincronizar-uxxi
 * Aplica los cambios: crea los nuevos (con studentCode = identificacion),
 * inactiva los que ya no aparecen en el archivo (por studentCode).
 */
export const sincronizarPostulantesUxxi = async (req, res) => {
  const CHUNK = 50; // registros por lote de creación
  const log   = (...args) => console.log("[sincronizarUxxi]", ...args);
  log("── INICIO ──────────────────────────────────────────");

  try {
    // ── Email del usuario logueado (para userCreator) ────────────────────────
    let userCreatorEmail = "sincronizacion-uxxi";
    if (req.user?.id) {
      const userLogueado = await User.findById(req.user.id).select("email").lean();
      if (userLogueado?.email) userCreatorEmail = userLogueado.email;
    }
    log(`[INICIO] Ejecutado por: ${userCreatorEmail}`);

    // ── Diff + catálogos en paralelo ────────────────────────────────────────────
    const [diff, catalogos] = await Promise.all([
      calcularDiffUxxi(),
      buildCatalogosUxxi(),
    ]);
    const { filasExcel, porCrear, porCompletar, porInactivar, existentes, perfilPorCode } = diff;
    const { excelGenderMap, countryByIso, stateByDian, cityByCodDian, pfByCode } = catalogos;

    if (filasExcel.length === 0) {
      return res.json({ message: "El archivo UXXI está vacío.", creados: 0, inactivados: 0, errores: [] });
    }

    // Mapa rápido id → fila
    const filaPorId = new Map(filasExcel.map(f => [String(f.identificacion || "").trim(), f]));

    // ════════════════════════════════════════════════════════════════════════════
    // FASE 1 — INACTIVAR en bulk (una sola query, inmediata)
    // ════════════════════════════════════════════════════════════════════════════
    const userIdsInactivar = porInactivar.map(i => i.userId).filter(Boolean);
    let inactivados = 0;

    if (userIdsInactivar.length > 0) {
      log(`[FASE 1] Inactivando ${userIdsInactivar.length} usuarios con bulkWrite…`);
      const bulkResult = await User.bulkWrite(
        userIdsInactivar.map(uid => ({
          updateOne: {
            filter: { _id: uid },
            update: { $set: { estado: false } },
          },
        })),
        { ordered: false } // continúa aunque falle alguno
      );
      inactivados = bulkResult.modifiedCount;
      log(`[FASE 1] Inactivados: ${inactivados}`);
    } else {
      log("[FASE 1] Nada que inactivar.");
    }

    // ════════════════════════════════════════════════════════════════════════════
    // FASE 2 — CREAR en lotes de ${CHUNK}
    //   Dentro de cada chunk se pre-hashean las contraseñas en paralelo,
    //   se insertan Users con insertMany, y luego se procesan los registros
    //   dependientes (Postulant, Profile, Academic, EnrolledPrograms) en paralelo.
    // ════════════════════════════════════════════════════════════════════════════
    let creados = 0;
    const errores = [];

    // Filtrar duplicados del propio Excel antes de iterar
    const candidatos = [];
    const vistosEnRun = new Set();
    for (const item of porCrear) {
      const id = String(item.identificacion || "").trim();
      if (!id || !filaPorId.get(id) || perfilPorCode.has(id.toLowerCase()) || vistosEnRun.has(id)) continue;
      vistosEnRun.add(id);
      candidatos.push(id);
    }

    log(`[FASE 2] Candidatos a crear: ${candidatos.length} | lotes de ${CHUNK}`);

    for (let i = 0; i < candidatos.length; i += CHUNK) {
      const chunk = candidatos.slice(i, i + CHUNK);
      log(`[FASE 2] Lote ${Math.floor(i / CHUNK) + 1}/${Math.ceil(candidatos.length / CHUNK)} (${chunk.length} registros)`);

      // ── a) Pre-hashear contraseñas en paralelo ──────────────────────────────
      const hashes = await Promise.all(chunk.map(id => bcrypt.hash(id, 10)));

      // ── b) Preparar documentos User ────────────────────────────────────────
      const userDocs = chunk.map((id, idx) => {
        const fila     = filaPorId.get(id);
        const email    = String(fila.correo || "").toLowerCase().trim();
        const fullName = [fila.nombres, fila.apellidos].filter(Boolean).join(" ").trim() || `Estudiante ${id}`;
        return {
          _id:                 new mongoose.Types.ObjectId(),
          name:                fullName,
          email:               email || `${id}@urosario.edu.co`,
          code:                id,
          password:            hashes[idx],
          modulo:              "estudiante",
          estado:              true,
          debeCambiarPassword: true,
          directorioActivo:    false,
        };
      });

      // ── c) insertMany Users (ordered:false → no para en el 1er duplicado) ──
      let insertedUsers;
      try {
        insertedUsers = await User.insertMany(userDocs, { ordered: false });
      } catch (bulkErr) {
        // insertMany con ordered:false lanza error pero igual inserta los buenos
        insertedUsers = bulkErr.insertedDocs || [];
        const failedIds = new Set(
          (bulkErr.writeErrors || []).map(e => String(e.err?.op?.code || ""))
        );
        (bulkErr.writeErrors || []).forEach(e => {
          const failId = e.err?.op?.code || "?";
          log(`  [SKIP-USER] ${failId}: duplicado`);
          errores.push({ identificacion: failId, error: "Usuario duplicado (email/code)" });
        });
        // Filtrar candidatos que fallaron para no intentar crear sus dependientes
        chunk.forEach(id => { if (failedIds.has(id)) perfilPorCode.add(id.toLowerCase()); });
      }

      // Mapa userId por code para los inserts dependientes
      const userPorCode = new Map(
        (Array.isArray(insertedUsers) ? insertedUsers : []).map(u => [String(u.code || "").trim(), u])
      );

      // ── d) Crear registros dependientes en paralelo por cada User insertado ─
      const enrolledBuffer = []; // acumula ProfileEnrolledProgram para insertMany al final del lote

      await Promise.all(
        [...userPorCode.entries()].map(async ([id, user]) => {
          const fila = filaPorId.get(id);
          if (!fila) return;

          try {
            const email = String(fila.correo || "").toLowerCase().trim();

            // Geo nacimiento
            const paisNacRaw  = fila.paisNacimiento  ? Number(fila.paisNacimiento)  : null;
            const deptoNacRaw = fila.deptoNacimiento ? String(fila.deptoNacimiento).trim() : null;
            const ciudNacRaw  = fila.ciudadNacimiento ? String(fila.ciudadNacimiento).trim() : null;
            const countryBirthId = paisNacRaw  ? (countryByIso.get(paisNacRaw) || null) : null;
            const stateBirthId   = deptoNacRaw ? (stateByDian.get(deptoNacRaw.padStart(2, "0")) || stateByDian.get(deptoNacRaw) || null) : null;
            const codDianNac     = buildCodDian(deptoNacRaw, ciudNacRaw);
            const cityBirthId    = codDianNac  ? (cityByCodDian.get(codDianNac) || null) : null;

            // Geo residencia
            const paisResRaw  = fila.paisResidencia  ? Number(fila.paisResidencia)  : null;
            const deptoResRaw = fila.deptoResidencia ? String(fila.deptoResidencia).trim() : null;
            const ciudResRaw  = fila.ciudadResidencia ? String(fila.ciudadResidencia).trim() : null;
            const countryResidenceId = paisResRaw  ? (countryByIso.get(paisResRaw) || null) : null;
            const stateResidenceId   = deptoResRaw ? (stateByDian.get(deptoResRaw.padStart(2, "0")) || stateByDian.get(deptoResRaw) || null) : null;
            const codDianRes         = buildCodDian(deptoResRaw, ciudResRaw);
            const cityResidenceId    = codDianRes  ? (cityByCodDian.get(codDianRes) || null) : null;

            // Género
            const genderId = excelGenderMap[String(fila.genero || "").trim().toUpperCase()] || null;

            // Fecha nacimiento
            let dateBirth = null;
            if (fila.fechaNacimiento) {
              const d = new Date(fila.fechaNacimiento);
              if (!isNaN(d.getTime())) dateBirth = d;
            }

            // Postulant
            const postulant = await Postulant.create({
              postulantId:       user._id,
              alternateEmail:    email || `${id}@urosario.edu.co`,
              phone:             fila.celular   || "",
              address:           fila.direccion || "",
              dateBirth,
              gender:            genderId,
              countryBirthId,    stateBirthId,    cityBirthId,
              countryResidenceId,stateResidenceId,cityResidenceId,
              fillingPercentage: 0,
              filled:            false,
            });

            // PostulantProfile
            const academicIdNum = fila.codigoEstudiante ? Number(fila.codigoEstudiante) : null;
            const profile = await PostulantProfile.create({
              postulantId:  postulant._id,
              studentCode:  id,
              academicId:   !isNaN(academicIdNum) ? academicIdNum : null,
              filled:       false,
              dateCreation: new Date(),
              userCreator:  userCreatorEmail,
            });

            // PostulantAcademic
            await PostulantAcademic.create({
              postulant:            postulant._id,
              current_program_code: fila.codProgramaCurso || "",
              current_program_name: fila.tituloCurso      || "",
            });

            // Acumular ProfileEnrolledProgram para insertMany del lote
            const pCodes = [fila.codProgramaCurso, fila.codProgramaCurso2]
              .map(c => String(c || "").trim().toUpperCase())
              .filter(Boolean);

            for (const pCode of pCodes) {
              const pf = pfByCode.get(pCode);
              if (pf?.programId) {
                enrolledBuffer.push({
                  profileId:        profile._id,
                  programId:        pf.programId,
                  programFacultyId: pf._id,
                  dateCreation:     new Date(),
                  userCreator:      userCreatorEmail,
                });
              }
            }

            perfilPorCode.add(id.toLowerCase());
            creados++;
          } catch (innerErr) {
            const msg = innerErr.code === 11000
              ? `Duplicado en registros dependientes para ${id}`
              : innerErr.message;
            log(`  [ERROR-DEP] ${id}: ${msg}`);
            errores.push({ identificacion: id, error: msg });
          }
        })
      );

      // ── e) insertMany ProfileEnrolledProgram del lote ──────────────────────
      if (enrolledBuffer.length > 0) {
        await ProfileEnrolledProgram.insertMany(enrolledBuffer, { ordered: false }).catch(e => {
          log(`  [WARN] Algunos ProfileEnrolledProgram del lote fallaron: ${e.message}`);
        });
      }
    }

    // ════════════════════════════════════════════════════════════════════════════
    // FASE 3 — COMPLETAR perfiles para Users que ya existen sin Postulant/Profile
    // ════════════════════════════════════════════════════════════════════════════
    let completados = 0;

    if (porCompletar.length > 0) {
      log(`[FASE 3] Completando perfiles para ${porCompletar.length} usuarios sin profile…`);

      for (let i = 0; i < porCompletar.length; i += CHUNK) {
        const chunk = porCompletar.slice(i, i + CHUNK);
        const enrolledBufferF3 = [];

        await Promise.all(chunk.map(async (item) => {
          const id   = String(item.identificacion || "").trim();
          const fila = filaPorId.get(id);
          if (!id || !fila || perfilPorCode.has(id.toLowerCase())) return;

          try {
            const email = String(fila.correo || "").toLowerCase().trim();

            // Geo nacimiento
            const paisNacRaw  = fila.paisNacimiento  ? Number(fila.paisNacimiento)  : null;
            const deptoNacRaw = fila.deptoNacimiento ? String(fila.deptoNacimiento).trim() : null;
            const ciudNacRaw  = fila.ciudadNacimiento ? String(fila.ciudadNacimiento).trim() : null;
            const countryBirthId = paisNacRaw  ? (countryByIso.get(paisNacRaw) || null) : null;
            const stateBirthId   = deptoNacRaw ? (stateByDian.get(deptoNacRaw.padStart(2,"0")) || stateByDian.get(deptoNacRaw) || null) : null;
            const cityBirthId    = buildCodDian(deptoNacRaw, ciudNacRaw) ? (cityByCodDian.get(buildCodDian(deptoNacRaw, ciudNacRaw)) || null) : null;

            // Geo residencia
            const paisResRaw  = fila.paisResidencia  ? Number(fila.paisResidencia)  : null;
            const deptoResRaw = fila.deptoResidencia ? String(fila.deptoResidencia).trim() : null;
            const ciudResRaw  = fila.ciudadResidencia ? String(fila.ciudadResidencia).trim() : null;
            const countryResidenceId = paisResRaw  ? (countryByIso.get(paisResRaw) || null) : null;
            const stateResidenceId   = deptoResRaw ? (stateByDian.get(deptoResRaw.padStart(2,"0")) || stateByDian.get(deptoResRaw) || null) : null;
            const cityResidenceId    = buildCodDian(deptoResRaw, ciudResRaw) ? (cityByCodDian.get(buildCodDian(deptoResRaw, ciudResRaw)) || null) : null;

            const genderId = excelGenderMap[String(fila.genero || "").trim().toUpperCase()] || null;
            let dateBirth = null;
            if (fila.fechaNacimiento) { const d = new Date(fila.fechaNacimiento); if (!isNaN(d.getTime())) dateBirth = d; }

            // Verificar si ya tiene Postulant (puede haberse creado por otra vía)
            let postulant = await Postulant.findOne({ postulantId: item.existingUserId }).lean();

            if (!postulant) {
              postulant = await Postulant.create({
                postulantId:       item.existingUserId,
                alternateEmail:    email || `${id}@urosario.edu.co`,
                phone:             fila.celular   || "",
                address:           fila.direccion || "",
                dateBirth,
                gender:            genderId,
                countryBirthId,    stateBirthId,    cityBirthId,
                countryResidenceId,stateResidenceId,cityResidenceId,
                fillingPercentage: 0,
                filled:            false,
              });
            }

            // Crear PostulantProfile con studentCode = identificacion
            const academicIdNum = fila.codigoEstudiante ? Number(fila.codigoEstudiante) : null;
            const profile = await PostulantProfile.create({
              postulantId:  postulant._id,
              studentCode:  id,
              academicId:   !isNaN(academicIdNum) ? academicIdNum : null,
              filled:       false,
              dateCreation: new Date(),
              userCreator:  userCreatorEmail,
            });

            await PostulantAcademic.create({
              postulant:            postulant._id,
              current_program_code: fila.codProgramaCurso || "",
              current_program_name: fila.tituloCurso      || "",
            });

            const pCodes = [fila.codProgramaCurso, fila.codProgramaCurso2]
              .map(c => String(c || "").trim().toUpperCase()).filter(Boolean);
            for (const pCode of pCodes) {
              const pf = pfByCode.get(pCode);
              if (pf?.programId) {
                enrolledBufferF3.push({
                  profileId:        profile._id,
                  programId:        pf.programId,
                  programFacultyId: pf._id,
                  dateCreation:     new Date(),
                  userCreator:      userCreatorEmail,
                });
              }
            }

            perfilPorCode.add(id.toLowerCase());
            completados++;
            log(`  [COMPLETA] ${id} — perfil creado sobre User existente`);
          } catch (innerErr) {
            const msg = innerErr.code === 11000
              ? `Duplicado al completar perfil de ${id}`
              : innerErr.message;
            log(`  [ERROR-COMPLETA] ${id}: ${msg}`);
            errores.push({ identificacion: id, error: msg });
          }
        }));

        if (enrolledBufferF3.length > 0) {
          await ProfileEnrolledProgram.insertMany(enrolledBufferF3, { ordered: false }).catch(e => {
            log(`  [WARN-F3] EnrolledProgram fallaron: ${e.message}`);
          });
        }
      }
      log(`[FASE 3] Completados: ${completados}`);
    }

    log(`── FIN: ${creados} creados, ${completados} completados, ${inactivados} inactivados, ${errores.length} errores ─────`);

    res.json({
      message:     `Sincronización completada: ${creados} creados, ${completados} completados, ${inactivados} inactivados, ${errores.length} errores.`,
      creados,
      completados,
      inactivados,
      errores,
      totalArchivo: filasExcel.length,
    });

  } catch (err) {
    console.error("[sincronizarUxxi] ERROR FATAL:", err.message, err.stack);
    res.status(500).json({ message: "Error en sincronización UXXI", error: err.message });
  }
};
