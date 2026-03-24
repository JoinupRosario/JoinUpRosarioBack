import mongoose from "mongoose";
import OportunidadMTM from "./oportunidadMTM.model.js";
import PostulacionMTM from "./postulacionMTM.model.js";
import LegalizacionMTM from "./legalizacionMTM.model.js";
import PlanDeTrabajoMTM from "./planDeTrabajoMTM.model.js";
import SeguimientoMTM from "./seguimientoMTM.model.js";
import AsistenciaMTM from "./asistenciaMTM.model.js";
import crypto from "crypto";
import { uploadToS3, getSignedDownloadUrl, getObjectFromS3, deleteFromS3 } from "../../config/s3.config.js";
import Item from "../shared/reference-data/models/item.schema.js"; // asegura registro del modelo "items"
import { buildSearchRegex } from "../../utils/searchUtils.js";
import Postulant from "../postulants/models/postulants.schema.js";
import PostulantProfile from "../postulants/models/profile/profile.schema.js";
import { ProfileEnrolledProgram, ProfileGraduateProgram, ProfileSkill, ProfileCv, ProfileSupport } from "../postulants/models/profile/index.js";
import { consultaInfAcademica, consultaAsignatura } from "../../services/uxxiIntegration.service.js";
import DocumentMonitoringDefinition from "../documentMonitoringDefinition/documentMonitoringDefinition.model.js";

/** Definiciones de documentos para legalización MTM (misma fuente que /documentos-legalizacion-monitoria). */
async function listDefinicionesDocumentosMonitoriaParaLegalizacion() {
  return DocumentMonitoringDefinition.find({})
    .sort({ documentOrder: 1 })
    .populate("documentTypeItem", "value description")
    .select("documentName documentObservation documentMandatory documentOrder extensionCodes documentTypeItem")
    .lean();
}

function normalizeExtCodeMon(c) {
  return String(c || "").replace(/^\./, "").trim().toLowerCase();
}

const MIME_TO_EXT_LEG = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

function archivoPermitidoPorDefinicionMon(file, def) {
  const codes = (def.extensionCodes || []).map(normalizeExtCodeMon).filter(Boolean);
  const orig = (file.originalname || "").toLowerCase();
  const dot = orig.lastIndexOf(".");
  const fileExt = dot >= 0 ? orig.slice(dot + 1) : "";
  const fromMime = MIME_TO_EXT_LEG[file.mimetype];
  if (!codes.length) {
    return file.mimetype === "application/pdf" && (!fileExt || fileExt === "pdf");
  }
  const candidates = [fileExt, fromMime].filter(Boolean);
  return candidates.some((c) => codes.includes(c));
}

function s3ExtensionFromUploadMon(file) {
  const orig = (file.originalname || "").toLowerCase();
  const dot = orig.lastIndexOf(".");
  if (dot >= 0) {
    const ext = orig.slice(dot);
    if (/^\.[a-z0-9]{1,10}$/i.test(ext)) return ext.toLowerCase();
  }
  const fromMime = MIME_TO_EXT_LEG[file.mimetype];
  return fromMime ? `.${fromMime}` : ".pdf";
}

function getLegDocMon(leg, definitionId) {
  const id = String(definitionId);
  const m = leg.documentos;
  if (!m || typeof m !== "object") return null;
  return m[id] ?? null;
}

function setLegDocMon(leg, definitionId, docValue) {
  if (!leg.documentos || typeof leg.documentos !== "object") leg.documentos = {};
  const id = String(definitionId);
  if (docValue == null) delete leg.documentos[id];
  else leg.documentos[id] = docValue;
  leg.markModified("documentos");
}

/** Suma N días hábiles (lun–vie) a una fecha. */
function addBusinessDays(date, days) {
  const d = new Date(date);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) added++;
  }
  return d;
}

/** RQ04: máximo de MTM aceptadas por periodo académico (mismo código de periodo). */
const MTM_MAX_ACEPTADAS_POR_PERIODO = 3;

/**
 * Clave lógica de periodo: código trim (si existe) o string del ObjectId del periodo.
 * Así varias ofertas con distintos documentos Periodo pero mismo `codigo` cuentan junto.
 */
function periodoKeyFromPopulated(periodo) {
  if (periodo == null) return null;
  const cod = periodo.codigo != null ? String(periodo.codigo).trim() : "";
  if (cod) return cod;
  const id = periodo._id != null ? String(periodo._id) : String(periodo);
  return id || null;
}

/** Pipeline base: postulaciones aceptadas del postulante con campo `pk` (clave periodo lógico). */
function stagesPostulacionesAceptadasConClavePeriodo(postulantObjectId) {
  const pid = new mongoose.Types.ObjectId(postulantObjectId);
  return [
    { $match: { postulant: pid, estado: "aceptado_estudiante" } },
    { $lookup: { from: "oportunidadmtms", localField: "oportunidadMTM", foreignField: "_id", as: "op" } },
    { $unwind: "$op" },
    { $match: { "op.periodo": { $ne: null } } },
    { $lookup: { from: "periodos", localField: "op.periodo", foreignField: "_id", as: "per" } },
    { $unwind: { path: "$per", preserveNullAndEmptyArrays: true } },
    {
      $addFields: {
        pk: {
          $let: {
            vars: { c: { $trim: { input: { $ifNull: ["$per.codigo", ""] } } } },
            in: {
              $cond: [{ $gt: [{ $strLenCP: "$$c" }, 0] }, "$$c", { $toString: "$op.periodo" }],
            },
          },
        },
      },
    },
  ];
}

async function countAceptadasMtmMismaClavePeriodo(postulantObjectId, periodoKey) {
  if (!periodoKey) return 0;
  const r = await PostulacionMTM.aggregate([
    ...stagesPostulacionesAceptadasConClavePeriodo(postulantObjectId),
    { $match: { pk: periodoKey } },
    { $count: "n" },
  ]);
  return r[0]?.n ?? 0;
}

/** Devuelve Set de claves de periodo donde el estudiante ya tiene >= max aceptaciones. */
async function getPeriodoKeysBloqueadosPorMaxAceptadas(postulantObjectId, max = MTM_MAX_ACEPTADAS_POR_PERIODO) {
  const grouped = await PostulacionMTM.aggregate([
    ...stagesPostulacionesAceptadasConClavePeriodo(postulantObjectId),
    { $match: { pk: { $nin: [null, ""] } } },
    { $group: { _id: "$pk", count: { $sum: 1 } } },
  ]);
  return new Set(
    grouped.filter((g) => g._id != null && String(g._id).trim() !== "" && g.count >= max).map((g) => g._id)
  );
}

const POPULATE_FIELDS = [
  { path: "dedicacionHoras", select: "value description listId" },
  { path: "valorPorHora", select: "value description listId" },
  { path: "tipoVinculacion", select: "value description listId" },
  { path: "categoria", select: "value description listId" },
  { path: "periodo", select: "codigo tipo estado" },
  { path: "asignaturas", select: "nombreAsignatura codAsignatura periodo codDepto nombreDepartamento" },
  { path: "programas", select: "name code level labelLevel" },
  { path: "profesorResponsable", select: "nombres apellidos identificacion", populate: { path: "user", select: "email name" } },
  { path: "company", select: "name legalName nit" },
  { path: "creadoPor", select: "name email" },
  { path: "actualizadoPor", select: "name email" },
  { path: "cerradoPor", select: "name email" },
  { path: "historialEstados.cambiadoPor", select: "name email" },
  { path: "cierrePostulantesSeleccionados", populate: { path: "postulant", populate: { path: "postulantId", select: "name" } } },
];

// ─── Listar oportunidades MTM ─────────────────────────────────────────────────
export const getOportunidadesMTM = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = "",
      estado,
      periodo,
      categoria
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const filter = {};

    if (search) {
      filter.nombreCargo = buildSearchRegex(search);
    }
    if (estado) filter.estado = estado;
    if (periodo) filter.periodo = periodo;
    if (categoria) filter.categoria = categoria;

    const [total, data] = await Promise.all([
      OportunidadMTM.countDocuments(filter),
      OportunidadMTM.find(filter)
        .populate(POPULATE_FIELDS)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean()
    ]);

    const opIds = data.map((o) => o._id);
    const countsFromPost = await PostulacionMTM.aggregate([
      { $match: { oportunidadMTM: { $in: opIds } } },
      { $group: { _id: "$oportunidadMTM", count: { $sum: 1 } } },
    ]);
    const countMap = new Map(countsFromPost.map((c) => [c._id.toString(), c.count]));
    const dataWithCount = data.map((opp) => ({
      ...opp,
      aplicacionesCount: countMap.get(opp._id.toString()) || 0,
    }));

    res.json({
      data: dataWithCount,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (err) {
    console.error("[MTM] getOportunidadesMTM:", err);
    res.status(500).json({ message: "Error al obtener oportunidades MTM" });
  }
};

// ─── GET /oportunidades-mtm/reportes/estadisticas ───────────────────────────────
// RQ04_HU003: Reportes y estadísticas MTM para coordinación (admin).
export const getReportesEstadisticasMTM = async (req, res) => {
  try {
    const [porEstadoOp, porEstadoPost, totales, porPeriodo] = await Promise.all([
      OportunidadMTM.aggregate([{ $group: { _id: "$estado", count: { $sum: 1 } } }]),
      PostulacionMTM.aggregate([{ $group: { _id: "$estado", count: { $sum: 1 } } }]),
      Promise.all([
        OportunidadMTM.countDocuments(),
        PostulacionMTM.countDocuments(),
        PostulacionMTM.countDocuments({ estado: "aceptado_estudiante" }),
        PostulacionMTM.countDocuments({ estado: "rechazado" }),
        PostulacionMTM.countDocuments({ estado: "seleccionado_empresa" }),
        PostulacionMTM.countDocuments({ estado: "aplicado" }).then((n) => n),
        PostulacionMTM.countDocuments({ $or: [{ estado: "empresa_consulto_perfil" }, { estado: "empresa_descargo_hv" }] }).then((n) => n),
      ]).then(([op, post, aceptadas, rechazadas, pendientesRespuesta, aplicadas, enRevision]) => ({
        totalOportunidades: op,
        totalPostulaciones: post,
        aceptadas,
        rechazadas,
        pendientesRespuesta,
        aplicadas,
        enRevision,
      })),
      PostulacionMTM.aggregate([
        { $lookup: { from: "oportunidadmtms", localField: "oportunidadMTM", foreignField: "_id", as: "op" } },
        { $unwind: "$op" },
        { $lookup: { from: "periodos", localField: "op.periodo", foreignField: "_id", as: "periodoDoc" } },
        { $unwind: { path: "$periodoDoc", preserveNullAndEmptyArrays: true } },
        {
          $group: {
            _id: "$periodoDoc.codigo",
            periodoId: { $first: "$op.periodo" },
            totalPostulaciones: { $sum: 1 },
            aceptadas: { $sum: { $cond: [{ $eq: ["$estado", "aceptado_estudiante"] }, 1, 0] } },
            rechazadas: { $sum: { $cond: [{ $eq: ["$estado", "rechazado"] }, 1, 0] } },
            seleccionadasPendientes: { $sum: { $cond: [{ $eq: ["$estado", "seleccionado_empresa"] }, 1, 0] } },
          },
        },
        { $sort: { _id: -1 } },
        { $limit: 12 },
      ]),
    ]);

    const resumen = {
      ...totales,
      oportunidadesPorEstado: Object.fromEntries(porEstadoOp.map((e) => [e._id || "sin_estado", e.count])),
      postulacionesPorEstado: Object.fromEntries(porEstadoPost.map((e) => [e._id || "sin_estado", e.count])),
    };

    const porPeriodoFormato = porPeriodo.map((p) => ({
      periodo: p._id || "—",
      totalPostulaciones: p.totalPostulaciones,
      aceptadas: p.aceptadas,
      rechazadas: p.rechazadas,
      seleccionadasPendientes: p.seleccionadasPendientes,
    }));

    res.json({
      success: true,
      resumen,
      porPeriodo: porPeriodoFormato,
      generadoAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[MTM] getReportesEstadisticasMTM:", err);
    res.status(500).json({ message: err.message });
  }
};

/** GET estadísticas específicas de legalización MTM (por estado, periodo, plazos). */
export const getEstadisticasLegalizacionMTM = async (req, res) => {
  try {
    const [porEstado, porPeriodo, totales] = await Promise.all([
      LegalizacionMTM.aggregate([{ $group: { _id: "$estado", count: { $sum: 1 } } }]),
      LegalizacionMTM.aggregate([
        { $lookup: { from: "postulacionmtms", localField: "postulacionMTM", foreignField: "_id", as: "po" } },
        { $unwind: "$po" },
        { $lookup: { from: "oportunidadmtms", localField: "po.oportunidadMTM", foreignField: "_id", as: "op" } },
        { $unwind: { path: "$op", preserveNullAndEmptyArrays: true } },
        { $lookup: { from: "periodos", localField: "op.periodo", foreignField: "_id", as: "periodoDoc" } },
        { $unwind: { path: "$periodoDoc", preserveNullAndEmptyArrays: true } },
        {
          $group: {
            _id: "$periodoDoc.codigo",
            total: { $sum: 1 },
            borrador: { $sum: { $cond: [{ $eq: ["$estado", "borrador"] }, 1, 0] } },
            en_revision: { $sum: { $cond: [{ $eq: ["$estado", "en_revision"] }, 1, 0] } },
            aprobada: { $sum: { $cond: [{ $eq: ["$estado", "aprobada"] }, 1, 0] } },
            rechazada: { $sum: { $cond: [{ $eq: ["$estado", "rechazada"] }, 1, 0] } },
            en_ajuste: { $sum: { $cond: [{ $eq: ["$estado", "en_ajuste"] }, 1, 0] } },
          },
        },
        { $sort: { _id: -1 } },
        { $limit: 15 },
      ]),
      LegalizacionMTM.aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            borrador: { $sum: { $cond: [{ $eq: ["$estado", "borrador"] }, 1, 0] } },
            en_revision: { $sum: { $cond: [{ $eq: ["$estado", "en_revision"] }, 1, 0] } },
            aprobada: { $sum: { $cond: [{ $eq: ["$estado", "aprobada"] }, 1, 0] } },
            rechazada: { $sum: { $cond: [{ $eq: ["$estado", "rechazada"] }, 1, 0] } },
            en_ajuste: { $sum: { $cond: [{ $eq: ["$estado", "en_ajuste"] }, 1, 0] } },
          },
        },
      ]),
    ]);

    const porEstadoMap = Object.fromEntries((porEstado || []).map((e) => [e._id || "sin_estado", e.count]));
    const totalesLeg = totales?.[0] || { total: 0, borrador: 0, en_revision: 0, aprobada: 0, rechazada: 0, en_ajuste: 0 };

    res.json({
      success: true,
      porEstado: porEstadoMap,
      total: totalesLeg.total,
      borrador: totalesLeg.borrador,
      en_revision: totalesLeg.en_revision,
      aprobada: totalesLeg.aprobada,
      rechazada: totalesLeg.rechazada,
      en_ajuste: totalesLeg.en_ajuste,
      porPeriodo: (porPeriodo || []).map((p) => ({
        periodo: p._id || "—",
        total: p.total,
        borrador: p.borrador,
        en_revision: p.en_revision,
        aprobada: p.aprobada,
        rechazada: p.rechazada,
        en_ajuste: p.en_ajuste,
      })),
      generadoAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[MTM] getEstadisticasLegalizacionMTM:", err);
    res.status(500).json({ message: err.message });
  }
};

// ─── Obtener una oportunidad MTM por ID ───────────────────────────────────────
export const getOportunidadMTMById = async (req, res) => {
  try {
    const op = await OportunidadMTM.findById(req.params.id).populate(POPULATE_FIELDS).lean();
    if (!op) return res.status(404).json({ message: "Oportunidad MTM no encontrada" });
    res.json(op);
  } catch (err) {
    console.error("[MTM] getOportunidadMTMById:", err);
    res.status(500).json({ message: "Error al obtener la oportunidad MTM" });
  }
};

// ─── Crear oportunidad MTM ────────────────────────────────────────────────────
export const createOportunidadMTM = async (req, res) => {
  try {
    const userId = req.user?.id;

    const {
      company,
      nombreCargo,
      dedicacionHoras,
      limiteHoras,
      centroCosto,
      codigoCPS,
      valorPorHora,
      tipoVinculacion,
      categoria,
      periodo,
      vacantes,
      fechaVencimiento,
      asignaturas,
      promedioMinimo,
      profesorResponsable,
      nombreProfesor,
      unidadAcademica,
      horario,
      grupo,
      programas,
      funciones,
      requisitos
    } = req.body;

    if (!nombreCargo) {
      return res.status(400).json({ message: "El nombre del cargo es requerido" });
    }
    if (asignaturas && asignaturas.length > 3) {
      return res.status(400).json({ message: "Se pueden seleccionar máximo 3 asignaturas" });
    }

    const nueva = await OportunidadMTM.create({
      company: company || null,
      nombreCargo,
      dedicacionHoras: dedicacionHoras || null,
      limiteHoras: limiteHoras ?? null,
      centroCosto: centroCosto || null,
      codigoCPS: codigoCPS || null,
      valorPorHora: valorPorHora || null,
      tipoVinculacion: tipoVinculacion || null,
      categoria: categoria || null,
      periodo: periodo || null,
      vacantes: vacantes || null,
      fechaVencimiento: fechaVencimiento || null,
      asignaturas: asignaturas || [],
      promedioMinimo: promedioMinimo ?? null,
      profesorResponsable: profesorResponsable || null,
      nombreProfesor: nombreProfesor || null,
      unidadAcademica: unidadAcademica || null,
      horario: horario || null,
      grupo: grupo || null,
      programas: programas || [],
      funciones: funciones || null,
      requisitos: requisitos || null,
      estado: "Borrador",
      creadoPor: userId || null,
      historialEstados: [
        {
          estadoAnterior: null,
          estadoNuevo: "Borrador",
          cambiadoPor: userId,
          motivo: "Creación"
        }
      ]
    });

    const populated = await nueva.populate(POPULATE_FIELDS);
    res.status(201).json(populated);
  } catch (err) {
    console.error("[MTM] createOportunidadMTM:", err);
    res.status(500).json({ message: "Error al crear la oportunidad MTM" });
  }
};

// ─── Actualizar oportunidad MTM ───────────────────────────────────────────────
export const updateOportunidadMTM = async (req, res) => {
  try {
    const userId = req.user?.id;
    const op = await OportunidadMTM.findById(req.params.id);
    if (!op) return res.status(404).json({ message: "Oportunidad MTM no encontrada" });

    const {
      company,
      nombreCargo,
      dedicacionHoras,
      limiteHoras,
      centroCosto,
      codigoCPS,
      valorPorHora,
      tipoVinculacion,
      categoria,
      periodo,
      vacantes,
      fechaVencimiento,
      asignaturas,
      promedioMinimo,
      profesorResponsable,
      nombreProfesor,
      unidadAcademica,
      horario,
      grupo,
      programas,
      funciones,
      requisitos
    } = req.body;

    if (asignaturas && asignaturas.length > 3) {
      return res.status(400).json({ message: "Se pueden seleccionar máximo 3 asignaturas" });
    }

    Object.assign(op, {
      ...(company !== undefined && { company }),
      ...(nombreCargo !== undefined && { nombreCargo }),
      ...(dedicacionHoras !== undefined && { dedicacionHoras }),
      ...(limiteHoras !== undefined && { limiteHoras }),
      ...(centroCosto !== undefined && { centroCosto }),
      ...(codigoCPS !== undefined && { codigoCPS }),
      ...(valorPorHora !== undefined && { valorPorHora }),
      ...(tipoVinculacion !== undefined && { tipoVinculacion }),
      ...(categoria !== undefined && { categoria }),
      ...(periodo !== undefined && { periodo }),
      ...(vacantes !== undefined && { vacantes }),
      ...(fechaVencimiento !== undefined && { fechaVencimiento }),
      ...(asignaturas !== undefined && { asignaturas }),
      ...(promedioMinimo !== undefined && { promedioMinimo }),
      ...(profesorResponsable !== undefined && { profesorResponsable: profesorResponsable || null }),
      ...(nombreProfesor !== undefined && { nombreProfesor }),
      ...(unidadAcademica !== undefined && { unidadAcademica }),
      ...(horario !== undefined && { horario }),
      ...(grupo !== undefined && { grupo }),
      ...(programas !== undefined && { programas }),
      ...(funciones !== undefined && { funciones }),
      ...(requisitos !== undefined && { requisitos }),
      actualizadoPor: userId || null
    });

    op.historialEstados = op.historialEstados || [];
    op.historialEstados.push({
      estadoAnterior: op.estado,
      estadoNuevo: op.estado,
      cambiadoPor: userId,
      motivo: "Edición de datos",
    });

    await op.save();
    const populated = await op.populate(POPULATE_FIELDS);
    res.json(populated);
  } catch (err) {
    console.error("[MTM] updateOportunidadMTM:", err);
    res.status(500).json({ message: "Error al actualizar la oportunidad MTM" });
  }
};

// ─── Cambiar estado de oportunidad MTM ───────────────────────────────────────
export const changeStatusMTM = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { estado, motivo } = req.body;

    const VALID_STATES = ["Borrador", "Activa", "Inactiva"];
    if (!VALID_STATES.includes(estado)) {
      return res.status(400).json({ message: "Estado inválido" });
    }

    const op = await OportunidadMTM.findById(req.params.id);
    if (!op) return res.status(404).json({ message: "Oportunidad MTM no encontrada" });

    op.historialEstados.push({
      estadoAnterior: op.estado,
      estadoNuevo: estado,
      cambiadoPor: userId,
      motivo: motivo || null
    });
    op.estado = estado;
    op.actualizadoPor = userId || null;
    await op.save();

    const populated = await op.populate(POPULATE_FIELDS);
    res.json(populated);
  } catch (err) {
    console.error("[MTM] changeStatusMTM:", err);
    res.status(500).json({ message: "Error al cambiar el estado" });
  }
};

