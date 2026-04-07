/**
 * RQ04_HU004 — Legalización práctica / pasantía (estudiante + coordinación).
 */
import mongoose from "mongoose";
import LegalizacionPractica from "./legalizacionPractica.model.js";
import PostulacionOportunidad from "../opportunities/postulacionOportunidad.model.js";
import Postulant from "../postulants/models/postulants.schema.js";
import DocumentPracticeDefinition from "../documentPracticeDefinition/documentPracticeDefinition.model.js";
import EstudianteHabilitado from "../estudiantesHabilitados/estudianteHabilitado.model.js";
import ProgramFaculty from "../program/model/programFaculty.model.js";
import { ProfileEnrolledProgram, ProfileProgramExtraInfo } from "../postulants/models/profile/index.js";
import { uploadToS3, deleteFromS3, getSignedDownloadUrl, getObjectFromS3 } from "../../config/s3.config.js";
import { esAcuerdoDeVinculacion, buildAcuerdoVinculacionPdfDataFromPostulacion } from "../../services/acuerdoVinculacion.service.js";
import { buildAcuerdoVinculacionPdf } from "../../services/acuerdoVinculacionPdf.service.js";
import {
  loadPracticaPostulacionContext,
  dispatchPracticaNotification,
  entityAndCoordinatorsRecipientContext,
  studentOnlyRecipientContext,
  practicaLegalizacionRevisionLink,
} from "../notificacion/application/practicaOpportunityNotifications.helper.js";

const S3_PREFIX = "legalizaciones-practica";

/** Correo de contacto de la entidad (RQ04_HU005: notificar escenario). */
function emailEntidadDesdeCompany(company) {
  if (!company || typeof company !== "object") return "";
  const fromContacts = Array.isArray(company.contacts)
    ? company.contacts.map((x) => x?.email).find((e) => e && String(e).trim())
    : null;
  return String(company.contact?.email || company.email || fromContacts || "").trim();
}

const MIME_TO_EXT = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

function normalizeExtCodePr(v) {
  return String(v || "")
    .replace(/^\./, "")
    .trim()
    .toLowerCase();
}

function archivoPermitidoPorDefinicionPractica(file, def) {
  const codes = (def.extensionCodes || []).map(normalizeExtCodePractica).filter(Boolean);
  const orig = (file.originalname || "").toLowerCase();
  const dot = orig.lastIndexOf(".");
  const fileExt = dot >= 0 ? orig.slice(dot + 1) : "";
  const fromMime = MIME_TO_EXT[file.mimetype];
  if (!codes.length) {
    return file.mimetype === "application/pdf" && (!fileExt || fileExt === "pdf");
  }
  const candidates = [fileExt, fromMime].filter(Boolean);
  return candidates.some((c) => codes.includes(c));
}

function normalizeExtCodePractica(v) {
  return normalizeExtCodePr(v);
}

function s3ExtensionFromUploadPr(file) {
  const orig = (file.originalname || "").toLowerCase();
  const dot = orig.lastIndexOf(".");
  if (dot >= 0) {
    const ext = orig.slice(dot);
    if (/^\.[a-z0-9]{1,10}$/i.test(ext)) return ext.toLowerCase();
  }
  const fromMime = MIME_TO_EXT[file.mimetype];
  return fromMime ? `.${fromMime}` : ".pdf";
}

function getLegDocPr(leg, definitionId) {
  const id = String(definitionId);
  const m = leg.documentos;
  if (!m || typeof m !== "object") return null;
  return m[id] ?? null;
}

function setLegDocPr(leg, definitionId, docValue) {
  if (!leg.documentos || typeof leg.documentos !== "object") leg.documentos = {};
  const id = String(definitionId);
  if (docValue == null) delete leg.documentos[id];
  else leg.documentos[id] = docValue;
  leg.markModified("documentos");
}

function isValidObjectId24(id) {
  return typeof id === "string" && /^[a-fA-F0-9]{24}$/.test(id);
}

function getClientIp(req) {
  const x = req.headers["x-forwarded-for"];
  if (typeof x === "string" && x.trim()) return x.split(",")[0].trim().slice(0, 64);
  return (req.ip || req.socket?.remoteAddress || "").slice(0, 64) || null;
}

function splitNombreCompleto(name) {
  const s = String(name || "").trim();
  if (!s) return { nombre: "", apellido: "" };
  const parts = s.split(/\s+/);
  if (parts.length === 1) return { nombre: parts[0], apellido: "" };
  return { nombre: parts[0], apellido: parts.slice(1).join(" ") };
}

function pushHistorial(leg, { estadoAnterior, estadoNuevo, userId, detalle, ip }) {
  if (!Array.isArray(leg.historial)) leg.historial = [];
  leg.historial.push({
    estadoAnterior: estadoAnterior ?? null,
    estadoNuevo,
    usuario: userId || null,
    fecha: new Date(),
    detalle: detalle || null,
    ip: ip || null,
  });
  leg.markModified("historial");
}

const populateOppLegalizacion = [
  { path: "company", populate: { path: "contacts" } }, // incluye legalRepresentative en el documento company
  { path: "creadoPor", select: "name email" },
  { path: "periodo", select: "codigo fechaLegalizacion" },
  { path: "tipoVinculacion", select: "value description" },
  { path: "dedicacion", select: "value description" },
  { path: "areaDesempeno", select: "value description" },
  { path: "pais", select: "name sortname" },
  { path: "ciudad", select: "name" },
];

export async function getPostulacionAceptadaEstudiante(req, postulacionId) {
  if (!isValidObjectId24(postulacionId)) return { error: 400, message: "ID de postulación no válido" };
  const userId = req.user?.id;
  if (!userId) return { error: 401, message: "No autenticado" };
  const postulant = await Postulant.findOne({ postulantId: userId }).select("_id").lean();
  if (!postulant) return { error: 403, message: "No es postulante" };
  const po = await PostulacionOportunidad.findOne({
    _id: postulacionId,
    postulant: postulant._id,
    estado: "aceptado_estudiante",
  })
    .populate({ path: "opportunity", populate: populateOppLegalizacion })
    .populate("postulantProfile")
    .lean();
  if (!po) return { error: 404, message: "Postulación no encontrada o no aceptada" };
  return { po, postulant };
}

function fallbackPracticeTypeItemIdFromOportunidad(opp) {
  const tipoVin = opp?.tipoVinculacion;
  const id = tipoVin?._id ?? tipoVin;
  return id && mongoose.Types.ObjectId.isValid(String(id)) ? id : null;
}

/**
 * IDs de ProgramFaculty según lo registrado en estudiantes habilitados (programaFacultad y/o codigoPrograma).
 * No usa el perfil inscrito del estudiante.
 */
async function programFacultyIdsFromEstudiantesHabilitadosRows(rows) {
  const ids = new Set();
  const codesForLookup = [];
  for (const r of rows) {
    const pfRef = r.programaFacultad?._id ?? r.programaFacultad;
    if (pfRef && mongoose.Types.ObjectId.isValid(String(pfRef))) {
      ids.add(String(pfRef));
      continue;
    }
    const cod = String(r.codigoPrograma || "").trim();
    if (cod) codesForLookup.push(cod);
  }
  if (codesForLookup.length) {
    const unique = [...new Set(codesForLookup)];
    const pfs = await ProgramFaculty.find({ code: { $in: unique } })
      .select("_id")
      .lean();
    for (const pf of pfs) {
      if (pf?._id) ids.add(String(pf._id));
    }
  }
  return ids;
}

