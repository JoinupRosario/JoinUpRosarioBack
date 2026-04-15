import mongoose from "mongoose";
import OportunidadMTM from "../oportunidadesMTM/oportunidadMTM.model.js";
import PostulacionMTM from "../oportunidadesMTM/postulacionMTM.model.js";
import LegalizacionMTM from "../oportunidadesMTM/legalizacionMTM.model.js";
import SeguimientoMTM from "../oportunidadesMTM/seguimientoMTM.model.js";
import Opportunity from "../opportunities/opportunity.model.js";
import LegalizacionPractica from "../legalizacionPractica/legalizacionPractica.model.js";
import SeguimientoPractica from "../legalizacionPractica/seguimientoPractica.model.js";
import Company from "../companies/company.model.js";
import Program from "../program/model/program.model.js";
import Postulant from "../postulants/models/postulants.schema.js";
import EstudianteHabilitado from "../estudiantesHabilitados/estudianteHabilitado.model.js";
import PostulantProfile from "../postulants/models/profile/profile.schema.js";
import { ProfileEnrolledProgram, ProfileGraduateProgram } from "../postulants/models/profile/index.js";
import { getAdminProgramScope } from "../../utils/adminProgramScope.util.js";
import {
  getAdminProgramIdsForReports,
  getPostulantIdsInAdminProgramScope,
  coerceProgramIdForAdminFilter,
  practiceOpportunityMatchesAdminPrograms,
  mtmOpportunityAllowedForAdmin,
} from "./reportExecutionScope.service.js";

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseDayStart(v) {
  if (v == null || String(v).trim() === "") return null;
  const d = new Date(`${String(v).trim()}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseDayEnd(v) {
  if (v == null || String(v).trim() === "") return null;
  const d = new Date(`${String(v).trim()}T23:59:59.999Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function oid(v) {
  if (v == null || String(v).trim() === "") return null;
  return mongoose.Types.ObjectId.isValid(v) ? new mongoose.Types.ObjectId(String(v)) : null;
}

function truthySwitch(v) {
  return v === true || v === "true" || v === "1" || v === 1;
}

function intersectObjectIds(a, b) {
  if (!a?.length || !b?.length) return [];
  const sb = new Set(b.map((x) => String(x)));
  return a.filter((x) => sb.has(String(x)));
}

/** @returns {{ columns: { key: string, label: string }[], rows: Record<string, unknown>[] }} */
async function runMonDetalleOfertas(filters, req) {
  const adminScope = await getAdminProgramScope(req);
  const adminProgramIds = adminScope?.programIds?.map(String) ?? null;
  const match = {};
  const cDesde = parseDayStart(filters.fechaCreacionDesde);
  const cHasta = parseDayEnd(filters.fechaCreacionHasta);
  if (cDesde || cHasta) {
    match.createdAt = {};
    if (cDesde) match.createdAt.$gte = cDesde;
    if (cHasta) match.createdAt.$lte = cHasta;
  }
  if (filters.estado != null && String(filters.estado).trim() !== "") {
    match.estado = String(filters.estado).trim();
  }
  const cat = oid(filters.categoriaItemId);
  if (cat) match.categoria = cat;
  const per = oid(filters.periodoId);
  if (per) match.periodo = per;

  const aDesde = parseDayStart(filters.fechaActivacionDesde);
  const aHasta = parseDayEnd(filters.fechaActivacionHasta);
  if (aDesde || aHasta) {
    const r = {};
    if (aDesde) r.$gte = aDesde;
    if (aHasta) r.$lte = aHasta;
    const updatedR = {};
    if (aDesde) updatedR.$gte = aDesde;
    if (aHasta) updatedR.$lte = aHasta;
    match.$and = match.$and || [];
    match.$and.push({
      $or: [
        { historialEstados: { $elemMatch: { estadoNuevo: "Activa", fechaCambio: r } } },
        { estado: "Activa", updatedAt: updatedR },
      ],
    });
  }

  let docs = await OportunidadMTM.find(match)
    .populate("periodo", "codigo")
    .populate("categoria", "value description")
    .populate("company", "name commercialName")
    .populate({ path: "programas", select: "name code" })
    .sort({ createdAt: -1 })
    .limit(5000)
    .lean();

  if (adminProgramIds?.length) {
    docs = docs.filter((d) => mtmOpportunityAllowedForAdmin(d, adminProgramIds, adminScope?.programTerms));
  }

  const columns = [
    { key: "nombreCargo", label: "Nombre del cargo" },
    { key: "estado", label: "Estado" },
    { key: "periodo", label: "Periodo" },
    { key: "categoria", label: "Categoría" },
    { key: "vacantes", label: "Vacantes" },
    { key: "fechaVencimiento", label: "Vencimiento oferta" },
    { key: "fechaCreacion", label: "Fecha creación" },
    { key: "entidad", label: "Entidad" },
    { key: "unidadAcademica", label: "Unidad académica" },
    { key: "nombreProfesor", label: "Profesor responsable" },
  ];

  const rows = docs.map((d) => ({
    nombreCargo: d.nombreCargo ?? "",
    estado: d.estado ?? "",
    periodo: d.periodo?.codigo != null ? String(d.periodo.codigo) : "",
    categoria: d.categoria?.value ?? d.categoria?.description ?? "",
    vacantes: d.vacantes ?? "",
    fechaVencimiento: d.fechaVencimiento ? new Date(d.fechaVencimiento).toLocaleDateString("es-CO") : "",
    fechaCreacion: d.createdAt ? new Date(d.createdAt).toLocaleString("es-CO") : "",
    entidad: (d.company?.commercialName || d.company?.name || "").trim(),
    unidadAcademica: d.unidadAcademica ?? "",
    nombreProfesor: d.nombreProfesor ?? "",
  }));

  return { columns, rows };
}

async function runMonAplicacionesOfertas(filters, req) {
  const emptyAplic = () => ({
    columns: [
      { key: "fechaAplicacion", label: "Fecha aplicación" },
      { key: "estado", label: "Estado postulación" },
      { key: "estudiante", label: "Estudiante" },
      { key: "oferta", label: "Oferta" },
      { key: "periodo", label: "Periodo" },
    ],
    rows: [],
  });

  const match = {};
  const adminProgramIds = await getAdminProgramIdsForReports(req);
  const adminPostulantIds = await getPostulantIdsInAdminProgramScope(req);

  if (adminPostulantIds !== null) {
    if (adminPostulantIds.length === 0) return emptyAplic();
    match.postulant = { $in: adminPostulantIds.map((id) => new mongoose.Types.ObjectId(id)) };
  }

  let allowedOpIds = null;
  if (adminProgramIds?.length) {
    allowedOpIds = (
      await OportunidadMTM.find({
        programas: { $in: adminProgramIds.map((id) => new mongoose.Types.ObjectId(id)) },
      })
        .select("_id")
        .lean()
    ).map((x) => x._id);
    if (!allowedOpIds.length) return emptyAplic();
  }

  const faDesde = parseDayStart(filters.fechaAplicacionDesde);
  const faHasta = parseDayEnd(filters.fechaAplicacionHasta);
  if (faDesde || faHasta) {
    match.fechaAplicacion = {};
    if (faDesde) match.fechaAplicacion.$gte = faDesde;
    if (faHasta) match.fechaAplicacion.$lte = faHasta;
  }

  let opIdsFromFilters = null;
  const opMatch = {};
  const per = oid(filters.periodoId);
  if (per) opMatch.periodo = per;
  const prog = oid(filters.programaId);
  if (prog) opMatch.programas = prog;
  if (Object.keys(opMatch).length) {
    const ids = await OportunidadMTM.find(opMatch).select("_id").lean();
    opIdsFromFilters = ids.map((x) => x._id);
    if (opIdsFromFilters.length === 0) return emptyAplic();
  }

  let finalOpIds = allowedOpIds;
  if (opIdsFromFilters != null) {
    finalOpIds =
      finalOpIds != null ? intersectObjectIds(opIdsFromFilters, finalOpIds) : opIdsFromFilters;
  }
  if (finalOpIds != null) {
    if (!finalOpIds.length) return emptyAplic();
    match.oportunidadMTM = { $in: finalOpIds };
  }

  const docs = await PostulacionMTM.find(match)
    .populate({
      path: "postulant",
      populate: { path: "postulantId", select: "name code email" },
    })
    .populate({
      path: "oportunidadMTM",
      select: "nombreCargo periodo",
      populate: { path: "periodo", select: "codigo" },
    })
    .sort({ fechaAplicacion: -1 })
    .limit(5000)
    .lean();

  const columns = [
    { key: "fechaAplicacion", label: "Fecha aplicación" },
    { key: "estado", label: "Estado postulación" },
    { key: "estudiante", label: "Estudiante" },
    { key: "oferta", label: "Oferta" },
    { key: "periodo", label: "Periodo" },
  ];

  const rows = docs.map((d) => {
    const u = d.postulant?.postulantId;
    const estudiante = u ? `${u.name || ""} (${u.code || ""})`.trim() : "";
    return {
      fechaAplicacion: d.fechaAplicacion ? new Date(d.fechaAplicacion).toLocaleString("es-CO") : "",
      estado: d.estado ?? "",
      estudiante,
      oferta: d.oportunidadMTM?.nombreCargo ?? "",
      periodo: d.oportunidadMTM?.periodo?.codigo != null ? String(d.oportunidadMTM.periodo.codigo) : "",
    };
  });

  return { columns, rows };
}

async function runMonResumenLegalizaciones(filters, req) {
  const periodoId = oid(filters.periodoId);
  const pipeline = [
    {
      $lookup: {
        from: "postulaciones_mtm",
        localField: "postulacionMTM",
        foreignField: "_id",
        as: "po",
      },
    },
    { $unwind: "$po" },
    {
      $lookup: {
        from: "oportunidadmtms",
        localField: "po.oportunidadMTM",
        foreignField: "_id",
        as: "op",
      },
    },
    { $unwind: "$op" },
  ];

  const adminPostulantIds = await getPostulantIdsInAdminProgramScope(req);
  if (adminPostulantIds !== null) {
    if (!adminPostulantIds.length) {
      return {
        columns: [
          { key: "estado", label: "Estado legalización" },
          { key: "cantidad", label: "Cantidad" },
        ],
        rows: [],
      };
    }
    pipeline.push({
      $match: {
        "po.postulant": {
          $in: adminPostulantIds.map((id) => new mongoose.Types.ObjectId(id)),
        },
      },
    });
  }

  const adminProgramIds = await getAdminProgramIdsForReports(req);
  if (adminProgramIds?.length) {
    pipeline.push({
      $match: {
        "op.programas": { $in: adminProgramIds.map((id) => new mongoose.Types.ObjectId(id)) },
      },
    });
  }

  if (periodoId) {
    pipeline.push({ $match: { "op.periodo": periodoId } });
  }
  pipeline.push({
    $group: {
      _id: "$estado",
      cantidad: { $sum: 1 },
    },
  });
  pipeline.push({ $sort: { _id: 1 } });

  const agg = await LegalizacionMTM.aggregate(pipeline);
  const columns = [
    { key: "estado", label: "Estado legalización" },
    { key: "cantidad", label: "Cantidad" },
  ];
  const rows = agg.map((r) => ({
    estado: r._id ?? "",
    cantidad: r.cantidad ?? 0,
  }));
  return { columns, rows };
}

async function runMonDetalladoLegalizaciones(filters, req) {
  const adminScope = await getAdminProgramScope(req);
  const adminProgramIds = adminScope?.programIds?.map(String) ?? null;
  const adminPostulantIds = await getPostulantIdsInAdminProgramScope(req);

  const legMatch = {};
  if (filters.estadoLegalizacion != null && String(filters.estadoLegalizacion).trim() !== "") {
    legMatch.estado = String(filters.estadoLegalizacion).trim();
  }

  let docs = await LegalizacionMTM.find(legMatch)
    .populate({
      path: "postulacionMTM",
      select: "postulant postulantProfile oportunidadMTM estado fechaAplicacion",
      populate: [
        { path: "postulant", populate: { path: "postulantId", select: "name code email" } },
        { path: "postulantProfile", select: "studentCode academicUser academicId" },
        {
          path: "oportunidadMTM",
          select:
            "nombreCargo periodo company programas unidadAcademica categoria asignaturas limiteHoras valorPorHora estado",
          populate: [
            { path: "periodo", select: "codigo" },
            { path: "company", select: "name commercialName" },
            { path: "programas", select: "name code" },
            { path: "categoria", select: "value description" },
            { path: "asignaturas", select: "nombreAsignatura codAsignatura" },
            { path: "valorPorHora", select: "value description" },
          ],
        },
      ],
    })
    .sort({ updatedAt: -1 })
    .limit(5000)
    .lean();

  if (adminPostulantIds !== null) {
    const allowP = new Set(adminPostulantIds.map(String));
    docs = docs.filter((leg) => {
      const ref = leg.postulacionMTM?.postulant?._id ?? leg.postulacionMTM?.postulant;
      return ref && allowP.has(String(ref));
    });
  }
  if (adminProgramIds?.length) {
    docs = docs.filter((leg) =>
      mtmOpportunityAllowedForAdmin(leg.postulacionMTM?.oportunidadMTM, adminProgramIds, adminScope?.programTerms)
    );
  }

  const postId = oid(filters.postulantId);
  const per = oid(filters.periodoId);
  const prog = oid(filters.programaId);
  const cat = oid(filters.categoriaItemId);
  const asig = oid(filters.asignaturaId);

  docs = docs.filter((leg) => {
    const po = leg.postulacionMTM;
    const op = po?.oportunidadMTM;
    const postulantRef = po?.postulant?._id ?? po?.postulant;
    if (postId && String(postulantRef || "") !== String(postId)) return false;
    if (per && String(op?.periodo?._id || op?.periodo) !== String(per)) return false;
    if (prog) {
      const progs = Array.isArray(op?.programas) ? op.programas.map((x) => String(x)) : [];
      if (!progs.includes(String(prog))) return false;
    }
    if (cat) {
      const cRef = op?.categoria?._id ?? op?.categoria;
      if (String(cRef || "") !== String(cat)) return false;
    }
    if (asig) {
      const arr = Array.isArray(op?.asignaturas) ? op.asignaturas : [];
      const ids = arr.map((x) => String(x?._id ?? x));
      if (!ids.includes(String(asig))) return false;
    }
    return true;
  });

  const pend = filters.soloDocumentosPendientes === true || filters.soloDocumentosPendientes === "true";
  const rech = filters.soloDocumentosRechazados === true || filters.soloDocumentosRechazados === "true";
  if (pend || rech) {
    docs = docs.filter((leg) => {
      const docObj = leg.documentos && typeof leg.documentos === "object" ? leg.documentos : {};
      const entries = Object.values(docObj);
      if (pend) {
        const hasPend = entries.some((e) => e && String(e.estadoDocumento || "").toLowerCase().includes("pend"));
        if (!hasPend) return false;
      }
      if (rech) {
        const hasRech = entries.some((e) => e && String(e.estadoDocumento || "").toLowerCase().includes("rechaz"));
        if (!hasRech) return false;
      }
      return true;
    });
  }

  const columns = [
    { key: "estado", label: "Estado legalización" },
    { key: "estudiante", label: "Estudiante" },
    { key: "oferta", label: "Oferta" },
    { key: "periodo", label: "Periodo" },
    { key: "entidad", label: "Entidad" },
    { key: "estadoPostulacion", label: "Estado postulación" },
    { key: "actualizado", label: "Última actualización" },
  ];

  const rows = docs.map((leg) => {
    const po = leg.postulacionMTM;
    const op = po?.oportunidadMTM;
    const u = po?.postulant?.postulantId;
    return {
      estado: leg.estado ?? "",
      estudiante: u ? `${u.name || ""} (${u.code || ""})`.trim() : "",
      oferta: op?.nombreCargo ?? "",
      periodo: op?.periodo?.codigo != null ? String(op.periodo.codigo) : "",
      entidad: (op?.company?.commercialName || op?.company?.name || "").trim(),
      estadoPostulacion: po?.estado ?? "",
      actualizado: leg.updatedAt ? new Date(leg.updatedAt).toLocaleString("es-CO") : "",
    };
  });

  return { columns, rows };
}

function joinAsignaturas(asignaturas) {
  if (!Array.isArray(asignaturas) || !asignaturas.length) return "";
  return asignaturas
    .map((a) => {
      const c = a?.codAsignatura != null ? String(a.codAsignatura).trim() : "";
      const n = a?.nombreAsignatura != null ? String(a.nombreAsignatura).trim() : "";
      if (c && n) return `${c} — ${n}`;
      return n || c || "";
    })
    .filter(Boolean)
    .join(" · ");
}

function splitNombreApellidoUsuario(fullName) {
  const s = String(fullName ?? "").trim();
  if (!s) return { nombres: "", apellidos: "" };
  const i = s.indexOf(" ");
  if (i < 0) return { nombres: s, apellidos: "" };
  return { nombres: s.slice(0, i).trim(), apellidos: s.slice(i + 1).trim() };
}

function fmtFechaSolo(d) {
  if (!d) return "";
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? "" : t.toLocaleDateString("es-CO");
}

/**
 * Cadena exacta del parámetro `MONITORING_DAF_REPORT_HD` (id 263) en `rosarioactualizado.sql`
 * — encabezado del Excel legado `reporte_monitoria_daf__VINCULACION_*`.
 */
const MONITORING_DAF_REPORT_HD_ROW =
  "Período,Categoría,Número D.I,Nombre(s),Apellidos,Correo Institucional,Fecha de nacimiento, Género, Nombre de la EPS, Dirección de residencia, Zona de Residencia, Localidad/Barrio, Celular,Asignatura,Grupo,Centro de costos, Nombre del profesor,Nombre Coordinador,Apellido Coordinador,Correo Coordinador,Número de contrato, Máximo Horas Monitoría,Nro Horas Reportadas";

/** Orden fijo del informe DAF Vinculación (coincide con `MONITORING_DAF_REPORT_HD`); no reordenar. */
const MONITORING_DAF_VINCULACION_KEYS = [
  "periodo",
  "categoria",
  "numeroDI",
  "nombres",
  "apellidos",
  "correoInstitucional",
  "fechaNacimiento",
  "genero",
  "nombreEps",
  "direccionResidencia",
  "zonaResidencia",
  "localidadBarrio",
  "celular",
  "asignatura",
  "grupo",
  "centroCostos",
  "nombreProfesor",
  "nombreCoordinador",
  "apellidoCoordinador",
  "correoCoordinador",
  "numeroContrato",
  "maximoHorasMonitoria",
  "nroHorasReportadas",
];

function buildMonDafVinculacionColumnsFromLegacyHd() {
  const labels = MONITORING_DAF_REPORT_HD_ROW.split(",").map((s) => s.trim());
  if (labels.length !== MONITORING_DAF_VINCULACION_KEYS.length) {
    throw new Error(
      `MONITORING_DAF_REPORT_HD: cabecera tiene ${labels.length} columnas, se esperaban ${MONITORING_DAF_VINCULACION_KEYS.length} (revisar cadena vs. keys).`
    );
  }
  return labels.map((label, i) => ({ key: MONITORING_DAF_VINCULACION_KEYS[i], label }));
}

const DAF_LEG_MAX = 8000;
const DAF_FULL_CHUNK = 200;
const DAF_SEGUIMIENTO_IN_CHUNK = 400;
const DAF_EH_IN_CHUNK = 360;

/** Pase ligero: orden + filtros admin sin árbol completo (para paginar o cargar por bloques). */
async function dafOrderedLegalizacionIds(req) {
  const adminScope = await getAdminProgramScope(req);
  const adminProgramIds = adminScope?.programIds?.map(String) ?? null;
  const adminPostulantIds = await getPostulantIdsInAdminProgramScope(req);

  let legs = await LegalizacionMTM.find({})
    .sort({ updatedAt: -1 })
    .limit(DAF_LEG_MAX)
    .select("_id postulacionMTM")
    .populate({
      path: "postulacionMTM",
      select: "postulant oportunidadMTM",
      populate: [
        { path: "postulant", select: "_id" },
        { path: "oportunidadMTM", select: "programas" },
      ],
    })
    .lean();

  legs = legs.filter((leg) => leg.postulacionMTM?.oportunidadMTM && leg.postulacionMTM?.postulant);

  if (adminPostulantIds !== null) {
    const allowP = new Set(adminPostulantIds.map(String));
    legs = legs.filter((leg) => {
      const ref = leg.postulacionMTM?.postulant?._id ?? leg.postulacionMTM?.postulant;
      return ref && allowP.has(String(ref));
    });
  }
  if (adminProgramIds?.length) {
    legs = legs.filter((leg) =>
      mtmOpportunityAllowedForAdmin(leg.postulacionMTM?.oportunidadMTM, adminProgramIds, adminScope?.programTerms)
    );
  }

  return legs.map((l) => l._id).filter(Boolean);
}

const dafLegalPopulate = [
  { path: "eps", select: "value description" },
  {
    path: "postulacionMTM",
    select: "postulant postulantProfile oportunidadMTM estado fechaAplicacion",
    populate: [
      { path: "postulantProfile", select: "studentCode" },
      {
        path: "postulant",
        select: "postulantId dateBirth gender phone address zonaResidencia cityResidenceId stateResidenceId alternateEmail",
        populate: [
          { path: "postulantId", select: "name email code" },
          { path: "gender", select: "value description" },
          { path: "cityResidenceId", select: "name" },
          { path: "stateResidenceId", select: "name" },
        ],
      },
      {
        path: "oportunidadMTM",
        select:
          "periodo asignaturas categoria limiteHoras centroCosto codigoCPS grupo nombreProfesor profesorResponsable programas dedicacionHoras tipoVinculacion",
        populate: [
          { path: "periodo", select: "codigo estado tipo" },
          { path: "asignaturas", select: "nombreAsignatura codAsignatura" },
          { path: "categoria", select: "value description" },
          { path: "programas", select: "name code" },
          { path: "dedicacionHoras", select: "value description" },
          { path: "tipoVinculacion", select: "value description" },
          {
            path: "profesorResponsable",
            select: "nombres apellidos user",
            populate: { path: "user", select: "email name" },
          },
        ],
      },
    ],
  },
];

/** Carga legalizaciones completas por `_id` en bloques, respetando el orden de `orderedMongoIds`. */
async function dafFullLegalDocsOrdered(orderedMongoIds) {
  if (!orderedMongoIds.length) return [];
  const byId = new Map();
  for (let i = 0; i < orderedMongoIds.length; i += DAF_FULL_CHUNK) {
    const chunk = orderedMongoIds.slice(i, i + DAF_FULL_CHUNK);
    const part = await LegalizacionMTM.find({ _id: { $in: chunk } })
      .populate(dafLegalPopulate)
      .lean();
    for (const d of part) {
      if (d?._id) byId.set(String(d._id), d);
    }
  }
  return orderedMongoIds.map((id) => byId.get(String(id))).filter(Boolean);
}

/**
 * Informe DAF Vinculación — columnas = encabezado `MONITORING_DAF_REPORT_HD` (UrJobs / rosarioactualizado.sql).
 * Sin filtros; legalización MTM + oportunidad + postulante (poblaciones amplias + EstudianteHabilitado por postulant o user).
 * Número D.I. = cédula en `PostulantProfile.studentCode` de la postulación (fallback: identificación UXXI).
 * Paginación: pase ligero + carga completa solo de la página; exportación: carga completa por bloques.
 */
async function runMonDafVinculacion(_filters, req, listOpts = {}) {
  const exportAll = listOpts?.exportAll === true;
  const page = listOpts?.page;
  const pageSize = listOpts?.pageSize;
  const usePaging = !exportAll && page != null && pageSize != null;

  const orderedIds = await dafOrderedLegalizacionIds(req);
  const total = orderedIds.length;

  let idsToHydrate = orderedIds;
  if (usePaging) {
    const p = Math.max(1, page);
    const ps = Math.min(100, Math.max(1, pageSize));
    const start = (p - 1) * ps;
    idsToHydrate = orderedIds.slice(start, start + ps);
  }

  let docs = await dafFullLegalDocsOrdered(idsToHydrate);
  docs = docs.filter((leg) => leg.postulacionMTM?.oportunidadMTM && leg.postulacionMTM?.postulant);

  const postulantIds = [...new Set(docs.map((d) => d.postulacionMTM?.postulant?._id ?? d.postulacionMTM?.postulant).filter(Boolean).map(String))];
  const userIdsFromPostulant = [
    ...new Set(
      docs
        .map((d) => d.postulacionMTM?.postulant?.postulantId?._id ?? d.postulacionMTM?.postulant?.postulantId)
        .filter(Boolean)
        .map(String)
    ),
  ];
  /** @type {Map<string, { identificacion: string, nombres: string, apellidos: string }>} */
  const ehPorPostulant = new Map();
  /** @type {Map<string, { identificacion: string, nombres: string, apellidos: string }>} */
  const ehPorUser = new Map();
  const postulantOids = postulantIds.filter((id) => mongoose.Types.ObjectId.isValid(id)).map((id) => new mongoose.Types.ObjectId(id));
  const userOids = userIdsFromPostulant.filter((id) => mongoose.Types.ObjectId.isValid(id)).map((id) => new mongoose.Types.ObjectId(id));
  const rowToSliceEh = (r) => ({
    identificacion: r.identificacion != null ? String(r.identificacion).trim() : "",
    nombres: r.nombres != null ? String(r.nombres).trim() : "",
    apellidos: r.apellidos != null ? String(r.apellidos).trim() : "",
  });
  for (let i = 0; i < postulantOids.length; i += DAF_EH_IN_CHUNK) {
    const chunk = postulantOids.slice(i, i + DAF_EH_IN_CHUNK);
    const ehRows = await EstudianteHabilitado.find({ postulant: { $in: chunk } })
      .sort({ updatedAt: -1 })
      .select("postulant user identificacion nombres apellidos")
      .lean();
    for (const r of ehRows) {
      if (r.postulant) {
        const pid = String(r.postulant);
        if (!ehPorPostulant.has(pid)) ehPorPostulant.set(pid, rowToSliceEh(r));
      }
      if (r.user) {
        const uid = String(r.user);
        if (!ehPorUser.has(uid)) ehPorUser.set(uid, rowToSliceEh(r));
      }
    }
  }
  for (let i = 0; i < userOids.length; i += DAF_EH_IN_CHUNK) {
    const chunk = userOids.slice(i, i + DAF_EH_IN_CHUNK);
    const ehRows = await EstudianteHabilitado.find({ user: { $in: chunk } })
      .sort({ updatedAt: -1 })
      .select("postulant user identificacion nombres apellidos")
      .lean();
    for (const r of ehRows) {
      if (r.postulant) {
        const pid = String(r.postulant);
        if (!ehPorPostulant.has(pid)) ehPorPostulant.set(pid, rowToSliceEh(r));
      }
      if (r.user) {
        const uid = String(r.user);
        if (!ehPorUser.has(uid)) ehPorUser.set(uid, rowToSliceEh(r));
      }
    }
  }

  const postulacionOids = docs
    .map((d) => d.postulacionMTM?._id)
    .filter((id) => id && mongoose.Types.ObjectId.isValid(String(id)))
    .map((id) => new mongoose.Types.ObjectId(String(id)));
  const horasByPostulacion = new Map();
  for (let i = 0; i < postulacionOids.length; i += DAF_SEGUIMIENTO_IN_CHUNK) {
    const slice = postulacionOids.slice(i, i + DAF_SEGUIMIENTO_IN_CHUNK);
    if (!slice.length) continue;
    const agg = await SeguimientoMTM.aggregate([
      { $match: { postulacionMTM: { $in: slice }, estado: "aprobado" } },
      {
        $group: {
          _id: "$postulacionMTM",
          nroHorasReportadas: { $sum: { $ifNull: ["$cantidadHoras", 0] } },
        },
      },
    ]);
    for (const row of agg) {
      if (row._id) horasByPostulacion.set(String(row._id), row.nroHorasReportadas ?? 0);
    }
  }

  const columns = buildMonDafVinculacionColumnsFromLegacyHd();

  const rows = docs.map((leg) => {
    const po = leg.postulacionMTM;
    const op = po?.oportunidadMTM;
    const post = po?.postulant;
    const u = post?.postulantId;
    const postRef = post?._id ?? post;
    const uid = u?._id ?? post?.postulantId;
    const eh =
      (postRef && ehPorPostulant.get(String(postRef))) || (uid && ehPorUser.get(String(uid))) || undefined;
    const split = splitNombreApellidoUsuario(u?.name);
    const nombresEst = eh?.nombres ? eh.nombres : split.nombres;
    const apellidosEst = eh?.apellidos ? eh.apellidos : split.apellidos;
    const perfil = po?.postulantProfile;
    const diPerfil =
      perfil?.studentCode != null && String(perfil.studentCode).trim() !== ""
        ? String(perfil.studentCode).trim()
        : "";
    const diEh = eh?.identificacion != null ? String(eh.identificacion).trim() : "";
    const numeroDI = diPerfil || diEh;
    const coord = op?.profesorResponsable;
    const nombresCoord = coord?.nombres != null ? String(coord.nombres).trim() : "";
    const apellidosCoord = coord?.apellidos != null ? String(coord.apellidos).trim() : "";
    const correoCoord = coord?.user?.email != null ? String(coord.user.email).trim() : "";
    const nombreProfesorTxt = op?.nombreProfesor != null ? String(op.nombreProfesor).trim() : "";
    const lim = op?.limiteHoras != null && Number.isFinite(Number(op.limiteHoras)) ? Number(op.limiteHoras) : "";
    const postOid = po?._id != null ? String(po._id) : "";
    const nroHoras = postOid ? horasByPostulacion.get(postOid) ?? 0 : 0;
    const generoItem = post?.gender;
    const ciudad = post?.cityResidenceId;
    const estado = post?.stateResidenceId;
    const localidadParts = [ciudad?.name, estado?.name].filter(Boolean).map((x) => String(x).trim());
    const correoInst =
      (u?.email != null && String(u.email).trim() !== "" ? String(u.email).trim() : "") ||
      (post?.alternateEmail != null ? String(post.alternateEmail).trim() : "");
    const numeroContratoTxt = op?.codigoCPS != null ? String(op.codigoCPS).trim() : "";

    const cells = {
      periodo: op?.periodo?.codigo != null ? String(op.periodo.codigo) : "",
      categoria: (op?.categoria?.value || op?.categoria?.description || "").trim(),
      numeroDI,
      nombres: nombresEst,
      apellidos: apellidosEst,
      correoInstitucional: correoInst,
      fechaNacimiento: fmtFechaSolo(post?.dateBirth),
      genero: (generoItem?.value || generoItem?.description || "").trim(),
      nombreEps: (leg.eps?.value || leg.eps?.description || "").trim(),
      direccionResidencia: post?.address != null ? String(post.address).trim() : "",
      zonaResidencia: post?.zonaResidencia != null ? String(post.zonaResidencia).trim() : "",
      localidadBarrio: localidadParts.length ? localidadParts.join(" · ") : "",
      celular: post?.phone != null ? String(post.phone).trim() : "",
      asignatura: joinAsignaturas(op?.asignaturas),
      grupo: op?.grupo != null ? String(op.grupo).trim() : "",
      centroCostos: op?.centroCosto != null ? String(op.centroCosto).trim() : "",
      nombreProfesor: nombreProfesorTxt,
      nombreCoordinador: nombresCoord,
      apellidoCoordinador: apellidosCoord,
      correoCoordinador: correoCoord,
      numeroContrato: numeroContratoTxt,
      maximoHorasMonitoria: lim === "" ? "" : lim,
      nroHorasReportadas: nroHoras,
    };
    return Object.fromEntries(MONITORING_DAF_VINCULACION_KEYS.map((k) => [k, cells[k] ?? ""]));
  });

  return { columns, rows, total, skipOuterPagination: true };
}

async function runPracDetalleOportunidades(filters, req) {
  const adminProgramIds = await getAdminProgramIdsForReports(req);
  const match = { tipo: "practica" };
  const cDesde = parseDayStart(filters.fechaCreacionDesde);
  const cHasta = parseDayEnd(filters.fechaCreacionHasta);
  if (cDesde || cHasta) {
    match.createdAt = {};
    if (cDesde) match.createdAt.$gte = cDesde;
    if (cHasta) match.createdAt.$lte = cHasta;
  }
  if (filters.estadoOportunidad != null && String(filters.estadoOportunidad).trim() !== "") {
    match.estado = String(filters.estadoOportunidad).trim();
  }
  const emp = oid(filters.empresaId);
  if (emp) match.company = emp;

  const aDesde = parseDayStart(filters.fechaActivacionDesde);
  const aHasta = parseDayEnd(filters.fechaActivacionHasta);
  if (aDesde || aHasta) {
    const r = {};
    if (aDesde) r.$gte = aDesde;
    if (aHasta) r.$lte = aHasta;
    match.$or = [
      { fechaActivacion: r },
      { historialEstados: { $elemMatch: { estadoNuevo: "Activa", fechaCambio: r } } },
    ];
  }

  const progId = coerceProgramIdForAdminFilter(filters.programaId, adminProgramIds);
  if (progId) {
    const prog = await Program.findById(progId).select("name code").lean();
    if (prog) {
      const terms = [prog.name, prog.code].filter(Boolean);
      if (terms.length) {
        match.$and = match.$and || [];
        match.$and.push({
          $or: terms.map((term) => ({
            formacionAcademica: { $elemMatch: { program: new RegExp(escapeRegex(term), "i") } },
          })),
        });
      }
    }
  }

  const salMin = filters.salarioMin != null && String(filters.salarioMin).trim() !== "" ? Number(String(filters.salarioMin).replace(",", ".")) : null;
  const salMax = filters.salarioMax != null && String(filters.salarioMax).trim() !== "" ? Number(String(filters.salarioMax).replace(",", ".")) : null;
  const ae = {};
  if (salMin != null && !Number.isNaN(salMin)) ae.$gte = salMin;
  if (salMax != null && !Number.isNaN(salMax)) ae.$lte = salMax;
  if (Object.keys(ae).length) match.apoyoEconomico = ae;

  let docs = await Opportunity.find(match)
    .populate("company", "name commercialName")
    .populate("periodo", "codigo")
    .sort({ createdAt: -1 })
    .limit(5000)
    .lean();

  if (adminProgramIds?.length) {
    const filtered = [];
    for (const d of docs) {
      if (await practiceOpportunityMatchesAdminPrograms(d, adminProgramIds)) filtered.push(d);
    }
    docs = filtered;
  }

  const columns = [
    { key: "nombreCargo", label: "Nombre del cargo" },
    { key: "estado", label: "Estado" },
    { key: "entidad", label: "Entidad" },
    { key: "periodo", label: "Periodo" },
    { key: "apoyoEconomico", label: "Apoyo económico" },
    { key: "fechaActivacion", label: "Fecha activación" },
    { key: "fechaCreacion", label: "Fecha creación" },
  ];

  const rows = docs.map((d) => ({
    nombreCargo: d.nombreCargo ?? "",
    estado: d.estado ?? "",
    entidad: (d.company?.commercialName || d.company?.name || "").trim(),
    periodo: d.periodo?.codigo != null ? String(d.periodo.codigo) : "",
    apoyoEconomico: d.apoyoEconomico != null ? String(d.apoyoEconomico) : "",
    fechaActivacion: d.fechaActivacion ? new Date(d.fechaActivacion).toLocaleDateString("es-CO") : "",
    fechaCreacion: d.createdAt ? new Date(d.createdAt).toLocaleString("es-CO") : "",
  }));

  return { columns, rows };
}

async function runPracEntidadesContactos(filters, _req) {
  const match = {};
  const rs = filters.razonSocial != null ? String(filters.razonSocial).trim() : "";
  if (rs) {
    match.$or = [
      { name: new RegExp(escapeRegex(rs), "i") },
      { legalName: new RegExp(escapeRegex(rs), "i") },
      { commercialName: new RegExp(escapeRegex(rs), "i") },
    ];
  }
  const nit = filters.nit != null ? String(filters.nit).trim() : "";
  if (nit) {
    match.nit = new RegExp(escapeRegex(nit), "i");
  }
  const cDesde = parseDayStart(filters.fechaCreacionDesde);
  const cHasta = parseDayEnd(filters.fechaCreacionHasta);
  if (cDesde || cHasta) {
    match.createdAt = {};
    if (cDesde) match.createdAt.$gte = cDesde;
    if (cHasta) match.createdAt.$lte = cHasta;
  }
  const aDesde = parseDayStart(filters.fechaActivacionDesde);
  const aHasta = parseDayEnd(filters.fechaActivacionHasta);
  if (aDesde || aHasta) {
    const r = {};
    if (aDesde) r.$gte = aDesde;
    if (aHasta) r.$lte = aHasta;
    match.approvedAt = r;
  }
  if (filters.estadoEntidad != null && String(filters.estadoEntidad).trim() !== "") {
    match.status = String(filters.estadoEntidad).trim();
  }
  if (filters.soloEntidadesSuspendidas === true || filters.soloEntidadesSuspendidas === "true") {
    match.status = "inactive";
  }

  const docs = await Company.find(match).sort({ updatedAt: -1 }).limit(5000).lean();

  const columns = [
    { key: "name", label: "Razón social" },
    { key: "nit", label: "NIT" },
    { key: "status", label: "Estado" },
    { key: "email", label: "Email" },
    { key: "phone", label: "Teléfono" },
    { key: "ciudad", label: "Ciudad" },
    { key: "creado", label: "Fecha registro" },
    { key: "aprobado", label: "Fecha aprobación" },
  ];

  const rows = docs.map((d) => ({
    name: d.name ?? "",
    nit: d.nit ?? "",
    status: d.status ?? "",
    email: d.email ?? "",
    phone: d.phone ?? "",
    ciudad: d.city ?? "",
    creado: d.createdAt ? new Date(d.createdAt).toLocaleString("es-CO") : "",
    aprobado: d.approvedAt ? new Date(d.approvedAt).toLocaleString("es-CO") : "",
  }));

  return { columns, rows };
}

function toObjectIdArray(ids) {
  return (ids || [])
    .filter((id) => mongoose.Types.ObjectId.isValid(String(id)))
    .map((id) => new mongoose.Types.ObjectId(String(id)));
}

async function studentCodeMapForPostulants(postulantIds) {
  if (!postulantIds?.length) return new Map();
  const rows = await PostulantProfile.aggregate([
    { $match: { postulantId: { $in: toObjectIdArray(postulantIds) } } },
    { $sort: { createdAt: -1 } },
    { $group: { _id: "$postulantId", studentCode: { $first: "$studentCode" } } },
  ]);
  return new Map(
    rows.map((s) => {
      const sc =
        s.studentCode != null && String(s.studentCode).trim() !== "" ? String(s.studentCode).trim() : "";
      return [String(s._id), sc];
    })
  );
}

async function runPracPostulantes(filters, req) {
  const columns = [
    { key: "estudiante", label: "Estudiante" },
    { key: "email", label: "Correo" },
    { key: "usuario", label: "Código usuario" },
    { key: "identificacion", label: "Identificación" },
    { key: "studentCode", label: "Código estudiantil" },
    { key: "programasCurso", label: "Programas en curso" },
    { key: "programasFinalizados", label: "Programas finalizados" },
    { key: "perfilActualizado", label: "Última actualización perfil" },
  ];

  const adminProgramIdsStr = await getAdminProgramIdsForReports(req);
  const adminPostulantIds = await getPostulantIdsInAdminProgramScope(req);

  if (adminPostulantIds !== null && adminPostulantIds.length === 0) {
    return { columns, rows: [] };
  }

  const enc = coerceProgramIdForAdminFilter(filters.programaEnCursoId, adminProgramIdsStr);
  const fin = coerceProgramIdForAdminFilter(filters.programaFinalizadoId, adminProgramIdsStr);

  const programPostulantParts = [];
  if (enc) {
    const profIds = toObjectIdArray(await ProfileEnrolledProgram.distinct("profileId", { programId: enc }));
    if (profIds.length) {
      const pus = await PostulantProfile.distinct("postulantId", { _id: { $in: profIds } });
      programPostulantParts.push(new Set(pus.map(String)));
    } else {
      programPostulantParts.push(new Set());
    }
  }
  if (fin) {
    const profIds = toObjectIdArray(await ProfileGraduateProgram.distinct("profileId", { programId: fin }));
    if (profIds.length) {
      const pus = await PostulantProfile.distinct("postulantId", { _id: { $in: profIds } });
      programPostulantParts.push(new Set(pus.map(String)));
    } else {
      programPostulantParts.push(new Set());
    }
  }

  let programPostulantSet = null;
  if (programPostulantParts.length === 2) {
    programPostulantSet = new Set([...programPostulantParts[0], ...programPostulantParts[1]]);
  } else if (programPostulantParts.length === 1) {
    programPostulantSet = programPostulantParts[0];
  }

  const perfDesde = parseDayStart(filters.perfilActualizadoDesde);
  const perfHasta = parseDayEnd(filters.perfilActualizadoHasta);
  let datePostulantSet = null;
  if (perfDesde || perfHasta) {
    const pm = {};
    if (perfDesde) pm.updatedAt = { $gte: perfDesde };
    if (perfHasta) pm.updatedAt = { ...(pm.updatedAt || {}), $lte: perfHasta };
    const pus = await PostulantProfile.distinct("postulantId", pm);
    datePostulantSet = new Set(pus.map(String));
  }

  let uniPostulantSet = null;
  if (truthySwitch(filters.soloProgramasUniversidad)) {
    const pe = await ProfileEnrolledProgram.distinct("profileId", { programFacultyId: { $exists: true, $ne: null } });
    const pg = await ProfileGraduateProgram.distinct("profileId", { programFacultyId: { $exists: true, $ne: null } });
    const profIds = toObjectIdArray([...new Set([...pe, ...pg].map(String))]);
    if (profIds.length) {
      const pus = await PostulantProfile.distinct("postulantId", { _id: { $in: profIds } });
      uniPostulantSet = new Set(pus.map(String));
    } else {
      uniPostulantSet = new Set();
    }
  }

  const constraintSets = [];
  if (adminPostulantIds !== null) constraintSets.push(new Set(adminPostulantIds.map(String)));
  if (programPostulantSet) constraintSets.push(programPostulantSet);
  if (datePostulantSet) constraintSets.push(datePostulantSet);
  if (uniPostulantSet) constraintSets.push(uniPostulantSet);

  let finalPostulantIdStrings = null;
  for (const s of constraintSets) {
    finalPostulantIdStrings =
      finalPostulantIdStrings == null ? new Set(s) : new Set([...finalPostulantIdStrings].filter((id) => s.has(id)));
  }

  const postulantQuery = {};
  if (finalPostulantIdStrings != null) {
    if (finalPostulantIdStrings.size === 0) return { columns, rows: [] };
    postulantQuery._id = { $in: toObjectIdArray([...finalPostulantIdStrings]) };
  }

  const postulants = await Postulant.find(postulantQuery)
    .populate("postulantId", "name email code")
    .sort({ updatedAt: -1 })
    .limit(3000)
    .lean();

  const ids = postulants.map((p) => p._id);
  const [studentCodeMap, identRows, profiles] = await Promise.all([
    studentCodeMapForPostulants(ids),
    EstudianteHabilitado.find({ postulant: { $in: ids } })
      .select("postulant identificacion")
      .lean(),
    PostulantProfile.find({ postulantId: { $in: ids } }).select("_id postulantId updatedAt").lean(),
  ]);
  const identByPostulant = new Map(identRows.map((r) => [String(r.postulant), String(r.identificacion || "").trim()]));

  const profileIds = profiles.map((p) => p._id);
  const profilesByPostulant = new Map();
  for (const p of profiles) {
    const k = String(p.postulantId);
    if (!profilesByPostulant.has(k)) profilesByPostulant.set(k, []);
    profilesByPostulant.get(k).push(p);
  }

  const [enrolledRows, gradRows] = await Promise.all([
    profileIds.length
      ? ProfileEnrolledProgram.find({ profileId: { $in: profileIds } }).populate("programId", "name code").lean()
      : [],
    profileIds.length
      ? ProfileGraduateProgram.find({
          profileId: { $in: profileIds },
          programId: { $exists: true, $ne: null },
        })
          .populate("programId", "name code")
          .lean()
      : [],
  ]);

  const enrolledByProfile = new Map();
  for (const r of enrolledRows) {
    const label = [r.programId?.code, r.programId?.name].filter(Boolean).join(" — ") || "";
    if (!label) continue;
    const pid = String(r.profileId);
    if (!enrolledByProfile.has(pid)) enrolledByProfile.set(pid, new Set());
    enrolledByProfile.get(pid).add(label);
  }
  const gradByProfile = new Map();
  for (const r of gradRows) {
    const label = [r.programId?.code, r.programId?.name].filter(Boolean).join(" — ") || "";
    if (!label) continue;
    const pid = String(r.profileId);
    if (!gradByProfile.has(pid)) gradByProfile.set(pid, new Set());
    gradByProfile.get(pid).add(label);
  }

  const rows = postulants.map((p) => {
    const u = p.postulantId;
    const name = u?.name != null ? String(u.name).trim() : "";
    const code = u?.code != null ? String(u.code).trim() : "";
    const email = u?.email != null ? String(u.email).trim() : "";
    const identEh = identByPostulant.get(String(p._id)) || "";
    const identificacion = identEh || code;
    const studentCode = studentCodeMap.get(String(p._id)) || "";
    const plist = profilesByPostulant.get(String(p._id)) || [];
    const cur = new Set();
    const gradLabels = new Set();
    let maxUpd = null;
    for (const pr of plist) {
      if (pr.updatedAt) {
        const t = new Date(pr.updatedAt).getTime();
        if (maxUpd == null || t > maxUpd) maxUpd = t;
      }
      const pid = String(pr._id);
      const elSet = enrolledByProfile.get(pid);
      if (elSet) for (const x of elSet) cur.add(x);
      const glSet = gradByProfile.get(pid);
      if (glSet) for (const x of glSet) gradLabels.add(x);
    }
    return {
      estudiante: name,
      email,
      usuario: code,
      identificacion,
      studentCode,
      programasCurso: [...cur].join("; "),
      programasFinalizados: [...gradLabels].join("; "),
      perfilActualizado: maxUpd != null ? new Date(maxUpd).toLocaleString("es-CO") : "",
    };
  });

  return { columns, rows };
}

async function runPracCierreOportunidades(filters, req) {
  const adminProgramIds = await getAdminProgramIdsForReports(req);
  const match = { tipo: "practica", fechaCierre: { $exists: true, $ne: null } };
  const fcDesde = parseDayStart(filters.fechaCierreDesde);
  const fcHasta = parseDayEnd(filters.fechaCierreHasta);
  if (fcDesde || fcHasta) {
    match.fechaCierre = { $exists: true, $ne: null };
    if (fcDesde) match.fechaCierre.$gte = fcDesde;
    if (fcHasta) match.fechaCierre.$lte = fcHasta;
  }
  const emp = oid(filters.empresaId);
  if (emp) match.company = emp;

  const progOid = coerceProgramIdForAdminFilter(filters.programaId, adminProgramIds);
  if (progOid) {
    const prog = await Program.findById(progOid).select("name code").lean();
    if (prog) {
      const terms = [prog.name, prog.code].filter(Boolean);
      if (terms.length) {
        match.$and = match.$and || [];
        match.$and.push({
          $or: terms.map((term) => ({
            formacionAcademica: { $elemMatch: { program: new RegExp(escapeRegex(term), "i") } },
          })),
        });
      }
    }
  }

  let docs = await Opportunity.find(match)
    .populate("company", "name commercialName")
    .populate("periodo", "codigo")
    .sort({ fechaCierre: -1 })
    .limit(5000)
    .lean();

  if (adminProgramIds?.length) {
    const filtered = [];
    for (const d of docs) {
      if (await practiceOpportunityMatchesAdminPrograms(d, adminProgramIds)) filtered.push(d);
    }
    docs = filtered;
  }

  const columns = [
    { key: "nombreCargo", label: "Nombre del cargo" },
    { key: "estado", label: "Estado" },
    { key: "entidad", label: "Entidad" },
    { key: "periodo", label: "Periodo" },
    { key: "fechaCierre", label: "Fecha cierre" },
    { key: "motivoCierre", label: "Motivo no contratación" },
  ];

  const rows = docs.map((d) => ({
    nombreCargo: d.nombreCargo ?? "",
    estado: d.estado ?? "",
    entidad: (d.company?.commercialName || d.company?.name || "").trim(),
    periodo: d.periodo?.codigo != null ? String(d.periodo.codigo) : "",
    fechaCierre: d.fechaCierre ? new Date(d.fechaCierre).toLocaleString("es-CO") : "",
    motivoCierre: d.motivoCierreNoContrato ?? "",
  }));

  return { columns, rows };
}

async function runPracLegalizacionReporteGeneral(filters, req) {
  const adminPostulantIds = await getPostulantIdsInAdminProgramScope(req);
  const match = {};
  const d0 = parseDayStart(filters.fechaDesde);
  const d1 = parseDayEnd(filters.fechaHasta);
  if (d0 || d1) {
    match.updatedAt = {};
    if (d0) match.updatedAt.$gte = d0;
    if (d1) match.updatedAt.$lte = d1;
  }

  let docs = await LegalizacionPractica.find(match)
    .populate({
      path: "postulacionOportunidad",
      select: "postulant opportunity",
      populate: [
        { path: "postulant", populate: { path: "postulantId", select: "name code" } },
        { path: "opportunity", select: "nombreCargo tipo" },
      ],
    })
    .sort({ updatedAt: -1 })
    .limit(5000)
    .lean();

  if (adminPostulantIds !== null) {
    const allow = new Set(adminPostulantIds.map(String));
    docs = docs.filter((d) => {
      const ref = d.postulacionOportunidad?.postulant?._id ?? d.postulacionOportunidad?.postulant;
      return ref && allow.has(String(ref));
    });
  }

  const columns = [
    { key: "estado", label: "Estado" },
    { key: "estudiante", label: "Estudiante" },
    { key: "oportunidad", label: "Oportunidad" },
    { key: "actualizado", label: "Última actualización" },
  ];

  const rows = docs.map((d) => {
    const u = d.postulacionOportunidad?.postulant?.postulantId;
    return {
      estado: d.estado ?? "",
      estudiante: u ? `${u.name || ""} (${u.code || ""})`.trim() : "",
      oportunidad: d.postulacionOportunidad?.opportunity?.nombreCargo ?? "",
      actualizado: d.updatedAt ? new Date(d.updatedAt).toLocaleString("es-CO") : "",
    };
  });

  return { columns, rows };
}

async function runPracLegalizacionEvalSeguimiento(filters, req) {
  const adminPostulantIds = await getPostulantIdsInAdminProgramScope(req);
  const match = {};
  const d0 = parseDayStart(filters.fechaDesde);
  const d1 = parseDayEnd(filters.fechaHasta);
  if (d0 || d1) {
    match.createdAt = {};
    if (d0) match.createdAt.$gte = d0;
    if (d1) match.createdAt.$lte = d1;
  }

  let docs = await SeguimientoPractica.find(match)
    .populate({
      path: "postulacionOportunidad",
      select: "postulant",
      populate: { path: "postulant", populate: { path: "postulantId", select: "name code" } },
    })
    .sort({ createdAt: -1 })
    .limit(5000)
    .lean();

  if (adminPostulantIds !== null) {
    const allow = new Set(adminPostulantIds.map(String));
    docs = docs.filter((d) => {
      const ref = d.postulacionOportunidad?.postulant?._id ?? d.postulacionOportunidad?.postulant;
      return ref && allow.has(String(ref));
    });
  }

  const columns = [
    { key: "actividad", label: "Actividad" },
    { key: "estado", label: "Estado" },
    { key: "estudiante", label: "Estudiante" },
    { key: "fechaInicio", label: "Inicio" },
    { key: "fechaFin", label: "Fin" },
    { key: "creado", label: "Registro" },
  ];

  const rows = docs.map((d) => {
    const u = d.postulacionOportunidad?.postulant?.postulantId;
    return {
      actividad: d.actividad ?? "",
      estado: d.estado ?? "",
      estudiante: u ? `${u.name || ""} (${u.code || ""})`.trim() : "",
      fechaInicio: d.fechaInicio ? new Date(d.fechaInicio).toLocaleDateString("es-CO") : "",
      fechaFin: d.fechaFin ? new Date(d.fechaFin).toLocaleDateString("es-CO") : "",
      creado: d.createdAt ? new Date(d.createdAt).toLocaleString("es-CO") : "",
    };
  });

  return { columns, rows };
}

async function runPracEstadisticosGeneral(filters, req) {
  const adminProgramIds = await getAdminProgramIdsForReports(req);
  const match = { tipo: "practica" };
  const d0 = parseDayStart(filters.fechaDesde);
  const d1 = parseDayEnd(filters.fechaHasta);
  if (d0 || d1) {
    match.createdAt = {};
    if (d0) match.createdAt.$gte = d0;
    if (d1) match.createdAt.$lte = d1;
  }
  let docs = await Opportunity.find(match).select("estado nombreCargo createdAt").sort({ createdAt: -1 }).limit(8000).lean();
  if (adminProgramIds?.length) {
    const filtered = [];
    for (const d of docs) {
      if (await practiceOpportunityMatchesAdminPrograms(d, adminProgramIds)) filtered.push(d);
    }
    docs = filtered;
  }
  const byEstado = new Map();
  for (const d of docs) {
    const k = d.estado || "—";
    byEstado.set(k, (byEstado.get(k) || 0) + 1);
  }
  const columns = [
    { key: "estado", label: "Estado" },
    { key: "cantidad", label: "Cantidad" },
  ];
  const rows = [...byEstado.entries()].map(([estado, cantidad]) => ({ estado, cantidad }));
  rows.sort((a, b) => String(a.estado).localeCompare(String(b.estado)));
  return { columns, rows };
}

/** Sin columnas: el front muestra aviso si rows está vacío. */
function emptyResult() {
  return { columns: [], rows: [], total: 0 };
}

/**
 * @param {{ columns?: unknown[], rows?: unknown[], total?: number, skipOuterPagination?: boolean }} execResult
 * @param {{ exportAll?: boolean, page?: number, pageSize?: number }} listOpts
 */
function applyReportPagination(execResult, listOpts) {
  const columns = execResult.columns ?? [];
  const allRows = execResult.rows ?? [];
  const total = typeof execResult.total === "number" ? execResult.total : allRows.length;
  if (listOpts?.exportAll === true || execResult.skipOuterPagination === true) {
    return { columns, rows: allRows, total };
  }
  if (listOpts?.page != null && listOpts?.pageSize != null) {
    const page = Math.max(1, listOpts.page);
    const ps = Math.min(100, Math.max(1, listOpts.pageSize));
    const start = (page - 1) * ps;
    return { columns, rows: allRows.slice(start, start + ps), total };
  }
  return { columns, rows: allRows, total };
}

/**
 * @param {string} reportId
 * @param {Record<string, unknown>} filters
 * @param {import("express").Request|null} req
 * @param {{ exportAll?: boolean, page?: number, pageSize?: number }} [listOpts]
 */
export async function executeReportData(reportId, filters, req = null, listOpts = {}) {
  let result;
  switch (reportId) {
    case "mon-detalle-ofertas":
      result = await runMonDetalleOfertas(filters, req);
      break;
    case "mon-aplicaciones-ofertas":
      result = await runMonAplicacionesOfertas(filters, req);
      break;
    case "mon-resumen-legalizaciones-mtm":
      result = await runMonResumenLegalizaciones(filters, req);
      break;
    case "mon-detallado-legalizaciones":
      result = await runMonDetalladoLegalizaciones(filters, req);
      break;
    case "mon-daf-vinculacion":
      result = await runMonDafVinculacion(filters, req, listOpts);
      break;
    case "prac-detalle-oportunidades":
      result = await runPracDetalleOportunidades(filters, req);
      break;
    case "prac-entidades-contactos":
      result = await runPracEntidadesContactos(filters, req);
      break;
    case "prac-postulantes":
      result = await runPracPostulantes(filters, req);
      break;
    case "prac-cierre-oportunidades":
      result = await runPracCierreOportunidades(filters, req);
      break;
    case "prac-legalizacion-reporte-general":
      result = await runPracLegalizacionReporteGeneral(filters, req);
      break;
    case "prac-legalizacion-eval-seguimiento":
      result = await runPracLegalizacionEvalSeguimiento(filters, req);
      break;
    case "prac-estadisticos-general":
      result = await runPracEstadisticosGeneral(filters, req);
      break;
    default:
      result = emptyResult();
  }
  return applyReportPagination(result, listOpts);
}