// ─── Duplicar oportunidad MTM ─────────────────────────────────────────────────
export const duplicateOportunidadMTM = async (req, res) => {
  try {
    const userId = req.user?.id;
    const original = await OportunidadMTM.findById(req.params.id).lean();
    if (!original) return res.status(404).json({ message: "Oportunidad MTM no encontrada" });

    const { _id, createdAt, updatedAt, historialEstados, __v, ...rest } = original;

    const copia = await OportunidadMTM.create({
      ...rest,
      nombreCargo: `${rest.nombreCargo} (copia)`,
      estado: "Borrador",
      creadoPor: userId || null,
      actualizadoPor: null,
      historialEstados: [
        {
          estadoAnterior: null,
          estadoNuevo: "Borrador",
          cambiadoPor: userId,
          motivo: `Duplicado desde ${_id}`
        }
      ]
    });

    const populated = await copia.populate(POPULATE_FIELDS);
    res.status(201).json(populated);
  } catch (err) {
    console.error("[MTM] duplicateOportunidadMTM:", err);
    res.status(500).json({ message: "Error al duplicar la oportunidad MTM" });
  }
};

// ─── Eliminar oportunidad MTM ─────────────────────────────────────────────────
export const deleteOportunidadMTM = async (req, res) => {
  try {
    const op = await OportunidadMTM.findByIdAndDelete(req.params.id);
    if (!op) return res.status(404).json({ message: "Oportunidad MTM no encontrada" });
    res.json({ message: "Oportunidad MTM eliminada correctamente" });
  } catch (err) {
    console.error("[MTM] deleteOportunidadMTM:", err);
    res.status(500).json({ message: "Error al eliminar la oportunidad MTM" });
  }
};

// ─── Helper: documento del postulante (studentCode) para UXXI ─────────────────
async function getDocumentoForPostulant(postulantId) {
  const ids = [postulantId].filter(Boolean);
  if (ids.length === 0) return null;
  const profile = await PostulantProfile.findOne({ postulantId: { $in: ids } })
    .select("studentCode")
    .sort({ updatedAt: -1 })
    .lean();
  const doc = profile?.studentCode != null && profile.studentCode !== "" ? String(profile.studentCode).trim() : "";
  return doc || null;
}

// ─── GET /oportunidades-mtm/para-estudiante ──────────────────────────────────
// RQ04_HU001: Oportunidades MTM activas que el estudiante puede ver (programa, promedio, asignaturas desde UXXI).
export const getOportunidadesMTMParaEstudiante = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "No autenticado" });

    const postulant = await Postulant.findOne({ postulantId: userId }).select("_id").lean();
    if (!postulant) {
      return res.json({ opportunities: [], totalPages: 0, currentPage: 1, total: 0 });
    }

    const documento = await getDocumentoForPostulant(postulant._id) || await getDocumentoForPostulant(userId);
    if (!documento) {
      return res.status(400).json({
        message: "Debe tener un perfil con código estudiantil (studentCode) para ver oportunidades de monitoría.",
        opportunities: [],
        totalPages: 0,
        currentPage: 1,
        total: 0,
      });
    }

    let uxxiPlanes;
    try {
      uxxiPlanes = await consultaInfAcademica(documento);
    } catch (err) {
      console.error("[MTM] consultaInfAcademica:", err);
      return res.status(502).json({
        message: err.message || "Error al consultar información académica (UXXI).",
        opportunities: [],
        totalPages: 0,
        currentPage: 1,
        total: 0,
      });
    }

    if (!Array.isArray(uxxiPlanes) || uxxiPlanes.length === 0) {
      return res.json({ opportunities: [], totalPages: 0, currentPage: 1, total: 0 });
    }

    const studentProgramCodes = new Set();
    const studentPromedioByPlan = {};
    for (const p of uxxiPlanes) {
      const code = (p.codigoplan ?? p.planestudio ?? "").toString().trim();
      if (code) studentProgramCodes.add(code);
      const prom = p.promedioacumulado != null ? parseFloat(String(p.promedioacumulado).replace(",", ".")) : NaN;
      if (code && !Number.isNaN(prom)) studentPromedioByPlan[code] = prom;
    }

    const studentAsignaturasByPlan = {};
    for (const plan of uxxiPlanes) {
      const code = (plan.codigoplan ?? plan.planestudio ?? "").toString().trim();
      if (!code) continue;
      try {
        const items = await consultaAsignatura(documento, code);
        const codigos = new Set();
        (items || []).forEach((it) => {
          const id = it.identificador_asignatura != null ? String(it.identificador_asignatura).trim() : "";
          const cod = it.codigo_asignatura != null ? String(it.codigo_asignatura).trim() : "";
          if (id) codigos.add(id);
          if (cod) codigos.add(cod);
        });
        studentAsignaturasByPlan[code] = codigos;
      } catch {
        studentAsignaturasByPlan[code] = new Set();
      }
    }

    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const skip = (page - 1) * limit;

    const activas = await OportunidadMTM.find({ estado: "Activa" })
      .populate(POPULATE_FIELDS)
      .sort({ createdAt: -1 })
      .lean();

    const yaAplicados = await PostulacionMTM.find({ postulant: postulant._id }).select("oportunidadMTM").lean();
    const idsAplicados = new Set(yaAplicados.map((p) => String(p.oportunidadMTM)).filter((id) => id.length === 24));

    /** No mostrar ofertas de periodos donde ya tiene 3 MTM aceptadas (mismo código de periodo). */
    const periodoKeysBloqueados = await getPeriodoKeysBloqueadosPorMaxAceptadas(postulant._id);

    const parseNum = (v) => {
      if (v == null || v === "") return NaN;
      const n = parseFloat(String(v).replace(",", "."));
      return Number.isFinite(n) ? n : NaN;
    };

    const filtered = activas.filter((opp) => {
      if (idsAplicados.has(String(opp._id))) return false;

      const pkOpp = periodoKeyFromPopulated(opp.periodo);
      if (pkOpp && periodoKeysBloqueados.has(pkOpp)) return false;

      const oppProgramIds = (opp.programas || []).map((p) => (p && (p._id || p))).filter(Boolean);
      const oppProgramCodes = (opp.programas || []).map((p) => (p && (p.code || p.name || "")).toString().trim()).filter(Boolean);
      const matchProgram = [...studentProgramCodes].some((sc) =>
        oppProgramCodes.some((pc) => pc === sc || (sc && pc && (pc.includes(sc) || sc.includes(pc))))
      );
      if (!matchProgram) return false;

      const minProm = parseNum(opp.promedioMinimo);
      if (!Number.isNaN(minProm)) {
        const proms = [...studentProgramCodes].map((c) => studentPromedioByPlan[c]).filter((p) => p != null && !Number.isNaN(p));
        const studentProm = proms.length ? Math.max(...proms) : null;
        if (studentProm == null || studentProm < minProm) return false;
      }

      const oppAsignaturas = opp.asignaturas || [];
      if (oppAsignaturas.length > 0) {
        const allPlansAsig = Object.values(studentAsignaturasByPlan);
        const studentAllCodigos = new Set();
        allPlansAsig.forEach((s) => s.forEach((c) => studentAllCodigos.add(c)));
        const oppCodes = oppAsignaturas.map((a) => (a && (a.codAsignatura || a.idAsignatura || a._id)).toString().trim()).filter(Boolean);
        const todasCursadas = oppCodes.every((cod) => studentAllCodigos.has(cod) || [...studentAllCodigos].some((s) => s.includes(cod) || cod.includes(s)));
        if (!todasCursadas) return false;
      }

      return true;
    });

    const total = filtered.length;
    const opportunities = filtered.slice(skip, skip + limit);

    /** Conteo de postulantes por oferta (misma UX que tarjetas de prácticas). */
    if (opportunities.length > 0) {
      const oppIds = opportunities.map((o) => o._id).filter(Boolean);
      const countRows = await PostulacionMTM.aggregate([
        { $match: { oportunidadMTM: { $in: oppIds } } },
        { $group: { _id: "$oportunidadMTM", count: { $sum: 1 } } },
      ]);
      const byId = new Map(countRows.map((r) => [String(r._id), r.count]));
      opportunities.forEach((o) => {
        o.postulacionesCount = byId.get(String(o._id)) || 0;
      });
    }

    res.json({
      opportunities,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total,
    });
  } catch (err) {
    console.error("[MTM] getOportunidadesMTMParaEstudiante:", err);
    res.status(500).json({ message: "Error al obtener oportunidades MTM para estudiante", error: err.message });
  }
};

// ─── POST /oportunidades-mtm/:id/aplicar ─────────────────────────────────────
export const aplicarOportunidadMTM = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "No autenticado" });

    const postulant = await Postulant.findOne({ postulantId: userId }).select("_id").lean();
    if (!postulant) return res.status(403).json({ message: "No se encontró postulante asociado al usuario" });

    const { id } = req.params;
    const { postulantProfileId, profileVersionId } = req.body || {};

    if (!postulantProfileId) {
      return res.status(400).json({ message: "Debe indicar el perfil (hoja de vida) con el que aplica (postulantProfileId)." });
    }

    const oportunidad = await OportunidadMTM.findById(id).populate("periodo", "codigo").lean();
    if (!oportunidad) return res.status(404).json({ message: "Oportunidad MTM no encontrada" });
    if (oportunidad.estado !== "Activa") {
      return res.status(400).json({ message: "Solo se puede aplicar a oportunidades en estado Activa." });
    }

    const pk = periodoKeyFromPopulated(oportunidad.periodo);
    if (pk) {
      const n = await countAceptadasMtmMismaClavePeriodo(postulant._id, pk);
      if (n >= MTM_MAX_ACEPTADAS_POR_PERIODO) {
        const label = oportunidad.periodo?.codigo || pk;
        return res.status(400).json({
          message: `Ya tiene ${MTM_MAX_ACEPTADAS_POR_PERIODO} monitorías/tutorías/mentorías aceptadas para el periodo ${label}. No puede postularse a más ofertas de ese periodo.`,
        });
      }
    }

    const profileDoc = await PostulantProfile.findOne({
      _id: postulantProfileId,
      postulantId: { $in: [postulant._id, userId] },
    }).select("_id").lean();
    if (!profileDoc) return res.status(400).json({ message: "Perfil no encontrado o no pertenece al postulante." });

    const existe = await PostulacionMTM.findOne({ postulant: postulant._id, oportunidadMTM: id }).lean();
    if (existe) return res.status(400).json({ message: "Ya ha aplicado a esta oportunidad." });

    const nueva = await PostulacionMTM.create({
      postulant: postulant._id,
      oportunidadMTM: id,
      postulantProfile: profileDoc._id,
      profileVersionId: profileVersionId || null,
      estado: "aplicado",
    });

    const populated = await PostulacionMTM.findById(nueva._id)
      .populate("oportunidadMTM", "nombreCargo estado")
      .populate("postulantProfile", "studentCode")
      .lean();

    res.status(201).json({ message: "Postulación registrada correctamente", postulacion: populated });
  } catch (err) {
    console.error("[MTM] aplicarOportunidadMTM:", err);
    res.status(500).json({ message: err.response?.data?.message || err.message || "Error al aplicar" });
  }
};