/**
 * Contexto para documentos de legalización: tipo de práctica (L_PRACTICE_TYPE) y programa-facultad
 * tomados solo de EstudianteHabilitado (mismo periodo que la oferta + postulante/usuario/identificación).
 * Si no hay EH o falta tipoPractica: fallback tipo de vinculación de la oferta (legacy).
 */
async function resolveLegalizacionDocContextFromEstudianteHabilitado(po) {
  const opp = po?.opportunity;
  const out = { practiceTypeId: null, programFacultyIds: new Set(), fromEstudianteHabilitado: false };

  if (!opp) return out;

  const periodoId = opp.periodo?._id ?? opp.periodo;
  if (!periodoId || !mongoose.Types.ObjectId.isValid(String(periodoId))) {
    out.practiceTypeId = fallbackPracticeTypeItemIdFromOportunidad(opp);
    return out;
  }

  const postulantRef = po.postulant?._id ?? po.postulant;
  let userId = null;
  if (postulantRef && mongoose.Types.ObjectId.isValid(String(postulantRef))) {
    const pDoc = await Postulant.findById(postulantRef).select("postulantId").lean();
    userId = pDoc?.postulantId ?? null;
  }

  const studentCode = String(po.postulantProfile?.studentCode || "").trim();

  const orMatch = [];
  if (postulantRef && mongoose.Types.ObjectId.isValid(String(postulantRef))) {
    orMatch.push({ postulant: postulantRef });
  }
  if (userId && mongoose.Types.ObjectId.isValid(String(userId))) {
    orMatch.push({ user: userId });
  }
  if (studentCode) {
    orMatch.push({ identificacion: studentCode });
  }

  if (!orMatch.length) {
    out.practiceTypeId = fallbackPracticeTypeItemIdFromOportunidad(opp);
    return out;
  }

  const rows = await EstudianteHabilitado.find({
    periodo: periodoId,
    $or: orMatch,
  })
    .select("tipoPractica codigoPrograma programaFacultad")
    .lean();

  if (!rows.length) {
    out.practiceTypeId = fallbackPracticeTypeItemIdFromOportunidad(opp);
    return out;
  }

  out.fromEstudianteHabilitado = true;
  out.programFacultyIds = await programFacultyIdsFromEstudiantesHabilitadosRows(rows);

  const tipoIds = [
    ...new Set(
      rows
        .map((r) => {
          const t = r.tipoPractica?._id ?? r.tipoPractica;
          return t && mongoose.Types.ObjectId.isValid(String(t)) ? String(t) : null;
        })
        .filter(Boolean)
    ),
  ];
  if (tipoIds.length === 1) {
    out.practiceTypeId = new mongoose.Types.ObjectId(tipoIds[0]);
  } else if (tipoIds.length > 1) {
    const picked = rows.find((r) => r.tipoPractica);
    const tid = picked?.tipoPractica?._id ?? picked?.tipoPractica;
    out.practiceTypeId =
      tid && mongoose.Types.ObjectId.isValid(String(tid)) ? tid : fallbackPracticeTypeItemIdFromOportunidad(opp);
  } else {
    out.practiceTypeId = fallbackPracticeTypeItemIdFromOportunidad(opp);
  }

  return out;
}

/**
 * Definiciones de documento de práctica: tipo de práctica desde estudiantes habilitados (L_PRACTICE_TYPE),
 * filtro por programFaculties de la definición vs programaFacultad/codigoPrograma del mismo cargue (EH).
 * Fallback sin EH: tipo de vinculación de la oferta y sin filtro por programa-facultad.
 */
export async function listDefinicionesPracticaParaPostulacion(po) {
  const opp = po.opportunity;
  if (!opp) return [];

  const ctx = await resolveLegalizacionDocContextFromEstudianteHabilitado(po);
  if (!ctx.practiceTypeId) return [];

  const allDefs = await DocumentPracticeDefinition.find({ practiceTypeItem: ctx.practiceTypeId })
    .populate("documentTypeItem", "value description")
    .populate("practiceTypeItem", "value description")
    .populate("extensionItems", "value description")
    .sort({ documentOrder: 1, documentName: 1 })
    .lean();

  const pfIds = ctx.programFacultyIds;

  return allDefs.filter((def) => {
    const pfs = def.programFaculties || [];
    if (!pfs.length) return true;
    if (!ctx.fromEstudianteHabilitado || pfIds.size === 0) return true;
    return pfs.some((pf) => pfIds.has(String(pf)));
  });
}

export function resolveTutorPractica(opp, postulacionId) {
  const arr = opp?.cierreDatosTutor || [];
  const row = arr.find((t) => t.postulacionId && String(t.postulacionId) === String(postulacionId));
  if (row) {
    return {
      nombres: [row.nombreTutor, row.apellidoTutor].filter(Boolean).join(" ").trim() || "—",
      email: row.emailTutor || "—",
      cargo: row.cargoTutor || "—",
      tipoIdent: row.tipoIdentTutor || "—",
      identificacion: row.identificacionTutor || "—",
      arlEmpresa: row.arlEmpresa || null,
    };
  }
  const company = opp?.company;
  const c = company?.contacts?.find((x) => x.isPracticeTutor) || company?.contacts?.[0];
  if (!c) {
    return { nombres: "—", email: "—", cargo: "—", tipoIdent: c?.idType || "—", identificacion: "—", arlEmpresa: null };
  }
  return {
    nombres: [c.firstName, c.lastName].filter(Boolean).join(" ").trim() || "—",
    email: c.alternateEmail || c.userEmail || "—",
    cargo: c.position || c.dependency || "—",
    tipoIdent: c.idType || "—",
    identificacion: c.identification || "—",
    arlEmpresa: company?.arl || null,
  };
}

/**
 * Las fechas de período suelen guardarse como solo día (YYYY-MM-DD). Al parsearlas con
 * `new Date("YYYY-MM-DD")` JavaScript usa medianoche UTC, que en Colombia (UTC−5) cae en
 * la tarde/noche del día anterior: la ventana se cerraba antes del último día inclusive.
 * Interpretamos inicio/fin como día civil en America/Bogotá (sin horario de verano).
 */
const COLOMBIA_UTC_OFFSET_HOURS = 5;

function partesDiaCalendarioDesdeFechaGuardada(raw) {
  if (raw == null) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), day: d.getUTCDate() };
}

function inicioDiaColombiaUtc(parts) {
  if (!parts) return null;
  return Date.UTC(parts.y, parts.m, parts.day, COLOMBIA_UTC_OFFSET_HOURS, 0, 0, 0);
}

function finDiaColombiaUtcInclusive(parts) {
  if (!parts) return null;
  return Date.UTC(parts.y, parts.m, parts.day + 1, COLOMBIA_UTC_OFFSET_HOURS, 0, 0, 0) - 1;
}

function alertaVentanaLegalizacion(periodo) {
  if (!periodo?.fechaLegalizacion) return null;
  const pIni = periodo.fechaLegalizacion.inicio ? partesDiaCalendarioDesdeFechaGuardada(periodo.fechaLegalizacion.inicio) : null;
  const pFin = periodo.fechaLegalizacion.fin ? partesDiaCalendarioDesdeFechaGuardada(periodo.fechaLegalizacion.fin) : null;
  const now = Date.now();

  if (pFin) {
    const finEnd = finDiaColombiaUtcInclusive(pFin);
    if (finEnd != null && now > finEnd) {
      return { nivel: "error", mensaje: "La ventana de legalización de práctica para este periodo ya finalizó. Contacte a coordinación." };
    }
  }
  if (pIni) {
    const iniStart = inicioDiaColombiaUtc(pIni);
    if (iniStart != null && now < iniStart) {
      return { nivel: "info", mensaje: "La legalización para este periodo aún no está habilitada por fechas." };
    }
  }
  if (pFin) {
    const finEnd = finDiaColombiaUtcInclusive(pFin);
    if (finEnd != null) {
      const ms = finEnd - now;
      const dias = Math.ceil(ms / 86400000);
      if (dias <= 14 && dias > 0) {
        return { nivel: "warning", mensaje: `Quedan aproximadamente ${dias} día(s) para completar la legalización según el calendario del periodo.` };
      }
    }
  }
  return null;
}