// ─── GET /oportunidades-mtm/mis-postulaciones ─────────────────────────────────
export const getMisPostulacionesMTM = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "No autenticado" });

    const postulant = await Postulant.findOne({ postulantId: userId }).select("_id").lean();
    if (!postulant) return res.json({ data: [], total: 0 });

    const list = await PostulacionMTM.find({ postulant: postulant._id })
      .populate({
        path: "oportunidadMTM",
        select: "nombreCargo estado fechaVencimiento nombreProfesor profesorResponsable",
        populate: { path: "profesorResponsable", select: "nombres apellidos" },
      })
      .populate("postulantProfile", "studentCode")
      .sort({ fechaAplicacion: -1 })
      .lean();

    let diasHabiles = 8;
    try {
      const Parameter = (await import("../parameters/parameter.model.js")).default;
      const param = await Parameter.findOne({ code: "DIAS_HABILES_ACEPTAR_SELECCION_MTM", "metadata.active": true }).lean();
      if (param != null && typeof param.value === "number" && param.value > 0) diasHabiles = param.value;
    } catch (_) {}

    const data = list.map((p) => {
      const opp = p.oportunidadMTM;
      const nombreCoordinador = opp?.profesorResponsable
        ? [opp.profesorResponsable.nombres, opp.profesorResponsable.apellidos].filter(Boolean).join(" ").trim() || opp?.nombreProfesor
        : opp?.nombreProfesor ?? null;
      return {
        _id: p._id,
        cargo: opp?.nombreCargo,
        fechaAplicacion: p.fechaAplicacion,
        tipoOportunidad: "Monitoría / Tutoría / Mentoría",
        estadoOportunidad: opp?.estado,
        estado: p.estado,
        empresaConsultoPerfil: !!p.empresaConsultoPerfilAt,
        empresaDescargoHv: !!p.empresaDescargoHvAt,
        seleccionado: p.estado === "seleccionado_empresa" || p.estado === "aceptado_estudiante",
        estadoConfirmacion: p.estadoConfirmacion,
        oportunidadId: opp?._id,
        seleccionadoAt: p.seleccionadoAt,
        nombreCoordinador: nombreCoordinador || undefined,
      };
    });

    res.json({ data, total: data.length, diasHabilesAceptarSeleccion: diasHabiles });
  } catch (err) {
    console.error("[MTM] getMisPostulacionesMTM:", err);
    res.status(500).json({ message: err.message });
  }
};

// ─── GET /oportunidades-mtm/mis-aceptadas ───────────────────────────────────
// RQ04_HU004: Lista de MTM que el estudiante aceptó (para Legalización). Solo estado aceptado_estudiante.
export const getMisAceptadasMTM = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "No autenticado" });

    const postulant = await Postulant.findOne({ postulantId: userId })
      .select("_id postulantId")
      .populate("postulantId", "name")
      .lean();
    if (!postulant) return res.json({ data: [], total: 0 });

    const list = await PostulacionMTM.find({
      postulant: postulant._id,
      estado: "aceptado_estudiante",
    })
      .populate({
        path: "oportunidadMTM",
        select: "nombreCargo periodo nombreProfesor profesorResponsable categoria vacantes valorPorHora asignaturas programas",
        populate: [
          { path: "periodo", select: "codigo" },
          { path: "valorPorHora", select: "value description" },
          { path: "asignaturas", select: "nombreAsignatura codAsignatura" },
          { path: "programas", select: "name code" },
          { path: "profesorResponsable", select: "nombres apellidos", populate: { path: "user", select: "email" } },
        ],
      })
      .populate("postulantProfile", "studentCode")
      .sort({ aceptadoEstudianteAt: -1 })
      .lean();

    const postulacionIds = list.map((p) => p._id);
    const [legalizaciones, planes] = await Promise.all([
      LegalizacionMTM.find({ postulacionMTM: { $in: postulacionIds } }).select("postulacionMTM estado").lean(),
      PlanDeTrabajoMTM.find({ postulacionMTM: { $in: postulacionIds } }).select("postulacionMTM estado").lean(),
    ]);
    const estadoLegByPost = {};
    legalizaciones.forEach((l) => {
      estadoLegByPost[String(l.postulacionMTM)] = l.estado;
    });

    /** Etiqueta legible para el listado estudiante (HU legalización). */
    const labelEstadoLegalizacion = (raw) => {
      if (raw == null || raw === undefined) return "Pendiente de iniciar";
      const m = {
        borrador: "Borrador (complete y envíe a revisión)",
        en_revision: "Enviada a revisión",
        aprobada: "Aprobada",
        rechazada: "Rechazada",
        en_ajuste: "En ajuste (coordinación solicitó cambios)",
      };
      return m[raw] || raw;
    };
    const planAprobadoByPost = {};
    planes.forEach((pl) => {
      planAprobadoByPost[String(pl.postulacionMTM)] = pl.estado === "aprobado";
    });

    const nombreCompleto = postulant.postulantId?.name || "";

    const data = list.map((p) => {
      const opp = p.oportunidadMTM;
      const programaOportunidad = opp?.programas?.length
        ? opp.programas.map((prog) => prog?.name).filter(Boolean).join(", ") || opp.programas[0]?.name
        : null;
      return {
        _id: p._id,
        oportunidadId: opp?._id,
        numeroIdentidad: p.postulantProfile?.studentCode ?? null,
        nombre: nombreCompleto.split(" ").slice(0, -1).join(" ") || nombreCompleto,
        apellido: nombreCompleto.split(" ").slice(-1)[0] || "",
        programa: programaOportunidad,
        codigoMonitoria: opp?._id?.toString?.()?.slice(-8) ?? null,
        nombreMonitoria: opp?.nombreCargo ?? null,
        periodo: opp?.periodo?.codigo ?? null,
        coordinador: opp?.profesorResponsable ? [opp.profesorResponsable.nombres, opp.profesorResponsable.apellidos].filter(Boolean).join(" ") : (opp?.nombreProfesor ?? null),
        /** Postulación ya aceptada por el estudiante (siempre en esta lista). */
        estadoPostulacion: "Aceptado",
        /** Estado del trámite de legalización (formulario / revisión / etc.). */
        estadoLegalizacion: labelEstadoLegalizacion(estadoLegByPost[String(p._id)]),
        estadoLegalizacionCodigo: estadoLegByPost[String(p._id)] ?? null,
        planAprobado: planAprobadoByPost[String(p._id)] === true,
        finalizadoPorMonitor: null,
        aceptadoEstudianteAt: p.aceptadoEstudianteAt,
        oportunidad: opp,
      };
    });

    res.json({ data, total: data.length });
  } catch (err) {
    console.error("[MTM] getMisAceptadasMTM:", err);
    res.status(500).json({ message: err.message });
  }
};

// ─── POST /oportunidades-mtm/:id/cerrar ─────────────────────────────────────
// RQ04_HU001: Al cerrar la oportunidad, seleccionados → estadoConfirmacion confirmado; resto → rechazado.
export const cerrarOportunidadMTM = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    const { postulantesSeleccionados } = req.body || {};
    const selectedIds = Array.isArray(postulantesSeleccionados) ? postulantesSeleccionados.map(String).filter(Boolean) : [];

    const op = await OportunidadMTM.findById(id);
    if (!op) return res.status(404).json({ message: "Oportunidad MTM no encontrada" });
    if (op.estado !== "Activa") {
      return res.status(400).json({ message: "Solo se puede cerrar una oportunidad en estado Activa." });
    }

    const postulaciones = await PostulacionMTM.find({ oportunidadMTM: id }).lean();
    const now = new Date();
    for (const p of postulaciones) {
      const idStr = String(p._id);
      const fueSeleccionado = selectedIds.includes(idStr);
      await PostulacionMTM.updateOne(
        { _id: p._id },
        {
          $set: {
            estado: fueSeleccionado ? "seleccionado_empresa" : "rechazado",
            estadoConfirmacion: fueSeleccionado ? "confirmado" : "rechazado",
            ...(fueSeleccionado ? { seleccionadoAt: now } : { rechazadoAt: now }),
          },
        }
      );
    }

    // Trazabilidad en la oportunidad (igual que en prácticas)
    op.fechaCierre = now;
    op.cerradoPor = userId || null;
    op.cierrePostulantesSeleccionados = selectedIds
      .map((sid) => (mongoose.Types.ObjectId.isValid(sid) ? new mongoose.Types.ObjectId(sid) : null))
      .filter(Boolean);
    op.historialEstados.push({
      estadoAnterior: op.estado,
      estadoNuevo: "Inactiva",
      cambiadoPor: userId,
      motivo: selectedIds.length > 0
        ? "Cierre de oportunidad con postulante(s) seleccionado(s)"
        : "Cierre de oportunidad",
    });
    op.estado = "Inactiva";
    op.actualizadoPor = userId || null;
    await op.save();

    const populated = await OportunidadMTM.findById(id).populate(POPULATE_FIELDS).lean();
    res.json(populated);
  } catch (err) {
    console.error("[MTM] cerrarOportunidadMTM:", err);
    res.status(500).json({ message: err.message });
  }
};

// ─── GET /oportunidades-mtm/:id/applications ─────────────────────────────────
// Lista postulaciones para la coordinación (misma forma que prácticas para el front).
export const getApplicationsMTM = async (req, res) => {
  try {
    const { id } = req.params;
    const op = await OportunidadMTM.findById(id);
    if (!op) return res.status(404).json({ message: "Oportunidad MTM no encontrada" });

    const postulantesList = await PostulacionMTM.find({ oportunidadMTM: id })
      .populate("postulant", "postulantId")
      .populate("postulantProfile", "studentCode yearsExperience totalTimeExperience")
      .populate({ path: "postulant", populate: { path: "postulantId", select: "name email" } })
      .lean();

    const profileIds = postulantesList.map((p) => p.postulantProfile?._id).filter(Boolean);
    const [enrolledByProfile, graduateByProfile] = await Promise.all([
      profileIds.length
        ? ProfileEnrolledProgram.find({ profileId: { $in: profileIds } })
            .populate("programId", "name level")
            .lean()
        : [],
      profileIds.length
        ? ProfileGraduateProgram.find({ profileId: { $in: profileIds } })
            .populate("programId", "name level")
            .lean()
        : [],
    ]);
    const enrolledMap = new Map();
    enrolledByProfile.forEach((e) => {
      if (!e.profileId) return;
      const key = e.profileId.toString();
      if (!enrolledMap.has(key)) enrolledMap.set(key, []);
      enrolledMap.get(key).push(e.programId?.name || e.programId?.level || "—");
    });
    const graduateMap = new Map();
    graduateByProfile.forEach((g) => {
      if (!g.profileId) return;
      const key = g.profileId.toString();
      if (!graduateMap.has(key)) graduateMap.set(key, []);
      graduateMap.get(key).push(g.programId?.name || g.programId?.level || "—");
    });

    const estadoLabel = (est) => {
      const map = {
        aplicado: "Enviado",
        empresa_consulto_perfil: "Revisado",
        empresa_descargo_hv: "HV descargada",
        seleccionado_empresa: "Seleccionado",
        aceptado_estudiante: "Aceptado",
        rechazado: "Rechazado",
      };
      return map[est] || est || "—";
    };

    const postulaciones = postulantesList.map((p) => {
      const profileId = p.postulantProfile?._id?.toString();
      const name = (p.postulant?.postulantId?.name || p.postulant?.name || "").trim();
      const [nombres = "", ...rest] = name ? name.split(/\s+/) : [];
      const apellidos = rest.join(" ") || "—";
      const years = p.postulantProfile?.yearsExperience ?? p.postulantProfile?.totalTimeExperience;
      const añosExperiencia = years != null ? `${years} Año(s) de experiencia` : null;
      return {
        _id: p._id,
        postulant: p.postulant,
        postulantProfile: p.postulantProfile,
        fechaPostulacion: p.fechaAplicacion,
        estado: p.estado,
        estadoLabel: estadoLabel(p.estado),
        comentarios: p.comentarios,
        revisadoPor: p.revisadoPor,
        fechaRevision: p.updatedAt,
        _source: "postulacion_oportunidad",
        tipo: "postulant",
        nombres: nombres || "—",
        apellidos,
        programasEnCurso: profileId ? enrolledMap.get(profileId) || [] : [],
        programasFinalizados: profileId ? graduateMap.get(profileId) || [] : [],
        añosExperiencia,
        revisada: !!p.empresaConsultoPerfilAt,
        descargada: !!p.empresaDescargoHvAt,
      };
    });

    res.json({ postulaciones, total: postulaciones.length });
  } catch (err) {
    console.error("[MTM] getApplicationsMTM:", err);
    res.status(500).json({ message: err.message });
  }
};

// ─── GET /oportunidades-mtm/:id/applications/detail/:postulacionId ───────────
// Detalle de un postulante (perfil, HV). Al abrir se marca empresa_consulto_perfil.
export const getApplicationDetailMTM = async (req, res) => {
  try {
    const { id: oportunidadId, postulacionId } = req.params;
    const op = await OportunidadMTM.findById(oportunidadId);
    if (!op) return res.status(404).json({ message: "Oportunidad MTM no encontrada" });

    const po = await PostulacionMTM.findOne({
      _id: postulacionId,
      oportunidadMTM: oportunidadId,
    })
      .populate("postulant", "postulantId")
      .populate("postulantProfile", "studentCode yearsExperience totalTimeExperience")
      .populate({ path: "postulant", populate: { path: "postulantId", select: "name email" } })
      .lean();

    if (!po) return res.status(404).json({ message: "Postulación no encontrada" });

    if (po.estado === "aplicado" && !po.empresaConsultoPerfilAt) {
      await PostulacionMTM.updateOne(
        { _id: postulacionId },
        {
          $set: {
            estado: "empresa_consulto_perfil",
            empresaConsultoPerfilAt: new Date(),
          },
        }
      );
    }

    const profileIdRaw = po.postulantProfile?._id ?? po.postulantProfile;
    const profileId = profileIdRaw
      ? mongoose.Types.ObjectId.isValid(profileIdRaw)
        ? typeof profileIdRaw === "string"
          ? new mongoose.Types.ObjectId(profileIdRaw)
          : profileIdRaw
        : null
      : null;
    const profileVersionIdRaw = po.profileVersionId;
    const profileVersionId = profileVersionIdRaw && mongoose.Types.ObjectId.isValid(profileVersionIdRaw)
      ? (typeof profileVersionIdRaw === "string" ? new mongoose.Types.ObjectId(profileVersionIdRaw) : profileVersionIdRaw)
      : null;
    // Solo la HV con la que aplicó: mismo perfil y misma versión (si aplicó con versión).
    const cvFilter = { profileId };
    if (profileVersionId) {
      cvFilter.profileVersionId = profileVersionId;
    } else {
      cvFilter.$or = [{ profileVersionId: null }, { profileVersionId: { $exists: false } }];
    }
    const postulantDocId = po.postulant?._id?.toString();
    const postulantDoc = postulantDocId
      ? await Postulant.findById(postulantDocId).select("_id phone alternateEmail linkedinLink").lean()
      : null;

    let cvs = [];
    if (profileId) {
      cvs = await ProfileCv.find(cvFilter)
        .populate("attachmentId", "name filepath contentType")
        .sort({ _id: -1 })
        .limit(1)
        .lean();
      // Si aplicó con perfil base (sin versión) y no hay HV con profileVersionId null, usar la más reciente del perfil.
      if (cvs.length === 0 && !profileVersionId) {
        const fallback = await ProfileCv.find({ profileId }).populate("attachmentId", "name filepath contentType").sort({ _id: -1 }).limit(1).lean();
        if (fallback.length > 0) cvs = fallback;
      }
    }
    const [skills, enrolledList, graduateList] = await Promise.all([
      profileId ? ProfileSkill.find({ profileId }).populate("skillId", "name").lean() : [],
      profileId ? ProfileEnrolledProgram.find({ profileId }).populate("programId", "name level").lean() : [],
      profileId ? ProfileGraduateProgram.find({ profileId }).populate("programId", "name level").lean() : [],
    ]);

    const name = (po.postulant?.postulantId?.name || po.postulant?.name || "").trim();
    const [nombres = "", ...rest] = name ? name.split(/\s+/) : [];
    const apellidos = rest.join(" ") || "—";
    const years = po.postulantProfile?.yearsExperience ?? po.postulantProfile?.totalTimeExperience;
    const añosExperiencia = years != null ? `${years} Año(s) de experiencia` : null;
    const estadoLabels = {
      aplicado: "Enviado",
      empresa_consulto_perfil: "Revisado",
      empresa_descargo_hv: "HV descargada",
      seleccionado_empresa: "Seleccionado",
      aceptado_estudiante: "Aceptado",
      rechazado: "Rechazado",
    };

    res.json({
      _id: po._id,
      _source: "postulacion_oportunidad",
      nombres: nombres || "—",
      apellidos,
      email: po.postulant?.postulantId?.email || postulantDoc?.alternateEmail || "—",
      telefono: postulantDoc?.phone || "—",
      linkedin: postulantDoc?.linkedinLink || null,
      fechaAplicacion: po.fechaAplicacion,
      estado: po.estado,
      estadoLabel: estadoLabels[po.estado] || po.estado,
      programasEnCurso: enrolledList.map((e) => e.programId?.name || e.programId?.level || "—"),
      programasFinalizados: graduateList.map((g) => g.programId?.name || g.programId?.level || "—"),
      añosExperiencia,
      competencias: skills.map((s) => s.skillId?.name).filter(Boolean),
      hojasDeVida: cvs.map((c) => ({
        attachmentId: c.attachmentId?._id,
        name: c.attachmentId?.name || "Hoja de vida",
        postulantDocId: postulantDocId || postulantDoc?._id?.toString(),
      })),
    });
  } catch (err) {
    console.error("[MTM] getApplicationDetailMTM:", err);
    res.status(500).json({ message: err.message });
  }
};