/** GET estudiante: listado de prácticas aceptadas con estado de legalización */
export const getMisLegalizacionesPractica = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "No autenticado" });
    const postulant = await Postulant.findOne({ postulantId: userId }).select("_id").lean();
    if (!postulant) return res.json({ data: [], total: 0 });

    const postulaciones = await PostulacionOportunidad.find({
      postulant: postulant._id,
      estado: "aceptado_estudiante",
    })
      .populate({ path: "opportunity", populate: populateOppLegalizacion })
      .populate("postulantProfile", "studentCode")
      .sort({ aceptadoEstudianteAt: -1 })
      .lean();

    const ids = postulaciones.map((p) => p._id);
    const legs = await LegalizacionPractica.find({ postulacionOportunidad: { $in: ids } }).lean();
    const legByPo = new Map(legs.map((l) => [String(l.postulacionOportunidad), l]));

    const profileIdsRaw = [...new Set(postulaciones.map((p) => p.postulantProfile?._id || p.postulantProfile).filter((id) => id && mongoose.Types.ObjectId.isValid(String(id))))].map(
      (id) => new mongoose.Types.ObjectId(String(id))
    );
    const enrolledRows =
      profileIdsRaw.length > 0
        ? await ProfileEnrolledProgram.find({ profileId: { $in: profileIdsRaw } })
            .populate("programId", "name code")
            .sort({ _id: 1 })
            .lean()
        : [];
    const programaPorPerfil = new Map();
    for (const er of enrolledRows) {
      const pid = String(er.profileId);
      if (!programaPorPerfil.has(pid)) {
        programaPorPerfil.set(pid, er.programId?.name || er.programId?.code || "—");
      }
    }

    const postulantIds = [...new Set(postulaciones.map((p) => String(p.postulant)).filter(Boolean))];
    const postulantDocs = await Postulant.find({ _id: { $in: postulantIds } })
      .populate("postulantId", "name email")
      .lean();
    const postulantById = new Map(postulantDocs.map((p) => [String(p._id), p]));

    const data = postulaciones.map((po) => {
      const opp = po.opportunity;
      const company = opp?.company;
      const leg = legByPo.get(String(po._id));
      const profile = po.postulantProfile;
      const profileIdStr = String(profile?._id || profile || "");
      const pu = postulantById.get(String(po.postulant));
      const sp = splitNombreCompleto(pu?.postulantId?.name || "");
      const tutor = resolveTutorPractica(opp, po._id);
      return {
        _id: po._id,
        opportunityId: opp?._id,
        nombrePractica: opp?.nombreCargo ?? "—",
        numeroIdentidad: profile?.studentCode ?? "—",
        nombre: sp.nombre || "—",
        apellido: sp.apellido || "—",
        programa: programaPorPerfil.get(profileIdStr) || "—",
        periodo: opp?.periodo?.codigo ?? "—",
        empresa: company?.commercialName || company?.name || "—",
        docenteMonitor: tutor.nombres,
        fechaInicio: opp?.fechaInicioPractica ?? null,
        fechaFin: opp?.fechaFinPractica ?? null,
        estadoPostulacion: po.estado,
        estadoLegalizacionCodigo: leg?.estado ?? null,
        estadoLegalizacion: leg
          ? {
              borrador: "Borrador",
              en_revision: "En revisión",
              aprobada: "Aprobada",
              rechazada: "Rechazada",
              en_ajuste: "En ajuste",
            }[leg.estado] || leg.estado
          : "Pendiente de iniciar",
        aceptadoEstudianteAt: po.aceptadoEstudianteAt,
        practicaAutogestionada: Boolean(opp?.practicaAutogestionada),
      };
    });

    res.json({ data, total: data.length });
  } catch (err) {
    console.error("[LegalizacionPractica] getMisLegalizacionesPractica:", err);
    res.status(500).json({ message: err.message });
  }
};