// ─── PATCH /oportunidades-mtm/:id/applications/:postulacionId/descargo-hv ─────
// Marca que se descargó la HV (empresaDescargoHvAt, estado empresa_descargo_hv).
export const markApplicationDescargoHvMTM = async (req, res) => {
  try {
    const { id: oportunidadId, postulacionId } = req.params;
    const po = await PostulacionMTM.findOne({
      _id: postulacionId,
      oportunidadMTM: oportunidadId,
    });
    if (!po) return res.status(404).json({ message: "Postulación no encontrada" });
    po.empresaDescargoHvAt = new Date();
    if (po.estado !== "empresa_descargo_hv") {
      po.estado = "empresa_descargo_hv";
    }
    await po.save();
    res.json({
      message: "HV marcada como descargada",
      empresaDescargoHvAt: po.empresaDescargoHvAt,
      estado: po.estado,
      estadoLabel: "HV descargada",
    });
  } catch (err) {
    console.error("[MTM] markApplicationDescargoHvMTM:", err);
    res.status(500).json({ message: err.message });
  }
};

// ─── PATCH /oportunidades-mtm/:id/applications/:postulacionId/estudiante-responder ─
// El estudiante (postulante) confirma o rechaza la selección. Body: { accion: 'confirmar' | 'rechazar' }
export const estudianteResponderPostulacionMTM = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "No autenticado" });
    const { id: oportunidadId, postulacionId } = req.params;
    const { accion } = req.body || {};
    if (!accion || !["confirmar", "rechazar"].includes(accion)) {
      return res.status(400).json({ message: "accion debe ser 'confirmar' o 'rechazar'" });
    }

    const postulant = await Postulant.findOne({ postulantId: userId }).select("_id").lean();
    if (!postulant) return res.status(403).json({ message: "No es postulante" });

    const po = await PostulacionMTM.findOne({
      _id: postulacionId,
      oportunidadMTM: oportunidadId,
      postulant: postulant._id,
    });
    if (!po) return res.status(404).json({ message: "Postulación no encontrada" });
    if (po.estado !== "seleccionado_empresa") {
      return res.status(400).json({ message: "Solo puede responder cuando fue seleccionado por la empresa" });
    }

    if (accion === "confirmar") {
      // RQ04_HU003: plazo de N días hábiles para aceptar
      let diasHabiles = 8;
      try {
        const Parameter = (await import("../parameters/parameter.model.js")).default;
        const param = await Parameter.findOne({ code: "DIAS_HABILES_ACEPTAR_SELECCION_MTM", "metadata.active": true }).lean();
        if (param != null && typeof param.value === "number" && param.value > 0) diasHabiles = param.value;
      } catch (_) {}
      if (po.seleccionadoAt) {
        const limite = addBusinessDays(po.seleccionadoAt, diasHabiles);
        if (new Date() > limite) {
          return res.status(400).json({
            message: `El plazo para aceptar o rechazar esta selección ha vencido (${diasHabiles} días hábiles desde la selección).`,
          });
        }
      }
      // RQ04_HU003: máximo 3 MTM aceptadas por periodo académico (mismo código de periodo)
      const opp = await OportunidadMTM.findById(oportunidadId).populate("periodo", "codigo").lean();
      if (opp?.periodo) {
        const pk = periodoKeyFromPopulated(opp.periodo);
        if (pk) {
          const yaAceptadas = await countAceptadasMtmMismaClavePeriodo(postulant._id, pk);
          if (yaAceptadas >= MTM_MAX_ACEPTADAS_POR_PERIODO) {
            return res.status(400).json({
              message: `Ya tiene el máximo de ${MTM_MAX_ACEPTADAS_POR_PERIODO} monitorías/tutorías/mentorías aceptadas para este periodo académico.`,
            });
          }
        }
      }
    }

    const now = new Date();
    if (accion === "confirmar") {
      po.estado = "aceptado_estudiante";
      po.aceptadoEstudianteAt = now;
      po.rechazadoAt = null;
    } else {
      po.estado = "rechazado";
      po.rechazadoAt = now;
      po.aceptadoEstudianteAt = null;
    }
    await po.save();

    if (accion === "confirmar") {
      // RQ04_HU003: notificar a coordinación GUIARTE (plantilla "Posterior a la aceptación de oferta por parte del estudiante")
      try {
        const Evento = (await import("../notificacion/eventos/evento.model.js")).default;
        const { getRenderedActivePlantilla } = await import("../notificacion/plantillasNotificacion/plantillaNotificacion.service.js");
        const evento = await Evento.findOne({ value: "aceptacion_oferta_por_estudiante", tipo: "monitoria" }).select("_id").lean();
        if (evento) {
          const oppFull = await OportunidadMTM.findById(oportunidadId).populate("periodo", "codigo").lean();
          const postulantUser = await Postulant.findById(postulant._id).populate("postulantId", "name email").lean();
          const rendered = await getRenderedActivePlantilla(evento._id, {
            NOMBRE_ESTUDIANTE: postulantUser?.postulantId?.name || "Estudiante",
            NOMBRE_MTM: oppFull?.nombreCargo || "Monitoría/Tutoría/Mentoría",
            PERIODO: oppFull?.periodo?.codigo || "",
          });
          if (rendered) {
            // TODO: enviar correo al coordinador (destinatarios según plantilla o configuración GUIARTE)
            console.log("[MTM] Notificación aceptación estudiante:", rendered.asunto);
          }
        }
      } catch (notifErr) {
        console.error("[MTM] Error al preparar notificación aceptación:", notifErr);
      }
    }

    res.json({
      message: accion === "confirmar" ? "Has confirmado la selección" : "Has rechazado la selección",
      estado: po.estado,
      aceptadoEstudianteAt: po.aceptadoEstudianteAt,
      rechazadoAt: po.rechazadoAt,
    });
  } catch (err) {
    console.error("[MTM] estudianteResponderPostulacionMTM:", err);
    res.status(500).json({ message: err.message });
  }
};

// ─── PATCH /oportunidades-mtm/:id/applications/:postulacionId/state ───────────
export const updateApplicationStateMTM = async (req, res) => {
  try {
    const { id: oportunidadId, postulacionId } = req.params;
    const { estado } = req.body;

    if (!estado || !["rechazado", "empresa_consulto_perfil"].includes(estado)) {
      return res.status(400).json({
        message: "estado debe ser 'rechazado' o 'empresa_consulto_perfil' (para deshacer rechazo)",
      });
    }

    const po = await PostulacionMTM.findOne({
      _id: postulacionId,
      oportunidadMTM: oportunidadId,
    });
    if (!po) return res.status(404).json({ message: "Postulación no encontrada" });

    if (estado === "rechazado") {
      po.estado = "rechazado";
      po.rechazadoAt = new Date();
    } else {
      po.estado = "empresa_consulto_perfil";
      po.rechazadoAt = null;
    }
    await po.save();

    const estadoLabel = estado === "rechazado" ? "Rechazado" : "Revisado";
    res.json({
      message: estado === "rechazado" ? "Postulante rechazado" : "Rechazo revertido",
      estado: po.estado,
      estadoLabel,
    });
  } catch (err) {
    console.error("[MTM] updateApplicationStateMTM:", err);
    res.status(500).json({ message: err.message });
  }
};

// ─── GET /oportunidades-mtm/:id/history ───────────────────────────────────────
export const getStatusHistoryMTM = async (req, res) => {
  try {
    const op = await OportunidadMTM.findById(req.params.id)
      .populate("historialEstados.cambiadoPor", "name email")
      .select("historialEstados")
      .lean();

    if (!op) return res.status(404).json({ message: "Oportunidad MTM no encontrada" });

    const historial = (op.historialEstados || []).map((h) => ({
      estadoAnterior: h.estadoAnterior,
      estadoNuevo: h.estadoNuevo,
      fechaCambio: h.fechaCambio,
      cambiadoPor: h.cambiadoPor,
      motivo: h.motivo,
      comentarios: h.comentarios || null,
    }));

    res.json({ historial });
  } catch (err) {
    console.error("[MTM] getStatusHistoryMTM:", err);
    res.status(500).json({ message: err.message });
  }
};

// ─── Legalización MTM (RQ04_HU004) ───────────────────────────────────────────
const S3_PREFIX_LEGALIZACIONES = "legalizaciones-mtm";
/** Debe coincidir con el valor guardado al subir “Otros documentos de soporte” → tipo Cédula (front: DOCUMENT_LABEL_SUPPORT_CEDULA). */
const DOCUMENT_LABEL_SUPPORT_CEDULA = "Cédula";

async function findCedulaSupportAttachmentForProfile(profileId) {
  if (!profileId) return null;
  const row = await ProfileSupport.findOne({
    profileId,
    documentLabel: DOCUMENT_LABEL_SUPPORT_CEDULA,
  })
    .sort({ _id: -1 })
    .populate("attachmentId", "name")
    .lean();
  if (!row?.attachmentId?._id) return null;
  return {
    _id: row.attachmentId._id,
    name: row.attachmentId.name || "Cédula",
  };
}

function isValidObjectId24(id) {
  return typeof id === "string" && /^[a-fA-F0-9]{24}$/.test(id);
}

async function getLegalizacionMTMForStudent(req, postulacionId) {
  if (!isValidObjectId24(postulacionId)) return { error: 400, message: "ID de postulación no válido" };
  const userId = req.user?.id;
  if (!userId) return { error: 401, message: "No autenticado" };
  const postulant = await Postulant.findOne({ postulantId: userId }).select("_id").lean();
  if (!postulant) return { error: 403, message: "No es postulante" };
  const po = await PostulacionMTM.findOne({
    _id: postulacionId,
    postulant: postulant._id,
    estado: "aceptado_estudiante",
  })
    .populate({
      path: "oportunidadMTM",
      select: "nombreCargo periodo nombreProfesor profesorResponsable categoria vacantes valorPorHora asignaturas programas dedicacionHoras limiteHoras centroCosto codigoCPS",
      populate: [
        { path: "periodo", select: "codigo" },
        { path: "valorPorHora", select: "value description" },
        { path: "categoria", select: "value description" },
        { path: "dedicacionHoras", select: "value description" },
        { path: "asignaturas", select: "nombreAsignatura codAsignatura" },
        { path: "programas", select: "name code" },
        { path: "profesorResponsable", select: "nombres apellidos", populate: { path: "user", select: "email name" } },
      ],
    })
    .populate("postulantProfile")
    .lean();
  if (!po) return { error: 404, message: "Postulación no encontrada o no aceptada" };
  return { po, postulant };
}

export const getLegalizacionMTM = async (req, res) => {
  try {
    const { postulacionId } = req.params;
    const result = await getLegalizacionMTMForStudent(req, postulacionId);
    if (result.error) return res.status(result.error).json({ message: result.message });

    let leg = await LegalizacionMTM.findOne({ postulacionMTM: postulacionId })
      .populate("eps tipoCuenta banco", "value description listId")
      .lean();
    if (!leg) {
      leg = await LegalizacionMTM.create({
        postulacionMTM: postulacionId,
        estado: "borrador",
      });
      leg = await LegalizacionMTM.findById(leg._id).populate("eps tipoCuenta banco", "value description listId").lean();
    }

    const opp = result.po.oportunidadMTM;
    const profileId = result.po.postulantProfile?._id ?? null;
    const [postulantUser, postulantDatos, enrolledProgram, cedulaAttachment, planDoc] = await Promise.all([
      Postulant.findById(result.po.postulant).populate("postulantId", "name email").lean(),
      Postulant.findById(result.po.postulant).select("phone address alternateEmail cityResidenceId zonaResidencia").populate("cityResidenceId", "name").lean(),
      profileId
        ? ProfileEnrolledProgram.findOne({ profileId }).populate("programId", "name code").populate({ path: "programFacultyId", select: "facultyId", populate: { path: "facultyId", select: "name" } }).lean()
        : null,
      findCedulaSupportAttachmentForProfile(profileId),
      PlanDeTrabajoMTM.findOne({ postulacionMTM: postulacionId }).select("estado").lean(),
    ]);

    const definicionesDocumentos = await listDefinicionesDocumentosMonitoriaParaLegalizacion();

    res.json({
      legalizacion: leg,
      oportunidad: opp,
      postulacion: { _id: result.po._id, aceptadoEstudianteAt: result.po.aceptadoEstudianteAt },
      planDeTrabajo: planDoc ? { estado: planDoc.estado } : null,
      /** Link/reporte de asistencia solo tras plan aprobado por el profesor (HU010 alineado al flujo). */
      planAprobado: planDoc?.estado === "aprobado",
      definicionesDocumentos,
      estudiante: {
        nombre: postulantUser?.postulantId?.name ?? "",
        correoInstitucional: postulantUser?.postulantId?.email ?? "",
        correoAlterno: postulantDatos?.alternateEmail ?? null,
        identificacion: result.po.postulantProfile?.studentCode ?? null,
        celular: postulantDatos?.phone ?? null,
        direccion: postulantDatos?.address ?? null,
        zonaResidencia: postulantDatos?.zonaResidencia ?? null,
        localidadBarrio: postulantDatos?.cityResidenceId?.name ?? null,
        facultad: enrolledProgram?.programFacultyId?.facultyId?.name ?? null,
        programa: enrolledProgram?.programId?.name ?? null,
        cedulaAttachment,
        postulantId: result.po.postulant?._id ?? null,
      },
    });
  } catch (err) {
    console.error("[MTM] getLegalizacionMTM:", err);
    res.status(500).json({ message: err.message });
  }
};

export const updateLegalizacionMTM = async (req, res) => {
  try {
    const { postulacionId } = req.params;
    const result = await getLegalizacionMTMForStudent(req, postulacionId);
    if (result.error) return res.status(result.error).json({ message: result.message });

    const leg = await LegalizacionMTM.findOne({ postulacionMTM: postulacionId });
    if (!leg) return res.status(404).json({ message: "Legalización no encontrada" });
    if (leg.estado !== "borrador" && leg.estado !== "en_ajuste") return res.status(400).json({ message: "Solo se puede editar en estado borrador o en ajuste" });

    const { eps, tipoCuenta, tipoCuentaValor, banco, numeroCuenta } = req.body || {};
    if (eps !== undefined) leg.eps = eps || null;
    if (tipoCuenta !== undefined) leg.tipoCuenta = tipoCuenta || null;
    if (tipoCuentaValor !== undefined) leg.tipoCuentaValor = ["Ahorros", "Corriente"].includes(tipoCuentaValor) ? tipoCuentaValor : null;
    if (banco !== undefined) leg.banco = banco || null;
    if (numeroCuenta !== undefined) leg.numeroCuenta = numeroCuenta ? String(numeroCuenta).trim() : null;
    await leg.save();

    const updated = await LegalizacionMTM.findById(leg._id).populate("eps tipoCuenta banco", "value description listId").lean();
    res.json({ legalizacion: updated });
  } catch (err) {
    console.error("[MTM] updateLegalizacionMTM:", err);
    res.status(500).json({ message: err.message });
  }
};

export const uploadDocLegalizacionMTM = async (req, res) => {
  try {
    const { postulacionId } = req.params;
    const definitionId = (req.body?.definitionId || req.body?.documentDefinitionId || "").toString().trim();
    if (!definitionId || !mongoose.Types.ObjectId.isValid(definitionId)) {
      return res.status(400).json({ message: "Debe indicar definitionId (documento configurado en legalización monitoría)." });
    }
    if (!req.file || !req.file.buffer) return res.status(400).json({ message: "No se envió archivo" });
    if (req.file.size > 5 * 1024 * 1024) return res.status(400).json({ message: "El archivo no puede superar 5 MB" });

    const def = await DocumentMonitoringDefinition.findById(definitionId).lean();
    if (!def) return res.status(404).json({ message: "Definición de documento no encontrada" });
    if (!archivoPermitidoPorDefinicionMon(req.file, def)) {
      const allowed = (def.extensionCodes || []).map(normalizeExtCodeMon).filter(Boolean).join(", ") || "pdf";
      return res.status(400).json({ message: `El archivo no cumple las extensiones permitidas para este documento (${allowed}).` });
    }

    const result = await getLegalizacionMTMForStudent(req, postulacionId);
    if (result.error) return res.status(result.error).json({ message: result.message });

    let leg = await LegalizacionMTM.findOne({ postulacionMTM: postulacionId });
    if (!leg) {
      leg = await LegalizacionMTM.create({ postulacionMTM: postulacionId, estado: "borrador" });
    }
    if (leg.estado !== "borrador" && leg.estado !== "en_ajuste") return res.status(400).json({ message: "Solo se puede subir documentos en estado borrador o en ajuste" });

    const ext = s3ExtensionFromUploadMon(req.file);
    const key = `${S3_PREFIX_LEGALIZACIONES}/${postulacionId}/def-${definitionId}${ext}`;
    await uploadToS3(key, req.file.buffer, { contentType: req.file.mimetype || "application/octet-stream" });

    const docInfo = {
      key,
      originalName: req.file.originalname || `documento${ext}`,
      size: req.file.size,
      estadoDocumento: "pendiente",
      motivoRechazo: null,
    };
    setLegDocMon(leg, definitionId, docInfo);
    await leg.save();

    const updated = await LegalizacionMTM.findById(leg._id).populate("eps tipoCuenta banco", "value description listId").lean();
    res.json({ legalizacion: updated, message: "Documento subido correctamente" });
  } catch (err) {
    if (err.message?.includes("S3 no está configurado")) {
      return res.status(503).json({ message: "El almacenamiento de documentos no está disponible" });
    }
    console.error("[MTM] uploadDocLegalizacionMTM:", err);
    res.status(500).json({ message: err.message });
  }
};

export const getDocumentoLegalizacionUrl = async (req, res) => {
  try {
    const { postulacionId, definitionId } = req.params;
    if (!definitionId || !mongoose.Types.ObjectId.isValid(definitionId)) {
      return res.status(400).json({ message: "ID de definición de documento no válido" });
    }

    const result = await getLegalizacionMTMForStudent(req, postulacionId);
    if (result.error) return res.status(result.error).json({ message: result.message });

    const leg = await LegalizacionMTM.findOne({ postulacionMTM: postulacionId }).lean();
    if (!leg) return res.status(404).json({ message: "Legalización no encontrada" });

    const doc = getLegDocMon(leg, definitionId);
    if (!doc?.key) return res.status(404).json({ message: "Documento no encontrado" });

    const url = await getSignedDownloadUrl(doc.key, 3600);
    res.json({ url });
  } catch (err) {
    if (err.message?.includes("S3 no está configurado")) {
      return res.status(503).json({ message: "El almacenamiento no está disponible" });
    }
    console.error("[MTM] getDocumentoLegalizacionUrl:", err);
    res.status(500).json({ message: err.message });
  }
};

export const deleteDocumentoLegalizacionMTM = async (req, res) => {
  try {
    const { postulacionId, definitionId } = req.params;
    if (!definitionId || !mongoose.Types.ObjectId.isValid(definitionId)) {
      return res.status(400).json({ message: "ID de definición de documento no válido" });
    }

    const result = await getLegalizacionMTMForStudent(req, postulacionId);
    if (result.error) return res.status(result.error).json({ message: result.message });

    const leg = await LegalizacionMTM.findOne({ postulacionMTM: postulacionId });
    if (!leg) return res.status(404).json({ message: "Legalización no encontrada" });
    if (leg.estado !== "borrador" && leg.estado !== "en_ajuste") return res.status(400).json({ message: "Solo se puede eliminar documentos en estado borrador o en ajuste" });

    const doc = getLegDocMon(leg, definitionId);
    if (!doc?.key) return res.status(404).json({ message: "Documento no encontrado" });

    await deleteFromS3(doc.key);
    setLegDocMon(leg, definitionId, null);
    await leg.save();

    const updated = await LegalizacionMTM.findById(leg._id).populate("eps tipoCuenta banco", "value description listId").lean();
    res.json({ legalizacion: updated, message: "Documento eliminado correctamente" });
  } catch (err) {
    if (err.message?.includes("S3 no está configurado")) {
      return res.status(503).json({ message: "El almacenamiento no está disponible" });
    }
    console.error("[MTM] deleteDocumentoLegalizacionMTM:", err);
    res.status(500).json({ message: err.message });
  }
};

export const remitirRevisionLegalizacionMTM = async (req, res) => {
  try {
    const { postulacionId } = req.params;
    const result = await getLegalizacionMTMForStudent(req, postulacionId);
    if (result.error) return res.status(result.error).json({ message: result.message });

    const leg = await LegalizacionMTM.findOne({ postulacionMTM: postulacionId });
    if (!leg) return res.status(404).json({ message: "Legalización no encontrada" });
    if (leg.estado !== "borrador" && leg.estado !== "en_ajuste") return res.status(400).json({ message: "Solo se puede remitir desde estado borrador o en ajuste" });

    const definiciones = await listDefinicionesDocumentosMonitoriaParaLegalizacion();
    if (definiciones.length === 0) {
      return res.status(400).json({
        message:
          "No hay documentos de legalización configurados. Un administrador debe definirlos en Configuración → Documentos legalización monitoría.",
      });
    }
    const obligatorias = definiciones.filter((d) => d.documentMandatory);
    const faltantes = obligatorias.filter((d) => !getLegDocMon(leg, d._id)?.key);
    if (faltantes.length > 0) {
      return res.status(400).json({
        message: `Debe cargar los documentos obligatorios: ${faltantes.map((f) => f.documentName).join(", ")}`,
      });
    }
    const algunSubido = definiciones.some((d) => getLegDocMon(leg, d._id)?.key);
    if (obligatorias.length === 0 && definiciones.length > 0 && !algunSubido) {
      return res.status(400).json({ message: "Debe cargar al menos un documento para enviar a revisión." });
    }
    const tieneTipoCuenta = leg.tipoCuentaValor || leg.tipoCuenta;
    if (!leg.eps || !leg.banco || !tieneTipoCuenta || !leg.numeroCuenta?.trim()) {
      return res.status(400).json({ message: "Complete EPS, Banco, Tipo de cuenta (Ahorros o Corriente) y Número de cuenta" });
    }

    const now = new Date();
    leg.estado = "en_revision";
    leg.enviadoRevisionAt = now;
    await leg.save();

    try {
      const Evento = (await import("../notificacion/eventos/evento.model.js")).default;
      const { getRenderedActivePlantilla } = await import("../notificacion/plantillasNotificacion/plantillaNotificacion.service.js");
      const evento = await Evento.findOne({ value: "envio_revision_legalizacion_monitoria", tipo: "monitoria" }).select("_id").lean();
      if (evento) {
        const opp = await OportunidadMTM.findById(result.po.oportunidadMTM._id).populate("periodo", "codigo").lean();
        const postulantDoc = await Postulant.findById(result.po.postulant).populate("postulantId", "name").lean();
        const rendered = await getRenderedActivePlantilla(evento._id, {
          NOMBRE_ESTUDIANTE: postulantDoc?.postulantId?.name || "Estudiante",
          NOMBRE_MTM: opp?.nombreCargo || "Monitoría",
          PERIODO: opp?.periodo?.codigo || "",
        });
        if (rendered) console.log("[MTM] Notificación envío a revisión:", rendered.asunto);
      }
    } catch (notifErr) {
      console.error("[MTM] Error notificación remitir revisión:", notifErr);
    }

    res.json({
      message: "Legalización remitida a revisión correctamente",
      legalizacion: await LegalizacionMTM.findById(leg._id).populate("eps tipoCuenta banco", "value description listId").lean(),
    });
  } catch (err) {
    console.error("[MTM] remitirRevisionLegalizacionMTM:", err);
    res.status(500).json({ message: err.message });
  }
};

// ─── Admin: listar legalizaciones MTM (RQ04_HU006) ─────────────────────────────
export const getLegalizacionesMTMAdmin = async (req, res) => {
  try {
    const { estado, periodo, page = 1, limit = 20, search, programa } = req.query;
    const filter = {};
    if (estado) filter.estado = estado;
    const legs = await LegalizacionMTM.find(filter)
      .populate({
        path: "postulacionMTM",
        match: { estado: "aceptado_estudiante" },
        select: "oportunidadMTM postulant postulantProfile aceptadoEstudianteAt estado",
        populate: [
          {
            path: "oportunidadMTM",
            select: "nombreCargo periodo nombreProfesor profesorResponsable programas",
            populate: [
              { path: "periodo", select: "codigo" },
              { path: "profesorResponsable", select: "nombres apellidos", populate: { path: "user", select: "email" } },
              { path: "programas", select: "name code" },
            ],
          },
          { path: "postulant", select: "postulantId", populate: { path: "postulantId", select: "name" } },
          { path: "postulantProfile", select: "studentCode" },
        ],
      })
      .sort({ updatedAt: -1 })
      .lean();

    const postulacionesValidas = legs.filter((l) => l.postulacionMTM != null);
    let list = postulacionesValidas.map((l) => {
      const po = l.postulacionMTM;
      const opp = po?.oportunidadMTM;
      const nombreCompleto = po?.postulant?.postulantId?.name || "";
      const programaOportunidad = opp?.programas?.length ? opp.programas.map((p) => p?.name).filter(Boolean).join(", ") : null;
      const coordinadorProf = opp?.profesorResponsable
        ? [opp.profesorResponsable.nombres, opp.profesorResponsable.apellidos].filter(Boolean).join(" ")
        : null;
      const coordinador = coordinadorProf || (opp?.nombreProfesor && String(opp.nombreProfesor).trim()) || null;
      const periodoCodigo = opp?.periodo?.codigo ?? null;
      const codigoMTMShort = opp?._id?.toString?.()?.slice(-8) ?? "";
      return {
        _id: l._id,
        postulacionId: po?._id,
        numeroIdentidad: po?.postulantProfile?.studentCode ?? null,
        nombre: nombreCompleto.split(" ").slice(0, -1).join(" ") || nombreCompleto,
        apellido: nombreCompleto.split(" ").slice(-1)[0] || "",
        programa: programaOportunidad,
        codigoMTM: codigoMTMShort || null,
        nombreMTM: opp?.nombreCargo ?? null,
        periodo: periodoCodigo,
        coordinador,
        estadoAlumnoMTM: po?.estado === "aceptado_estudiante" ? "Aceptó monitoría" : po?.estado || null,
        /** Estado de la legalización (misma clave que LegalizacionMTM.estado) para etiquetas en front */
        estadoMTM: l.estado,
        enviadoRevisionAt: l.enviadoRevisionAt,
        aprobadoAt: l.aprobadoAt,
        rechazadoAt: l.rechazadoAt,
      };
    });

    if (periodo) {
      list = list.filter((r) => r.periodo === periodo);
    }

    const programasSet = new Set();
    for (const r of list) {
      if (!r.programa) continue;
      for (const p of String(r.programa)
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean)) {
        programasSet.add(p);
      }
    }
    const programasFaceta = Array.from(programasSet).sort((a, b) => String(a).localeCompare(String(b), "es"));

    const searchNorm = search && String(search).trim().toLowerCase();
    if (searchNorm) {
      list = list.filter((r) => {
        const hay = [
          r.numeroIdentidad,
          r.nombre,
          r.apellido,
          r.programa,
          r.codigoMTM,
          r.nombreMTM,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(searchNorm) || hay.split(/\s+/).some((w) => w.startsWith(searchNorm));
      });
    }

    const programaNorm = programa && String(programa).trim();
    if (programaNorm) {
      const want = programaNorm.toLowerCase();
      list = list.filter((r) => {
        if (!r.programa) return false;
        const parts = String(r.programa)
          .split(",")
          .map((p) => p.trim().toLowerCase());
        return parts.some((p) => p === want);
      });
    }

    const total = list.length;
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const totalPages = Math.max(1, Math.ceil(total / limitNum));
    const start = (pageNum - 1) * limitNum;
    const pageSlice = list.slice(start, start + limitNum);

    res.json({
      data: pageSlice,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages,
      programas: programasFaceta,
    });
  } catch (err) {
    console.error("[MTM] getLegalizacionesMTMAdmin:", err);
    res.status(500).json({ message: err.message });
  }
};

// Helper: obtener datos completos de una legalización para admin (por postulacionId)
async function getLegalizacionMTMAdminByPostulacion(postulacionId) {
  const po = await PostulacionMTM.findOne({
    _id: postulacionId,
    estado: "aceptado_estudiante",
  })
    .populate({
      path: "oportunidadMTM",
      select: "nombreCargo periodo nombreProfesor profesorResponsable categoria vacantes valorPorHora asignaturas programas dedicacionHoras limiteHoras centroCosto codigoCPS",
      populate: [
        { path: "periodo", select: "codigo" },
        { path: "valorPorHora", select: "value description" },
        { path: "categoria", select: "value description" },
        { path: "dedicacionHoras", select: "value description" },
        { path: "asignaturas", select: "nombreAsignatura codAsignatura" },
        { path: "programas", select: "name code" },
        { path: "profesorResponsable", select: "nombres apellidos", populate: { path: "user", select: "email name" } },
      ],
    })
    .populate("postulantProfile")
    .lean();
  if (!po) return null;
  const leg = await LegalizacionMTM.findOne({ postulacionMTM: postulacionId })
    .populate("eps tipoCuenta banco", "value description listId")
    .lean();
  if (!leg) return null;
  const opp = po.oportunidadMTM;
  const profileId = po.postulantProfile?._id ?? null;
  const [postulantUser, postulantDatos, enrolledProgram, cedulaAttachment] = await Promise.all([
    Postulant.findById(po.postulant).populate("postulantId", "name email").lean(),
    Postulant.findById(po.postulant).select("phone address alternateEmail cityResidenceId zonaResidencia").populate("cityResidenceId", "name").lean(),
    profileId
      ? ProfileEnrolledProgram.findOne({ profileId }).populate("programId", "name code").populate({ path: "programFacultyId", select: "facultyId", populate: { path: "facultyId", select: "name" } }).lean()
      : null,
    findCedulaSupportAttachmentForProfile(profileId),
  ]);
  const definicionesDocumentos = await listDefinicionesDocumentosMonitoriaParaLegalizacion();
  return {
    legalizacion: leg,
    oportunidad: opp,
    postulacion: { _id: po._id, aceptadoEstudianteAt: po.aceptadoEstudianteAt },
    definicionesDocumentos,
    estudiante: {
      nombre: postulantUser?.postulantId?.name ?? "",
      correoInstitucional: postulantUser?.postulantId?.email ?? "",
      correoAlterno: postulantDatos?.alternateEmail ?? null,
      identificacion: po.postulantProfile?.studentCode ?? null,
      celular: postulantDatos?.phone ?? null,
      direccion: postulantDatos?.address ?? null,
      zonaResidencia: postulantDatos?.zonaResidencia ?? null,
      localidadBarrio: postulantDatos?.cityResidenceId?.name ?? null,
      facultad: enrolledProgram?.programFacultyId?.facultyId?.name ?? null,
      programa: enrolledProgram?.programId?.name ?? null,
      cedulaAttachment,
      postulantId: po.postulant ?? null,
    },
  };
}

export const getLegalizacionMTMAdmin = async (req, res) => {
  try {
    const { postulacionId } = req.params;
    const result = await getLegalizacionMTMAdminByPostulacion(postulacionId);
    if (!result) return res.status(404).json({ message: "Legalización no encontrada" });
    res.json(result);
  } catch (err) {
    console.error("[MTM] getLegalizacionMTMAdmin:", err);
    res.status(500).json({ message: err.message });
  }
};

export const getDocumentoLegalizacionUrlAdmin = async (req, res) => {
  try {
    const { postulacionId, definitionId } = req.params;
    if (!definitionId || !mongoose.Types.ObjectId.isValid(definitionId)) {
      return res.status(400).json({ message: "ID de definición de documento no válido" });
    }
    const leg = await LegalizacionMTM.findOne({ postulacionMTM: postulacionId }).lean();
    if (!leg) return res.status(404).json({ message: "Legalización no encontrada" });
    const doc = getLegDocMon(leg, definitionId);
    if (!doc?.key) return res.status(404).json({ message: "Documento no encontrado" });
    const url = await getSignedDownloadUrl(doc.key, 3600);
    res.json({ url });
  } catch (err) {
    if (err.message?.includes("S3 no está configurado")) {
      return res.status(503).json({ message: "El almacenamiento no está disponible" });
    }
    console.error("[MTM] getDocumentoLegalizacionUrlAdmin:", err);
    res.status(500).json({ message: err.message });
  }
};