/** GET estudiante: detalle + documentos requeridos */
export const getLegalizacionPracticaEstudiante = async (req, res) => {
  try {
    const { postulacionId } = req.params;
    const result = await getPostulacionAceptadaEstudiante(req, postulacionId);
    if (result.error) return res.status(result.error).json({ message: result.message });
    const { po } = result;

    let leg = await LegalizacionPractica.findOne({ postulacionOportunidad: postulacionId }).lean();
    if (!leg) {
      const created = await LegalizacionPractica.create({
        postulacionOportunidad: postulacionId,
        estado: "borrador",
      });
      leg = await LegalizacionPractica.findById(created._id).lean();
    }

    const definicionesDocumentos = await listDefinicionesPracticaParaPostulacion(po);
    const opp = po.opportunity;
    const profileId = po.postulantProfile?._id ?? po.postulantProfile;
    const [postulantUser, postulantDatos, enrolledPrograms] = await Promise.all([
      Postulant.findById(po.postulant).populate("postulantId", "name email").populate("typeOfIdentification", "value").lean(),
      Postulant.findById(po.postulant).select("phone address alternateEmail").lean(),
      profileId ? ProfileEnrolledProgram.find({ profileId }).populate("programId", "name code").populate({ path: "programFacultyId", populate: { path: "facultyId", select: "name" } }).lean() : [],
    ]);

    const enrolledIds = enrolledPrograms.map((e) => e._id);
    const extras =
      enrolledIds.length > 0 ? await ProfileProgramExtraInfo.find({ enrolledProgramId: { $in: enrolledIds } }).lean() : [];
    const extraByEnrolled = new Map(extras.map((ex) => [String(ex.enrolledProgramId), ex]));
    const firstEnrolled = enrolledPrograms[0];
    const extra = firstEnrolled ? extraByEnrolled.get(String(firstEnrolled._id)) : null;

    const company = opp?.company;
    const lr = company?.legalRepresentative;
    const tutor = resolveTutorPractica(opp, postulacionId);
    const alertaLegalizacion = alertaVentanaLegalizacion(opp?.periodo);

    const diasPractica =
      opp?.fechaInicioPractica && opp?.fechaFinPractica
        ? Math.max(0, Math.ceil((new Date(opp.fechaFinPractica) - new Date(opp.fechaInicioPractica)) / 86400000))
        : null;

    res.json({
      legalizacion: leg,
      postulacion: { _id: po._id, aceptadoEstudianteAt: po.aceptadoEstudianteAt },
      definicionesDocumentos,
      alertaLegalizacion,
      oportunidadResumen: {
        nombreCargo: opp?.nombreCargo,
        periodo: opp?.periodo?.codigo,
        tipoVinculacion: opp?.tipoVinculacion,
        fechaInicio: opp?.fechaInicioPractica,
        fechaFin: opp?.fechaFinPractica,
        horario: opp?.horario,
        dedicacion: opp?.dedicacion,
        areaDesempeno: opp?.areaDesempeno,
        auxilioEconomico: opp?.auxilioEconomico,
        apoyoEconomico: opp?.apoyoEconomico,
        funciones: opp?.funciones,
        jornadaOrdinariaSemanal: opp?.jornadaOrdinariaSemanal,
        jornadaSemanalPractica: opp?.jornadaSemanalPractica,
      },
      estudiante: {
        nombre: postulantUser?.postulantId?.name ?? "",
        correoInstitucional: postulantUser?.postulantId?.email ?? "",
        correoAlterno: postulantDatos?.alternateEmail ?? null,
        tipoDocumento: postulantUser?.typeOfIdentification?.value ?? null,
        identificacion: po.postulantProfile?.studentCode ?? null,
        celular: postulantDatos?.phone ?? null,
        facultad: firstEnrolled?.programFacultyId?.facultyId?.name ?? null,
        programa: firstEnrolled?.programId?.name ?? null,
        semestreCreditos: extra?.accordingCreditSemester != null ? String(extra.accordingCreditSemester) : null,
        creditosAprobados: extra?.approvedCredits ?? null,
      },
      entidad: {
        nit: company?.nit || company?.idNumber || "—",
        razonSocial: company?.legalName || company?.name || "—",
        representanteNombres: lr?.firstName || "—",
        representanteApellidos: lr?.lastName || "—",
        representanteTipoId: lr?.idType || "—",
        representanteNumeroId: lr?.idNumber || "—",
        tutorNombres: tutor.nombres,
        tutorTipoId: tutor.tipoIdent,
        tutorNumeroId: tutor.identificacion,
        tutorCargo: tutor.cargo,
        tutorTelefono: company?.phone || "—",
        tutorEmail: tutor.email,
      },
      practica: {
        docenteMonitor: tutor.nombres,
        correoDocenteMonitor: tutor.email,
        cedulaDocenteMonitor: tutor.identificacion,
        cargoDocenteMonitor: tutor.cargo,
        programaLegaliza: firstEnrolled?.programId?.name ?? "—",
        periodoLegaliza: opp?.periodo?.codigo ?? "—",
        fechaInicio: opp?.fechaInicioPractica,
        fechaFin: opp?.fechaFinPractica,
        tipoVinculacion: opp?.tipoVinculacion,
        numeroDias: diasPractica,
        duracion: opp?.dedicacion?.value ?? opp?.dedicacion?.description ?? "—",
        remunerada: opp?.auxilioEconomico === true ? "Sí" : opp?.auxilioEconomico === false ? "No" : "—",
        remuneracionMes: opp?.apoyoEconomico,
        areaOrganizacion: opp?.areaDesempeno?.value ?? opp?.areaDesempeno?.description ?? "—",
        dedicacionSemana: opp?.jornadaSemanalPractica ?? opp?.jornadaOrdinariaSemanal,
        horario: opp?.horario,
        arl: tutor.arlEmpresa || company?.arl || "—",
        afiliacionArlUniversidad: "—",
        pais: opp?.pais?.name ?? opp?.pais?.sortname ?? "—",
        ciudad: opp?.ciudad?.name ?? "—",
        primeraEvaluacion: "—",
        segundaEvaluacion: "—",
      },
      historial: leg.historial || [],
      historialPlanTrabajoPractica: leg.historialPlanTrabajoPractica || [],
    });
  } catch (err) {
    console.error("[LegalizacionPractica] getLegalizacionPracticaEstudiante:", err);
    res.status(500).json({ message: err.message });
  }
};

export const uploadDocLegalizacionPractica = async (req, res) => {
  try {
    const { postulacionId } = req.params;
    const definitionId = (req.body?.definitionId || "").toString().trim();
    if (!definitionId || !mongoose.Types.ObjectId.isValid(definitionId)) {
      return res.status(400).json({ message: "Debe indicar definitionId del documento de legalización de práctica." });
    }
    if (!req.file?.buffer) return res.status(400).json({ message: "No se envió archivo" });
    if (req.file.size > 5 * 1024 * 1024) return res.status(400).json({ message: "El archivo no puede superar 5 MB" });

    const result = await getPostulacionAceptadaEstudiante(req, postulacionId);
    if (result.error) return res.status(result.error).json({ message: result.message });
    const defList = await listDefinicionesPracticaParaPostulacion(result.po);
    const def = defList.find((d) => String(d._id) === definitionId);
    if (!def) return res.status(404).json({ message: "Documento no aplicable a esta legalización (tipo de práctica del estudiante habilitado)." });

    const defFull = await DocumentPracticeDefinition.findById(definitionId).lean();
    if (!archivoPermitidoPorDefinicionPractica(req.file, defFull)) {
      const allowed = (defFull.extensionCodes || []).map(normalizeExtCodePractica).filter(Boolean).join(", ") || "pdf";
      return res.status(400).json({ message: `Extensión no permitida para este documento (${allowed}).` });
    }

    let leg = await LegalizacionPractica.findOne({ postulacionOportunidad: postulacionId });
    if (!leg) leg = await LegalizacionPractica.create({ postulacionOportunidad: postulacionId, estado: "borrador" });
    if (leg.estado !== "borrador" && leg.estado !== "en_ajuste") {
      return res.status(400).json({ message: "Solo puede cargar documentos en borrador o en ajuste." });
    }

    const ext = s3ExtensionFromUploadPr(req.file);
    const key = `${S3_PREFIX}/${postulacionId}/def-${definitionId}${ext}`;
    await uploadToS3(key, req.file.buffer, { contentType: req.file.mimetype || "application/octet-stream" });

    setLegDocPr(leg, definitionId, {
      key,
      originalName: req.file.originalname || `documento${ext}`,
      size: req.file.size,
      estadoDocumento: "pendiente",
      motivoRechazo: null,
    });
    await leg.save();

    /** RQ04_HU005: notificación a coordinación sin exigir “enviar a revisión”. */
    try {
      const ctx = await loadPracticaPostulacionContext(postulacionId);
      if (ctx) {
        const docName = defFull?.documentName || def?.documentName || definitionId;
        await dispatchPracticaNotification(
          "actualizacion_documento_legalizacion_practica",
          {
            ...ctx.datos,
            COMENTARIO: `El estudiante cargó o actualizó un documento: ${docName}. Revise la legalización en el sistema.`,
            LINK_REVISION: practicaLegalizacionRevisionLink(postulacionId),
          },
          entityAndCoordinatorsRecipientContext(ctx.creadorEmail),
          { postulacionId: String(postulacionId), definitionId: String(definitionId), source: "legalizacion_practica_upload" }
        );
      }
    } catch (e) {
      console.error("[LegalizacionPractica] notif actualizacion_documento_legalizacion_practica:", e?.message || e);
    }

    res.json({ legalizacion: await LegalizacionPractica.findById(leg._id).lean(), message: "Documento subido correctamente" });
  } catch (err) {
    if (err.message?.includes("S3 no está configurado")) {
      return res.status(503).json({ message: "El almacenamiento de documentos no está disponible" });
    }
    console.error("[LegalizacionPractica] uploadDocLegalizacionPractica:", err);
    res.status(500).json({ message: err.message });
  }
};