/** GET descargar documento (stream directo, para guardar en Descargas sin abrir pestaña). */
export const getDocumentoLegalizacionDownloadAdmin = async (req, res) => {
  try {
    const { postulacionId, definitionId } = req.params;
    if (!definitionId || !mongoose.Types.ObjectId.isValid(definitionId)) {
      return res.status(400).json({ message: "ID de definición de documento no válido" });
    }
    const leg = await LegalizacionMTM.findOne({ postulacionMTM: postulacionId }).lean();
    if (!leg) return res.status(404).json({ message: "Legalización no encontrada" });
    const doc = getLegDocMon(leg, definitionId);
    if (!doc?.key) return res.status(404).json({ message: "Documento no encontrado" });
    const { body, contentType } = await getObjectFromS3(doc.key);
    const fileName = (doc.originalName || "documento.pdf").replace(/[^a-zA-Z0-9._-]/g, "_") || "documento.pdf";
    res.setHeader("Content-Type", contentType || "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.send(body);
  } catch (err) {
    if (err.message?.includes("S3 no está configurado")) {
      return res.status(503).json({ message: "El almacenamiento no está disponible" });
    }
    console.error("[MTM] getDocumentoLegalizacionDownloadAdmin:", err);
    res.status(500).json({ message: err.message });
  }
};

export const patchDocumentoLegalizacionMTM = async (req, res) => {
  try {
    const { postulacionId, definitionId } = req.params;
    const { estadoDocumento, motivoRechazo } = req.body || {};
    if (!definitionId || !mongoose.Types.ObjectId.isValid(definitionId)) {
      return res.status(400).json({ message: "ID de definición de documento no válido" });
    }
    if (!["aprobado", "rechazado"].includes(estadoDocumento)) {
      return res.status(400).json({ message: "estadoDocumento debe ser aprobado o rechazado" });
    }
    const leg = await LegalizacionMTM.findOne({ postulacionMTM: postulacionId });
    if (!leg) return res.status(404).json({ message: "Legalización no encontrada" });
    if (leg.estado !== "en_revision") {
      return res.status(400).json({ message: "Solo se puede revisar documentos cuando la legalización está en revisión" });
    }
    const doc = getLegDocMon(leg, definitionId);
    if (!doc?.key) return res.status(404).json({ message: "Documento no encontrado" });
    const plain = typeof doc.toObject === "function" ? doc.toObject() : { ...doc };
    setLegDocMon(leg, definitionId, {
      ...plain,
      estadoDocumento,
      motivoRechazo: estadoDocumento === "rechazado" ? (motivoRechazo || "").trim() || null : null,
    });
    await leg.save();
    const updated = await LegalizacionMTM.findById(leg._id).populate("eps tipoCuenta banco", "value description listId").lean();
    res.json({ legalizacion: updated });
  } catch (err) {
    console.error("[MTM] patchDocumentoLegalizacionMTM:", err);
    res.status(500).json({ message: err.message });
  }
};

export const postAprobarLegalizacionMTM = async (req, res) => {
  try {
    const { postulacionId } = req.params;
    const leg = await LegalizacionMTM.findOne({ postulacionMTM: postulacionId });
    if (!leg) return res.status(404).json({ message: "Legalización no encontrada" });
    if (leg.estado !== "en_revision") {
      return res.status(400).json({ message: "Solo se puede aprobar una legalización en estado en revisión" });
    }
    const docs = leg.documentos || {};
    const defList = await listDefinicionesDocumentosMonitoriaParaLegalizacion();
    const defIds = new Set(defList.map((d) => String(d._id)));
    const entries = Object.entries(docs).filter(([k, v]) => v && typeof v === "object" && v.key && defIds.has(String(k)));
    if (entries.length === 0) {
      return res.status(400).json({ message: "No hay documentos cargados para aprobar la legalización (según definiciones vigentes)." });
    }
    const algunRechazado = entries.some(([, d]) => d.estadoDocumento === "rechazado");
    const algunPendiente = entries.some(
      ([, d]) => d.key && (!d.estadoDocumento || d.estadoDocumento === "pendiente")
    );
    if (algunRechazado) {
      return res.status(400).json({ message: "No se puede aprobar: hay documentos rechazados. Solicite ajustes al estudiante." });
    }
    if (algunPendiente) {
      return res.status(400).json({ message: "Debe aprobar o rechazar todos los documentos antes de aprobar la legalización" });
    }
    leg.estado = "aprobada";
    leg.aprobadoAt = new Date();
    leg.rechazoMotivo = null;
    await leg.save();
    const updated = await LegalizacionMTM.findById(leg._id).populate("eps tipoCuenta banco", "value description listId").lean();
    res.json({ legalizacion: updated, message: "Legalización aprobada correctamente" });
  } catch (err) {
    console.error("[MTM] postAprobarLegalizacionMTM:", err);
    res.status(500).json({ message: err.message });
  }
};

export const postRechazarLegalizacionMTM = async (req, res) => {
  try {
    const { postulacionId } = req.params;
    const { motivo, enviarAjuste } = req.body || {};
    const leg = await LegalizacionMTM.findOne({ postulacionMTM: postulacionId });
    if (!leg) return res.status(404).json({ message: "Legalización no encontrada" });
    if (leg.estado !== "en_revision") {
      return res.status(400).json({ message: "Solo se puede rechazar una legalización en estado en revisión" });
    }
    const motivoStr = (motivo || "").trim() || null;
    if (enviarAjuste) {
      leg.estado = "en_ajuste";
      leg.rechazoMotivo = motivoStr;
    } else {
      leg.estado = "rechazada";
      leg.rechazadoAt = new Date();
      leg.rechazoMotivo = motivoStr;
    }
    await leg.save();
    const updated = await LegalizacionMTM.findById(leg._id).populate("eps tipoCuenta banco", "value description listId").lean();
    res.json({
      legalizacion: updated,
      message: enviarAjuste ? "Legalización enviada a ajuste para que el estudiante corrija los documentos" : "Legalización rechazada",
    });
  } catch (err) {
    console.error("[MTM] postRechazarLegalizacionMTM:", err);
    res.status(500).json({ message: err.message });
  }
};

// ─── Plan de trabajo MTM (RQ04_HU006) ───────────────────────────────────────
/** Obtiene datos pre-cargados para el plan (facultad, programa, profesor, etc.) a partir de postulación + oportunidad + estudiante. */
async function getDatosPrecargadosPlanTrabajo(result) {
  const po = result.po;
  const opp = po?.oportunidadMTM;
  const profileId = po?.postulantProfile?._id ?? null;
  const [postulantUser, postulantDatos, enrolledProgram] = await Promise.all([
    Postulant.findById(po.postulant).populate("postulantId", "name email").lean(),
    Postulant.findById(po.postulant).select("phone").lean(),
    profileId
      ? ProfileEnrolledProgram.findOne({ profileId }).populate("programId", "name code").populate({ path: "programFacultyId", select: "facultyId", populate: { path: "facultyId", select: "name" } }).lean()
      : null,
  ]);
  const profesorNombre = opp?.profesorResponsable
    ? [opp.profesorResponsable.nombres, opp.profesorResponsable.apellidos].filter(Boolean).join(" ")
    : opp?.nombreProfesor ?? "";
  const asignaturaArea = opp?.asignaturas?.length
    ? opp.asignaturas.map((a) => a.nombreAsignatura || a.codAsignatura).filter(Boolean).join(", ")
    : "";
  return {
    facultad: enrolledProgram?.programFacultyId?.facultyId?.name ?? "",
    programa: enrolledProgram?.programId?.name ?? "",
    asignaturaArea,
    periodo: opp?.periodo?.codigo ?? "",
    profesorResponsable: profesorNombre,
    codigoMonitor: po?.postulantProfile?.studentCode ?? "",
    nombreMonitor: postulantUser?.postulantId?.name ?? "",
    telefono: postulantDatos?.phone ?? "",
    correoInstitucional: postulantUser?.postulantId?.email ?? "",
  };
}

/** GET plan de trabajo. Estudiante: solo su postulación y legalización aprobada. Profesor/admin: por postulacionId. */
export const getPlanTrabajoMTM = async (req, res) => {
  try {
    const { postulacionId } = req.params;
    const isStudent = req.user?.role === "student" || req.user?.modulo === "estudiante";
    if (isStudent) {
      const result = await getLegalizacionMTMForStudent(req, postulacionId);
      if (result.error) return res.status(result.error).json({ message: result.message });
      const leg = await LegalizacionMTM.findOne({ postulacionMTM: postulacionId }).lean();
      if (!leg || leg.estado !== "aprobada") return res.status(400).json({ message: "Solo puede gestionar el plan de trabajo cuando la legalización está aprobada" });
      const plan = await PlanDeTrabajoMTM.findOne({ postulacionMTM: postulacionId }).lean();
      if (!plan) return res.status(404).json({ message: "Plan de trabajo no encontrado. Puede crearlo desde el detalle de la legalización." });
      const datosPrecargados = await getDatosPrecargadosPlanTrabajo(result);
      return res.json({ plan, datosPrecargados, oportunidad: result.po.oportunidadMTM });
    }
    const result = await getLegalizacionMTMAdminByPostulacion(postulacionId);
    if (!result) return res.status(404).json({ message: "No encontrado" });
    const plan = await PlanDeTrabajoMTM.findOne({ postulacionMTM: postulacionId }).lean();
    if (!plan) return res.status(404).json({ message: "Plan de trabajo no encontrado" });
    res.json({ plan, oportunidad: result.oportunidad, estudiante: result.estudiante });
  } catch (err) {
    console.error("[MTM] getPlanTrabajoMTM:", err);
    res.status(500).json({ message: err.message });
  }
};

/** POST crear plan de trabajo. Solo estudiante; legalización debe estar aprobada. */
export const createPlanTrabajoMTM = async (req, res) => {
  try {
    const postulacionId = req.params.postulacionId || req.body?.postulacionId;
    if (!postulacionId) return res.status(400).json({ message: "postulacionId es requerido" });
    const result = await getLegalizacionMTMForStudent(req, postulacionId);
    if (result.error) return res.status(result.error).json({ message: result.message });
    const leg = await LegalizacionMTM.findOne({ postulacionMTM: postulacionId }).lean();
    if (!leg || leg.estado !== "aprobada") return res.status(400).json({ message: "Solo puede crear el plan de trabajo cuando la legalización está aprobada" });
    const existente = await PlanDeTrabajoMTM.findOne({ postulacionMTM: postulacionId });
    if (existente) return res.status(400).json({ message: "Ya existe un plan de trabajo para esta legalización" });
    const datosPrecargados = await getDatosPrecargadosPlanTrabajo(result);
    const plan = await PlanDeTrabajoMTM.create({
      postulacionMTM: postulacionId,
      estado: "borrador",
      ...datosPrecargados,
    });
    res.status(201).json({ plan, message: "Plan de trabajo creado" });
  } catch (err) {
    console.error("[MTM] createPlanTrabajoMTM:", err);
    res.status(500).json({ message: err.message });
  }
};

/** PUT actualizar plan de trabajo. Solo estudiante; solo en estado borrador o rechazado. */
export const updatePlanTrabajoMTM = async (req, res) => {
  try {
    const { postulacionId } = req.params;
    const { justificacion, objetivoGeneral, objetivosEspecificos, actividades } = req.body || {};
    const result = await getLegalizacionMTMForStudent(req, postulacionId);
    if (result.error) return res.status(result.error).json({ message: result.message });
    const plan = await PlanDeTrabajoMTM.findOne({ postulacionMTM: postulacionId });
    if (!plan) return res.status(404).json({ message: "Plan de trabajo no encontrado" });
    if (plan.estado !== "borrador" && plan.estado !== "rechazado") return res.status(400).json({ message: "Solo puede editar el plan en estado borrador o rechazado" });
    if (justificacion !== undefined) plan.justificacion = justificacion;
    if (objetivoGeneral !== undefined) plan.objetivoGeneral = objetivoGeneral;
    if (objetivosEspecificos !== undefined) plan.objetivosEspecificos = objetivosEspecificos;
    if (Array.isArray(actividades)) plan.actividades = actividades;
    await plan.save();
    res.json({ plan, message: "Plan actualizado" });
  } catch (err) {
    console.error("[MTM] updatePlanTrabajoMTM:", err);
    res.status(500).json({ message: err.message });
  }
};

/** POST enviar plan a revisión (estudiante). RQ04_HU007: notificar al profesor/responsable MTM. */
export const enviarRevisionPlanTrabajoMTM = async (req, res) => {
  try {
    const { postulacionId } = req.params;
    const result = await getLegalizacionMTMForStudent(req, postulacionId);
    if (result.error) return res.status(result.error).json({ message: result.message });
    const plan = await PlanDeTrabajoMTM.findOne({ postulacionMTM: postulacionId });
    if (!plan) return res.status(404).json({ message: "Plan de trabajo no encontrado" });
    if (plan.estado !== "borrador" && plan.estado !== "rechazado") {
      return res.status(400).json({
        message: "Solo puede enviar a revisión un plan en borrador o después de un rechazo (corrija y vuelva a enviar).",
      });
    }
    plan.estado = "enviado_revision";
    plan.enviadoRevisionAt = new Date();
    plan.rechazoMotivo = null;
    plan.rechazadoAt = null;
    await plan.save();

    try {
      const Evento = (await import("../notificacion/eventos/evento.model.js")).default;
      const { getRenderedActivePlantilla } = await import("../notificacion/plantillasNotificacion/plantillaNotificacion.service.js");
      const evento = await Evento.findOne({ value: "envio_revision_plan_trabajo_monitoria", tipo: "monitoria" }).select("_id").lean();
      if (evento) {
        const po = await PostulacionMTM.findById(postulacionId)
          .populate({
            path: "oportunidadMTM",
            select: "nombreCargo periodo profesorResponsable",
            populate: [
              { path: "periodo", select: "codigo" },
              { path: "profesorResponsable", select: "nombres apellidos", populate: { path: "user", select: "email" } },
            ],
          })
          .populate({ path: "postulant", populate: { path: "postulantId", select: "name" } })
          .lean();
        const opp = po?.oportunidadMTM;
        const nombreEstudiante = po?.postulant?.postulantId?.name || "Estudiante";
        const nombreMTM = opp?.nombreCargo || "Monitoría";
        const periodo = opp?.periodo?.codigo || "";
        const correoProfesor = opp?.profesorResponsable?.user?.email;
        const rendered = await getRenderedActivePlantilla(evento._id, {
          NOMBRE_ESTUDIANTE: nombreEstudiante,
          NOMBRE_MTM: nombreMTM,
          PERIODO: periodo,
          LINK_APROBAR_PLAN: "", // HU007: enlace para aprobar sin autenticarse; integrar cuando exista ruta pública con token
        });
        if (rendered) {
          console.log("[MTM] Notificación envío plan a revisión:", rendered.asunto, correoProfesor ? `→ ${correoProfesor}` : "(sin correo profesor)");
          // TODO: enviar correo a correoProfesor cuando el módulo de envío esté integrado
        }
      }
    } catch (notifErr) {
      console.error("[MTM] Error notificación envío plan a revisión:", notifErr);
    }

    res.json({ plan, message: "Plan enviado a revisión" });
  } catch (err) {
    console.error("[MTM] enviarRevisionPlanTrabajoMTM:", err);
    res.status(500).json({ message: err.message });
  }
};

/** POST aprobar plan (profesor/admin). RQ04_HU007: notificación a coordinadores cuando el profesor aprueba. */
export const aprobarPlanTrabajoMTM = async (req, res) => {
  try {
    const { postulacionId } = req.params;
    const plan = await PlanDeTrabajoMTM.findOne({ postulacionMTM: postulacionId });
    if (!plan) return res.status(404).json({ message: "Plan de trabajo no encontrado" });
    if (plan.estado !== "enviado_revision") return res.status(400).json({ message: "Solo se puede aprobar un plan enviado a revisión" });
    plan.estado = "aprobado";
    plan.aprobadoPorProfesorAt = new Date();
    plan.aprobadoPor = req.user?.id ?? null;
    await plan.save();

    try {
      const Evento = (await import("../notificacion/eventos/evento.model.js")).default;
      const { getRenderedActivePlantilla } = await import("../notificacion/plantillasNotificacion/plantillaNotificacion.service.js");
      const evento = await Evento.findOne({ value: "aprobacion_plan_trabajo_monitoria", tipo: "monitoria" }).select("_id").lean();
      if (evento) {
        const rendered = await getRenderedActivePlantilla(evento._id, {
          NOMBRE_MTM: plan.nombreMonitor || plan.asignaturaArea || "Monitoría",
          PERIODO: plan.periodo || "",
        });
        if (rendered) console.log("[MTM] Notificación aprobación plan de trabajo (para coordinadores):", rendered.asunto);
        // TODO: enviar correo a coordinadores cuando el módulo de envío esté integrado
      }
    } catch (notifErr) {
      console.error("[MTM] Error notificación aprobación plan:", notifErr);
    }

    res.json({ plan, message: "Plan aprobado" });
  } catch (err) {
    console.error("[MTM] aprobarPlanTrabajoMTM:", err);
    res.status(500).json({ message: err.message });
  }
};

/** POST rechazar plan (profesor/admin). */
export const rechazarPlanTrabajoMTM = async (req, res) => {
  try {
    const { postulacionId } = req.params;
    const { motivo } = req.body || {};
    const plan = await PlanDeTrabajoMTM.findOne({ postulacionMTM: postulacionId });
    if (!plan) return res.status(404).json({ message: "Plan de trabajo no encontrado" });
    if (plan.estado !== "enviado_revision") return res.status(400).json({ message: "Solo se puede rechazar un plan enviado a revisión" });
    plan.estado = "rechazado";
    plan.rechazadoAt = new Date();
    plan.rechazoMotivo = (motivo || "").trim() || null;
    await plan.save();
    res.json({ plan, message: "Plan rechazado. El estudiante podrá modificarlo y volver a enviar." });
  } catch (err) {
    console.error("[MTM] rechazarPlanTrabajoMTM:", err);
    res.status(500).json({ message: err.message });
  }
};

/** GET plan de trabajo: datos para crear (si no existe). Estudiante; legalización aprobada. */
export const getPlanTrabajoMTMDatosCrear = async (req, res) => {
  try {
    const { postulacionId } = req.params;
    const result = await getLegalizacionMTMForStudent(req, postulacionId);
    if (result.error) return res.status(result.error).json({ message: result.message });
    const leg = await LegalizacionMTM.findOne({ postulacionMTM: postulacionId }).lean();
    if (!leg || leg.estado !== "aprobada") return res.status(400).json({ message: "Solo puede crear el plan cuando la legalización está aprobada" });
    const existente = await PlanDeTrabajoMTM.findOne({ postulacionMTM: postulacionId }).lean();
    if (existente) return res.json({ plan: existente, yaExiste: true });
    const datosPrecargados = await getDatosPrecargadosPlanTrabajo(result);
    res.json({ datosPrecargados, oportunidad: result.po.oportunidadMTM, yaExiste: false });
  } catch (err) {
    console.error("[MTM] getPlanTrabajoMTMDatosCrear:", err);
    res.status(500).json({ message: err.message });
  }
};

// ─── Seguimientos MTM (RQ04) ─────────────────────────────────────────────────
/** GET listar seguimientos por postulacionId. Estudiante: solo su postulación y solo si plan aprobado (HU006); admin: cualquiera. */
export const getSeguimientosMTM = async (req, res) => {
  try {
    const { postulacionId } = req.params;
    const isStudent = req.user?.role === "student" || req.user?.modulo === "estudiante";
    if (isStudent) {
      const result = await getLegalizacionMTMForStudent(req, postulacionId);
      if (result.error) return res.status(result.error).json({ message: result.message });
      const plan = await PlanDeTrabajoMTM.findOne({ postulacionMTM: postulacionId }).select("estado").lean();
      if (!plan || plan.estado !== "aprobado") return res.status(400).json({ message: "Los seguimientos se habilitan cuando el plan de trabajo esté aprobado por el profesor" });
    } else {
      const po = await PostulacionMTM.findOne({ _id: postulacionId, estado: "aceptado_estudiante" }).lean();
      if (!po) return res.status(404).json({ message: "Postulación no encontrada" });
    }
    const list = await SeguimientoMTM.find({ postulacionMTM: postulacionId })
      .sort({ fecha: -1, createdAt: -1 })
      .populate("creadoPor", "name email")
      .populate("aprobadoPor", "name email")
      .lean();
    const totalResult = await SeguimientoMTM.aggregate([
      { $match: { postulacionMTM: new mongoose.Types.ObjectId(postulacionId), estado: "aprobado" } },
      { $group: { _id: null, totalHoras: { $sum: "$cantidadHoras" } } },
    ]);
    const totalHorasAprobadas = totalResult[0]?.totalHoras ?? 0;
    const pendientes = await SeguimientoMTM.countDocuments({ postulacionMTM: postulacionId, estado: "pendiente_revision" });
    const todosSeguimientosResueltos = pendientes === 0; // HU009: para finalizar MTM todos deben estar aprobados o rechazados
    // Actividades del plan de trabajo aprobado para el select "Tipo de actividad"
    const plan = await PlanDeTrabajoMTM.findOne({ postulacionMTM: postulacionId }).select("actividades estado").lean();
    const actividadesPlan =
      plan?.estado === "aprobado" && Array.isArray(plan.actividades)
        ? plan.actividades.map((a) => (a.tema || "").trim()).filter(Boolean)
        : [];
    res.json({ data: list, totalHorasAprobadas, todosSeguimientosResueltos, actividadesPlan });
  } catch (err) {
    console.error("[MTM] getSeguimientosMTM:", err);
    res.status(500).json({ message: err.message });
  }
};

/** POST crear seguimiento (HU008). Estudiante: plan aprobado; estado inicial pendiente_revision. */
export const createSeguimientoMTM = async (req, res) => {
  try {
    const { postulacionId } = req.params;
    const {
      fecha,
      tipoActividad,
      numeroEstudiantesConvocados,
      numeroEstudiantesAtendidos,
      cantidadHoras,
      comentarios,
      tipo,
      descripcion,
    } = req.body || {};
    const isStudent = req.user?.role === "student" || req.user?.modulo === "estudiante";
    if (isStudent) {
      const result = await getLegalizacionMTMForStudent(req, postulacionId);
      if (result.error) return res.status(result.error).json({ message: result.message });
      const plan = await PlanDeTrabajoMTM.findOne({ postulacionMTM: postulacionId }).select("estado").lean();
      if (!plan || plan.estado !== "aprobado") return res.status(400).json({ message: "Los seguimientos se habilitan cuando el plan de trabajo esté aprobado por el profesor" });
    } else {
      const po = await PostulacionMTM.findOne({ _id: postulacionId, estado: "aceptado_estudiante" }).lean();
      if (!po) return res.status(404).json({ message: "Postulación no encontrada" });
    }
    const seg = await SeguimientoMTM.create({
      postulacionMTM: postulacionId,
      fecha: fecha ? new Date(fecha) : new Date(),
      tipoActividad: (tipoActividad ?? tipo ?? "").toString().trim().slice(0, 150) || null,
      numeroEstudiantesConvocados: numeroEstudiantesConvocados != null ? Number(numeroEstudiantesConvocados) : null,
      numeroEstudiantesAtendidos: numeroEstudiantesAtendidos != null ? Number(numeroEstudiantesAtendidos) : null,
      cantidadHoras: cantidadHoras != null ? Number(cantidadHoras) : null,
      comentarios: (comentarios ?? descripcion ?? "").toString().trim() || null,
      estado: "pendiente_revision",
      creadoPor: req.user?.id ?? null,
    });
    const populated = await SeguimientoMTM.findById(seg._id).populate("creadoPor", "name email").lean();
    res.status(201).json({ seguimiento: populated, message: "Seguimiento registrado. Queda en Pendiente de revisión." });
  } catch (err) {
    console.error("[MTM] createSeguimientoMTM:", err);
    res.status(500).json({ message: err.message });
  }
};

/** PUT actualizar seguimiento (HU008). Solo editable en estado pendiente_revision. */
export const updateSeguimientoMTM = async (req, res) => {
  try {
    const { postulacionId, seguimientoId } = req.params;
    const {
      fecha,
      tipoActividad,
      numeroEstudiantesConvocados,
      numeroEstudiantesAtendidos,
      cantidadHoras,
      comentarios,
      tipo,
      descripcion,
    } = req.body || {};
    const seg = await SeguimientoMTM.findOne({ _id: seguimientoId, postulacionMTM: postulacionId });
    if (!seg) return res.status(404).json({ message: "Seguimiento no encontrado" });
    if (seg.estado !== "pendiente_revision") return res.status(400).json({ message: "Solo se puede editar un seguimiento en estado Pendiente de revisión" });
    const isStudent = req.user?.role === "student" || req.user?.modulo === "estudiante";
    if (isStudent) {
      const result = await getLegalizacionMTMForStudent(req, postulacionId);
      if (result.error) return res.status(result.error).json({ message: result.message });
      const plan = await PlanDeTrabajoMTM.findOne({ postulacionMTM: postulacionId }).select("estado").lean();
      if (!plan || plan.estado !== "aprobado") return res.status(400).json({ message: "Los seguimientos se habilitan cuando el plan de trabajo esté aprobado" });
    }
    if (fecha !== undefined) seg.fecha = new Date(fecha);
    if (tipoActividad !== undefined) seg.tipoActividad = tipoActividad?.toString().trim().slice(0, 150) || null;
    else if (tipo !== undefined) seg.tipoActividad = tipo?.toString().trim().slice(0, 150) || null;
    if (numeroEstudiantesConvocados !== undefined) seg.numeroEstudiantesConvocados = numeroEstudiantesConvocados != null ? Number(numeroEstudiantesConvocados) : null;
    if (numeroEstudiantesAtendidos !== undefined) seg.numeroEstudiantesAtendidos = numeroEstudiantesAtendidos != null ? Number(numeroEstudiantesAtendidos) : null;
    if (cantidadHoras !== undefined) seg.cantidadHoras = cantidadHoras != null ? Number(cantidadHoras) : null;
    if (comentarios !== undefined) seg.comentarios = comentarios?.toString().trim() || null;
    else if (descripcion !== undefined) seg.comentarios = descripcion?.toString().trim() || null;
    seg.actualizadoPor = req.user?.id ?? null;
    await seg.save();
    const updated = await SeguimientoMTM.findById(seg._id).populate("creadoPor", "name email").populate("aprobadoPor", "name email").lean();
    res.json({ seguimiento: updated, message: "Seguimiento actualizado" });
  } catch (err) {
    console.error("[MTM] updateSeguimientoMTM:", err);
    res.status(500).json({ message: err.message });
  }
};

/** DELETE seguimiento (HU008). Solo se puede eliminar si está en pendiente_revision. */
export const deleteSeguimientoMTM = async (req, res) => {
  try {
    const { postulacionId, seguimientoId } = req.params;
    const seg = await SeguimientoMTM.findOne({ _id: seguimientoId, postulacionMTM: postulacionId });
    if (!seg) return res.status(404).json({ message: "Seguimiento no encontrado" });
    if (seg.estado !== "pendiente_revision") return res.status(400).json({ message: "Solo se puede eliminar un seguimiento en estado Pendiente de revisión" });
    const isStudent = req.user?.role === "student" || req.user?.modulo === "estudiante";
    if (isStudent) {
      const result = await getLegalizacionMTMForStudent(req, postulacionId);
      if (result.error) return res.status(result.error).json({ message: result.message });
      const plan = await PlanDeTrabajoMTM.findOne({ postulacionMTM: postulacionId }).select("estado").lean();
      if (!plan || plan.estado !== "aprobado") return res.status(400).json({ message: "Los seguimientos se habilitan cuando el plan de trabajo esté aprobado" });
    }
    await SeguimientoMTM.deleteOne({ _id: seguimientoId });
    res.json({ message: "Seguimiento eliminado" });
  } catch (err) {
    console.error("[MTM] deleteSeguimientoMTM:", err);
    res.status(500).json({ message: err.message });
  }
};

const S3_PREFIX_SEGUIMIENTOS = "seguimientos-mtm";

/** PATCH aprobar seguimiento. Solo coordinador; solo si estado pendiente_revision. */
export const aprobarSeguimientoMTM = async (req, res) => {
  try {
    const { postulacionId, seguimientoId } = req.params;
    const seg = await SeguimientoMTM.findOne({ _id: seguimientoId, postulacionMTM: postulacionId });
    if (!seg) return res.status(404).json({ message: "Seguimiento no encontrado" });
    if (seg.estado !== "pendiente_revision") return res.status(400).json({ message: "Solo se puede aprobar un seguimiento en estado Pendiente de revisión" });
    seg.estado = "aprobado";
    seg.aprobadoPor = req.user?.id ?? null;
    seg.aprobadoAt = new Date();
    seg.rechazoMotivo = null;
    seg.rechazadoAt = null;
    await seg.save();
    const updated = await SeguimientoMTM.findById(seg._id).populate("creadoPor", "name email").populate("aprobadoPor", "name email").lean();
    res.json({ seguimiento: updated, message: "Seguimiento aprobado" });
  } catch (err) {
    console.error("[MTM] aprobarSeguimientoMTM:", err);
    res.status(500).json({ message: err.message });
  }
};

/** PATCH rechazar seguimiento. Solo coordinador; solo si estado pendiente_revision. */
export const rechazarSeguimientoMTM = async (req, res) => {
  try {
    const { postulacionId, seguimientoId } = req.params;
    const { motivo } = req.body || {};
    const seg = await SeguimientoMTM.findOne({ _id: seguimientoId, postulacionMTM: postulacionId });
    if (!seg) return res.status(404).json({ message: "Seguimiento no encontrado" });
    if (seg.estado !== "pendiente_revision") return res.status(400).json({ message: "Solo se puede rechazar un seguimiento en estado Pendiente de revisión" });
    seg.estado = "rechazado";
    seg.rechazoMotivo = (motivo || "").toString().trim() || null;
    seg.rechazadoAt = new Date();
    seg.aprobadoPor = null;
    seg.aprobadoAt = null;
    await seg.save();
    const updated = await SeguimientoMTM.findById(seg._id).populate("creadoPor", "name email").lean();
    res.json({ seguimiento: updated, message: "Seguimiento rechazado" });
  } catch (err) {
    console.error("[MTM] rechazarSeguimientoMTM:", err);
    res.status(500).json({ message: err.message });
  }
};

/** POST aprobación/rechazo masivo de seguimientos (HU009). Coordinador; solo pendiente_revision. */
export const accionMasivaSeguimientosMTM = async (req, res) => {
  try {
    const { postulacionId } = req.params;
    const { accion, seguimientoIds, motivo } = req.body || {};
    if (!Array.isArray(seguimientoIds) || seguimientoIds.length === 0) {
      return res.status(400).json({ message: "Indique al menos un seguimiento (seguimientoIds)" });
    }
    if (accion !== "aprobar" && accion !== "rechazar") {
      return res.status(400).json({ message: "accion debe ser 'aprobar' o 'rechazar'" });
    }
    const po = await PostulacionMTM.findOne({ _id: postulacionId, estado: "aceptado_estudiante" }).lean();
    if (!po) return res.status(404).json({ message: "Postulación no encontrada" });

    const ids = seguimientoIds.filter((id) => id && mongoose.Types.ObjectId.isValid(id));
    const segs = await SeguimientoMTM.find({
      _id: { $in: ids },
      postulacionMTM: postulacionId,
      estado: "pendiente_revision",
    });
    if (segs.length === 0) {
      return res.status(400).json({ message: "Ningún seguimiento válido en estado Pendiente de revisión" });
    }

    const userId = req.user?.id ?? null;
    const now = new Date();
    if (accion === "aprobar") {
      await SeguimientoMTM.updateMany(
        { _id: { $in: segs.map((s) => s._id) } },
        { $set: { estado: "aprobado", aprobadoPor: userId, aprobadoAt: now, rechazoMotivo: null, rechazadoAt: null } }
      );
    } else {
      const motivoStr = (motivo || "").toString().trim() || null;
      await SeguimientoMTM.updateMany(
        { _id: { $in: segs.map((s) => s._id) } },
        { $set: { estado: "rechazado", rechazoMotivo: motivoStr, rechazadoAt: now, aprobadoPor: null, aprobadoAt: null } }
      );
    }

    const list = await SeguimientoMTM.find({ postulacionMTM: postulacionId })
      .sort({ fecha: -1, createdAt: -1 })
      .populate("creadoPor", "name email")
      .populate("aprobadoPor", "name email")
      .lean();
    const totalResult = await SeguimientoMTM.aggregate([
      { $match: { postulacionMTM: new mongoose.Types.ObjectId(postulacionId), estado: "aprobado" } },
      { $group: { _id: null, totalHoras: { $sum: "$cantidadHoras" } } },
    ]);
    const totalHorasAprobadas = totalResult[0]?.totalHoras ?? 0;
    const pendientes = await SeguimientoMTM.countDocuments({ postulacionMTM: postulacionId, estado: "pendiente_revision" });
    res.json({
      data: list,
      totalHorasAprobadas,
      todosSeguimientosResueltos: pendientes === 0,
      actualizados: segs.length,
      message: accion === "aprobar" ? `${segs.length} seguimiento(s) aprobado(s)` : `${segs.length} seguimiento(s) rechazado(s)`,
    });
  } catch (err) {
    console.error("[MTM] accionMasivaSeguimientosMTM:", err);
    res.status(500).json({ message: err.message });
  }
};

/** GET total horas de seguimientos aprobados (reporte reconocimiento DAF). */
export const getTotalHorasSeguimientosMTM = async (req, res) => {
  try {
    const { postulacionId } = req.params;
    const po = await PostulacionMTM.findOne({ _id: postulacionId, estado: "aceptado_estudiante" }).lean();
    if (!po) return res.status(404).json({ message: "Postulación no encontrada" });
    const result = await SeguimientoMTM.aggregate([
      { $match: { postulacionMTM: new mongoose.Types.ObjectId(postulacionId), estado: "aprobado" } },
      { $group: { _id: null, totalHoras: { $sum: "$cantidadHoras" } } },
    ]);
    const totalHoras = result[0]?.totalHoras ?? 0;
    res.json({ postulacionId, totalHorasAprobadas: totalHoras });
  } catch (err) {
    console.error("[MTM] getTotalHorasSeguimientosMTM:", err);
    res.status(500).json({ message: err.message });
  }
};

/** POST subir documento de soporte de un seguimiento (HU008). Solo si estado pendiente_revision. */
export const uploadDocumentoSeguimientoMTM = async (req, res) => {
  try {
    const { postulacionId, seguimientoId } = req.params;
    if (!req.file || !req.file.buffer) return res.status(400).json({ message: "No se envió archivo" });
    if (req.file.size > 5 * 1024 * 1024) return res.status(400).json({ message: "El archivo no puede superar 5 MB" });
    if (req.file.mimetype !== "application/pdf") return res.status(400).json({ message: "Solo se permiten archivos PDF" });

    const result = await getLegalizacionMTMForStudent(req, postulacionId);
    if (result.error) return res.status(result.error).json({ message: result.message });
    const plan = await PlanDeTrabajoMTM.findOne({ postulacionMTM: postulacionId }).select("estado").lean();
    if (!plan || plan.estado !== "aprobado") return res.status(400).json({ message: "Los seguimientos se habilitan cuando el plan esté aprobado" });

    const seg = await SeguimientoMTM.findOne({ _id: seguimientoId, postulacionMTM: postulacionId });
    if (!seg) return res.status(404).json({ message: "Seguimiento no encontrado" });
    if (seg.estado !== "pendiente_revision") return res.status(400).json({ message: "Solo se puede subir documento en un seguimiento Pendiente de revisión" });

    const ext = ".pdf";
    const key = `${S3_PREFIX_SEGUIMIENTOS}/${postulacionId}/${seguimientoId}/soporte${ext}`;
    await uploadToS3(key, req.file.buffer, { contentType: "application/pdf" });
    seg.documentoSoporte = { key, originalName: req.file.originalname || `soporte${ext}`, size: req.file.size };
    await seg.save();

    const updated = await SeguimientoMTM.findById(seg._id).populate("creadoPor", "name email").lean();
    res.json({ seguimiento: updated, message: "Documento de soporte subido" });
  } catch (err) {
    if (err.message?.includes("S3 no está configurado")) return res.status(503).json({ message: "El almacenamiento no está disponible" });
    console.error("[MTM] uploadDocumentoSeguimientoMTM:", err);
    res.status(500).json({ message: err.message });
  }
};

/** GET URL firmada del documento de soporte (estudiante, su postulación). */
export const getDocumentoSeguimientoUrl = async (req, res) => {
  try {
    const { postulacionId, seguimientoId } = req.params;
    const result = await getLegalizacionMTMForStudent(req, postulacionId);
    if (result.error) return res.status(result.error).json({ message: result.message });
    const seg = await SeguimientoMTM.findOne({ _id: seguimientoId, postulacionMTM: postulacionId }).select("documentoSoporte").lean();
    if (!seg || !seg.documentoSoporte?.key) return res.status(404).json({ message: "Documento no encontrado" });
    const url = await getSignedDownloadUrl(seg.documentoSoporte.key);
    res.json({ url, originalName: seg.documentoSoporte.originalName || "soporte.pdf" });
  } catch (err) {
    if (err.message?.includes("S3 no está configurado")) return res.status(503).json({ message: "Almacenamiento no disponible" });
    console.error("[MTM] getDocumentoSeguimientoUrl:", err);
    res.status(500).json({ message: err.message });
  }
};

/** GET URL o descarga del documento de soporte (admin). */
export const getDocumentoSeguimientoUrlAdmin = async (req, res) => {
  try {
    const { postulacionId, seguimientoId } = req.params;
    const seg = await SeguimientoMTM.findOne({ _id: seguimientoId, postulacionMTM: postulacionId }).select("documentoSoporte").lean();
    if (!seg || !seg.documentoSoporte?.key) return res.status(404).json({ message: "Documento no encontrado" });
    const url = await getSignedDownloadUrl(seg.documentoSoporte.key);
    res.json({ url, originalName: seg.documentoSoporte.originalName || "soporte.pdf" });
  } catch (err) {
    if (err.message?.includes("S3 no está configurado")) return res.status(503).json({ message: "Almacenamiento no disponible" });
    console.error("[MTM] getDocumentoSeguimientoUrlAdmin:", err);
    res.status(500).json({ message: err.message });
  }
};

/** GET descarga directa del documento de soporte (admin, guardar en Descargas). */
export const getDocumentoSeguimientoDownloadAdmin = async (req, res) => {
  try {
    const { postulacionId, seguimientoId } = req.params;
    const seg = await SeguimientoMTM.findOne({ _id: seguimientoId, postulacionMTM: postulacionId }).select("documentoSoporte").lean();
    if (!seg || !seg.documentoSoporte?.key) return res.status(404).json({ message: "Documento no encontrado" });
    const { buffer, contentType } = await getObjectFromS3(seg.documentoSoporte.key);
    const filename = seg.documentoSoporte.originalName || "soporte-seguimiento.pdf";
    res.setHeader("Content-Type", contentType || "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename.replace(/"/g, "%22")}"`);
    res.send(buffer);
  } catch (err) {
    if (err.message?.includes("S3 no está configurado")) return res.status(503).json({ message: "Almacenamiento no disponible" });
    console.error("[MTM] getDocumentoSeguimientoDownloadAdmin:", err);
    res.status(500).json({ message: err.message });
  }
};