export const getDocumentoLegalizacionPracticaUrl = async (req, res) => {
  try {
    const { postulacionId, definitionId } = req.params;
    if (!definitionId || !mongoose.Types.ObjectId.isValid(definitionId)) {
      return res.status(400).json({ message: "ID de documento no válido" });
    }
    const result = await getPostulacionAceptadaEstudiante(req, postulacionId);
    if (result.error) return res.status(result.error).json({ message: result.message });
    const leg = await LegalizacionPractica.findOne({ postulacionOportunidad: postulacionId }).lean();
    if (!leg) return res.status(404).json({ message: "Legalización no encontrada" });
    const doc = getLegDocPr(leg, definitionId);
    if (!doc?.key) return res.status(404).json({ message: "Documento no encontrado" });
    const url = await getSignedDownloadUrl(doc.key, 3600);
    res.json({ url });
  } catch (err) {
    if (err.message?.includes("S3 no está configurado")) return res.status(503).json({ message: "Almacenamiento no disponible" });
    console.error("[LegalizacionPractica] getDocumentoLegalizacionPracticaUrl:", err);
    res.status(500).json({ message: err.message });
  }
};

/** GET estudiante: PDF acuerdo de vinculación con datos reales (misma plantilla que vista previa HU006). */
export const getAcuerdoVinculacionPdfEstudiante = async (req, res) => {
  try {
    const { postulacionId } = req.params;
    const result = await getPostulacionAceptadaEstudiante(req, postulacionId);
    if (result.error) return res.status(result.error).json({ message: result.message });
    const opp = result.po?.opportunity;
    if (!esAcuerdoDeVinculacion(opp?.tipoVinculacion)) {
      return res.status(400).json({
        message: "Solo puede generar el acuerdo cuando el tipo de vinculación de la práctica es «Acuerdo de vinculación».",
      });
    }
    const built = await buildAcuerdoVinculacionPdfDataFromPostulacion(postulacionId);
    if (!built.ok) return res.status(404).json({ message: built.message || "No se pudo generar el acuerdo" });
    const pdfBuffer = await buildAcuerdoVinculacionPdf(built.payload);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'inline; filename="acuerdo-vinculacion.pdf"');
    res.send(pdfBuffer);
  } catch (err) {
    console.error("[LegalizacionPractica] getAcuerdoVinculacionPdfEstudiante:", err);
    res.status(500).json({ message: err.message });
  }
};

/** GET admin: mismo PDF del acuerdo para revisión. */
export const getAcuerdoVinculacionPdfAdmin = async (req, res) => {
  try {
    const { postulacionId } = req.params;
    const chk = await assertAdminLegalizacionAccess(req, postulacionId);
    if (chk.error) return res.status(chk.error).json({ message: chk.message });
    const opp = chk.po?.opportunity;
    if (!esAcuerdoDeVinculacion(opp?.tipoVinculacion)) {
      return res.status(400).json({ message: "Esta práctica no es tipo «Acuerdo de vinculación»." });
    }
    const built = await buildAcuerdoVinculacionPdfDataFromPostulacion(postulacionId);
    if (!built.ok) return res.status(404).json({ message: built.message || "No se pudo generar el acuerdo" });
    const pdfBuffer = await buildAcuerdoVinculacionPdf(built.payload);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'inline; filename="acuerdo-vinculacion.pdf"');
    res.send(pdfBuffer);
  } catch (err) {
    console.error("[LegalizacionPractica] getAcuerdoVinculacionPdfAdmin:", err);
    res.status(500).json({ message: err.message });
  }
};