// ─── RQ04_HU010: Asistencia espacios MTM ─────────────────────────────────────
async function assertPlanAprobadoParaAsistenciaEstudiante(postulacionId) {
  const plan = await PlanDeTrabajoMTM.findOne({ postulacionMTM: postulacionId }).select("estado").lean();
  if (!plan || plan.estado !== "aprobado") {
    return {
      ok: false,
      message:
        "El link y el reporte de asistencia están disponibles cuando el plan de trabajo esté aprobado por el profesor o responsable.",
    };
  }
  return { ok: true };
}

/** GET o crear link de asistencia para una postulación. Admin o estudiante dueño de la postulación. */
export const getOrCreateLinkAsistenciaMTM = async (req, res) => {
  try {
    const { postulacionId } = req.params;
    const isStudent = req.user?.role === "student" || req.user?.modulo === "estudiante";
    if (isStudent) {
      const result = await getLegalizacionMTMForStudent(req, postulacionId);
      if (result.error) return res.status(result.error).json({ message: result.message });
      const chk = await assertPlanAprobadoParaAsistenciaEstudiante(postulacionId);
      if (!chk.ok) return res.status(400).json({ message: chk.message });
    }
    const po = await PostulacionMTM.findOne({ _id: postulacionId, estado: "aceptado_estudiante" });
    if (!po) return res.status(404).json({ message: "Postulación no encontrada o no aceptada" });
    if (!po.linkAsistenciaToken) {
      po.linkAsistenciaToken = crypto.randomUUID();
      await po.save();
    }
    const baseUrl = process.env.FRONTEND_URL || process.env.CLIENT_URL || "http://localhost:5173";
    const link = `${baseUrl.replace(/\/$/, "")}/#/asistencia-mtm/${po.linkAsistenciaToken}`;
    res.json({ token: po.linkAsistenciaToken, link });
  } catch (err) {
    console.error("[MTM] getOrCreateLinkAsistenciaMTM:", err);
    res.status(500).json({ message: err.message });
  }
};

/** Filas del reporte de asistencia para una postulación MTM aceptada (reutiliza estudiante y admin). */
async function buildReporteAsistenciaPorPostulacion(postulacionId) {
  const po = await PostulacionMTM.findOne({ _id: postulacionId, estado: "aceptado_estudiante" })
    .populate({
      path: "oportunidadMTM",
      select: "periodo profesorResponsable",
      populate: [
        { path: "periodo", select: "codigo" },
        { path: "profesorResponsable", select: "nombres apellidos", populate: { path: "user", select: "email" } },
      ],
    })
    .populate({ path: "postulant", select: "postulantId", populate: { path: "postulantId", select: "name email" } })
    .populate("postulantProfile", "studentCode")
    .lean();
  if (!po) return null;

  const asistencias = await AsistenciaMTM.find({ postulacionMTM: postulacionId })
    .sort({ fechaDiligenciamiento: -1 })
    .lean();

  const opp = po.oportunidadMTM;
  const coordinador = opp?.profesorResponsable
    ? [opp.profesorResponsable.nombres, opp.profesorResponsable.apellidos].filter(Boolean).join(" ")
    : null;
  const base = {
    codigoMonitoria: po.postulantProfile?.studentCode ?? null,
    nombreApellidoMonitor: po.postulant?.postulantId?.name ?? "",
    identificacionMonitor: po.postulantProfile?.studentCode ?? null,
    correoMonitor: po.postulant?.postulantId?.email ?? null,
    nombreApellidoCoordinador: coordinador,
    periodoAcademico: opp?.periodo?.codigo ?? null,
  };
  const data = asistencias.map((a) => ({
    ...base,
    nombreActividad: a.nombreActividad,
    nombresEstudiante: a.nombresEstudiante,
    apellidosEstudiante: a.apellidosEstudiante,
    identificacionEstudiante: a.identificacionEstudiante,
    programaEstudiante: a.programaEstudiante ?? "",
    fechaDiligenciamiento: a.fechaDiligenciamiento,
  }));
  return { data, total: data.length };
}

/** GET reporte de asistencia para la MTM del estudiante (desde su legalización). */
export const getReporteAsistenciaMTMStudent = async (req, res) => {
  try {
    const { postulacionId } = req.params;
    const result = await getLegalizacionMTMForStudent(req, postulacionId);
    if (result.error) return res.status(result.error).json({ message: result.message });

    const chk = await assertPlanAprobadoParaAsistenciaEstudiante(postulacionId);
    if (!chk.ok) return res.status(400).json({ message: chk.message });

    const built = await buildReporteAsistenciaPorPostulacion(postulacionId);
    if (!built) return res.status(404).json({ message: "Postulación no encontrada" });
    res.json({ data: built.data, total: built.total });
  } catch (err) {
    console.error("[MTM] getReporteAsistenciaMTMStudent:", err);
    res.status(500).json({ message: err.message });
  }
};

/** GET reporte de asistencia de una legalización MTM (admin/coordinación), por postulación. */
export const getReporteAsistenciaMTMAdminByPostulacion = async (req, res) => {
  try {
    const { postulacionId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(postulacionId)) {
      return res.status(400).json({ message: "ID de postulación no válido" });
    }
    const leg = await LegalizacionMTM.findOne({ postulacionMTM: postulacionId }).lean();
    if (!leg) return res.status(404).json({ message: "Legalización no encontrada" });

    const built = await buildReporteAsistenciaPorPostulacion(postulacionId);
    if (!built) return res.status(404).json({ message: "Postulación no encontrada" });
    res.json({ data: built.data, total: built.total });
  } catch (err) {
    console.error("[MTM] getReporteAsistenciaMTMAdminByPostulacion:", err);
    res.status(500).json({ message: err.message });
  }
};

/** GET datos del formulario de asistencia por token (público, sin auth). */
export const getAsistenciaFormByToken = async (req, res) => {
  try {
    const { token } = req.params;
    const po = await PostulacionMTM.findOne({ linkAsistenciaToken: token, estado: "aceptado_estudiante" })
      .populate({
        path: "oportunidadMTM",
        select: "nombreCargo periodo profesorResponsable",
        populate: [
          { path: "periodo", select: "codigo" },
          { path: "profesorResponsable", select: "nombres apellidos", populate: { path: "user", select: "email" } },
        ],
      })
      .populate("postulant", "postulantId")
      .populate("postulantProfile", "studentCode")
      .lean();
    if (!po) return res.status(404).json({ message: "Link no válido o expirado" });
    const chk = await assertPlanAprobadoParaAsistenciaEstudiante(po._id);
    if (!chk.ok) return res.status(403).json({ message: chk.message });
    const postulantUser = await Postulant.findById(po.postulant).populate("postulantId", "name email").lean();
    const plan = await PlanDeTrabajoMTM.findOne({ postulacionMTM: po._id }).select("actividades").lean();
    const actividades = Array.isArray(plan?.actividades)
      ? plan.actividades.map((a) => (a.tema || "").trim()).filter(Boolean)
      : [];
    const opp = po.oportunidadMTM;
    const nombreMonitor = postulantUser?.postulantId?.name ?? "";
    const coordinador = opp?.profesorResponsable
      ? [opp.profesorResponsable.nombres, opp.profesorResponsable.apellidos].filter(Boolean).join(" ")
      : null;
    res.json({
      codigoMonitoria: po.postulantProfile?.studentCode ?? null,
      nombreMonitor,
      identificacionMonitor: po.postulantProfile?.studentCode ?? null,
      correoMonitor: postulantUser?.postulantId?.email ?? null,
      nombreCoordinador: coordinador,
      periodoAcademico: opp?.periodo?.codigo ?? null,
      nombreActividadMTM: opp?.nombreCargo ?? null,
      actividades,
    });
  } catch (err) {
    console.error("[MTM] getAsistenciaFormByToken:", err);
    res.status(500).json({ message: err.message });
  }
};

/** POST registrar asistencia (público, por token). */
export const postRegistrarAsistenciaMTM = async (req, res) => {
  try {
    const { token } = req.params;
    const { nombreActividad, nombresEstudiante, apellidosEstudiante, identificacionEstudiante, programaEstudiante } = req.body || {};
    const po = await PostulacionMTM.findOne({ linkAsistenciaToken: token, estado: "aceptado_estudiante" }).select("_id").lean();
    if (!po) return res.status(404).json({ message: "Link no válido o expirado" });
    const chk = await assertPlanAprobadoParaAsistenciaEstudiante(po._id);
    if (!chk.ok) return res.status(403).json({ message: chk.message });
    const tema = (nombreActividad || "").toString().trim();
    const nombres = (nombresEstudiante || "").toString().trim();
    const apellidos = (apellidosEstudiante || "").toString().trim();
    const identificacion = (identificacionEstudiante || "").toString().trim();
    if (!tema || !nombres || !apellidos || !identificacion) {
      return res.status(400).json({ message: "Faltan datos obligatorios: nombre de actividad, nombres, apellidos e identificación del estudiante" });
    }
    const reg = await AsistenciaMTM.create({
      postulacionMTM: po._id,
      nombreActividad: tema,
      nombresEstudiante: nombres,
      apellidosEstudiante: apellidos,
      identificacionEstudiante: identificacion,
      programaEstudiante: (programaEstudiante || "").toString().trim() || null,
      fechaDiligenciamiento: new Date(),
    });
    res.status(201).json({ registro: reg, message: "Asistencia registrada correctamente" });
  } catch (err) {
    console.error("[MTM] postRegistrarAsistenciaMTM:", err);
    res.status(500).json({ message: err.message });
  }
};

/** GET reporte de asistencia MTM (desde módulo legalización, mismos filtros). HU010. */
export const getReporteAsistenciaMTM = async (req, res) => {
  try {
    const { estado, periodo, page = 1, limit = 500 } = req.query;
    const filter = {};
    if (estado) filter.estado = estado;
    const legs = await LegalizacionMTM.find(filter)
      .populate({
        path: "postulacionMTM",
        match: { estado: "aceptado_estudiante" },
        select: "_id oportunidadMTM postulant postulantProfile",
        populate: [
          {
            path: "oportunidadMTM",
            select: "nombreCargo periodo profesorResponsable",
            populate: [
              { path: "periodo", select: "codigo" },
              { path: "profesorResponsable", select: "nombres apellidos", populate: { path: "user", select: "email" } },
            ],
          },
          { path: "postulant", select: "postulantId", populate: { path: "postulantId", select: "name email" } },
          { path: "postulantProfile", select: "studentCode" },
        ],
      })
      .lean();
    const postulacionesValidas = legs.filter((l) => l.postulacionMTM != null);
    let postulacionIds = postulacionesValidas.map((l) => l.postulacionMTM._id);
    if (periodo) {
      postulacionIds = postulacionesValidas
        .filter((p) => p.postulacionMTM?.oportunidadMTM?.periodo?.codigo === periodo)
        .map((p) => p.postulacionMTM._id);
    }
    const asistencias = await AsistenciaMTM.find({ postulacionMTM: { $in: postulacionIds } })
      .sort({ fechaDiligenciamiento: -1 })
      .lean();
    const poMap = new Map();
    postulacionesValidas.forEach((l) => {
      const po = l.postulacionMTM;
      if (po && !poMap.has(po._id.toString())) {
        const opp = po.oportunidadMTM;
        const nombreMonitor = po.postulant?.postulantId?.name ?? "";
        const coordinador = opp?.profesorResponsable
          ? [opp.profesorResponsable.nombres, opp.profesorResponsable.apellidos].filter(Boolean).join(" ")
          : null;
        poMap.set(po._id.toString(), {
          codigoMonitoria: po.postulantProfile?.studentCode ?? null,
          nombreApellidoMonitor: nombreMonitor,
          identificacionMonitor: po.postulantProfile?.studentCode ?? null,
          correoMonitor: po.postulant?.postulantId?.email ?? null,
          nombreApellidoCoordinador: coordinador,
          periodoAcademico: opp?.periodo?.codigo ?? null,
        });
      }
    });
    const rows = asistencias.map((a) => {
      const meta = poMap.get(a.postulacionMTM.toString()) || {};
      return {
        codigoMonitoria: meta.codigoMonitoria,
        nombreApellidoMonitor: meta.nombreApellidoMonitor,
        identificacionMonitor: meta.identificacionMonitor,
        correoMonitor: meta.correoMonitor,
        nombreApellidoCoordinador: meta.nombreApellidoCoordinador,
        periodoAcademico: meta.periodoAcademico,
        nombreActividad: a.nombreActividad,
        nombresEstudiante: a.nombresEstudiante,
        apellidosEstudiante: a.apellidosEstudiante,
        identificacionEstudiante: a.identificacionEstudiante,
        programaEstudiante: a.programaEstudiante ?? "",
        fechaDiligenciamiento: a.fechaDiligenciamiento,
      };
    });
    const total = rows.length;
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(1000, Math.max(1, parseInt(limit, 10)));
    const start = (pageNum - 1) * limitNum;
    const data = rows.slice(start, start + limitNum);
    res.json({ data, total, page: pageNum, limit: limitNum });
  } catch (err) {
    console.error("[MTM] getReporteAsistenciaMTM:", err);
    res.status(500).json({ message: err.message });
  }
};