/** GET estudiante: descarga vía API (evita CORS al bajar desde URL firmada en el navegador). */
export const getDocumentoLegalizacionPracticaDownload = async (req, res) => {
  try {
    const { postulacionId, definitionId } = req.params;
    if (!definitionId || !mongoose.Types.ObjectId.isValid(definitionId)) {
      return res.status(400).json({ message: "ID de documento no válido" });
    }
    const result = await getPostulacionAceptadaEstudiante(req, postulacionId);
    if (result.error) return res.status(result.error).json({ message: result.message });
    const leg = await LegalizacionPractica.findOne({ postulacionOportunidad: postulacionId }).lean();
    if (!leg) return res.status(404).json({ message: "Legalización no encontrada" });
    const doc = getLegDocPr(leg, definitionId);
    if (!doc?.key) return res.status(404).json({ message: "Documento no encontrado" });
    const { body, contentType } = await getObjectFromS3(doc.key);
    const fileName = (doc.originalName || "documento.pdf").replace(/[^a-zA-Z0-9._-]/g, "_") || "documento.pdf";
    res.setHeader("Content-Type", contentType || "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.send(body);
  } catch (err) {
    if (err.message?.includes("S3 no está configurado")) return res.status(503).json({ message: "Almacenamiento no disponible" });
    console.error("[LegalizacionPractica] getDocumentoLegalizacionPracticaDownload:", err);
    res.status(500).json({ message: err.message });
  }
};

export const deleteDocumentoLegalizacionPractica = async (req, res) => {
  try {
    const { postulacionId, definitionId } = req.params;
    if (!definitionId || !mongoose.Types.ObjectId.isValid(definitionId)) {
      return res.status(400).json({ message: "ID de documento no válido" });
    }
    const result = await getPostulacionAceptadaEstudiante(req, postulacionId);
    if (result.error) return res.status(result.error).json({ message: result.message });
    const leg = await LegalizacionPractica.findOne({ postulacionOportunidad: postulacionId });
    if (!leg) return res.status(404).json({ message: "Legalización no encontrada" });
    if (leg.estado !== "borrador" && leg.estado !== "en_ajuste") {
      return res.status(400).json({ message: "Solo puede eliminar documentos en borrador o en ajuste." });
    }
    const doc = getLegDocPr(leg, definitionId);
    if (!doc?.key) return res.status(404).json({ message: "Documento no encontrado" });
    await deleteFromS3(doc.key);
    setLegDocPr(leg, definitionId, null);
    await leg.save();
    res.json({ legalizacion: await LegalizacionPractica.findById(leg._id).lean(), message: "Documento eliminado" });
  } catch (err) {
    if (err.message?.includes("S3 no está configurado")) return res.status(503).json({ message: "Almacenamiento no disponible" });
    console.error("[LegalizacionPractica] deleteDocumentoLegalizacionPractica:", err);
    res.status(500).json({ message: err.message });
  }
};

export const remitirRevisionLegalizacionPractica = async (req, res) => {
  try {
    const { postulacionId } = req.params;
    const result = await getPostulacionAceptadaEstudiante(req, postulacionId);
    if (result.error) return res.status(result.error).json({ message: result.message });
    const leg = await LegalizacionPractica.findOne({ postulacionOportunidad: postulacionId });
    if (!leg) return res.status(404).json({ message: "Legalización no encontrada" });
    if (leg.estado !== "borrador" && leg.estado !== "en_ajuste") {
      return res.status(400).json({ message: "Solo puede enviar a revisión desde borrador o en ajuste." });
    }

    const definiciones = await listDefinicionesPracticaParaPostulacion(result.po);
    if (!definiciones.length) {
      return res.status(400).json({
        message:
          "No hay documentos configurados para el tipo de práctica de este estudiante habilitado (o no se encontró registro en estudiantes habilitados). Revise la parametrización en Configuración → Documentos legalización práctica.",
      });
    }
    const obligatorias = definiciones.filter((d) => d.documentMandatory);
    const faltantes = obligatorias.filter((d) => !getLegDocPr(leg, d._id)?.key);
    if (faltantes.length) {
      return res.status(400).json({
        message: `Debe cargar los documentos obligatorios: ${faltantes.map((f) => f.documentName).join(", ")}`,
      });
    }

    const prev = leg.estado;
    leg.estado = "en_revision";
    leg.enviadoRevisionAt = new Date();
    pushHistorial(leg, {
      estadoAnterior: prev,
      estadoNuevo: "en_revision",
      userId: req.user?.id || null,
      detalle: "Estudiante remitió a revisión",
      ip: getClientIp(req),
    });
    await leg.save();
    res.json({
      message: "Legalización enviada a revisión",
      legalizacion: await LegalizacionPractica.findById(leg._id).lean(),
    });
  } catch (err) {
    console.error("[LegalizacionPractica] remitirRevisionLegalizacionPractica:", err);
    res.status(500).json({ message: err.message });
  }
};

/* ─── Admin / coordinación ─── */

export async function assertAdminLegalizacionAccess(req, postulacionId) {
  if (!isValidObjectId24(postulacionId)) return { error: 400, message: "ID no válido" };
  const po = await PostulacionOportunidad.findById(postulacionId)
    .populate({ path: "opportunity", populate: populateOppLegalizacion })
    .populate("postulantProfile", "studentCode")
    .populate({ path: "postulant", populate: { path: "postulantId", select: "name email" } })
    .lean();
  if (!po) return { error: 404, message: "Postulación no encontrada" };
  if (po.estado !== "aceptado_estudiante") return { error: 404, message: "La postulación no está en estado aceptada por el estudiante" };
  let leg = await LegalizacionPractica.findOne({ postulacionOportunidad: postulacionId });
  if (!leg) {
    leg = await LegalizacionPractica.create({ postulacionOportunidad: postulacionId, estado: "borrador" });
  }
  return { po, leg };
}

export const getLegalizacionesPracticaAdmin = async (req, res) => {
  try {
    const { estado, periodo, page = 1, limit = 20, search, programa } = req.query;
    const filter = {};
    if (estado) filter.estado = estado;
    const skip = (Math.max(1, parseInt(page, 10)) - 1) * Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

    let query = LegalizacionPractica.find(filter)
      .populate({
        path: "postulacionOportunidad",
        match: { estado: "aceptado_estudiante" },
        populate: [
          {
            path: "opportunity",
            select: "nombreCargo periodo company practicaAutogestionada",
            populate: [
              { path: "periodo", select: "codigo" },
              { path: "company", select: "name commercialName" },
            ],
          },
          { path: "postulantProfile", select: "studentCode" },
          { path: "postulant", populate: { path: "postulantId", select: "name email" } },
        ],
      })
      .sort({ updatedAt: -1 });

    const all = await query.lean();
    let rows = all.filter((l) => l.postulacionOportunidad);

    if (periodo) {
      rows = rows.filter((l) => l.postulacionOportunidad?.opportunity?.periodo?.codigo === periodo);
    }
    if (search) {
      const q = String(search).toLowerCase();
      rows = rows.filter((l) => {
        const po = l.postulacionOportunidad;
        const name = (po?.postulant?.postulantId?.name || "").toLowerCase();
        const idn = (po?.postulantProfile?.studentCode || "").toLowerCase();
        const cargo = (po?.opportunity?.nombreCargo || "").toLowerCase();
        return name.includes(q) || idn.includes(q) || cargo.includes(q);
      });
    }

    const total = rows.length;
    const slice = rows.slice(skip, skip + limitNum);
    const data = await Promise.all(
      slice.map(async (l) => {
        const po = l.postulacionOportunidad;
        const sp = splitNombreCompleto(po?.postulant?.postulantId?.name);
        const profileId = po.postulantProfile?._id ?? po.postulantProfile;
        let programaRow = "—";
        if (profileId) {
          const enr = await ProfileEnrolledProgram.findOne({ profileId }).sort({ _id: 1 }).populate("programId", "name code").lean();
          programaRow = enr?.programId?.name || enr?.programId?.code || "—";
        }
        return {
          postulacionId: po._id,
          opportunityId: po.opportunity?._id,
          numeroIdentidad: po.postulantProfile?.studentCode,
          nombre: sp.nombre,
          apellido: sp.apellido,
          programa: programaRow,
          nombreCargo: po.opportunity?.nombreCargo,
          periodo: po.opportunity?.periodo?.codigo,
          empresa: po.opportunity?.company?.commercialName || po.opportunity?.company?.name,
          estadoLegalizacion: l.estado,
          estadoPostulacion: po.estado,
          practicaAutogestionada: Boolean(po.opportunity?.practicaAutogestionada),
        };
      })
    );

    res.json({ data, total, page: parseInt(page, 10), limit: limitNum, totalPages: Math.max(1, Math.ceil(total / limitNum)) });
  } catch (err) {
    console.error("[LegalizacionPractica] getLegalizacionesPracticaAdmin:", err);
    res.status(500).json({ message: err.message });
  }
};

export const getEstadisticasLegalizacionPractica = async (_req, res) => {
  try {
    const agg = await LegalizacionPractica.aggregate([{ $group: { _id: "$estado", n: { $sum: 1 } } }]);
    const porEstado = Object.fromEntries(agg.map((a) => [a._id || "sin_estado", a.n]));
    const total = agg.reduce((s, a) => s + a.n, 0);
    res.json({ porEstado, total });
  } catch (err) {
    console.error("[LegalizacionPractica] getEstadisticasLegalizacionPractica:", err);
    res.status(500).json({ message: err.message });
  }
};

export const getLegalizacionPracticaAdmin = async (req, res) => {
  try {
    const { postulacionId } = req.params;
    const chk = await assertAdminLegalizacionAccess(req, postulacionId);
    if (chk.error) return res.status(chk.error).json({ message: chk.message });
    const { po, leg } = chk;
    const definicionesDocumentos = await listDefinicionesPracticaParaPostulacion(po);
    const legLean = await LegalizacionPractica.findById(leg._id).lean();
    const opp = po.opportunity;
    const profileId = po.postulantProfile?._id ?? po.postulantProfile;
    const [postulantUser, postulantDatos, enrolledPrograms] = await Promise.all([
      Postulant.findById(po.postulant).populate("postulantId", "name email").populate("typeOfIdentification", "value").lean(),
      Postulant.findById(po.postulant).select("phone address alternateEmail").lean(),
      profileId ? ProfileEnrolledProgram.find({ profileId }).populate("programId", "name code").populate({ path: "programFacultyId", populate: { path: "facultyId", select: "name" } }).lean() : [],
    ]);
    const enrolledIds = enrolledPrograms.map((e) => e._id);
    const extras =
      enrolledIds.length > 0 ? await ProfileProgramExtraInfo.find({ enrolledProgramId: { $in: enrolledIds } }).lean() : [];
    const extraByEnrolled = new Map(extras.map((ex) => [String(ex.enrolledProgramId), ex]));
    const firstEnrolled = enrolledPrograms.find((e) => e.programFacultyId != null) || enrolledPrograms[0];
    const extra = firstEnrolled ? extraByEnrolled.get(String(firstEnrolled._id)) : null;
    const company = opp?.company;
    const lr = company?.legalRepresentative;
    const tutor = resolveTutorPractica(opp, postulacionId);
    const diasPractica =
      opp?.fechaInicioPractica && opp?.fechaFinPractica
        ? Math.max(0, Math.ceil((new Date(opp.fechaFinPractica) - new Date(opp.fechaInicioPractica)) / 86400000))
        : null;

    res.json({
      legalizacion: legLean,
      postulacion: { _id: po._id, aceptadoEstudianteAt: po.aceptadoEstudianteAt },
      definicionesDocumentos,
      oportunidadResumen: {
        nombreCargo: opp?.nombreCargo,
        periodo: opp?.periodo?.codigo,
        tipoVinculacion: opp?.tipoVinculacion,
        fechaInicio: opp?.fechaInicioPractica,
        fechaFin: opp?.fechaFinPractica,
        horario: opp?.horario,
        dedicacion: opp?.dedicacion,
        areaDesempeno: opp?.areaDesempeno,
        auxilioEconomico: opp?.auxilioEconomico,
        apoyoEconomico: opp?.apoyoEconomico,
        funciones: opp?.funciones,
        jornadaOrdinariaSemanal: opp?.jornadaOrdinariaSemanal,
        jornadaSemanalPractica: opp?.jornadaSemanalPractica,
      },
      estudiante: {
        nombre: postulantUser?.postulantId?.name ?? "",
        correoInstitucional: postulantUser?.postulantId?.email ?? "",
        correoAlterno: postulantDatos?.alternateEmail ?? null,
        tipoDocumento: postulantUser?.typeOfIdentification?.value ?? null,
        identificacion: po.postulantProfile?.studentCode ?? null,
        celular: postulantDatos?.phone ?? null,
        facultad: firstEnrolled?.programFacultyId?.facultyId?.name ?? null,
        programa: firstEnrolled?.programId?.name ?? null,
        semestreCreditos: extra?.accordingCreditSemester != null ? String(extra.accordingCreditSemester) : null,
        creditosAprobados: extra?.approvedCredits ?? null,
      },
      entidad: {
        nit: company?.nit || company?.idNumber || "—",
        razonSocial: company?.legalName || company?.name || "—",
        representanteNombres: lr?.firstName || "—",
        representanteApellidos: lr?.lastName || "—",
        representanteTipoId: lr?.idType || "—",
        representanteNumeroId: lr?.idNumber || "—",
        tutorNombres: tutor.nombres,
        tutorTipoId: tutor.tipoIdent,
        tutorNumeroId: tutor.identificacion,
        tutorCargo: tutor.cargo,
        tutorTelefono: company?.phone || "—",
        tutorEmail: tutor.email,
      },
      practica: {
        docenteMonitor: tutor.nombres,
        correoDocenteMonitor: tutor.email,
        cedulaDocenteMonitor: tutor.identificacion,
        cargoDocenteMonitor: tutor.cargo,
        programaLegaliza: firstEnrolled?.programId?.name ?? "—",
        periodoLegaliza: opp?.periodo?.codigo ?? "—",
        fechaInicio: opp?.fechaInicioPractica,
        fechaFin: opp?.fechaFinPractica,
        tipoVinculacion: opp?.tipoVinculacion,
        numeroDias: diasPractica,
        duracion: opp?.dedicacion?.value ?? opp?.dedicacion?.description ?? "—",
        remunerada: opp?.auxilioEconomico === true ? "Sí" : opp?.auxilioEconomico === false ? "No" : "—",
        remuneracionMes: opp?.apoyoEconomico,
        areaOrganizacion: opp?.areaDesempeno?.value ?? opp?.areaDesempeno?.description ?? "—",
        dedicacionSemana: opp?.jornadaSemanalPractica ?? opp?.jornadaOrdinariaSemanal,
        horario: opp?.horario,
        arl: tutor.arlEmpresa || company?.arl || "—",
        afiliacionArlUniversidad: "—",
        pais: opp?.pais?.name ?? opp?.pais?.sortname ?? "—",
        ciudad: opp?.ciudad?.name ?? "—",
        primeraEvaluacion: "—",
        segundaEvaluacion: "—",
      },
      historial: legLean.historial || [],
      historialPlanTrabajoPractica: legLean.historialPlanTrabajoPractica || [],
    });
  } catch (err) {
    console.error("[LegalizacionPractica] getLegalizacionPracticaAdmin:", err);
    res.status(500).json({ message: err.message });
  }
};

export const getDocumentoLegalizacionPracticaUrlAdmin = async (req, res) => {
  try {
    const { postulacionId, definitionId } = req.params;
    if (!definitionId || !mongoose.Types.ObjectId.isValid(definitionId)) {
      return res.status(400).json({ message: "ID de documento no válido" });
    }
    const chk = await assertAdminLegalizacionAccess(req, postulacionId);
    if (chk.error) return res.status(chk.error).json({ message: chk.message });
    const leg = await LegalizacionPractica.findOne({ postulacionOportunidad: postulacionId }).lean();
    const doc = getLegDocPr(leg, definitionId);
    if (!doc?.key) return res.status(404).json({ message: "Documento no encontrado" });
    const url = await getSignedDownloadUrl(doc.key, 3600);
    res.json({ url });
  } catch (err) {
    if (err.message?.includes("S3 no está configurado")) return res.status(503).json({ message: "Almacenamiento no disponible" });
    console.error("[LegalizacionPractica] getDocumentoLegalizacionPracticaUrlAdmin:", err);
    res.status(500).json({ message: err.message });
  }
};

export const getDocumentoLegalizacionPracticaDownloadAdmin = async (req, res) => {
  try {
    const { postulacionId, definitionId } = req.params;
    if (!definitionId || !mongoose.Types.ObjectId.isValid(definitionId)) {
      return res.status(400).json({ message: "ID de documento no válido" });
    }
    const chk = await assertAdminLegalizacionAccess(req, postulacionId);
    if (chk.error) return res.status(chk.error).json({ message: chk.message });
    const leg = await LegalizacionPractica.findOne({ postulacionOportunidad: postulacionId }).lean();
    const doc = getLegDocPr(leg, definitionId);
    if (!doc?.key) return res.status(404).json({ message: "Documento no encontrado" });
    const { body, contentType } = await getObjectFromS3(doc.key);
    const fileName = (doc.originalName || "documento.pdf").replace(/[^a-zA-Z0-9._-]/g, "_") || "documento.pdf";
    res.setHeader("Content-Type", contentType || "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.send(body);
  } catch (err) {
    if (err.message?.includes("S3 no está configurado")) return res.status(503).json({ message: "Almacenamiento no disponible" });
    console.error("[LegalizacionPractica] getDocumentoLegalizacionPracticaDownloadAdmin:", err);
    res.status(500).json({ message: err.message });
  }
};

export const patchDocumentoLegalizacionPracticaAdmin = async (req, res) => {
  try {
    const { postulacionId, definitionId } = req.params;
    const { estadoDocumento, motivoRechazo } = req.body || {};
    if (!definitionId || !mongoose.Types.ObjectId.isValid(definitionId)) {
      return res.status(400).json({ message: "ID de documento no válido" });
    }
    if (!["aprobado", "rechazado"].includes(estadoDocumento)) {
      return res.status(400).json({ message: "estadoDocumento debe ser aprobado o rechazado" });
    }
    const chk = await assertAdminLegalizacionAccess(req, postulacionId);
    if (chk.error) return res.status(chk.error).json({ message: chk.message });
    const { po, leg } = chk;
    if (leg.estado !== "en_revision") {
      return res.status(400).json({ message: "Solo se revisan documentos con la legalización en revisión" });
    }
    const defList = await listDefinicionesPracticaParaPostulacion(po);
    const defMeta = defList.find((d) => String(d._id) === String(definitionId));
    const defFull = await DocumentPracticeDefinition.findById(definitionId).select("bindingAgreement documentName").lean();
    if (estadoDocumento === "aprobado" && defFull?.bindingAgreement && !leg.acuerdoTresFirmasCompletas) {
      return res.status(400).json({
        message:
          "El documento de vinculación (acuerdo) solo puede aprobarse cuando existan las tres aprobaciones del acuerdo en el sistema. Pendiente de registro automático desde el flujo de acuerdo.",
      });
    }
    const doc = getLegDocPr(leg, definitionId);
    if (!doc?.key) return res.status(404).json({ message: "Documento no encontrado" });
    const plain = typeof doc.toObject === "function" ? doc.toObject() : { ...doc };
    setLegDocPr(leg, definitionId, {
      ...plain,
      estadoDocumento,
      motivoRechazo: estadoDocumento === "rechazado" ? (motivoRechazo || "").trim() || null : null,
      revisadoAt: new Date(),
      revisadoIp: getClientIp(req),
    });
    pushHistorial(leg, {
      estadoAnterior: leg.estado,
      estadoNuevo: leg.estado,
      userId: req.user?.id || null,
      detalle: `Documento "${defMeta?.documentName || definitionId}": ${estadoDocumento}`,
      ip: getClientIp(req),
    });
    await leg.save();

    if (estadoDocumento === "rechazado") {
      try {
        const ctx = await loadPracticaPostulacionContext(postulacionId);
        if (ctx) {
          const mr = (motivoRechazo || "").trim();
          await dispatchPracticaNotification(
            "rechazo_documento_legalizacion_practica",
            {
              ...ctx.datos,
              COMENTARIO: mr || "Su documento requiere corrección según observaciones de coordinación.",
              OBSERVACION: mr || "",
            },
            studentOnlyRecipientContext(ctx.postulantEmail),
            { postulacionId: String(postulacionId), definitionId: String(definitionId), source: "legalizacion_practica_doc_rechazo" }
          );
        }
      } catch (e) {
        console.error("[LegalizacionPractica] notif rechazo_documento_legalizacion_practica:", e?.message || e);
      }
    }

    res.json({ legalizacion: await LegalizacionPractica.findById(leg._id).lean() });
  } catch (err) {
    console.error("[LegalizacionPractica] patchDocumentoLegalizacionPracticaAdmin:", err);
    res.status(500).json({ message: err.message });
  }
};

export const postAprobarLegalizacionPractica = async (req, res) => {
  try {
    const { postulacionId } = req.params;
    const chk = await assertAdminLegalizacionAccess(req, postulacionId);
    if (chk.error) return res.status(chk.error).json({ message: chk.message });
    const { po, leg } = chk;
    if (leg.estado !== "en_revision") {
      return res.status(400).json({ message: "Solo se aprueba una legalización en revisión" });
    }
    const defList = await listDefinicionesPracticaParaPostulacion(po);
    const defIds = new Set(defList.map((d) => String(d._id)));
    const docs = leg.documentos || {};
    const entries = Object.entries(docs).filter(([k, v]) => v && typeof v === "object" && v.key && defIds.has(String(k)));
    if (entries.length === 0) {
      return res.status(400).json({ message: "No hay documentos cargados para aprobar la legalización." });
    }
    const algunRechazado = entries.some(([, d]) => d.estadoDocumento === "rechazado");
    const algunPendiente = entries.some(([, d]) => d.key && (!d.estadoDocumento || d.estadoDocumento === "pendiente"));
    if (algunRechazado) {
      return res.status(400).json({ message: "Hay documentos rechazados. Envíe a ajuste al estudiante." });
    }
    if (algunPendiente) {
      return res.status(400).json({ message: "Debe aprobar o rechazar todos los documentos cargados antes de aprobar la legalización." });
    }
    const prev = leg.estado;
    leg.estado = "aprobada";
    leg.aprobadoAt = new Date();
    leg.rechazoMotivo = null;
    pushHistorial(leg, {
      estadoAnterior: prev,
      estadoNuevo: "aprobada",
      userId: req.user?.id || null,
      detalle: "Coordinación aprobó la legalización",
      ip: getClientIp(req),
    });
    await leg.save();

    try {
      const ctx = await loadPracticaPostulacionContext(postulacionId);
      if (ctx) {
        await dispatchPracticaNotification(
          "aprobacion_legalizacion_practica",
          {
            ...ctx.datos,
            COMENTARIO: "Coordinación aprobó la legalización de su práctica. Puede continuar con el plan de práctica según corresponda.",
          },
          studentOnlyRecipientContext(ctx.postulantEmail),
          { postulacionId: String(postulacionId), source: "legalizacion_practica_aprobacion" }
        );
      }
    } catch (e) {
      console.error("[LegalizacionPractica] notif aprobacion_legalizacion_practica:", e?.message || e);
    }

    res.json({ legalizacion: await LegalizacionPractica.findById(leg._id).lean(), message: "Legalización aprobada" });
  } catch (err) {
    console.error("[LegalizacionPractica] postAprobarLegalizacionPractica:", err);
    res.status(500).json({ message: err.message });
  }
};

export const postRechazarLegalizacionPractica = async (req, res) => {
  try {
    const { postulacionId } = req.params;
    const { motivo, enviarAjuste } = req.body || {};
    const chk = await assertAdminLegalizacionAccess(req, postulacionId);
    if (chk.error) return res.status(chk.error).json({ message: chk.message });
    const { leg } = chk;
    if (leg.estado !== "en_revision") {
      return res.status(400).json({ message: "Solo se rechaza o envía a ajuste desde en revisión" });
    }
    const motivoStr = (motivo || "").trim() || null;
    const prev = leg.estado;
    if (enviarAjuste) {
      leg.estado = "en_ajuste";
      leg.rechazoMotivo = motivoStr;
      pushHistorial(leg, {
        estadoAnterior: prev,
        estadoNuevo: "en_ajuste",
        userId: req.user?.id || null,
        detalle: motivoStr || "Enviado a ajuste",
        ip: getClientIp(req),
      });
    } else {
      leg.estado = "rechazada";
      leg.rechazadoAt = new Date();
      leg.rechazoMotivo = motivoStr;
      pushHistorial(leg, {
        estadoAnterior: prev,
        estadoNuevo: "rechazada",
        userId: req.user?.id || null,
        detalle: motivoStr || "Legalización rechazada",
        ip: getClientIp(req),
      });
    }
    await leg.save();

    try {
      const ctx = await loadPracticaPostulacionContext(postulacionId);
      if (ctx) {
        const motivoStr = (motivo || "").trim() || "";
        const entidadEmail = emailEntidadDesdeCompany(ctx.po?.opportunity?.company);
        await dispatchPracticaNotification(
          "rechazo_legalizacion_practica",
          {
            ...ctx.datos,
            COMENTARIO:
              motivoStr ||
              (enviarAjuste
                ? "La legalización fue enviada a ajuste: puede cargar de nuevo los documentos indicados."
                : "La legalización fue rechazada."),
            OBSERVACION: motivoStr,
          },
          {
            ...entityAndCoordinatorsRecipientContext(ctx.creadorEmail),
            estudiante: ctx.postulantEmail,
            postulante: ctx.postulantEmail,
            ...(entidadEmail ? { entidad: entidadEmail } : {}),
          },
          {
            postulacionId: String(postulacionId),
            source: "legalizacion_practica_rechazo_total",
            enviarAjuste: Boolean(enviarAjuste),
          }
        );
      }
    } catch (e) {
      console.error("[LegalizacionPractica] notif rechazo_legalizacion_practica:", e?.message || e);
    }

    res.json({
      legalizacion: await LegalizacionPractica.findById(leg._id).lean(),
      message: enviarAjuste ? "Enviado a ajuste" : "Legalización rechazada",
    });
  } catch (err) {
    console.error("[LegalizacionPractica] postRechazarLegalizacionPractica:", err);
    res.status(500).json({ message: err.message });
  }
};
