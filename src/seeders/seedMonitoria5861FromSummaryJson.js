/**
 * Migra a Mongo **solo** la cadena MTM descrita en el JSON del resumen (p. ej. legalización 5861).
 *
 * Fuente: archivo generado por summarizeMonitoriaMysqlByCodigo.js (incluye tablas crudas + vistaLegado).
 * Destino: mismas colecciones y forma que migrateOpportunitiesFromMySQL.js (OportunidadMTM, PostulacionMTM,
 * LegalizacionMTM, PlanDeTrabajoMTM, SeguimientoMTM, legacy_entity_mappings).
 *
 * Prerrequisitos en Mongo: Company, Items, Periodo, Programs, Attachments, DocumentMonitoringDefinitions,
 * Postulant (+ PostulantProfile), Users con mysqlId donde aplique — mismos datos que usaría el migrador grande.
 *
 * Uso:
 *   node src/seeders/seedMonitoria5861FromSummaryJson.js
 *   SEED_MONITORIA_JSON=./.migration-runs/monitoria-legal-5861.json node ...
 *
 * Opcional:
 *   SEED_MONITORIA_DRY_RUN=1 — solo valida y muestra el plan, sin escrituras.
 *
 * Idempotencia: actualiza/crea filas en legacy_entity_mappings (scope + legacyId). Si el documento Mongo ya
 * existía pero faltaba mapping, enlaza con updateOne upsert.
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import mongoose from "mongoose";
import connectDB from "../config/db.js";
import { connectMySQL, query as mysqlQuery, closePool as mysqlClosePool } from "../config/mysql.js";
import {
  comentariosFromMysqlActivityLogRow,
  documentoSoporteFromActivityLogRow,
} from "./mtmActivityLogSeguimiento.helpers.js";
import Company from "../modules/companies/company.model.js";
import Item from "../modules/shared/reference-data/models/item.schema.js";
import Attachment from "../modules/shared/attachment/attachment.schema.js";
import Periodo from "../modules/periodos/periodo.model.js";
import Program from "../modules/program/model/program.model.js";
import User from "../modules/users/user.model.js";
import Postulant from "../modules/postulants/models/postulants.schema.js";
import PostulantProfile from "../modules/postulants/models/profile/profile.schema.js";
import ProfileCv from "../modules/postulants/models/profile/profileCv.schema.js";
import DocumentMonitoringDefinition from "../modules/documentMonitoringDefinition/documentMonitoringDefinition.model.js";
import OportunidadMTM from "../modules/oportunidadesMTM/oportunidadMTM.model.js";
import PostulacionMTM from "../modules/oportunidadesMTM/postulacionMTM.model.js";
import LegalizacionMTM from "../modules/oportunidadesMTM/legalizacionMTM.model.js";
import PlanDeTrabajoMTM from "../modules/oportunidadesMTM/planDeTrabajoMTM.model.js";
import SeguimientoMTM from "../modules/oportunidadesMTM/seguimientoMTM.model.js";
import {
  mapMysqlChangeStatusMonitoringLegalizedToLegalizacionEstado,
  mapMysqlMonitoringPlanStatusToPlanTrabajoMtmEstado,
  mapMysqlLegalizacionDocumentoEstado,
  mapMysqlMonitoringActivityLogStatusToSeguimientoMtmEstado,
  mapMysqlOpportunityApplicationToPostulacionEstado,
  mapMysqlOpportunityTableStatusToMtmEstado,
  defaultEstadoSeguimientoMtmNuevo,
} from "./mysqlChangeStatusMappers.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const LEGACY_SCOPE = Object.freeze({
  MTM_OPPORTUNITY: "mtm_opportunity",
  MTM_APPLICATION: "mtm_application",
  MTM_LEGALIZATION: "mtm_legalization",
  MTM_PLAN: "mtm_plan",
  MTM_PLAN_SCHEDULE: "mtm_plan_schedule",
  MTM_ACTIVITY_LOG: "mtm_activity_log",
});

const SEED_TAG = "seed_monitoria_summary_json";

const legacyEntityMappingSchema = new mongoose.Schema(
  {
    scope: { type: String, required: true, index: true },
    legacyId: { type: Number, required: true, index: true },
    mongoId: { type: mongoose.Schema.Types.ObjectId, required: true },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);
legacyEntityMappingSchema.index({ scope: 1, legacyId: 1 }, { unique: true });
const LegacyEntityMapping =
  mongoose.models.LegacyEntityMapping ||
  mongoose.model("LegacyEntityMapping", legacyEntityMappingSchema, "legacy_entity_mappings");

function num(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function mtmNonNegativeNumberOrNull(raw) {
  if (raw == null || raw === "") return null;
  const n = num(raw);
  if (n == null || n < 0) return null;
  return n;
}

function str(v) {
  return v == null ? "" : String(v).trim();
}

function date(v) {
  if (v == null) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function bool(v) {
  if (v == null) return false;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (Buffer.isBuffer(v)) return v[0] === 1;
  const s = String(v).toLowerCase();
  return s === "1" || s === "true";
}

function token() {
  return crypto.randomBytes(24).toString("hex");
}

function mtmTextoMax250(raw) {
  const s = raw != null ? String(raw).trim() : "";
  if (!s) return null;
  if (s.length <= 250) return s;
  return `${s.slice(0, 247)}...`;
}

function strKey(s) {
  return String(s || "").trim().toLowerCase();
}

function dayKey(d) {
  if (!d) return "";
  const x = new Date(d);
  return Number.isNaN(x.getTime()) ? "" : x.toISOString().slice(0, 10);
}

function buildMTMOpportunityKey({ company, nombreCargo, periodo, fechaVencimiento }) {
  return [String(company || ""), strKey(nombreCargo), String(periodo || ""), dayKey(fechaVencimiento)].join("|");
}

function toMysqlMap(rows, keyField = "mysqlId") {
  return new Map(rows.map((r) => [num(r[keyField]), r]));
}

async function ensureUserEmailMap() {
  const users = await User.find({ email: { $exists: true, $ne: "" } }).select("_id email").lean();
  const m = new Map();
  for (const u of users) {
    const k = String(u.email || "").trim().toLowerCase();
    if (k) m.set(k, u._id);
  }
  return m;
}

function resolveUserIdFromCreatorEmail(userByEmailLower, emailRaw, defaultUserId = null) {
  const k = String(emailRaw || "").trim().toLowerCase();
  if (!k) return defaultUserId;
  return userByEmailLower.get(k) || defaultUserId;
}

async function upsertLegacyMapping(scope, legacyId, mongoId, metaExtra = {}) {
  await LegacyEntityMapping.updateOne(
    { scope, legacyId },
    {
      $set: {
        mongoId,
        meta: { ...metaExtra, seedTag: SEED_TAG, updatedAtSeed: new Date().toISOString() },
      },
    },
    { upsert: true }
  );
}

async function getMappedMongoId(scope, legacyId) {
  const row = await LegacyEntityMapping.findOne({ scope, legacyId }).select("mongoId").lean();
  return row?.mongoId || null;
}

function planUserLabel(usersByMysqlId, mysqlUserId) {
  const u = usersByMysqlId.get(num(mysqlUserId));
  if (!u) return "";
  return str(u.name) || str(u.email) || "";
}

export async function loadMonitoriaSummaryJson(jsonPath) {
  const raw = fs.readFileSync(jsonPath, "utf8");
  return JSON.parse(raw);
}

async function buildProfileIdForPostulant(postulantMongoId, postulantCvMysqlId, attachmentMap) {
  const att = postulantCvMysqlId != null ? attachmentMap.get(num(postulantCvMysqlId)) : null;
  if (att?._id) {
    const cv = await ProfileCv.findOne({ attachmentId: att._id }).select("profileId").lean();
    if (cv?.profileId) return cv.profileId;
  }
  const prof = await PostulantProfile.findOne({ postulantId: postulantMongoId })
    .sort({ _id: 1 })
    .select("_id")
    .lean();
  return prof?._id || null;
}

/**
 * @param {object} data - JSON parseado del resumen
 * @param {{ dryRun?: boolean }} opts
 */
export async function seedMonitoriaFromSummaryJson(data, opts = {}) {
  const dryRun = !!opts.dryRun;
  const meta = data.meta || {};
  const oppMysqlId = num(meta.study_working_id_opportunity_id);
  const legalMysqlId = num(meta.monitoring_legalized_id);
  if (!oppMysqlId || !legalMysqlId) {
    throw new Error("JSON sin meta.study_working_id_opportunity_id o monitoring_legalized_id");
  }

  const opportunity = data.opportunity;
  const sw = data.studyWorking;
  const apps = data.opportunityApplications || [];
  const bundle = (data.monitoringLegalizations || [])[0];
  if (!bundle?.monitoring_legalized) {
    throw new Error("monitoringLegalizations[0] no encontrado en el JSON");
  }
  const ml = bundle.monitoring_legalized;
  const appRow = apps[0];
  if (!appRow?.id) {
    throw new Error("opportunityApplications[0] sin id (MySQL opportunity_application)");
  }

  const vistaLeg = (data.vistaLegado?.legalizaciones || [])[0] || null;

  const companyMysql = num(opportunity?.company_id);
  const periodMysql = num(sw?.period_sw);
  const itemMysqlIds = new Set(
    [
      sw?.dedication_hours,
      sw?.remuneration_hour_per_week,
      sw?.contract_type,
      sw?.category,
      ml.eps,
      ml.account_type,
      ml.fin_bank,
      ml.category,
      ml.dedication_hours,
      ml.remuneration_hour_per_week,
    ].filter((x) => num(x) != null)
  );
  for (const log of bundle.monitoring_activity_log || []) {
    if (num(log.activity_type)) itemMysqlIds.add(num(log.activity_type));
  }

  const programMysqlIds = [...new Set((data.opportunityPrograms || []).map((p) => num(p.program_id)).filter(Boolean))];
  const docRows = bundle.document_monitoring || [];
  const defMysqlIds = [...new Set(docRows.map((d) => num(d.document_monitoring_definition_id)).filter(Boolean))];
  const attMysqlIds = [...new Set(docRows.map((d) => num(d.document_attached_id)).filter(Boolean))];
  for (const log of bundle.monitoring_activity_log || []) {
    if (num(log.first_attachment)) attMysqlIds.push(num(log.first_attachment));
    if (num(log.second_attachment)) attMysqlIds.push(num(log.second_attachment));
  }

  const userMysqlIds = new Set([num(ml.user_coordinator), num(ml.user_teacher)].filter(Boolean));
  for (const row of bundle.change_status_monitoring_legalized || []) {
    if (num(row.user_id)) userMysqlIds.add(num(row.user_id));
  }

  const [
    companies,
    items,
    periodos,
    programs,
    attachments,
    docDefs,
    usersMysql,
    postulantDoc,
  ] = await Promise.all([
    companyMysql ? Company.find({ mysqlId: companyMysql }).select("_id mysqlId").lean() : [],
    Item.find({ mysqlId: { $in: [...itemMysqlIds] } })
      .select("_id mysqlId value")
      .lean(),
    periodMysql ? Periodo.find({ mysqlId: periodMysql }).select("_id mysqlId").lean() : [],
    programMysqlIds.length
      ? Program.find({ mysqlId: { $in: programMysqlIds } }).select("_id mysqlId").lean()
      : [],
    attMysqlIds.length
      ? Attachment.find({ mysqlId: { $in: [...new Set(attMysqlIds)] } })
          .select("_id mysqlId name filepath")
          .lean()
      : [],
    defMysqlIds.length
      ? DocumentMonitoringDefinition.find({ mysqlId: { $in: defMysqlIds } }).select("_id mysqlId").lean()
      : [],
    userMysqlIds.size
      ? User.find({ mysqlId: { $in: [...userMysqlIds] } })
          .select("_id mysqlId name email")
          .lean()
      : [],
    Postulant.findOne({ mysqlId: num(ml.postulant_ml) }).select("_id mysqlId postulantId").lean(),
  ]);

  const companiesByMysqlId = toMysqlMap(companies);
  const itemsByMysqlId = toMysqlMap(items);
  const periodosByMysqlId = toMysqlMap(periodos);
  const programsByMysqlId = toMysqlMap(programs);
  const attachmentsByMysqlId = toMysqlMap(attachments);
  const docDefByMysqlId = toMysqlMap(docDefs);
  const usersByMysqlId = toMysqlMap(usersMysql);

  if (!postulantDoc?._id) {
    throw new Error(
      `No hay Postulant con mysqlId=${ml.postulant_ml}. Migre postulantes primero (migratePostulantsFromMySQL).`
    );
  }

  const userByEmailLower = await ensureUserEmailMap();

  const companyOid = companiesByMysqlId.get(companyMysql)?._id || null;
  const periodoOid = periodosByMysqlId.get(periodMysql)?._id || null;
  const fechaVencimiento = date(opportunity?.closing_offer_date);
  const naturalKey = buildMTMOpportunityKey({
    company: companyOid,
    nombreCargo: str(opportunity?.job_title) || "Monitoria sin nombre",
    periodo: periodoOid,
    fechaVencimiento,
  });

  const resultado = {
    dryRun,
    legacy: {
      opportunityMysqlId: oppMysqlId,
      applicationMysqlId: num(appRow.id),
      monitoringLegalizedMysqlId: legalMysqlId,
    },
    mongo: {},
    avisos: [],
  };

  const noteMissing = (msg) => resultado.avisos.push(msg);

  // —— Oportunidad MTM ——
  let oppMongoId = await getMappedMongoId(LEGACY_SCOPE.MTM_OPPORTUNITY, oppMysqlId);
  if (!oppMongoId) {
    const existing = await OportunidadMTM.findOne({
      company: companyOid || null,
      nombreCargo: str(opportunity?.job_title) || "Monitoria sin nombre",
      periodo: periodoOid || null,
      fechaVencimiento: fechaVencimiento || null,
    })
      .select("_id")
      .lean();
    if (existing?._id) oppMongoId = existing._id;
  }

  const oppPayload = {
    company: companyOid,
    nombreCargo: str(opportunity?.job_title) || "Monitoria sin nombre",
    dedicacionHoras: itemsByMysqlId.get(num(sw?.dedication_hours))?._id || null,
    valorPorHora: itemsByMysqlId.get(num(sw?.remuneration_hour_per_week))?._id || null,
    tipoVinculacion: itemsByMysqlId.get(num(sw?.contract_type))?._id || null,
    categoria: itemsByMysqlId.get(num(sw?.category))?._id || null,
    periodo: periodoOid,
    vacantes: num(opportunity?.number_of_vacants) || 1,
    fechaVencimiento,
    promedioMinimo: num(sw?.cumulative_average),
    nombreProfesor: str(sw?.teacher_responsable) || null,
    grupo: sw?.monitoring_group != null ? String(sw.monitoring_group) : null,
    limiteHoras: num(ml.hour_limit),
    funciones: mtmTextoMax250(opportunity?.functions),
    requisitos: mtmTextoMax250(opportunity?.additional_requirements),
    estado: mapMysqlOpportunityTableStatusToMtmEstado(opportunity?.status),
    creadoPor: resolveUserIdFromCreatorEmail(userByEmailLower, opportunity?.user_creator, null),
  };

  if (!oppMongoId && !dryRun) {
    const created = await OportunidadMTM.create(oppPayload);
    oppMongoId = created._id;
    await upsertLegacyMapping(LEGACY_SCOPE.MTM_OPPORTUNITY, oppMysqlId, oppMongoId, { naturalKey });
  } else if (oppMongoId && !dryRun) {
    await OportunidadMTM.updateOne({ _id: oppMongoId }, { $set: oppPayload });
    await upsertLegacyMapping(LEGACY_SCOPE.MTM_OPPORTUNITY, oppMysqlId, oppMongoId, { naturalKey });
  }

  resultado.mongo.oportunidadMTM = oppMongoId || "(dry-run)";

  // Programas de la oferta
  const programOids = [
    ...new Set(programMysqlIds.map((pid) => programsByMysqlId.get(pid)?._id).filter(Boolean)),
  ];
  if (programOids.length < programMysqlIds.length) {
    noteMissing(
      `Algunos program_mysql_id no tienen Program en Mongo (${programMysqlIds.length} vs ${programOids.length} resueltos).`
    );
  }
  if (oppMongoId && programOids.length && !dryRun) {
    await OportunidadMTM.updateOne({ _id: oppMongoId }, { $set: { programas: programOids } });
  }

  // —— Postulación MTM ——
  const appMysqlId = num(appRow.id);
  let postMongoId = await getMappedMongoId(LEGACY_SCOPE.MTM_APPLICATION, appMysqlId);
  if (!postMongoId) {
    const ex = await PostulacionMTM.findOne({
      oportunidadMTM: oppMongoId,
      postulant: postulantDoc._id,
    })
      .select("_id")
      .lean();
    if (ex?._id) postMongoId = ex._id;
  }

  const profileId = await buildProfileIdForPostulant(
    postulantDoc._id,
    num(appRow.postulant_cv),
    attachmentsByMysqlId
  );
  if (!profileId) {
    throw new Error(
      "No se pudo resolver PostulantProfile (ni por profile_cv ni primer perfil del postulante). Migre perfiles."
    );
  }

  const estadoPost = mapMysqlOpportunityApplicationToPostulacionEstado(appRow);
  const postPayload = {
    postulant: postulantDoc._id,
    oportunidadMTM: oppMongoId,
    postulantProfile: profileId,
    estado: estadoPost,
    fechaAplicacion: date(appRow.date_creation) || new Date(),
    empresaConsultoPerfilAt:
      bool(appRow.viewed) || bool(appRow.revisedCompany) ? date(appRow.date_creation) || new Date() : null,
    empresaDescargoHvAt: bool(appRow.downloaded) ? date(appRow.date_creation) || new Date() : null,
    seleccionadoAt: estadoPost === "seleccionado_empresa" ? date(appRow.date_creation) || new Date() : null,
    aceptadoEstudianteAt: estadoPost === "aceptado_estudiante" ? date(appRow.date_creation) || new Date() : null,
    rechazadoAt: estadoPost === "rechazado" ? date(appRow.date_creation) || new Date() : null,
    linkAsistenciaToken: token(),
  };

  if (!postMongoId && !dryRun) {
    const created = await PostulacionMTM.create(postPayload);
    postMongoId = created._id;
    await upsertLegacyMapping(LEGACY_SCOPE.MTM_APPLICATION, appMysqlId, postMongoId, {
      opportunityId: oppMysqlId,
      postulantId: num(ml.postulant_ml),
    });
  } else if (postMongoId && !dryRun) {
    const { linkAsistenciaToken: _t, ...rest } = postPayload;
    await PostulacionMTM.updateOne({ _id: postMongoId }, { $set: rest });
    await upsertLegacyMapping(LEGACY_SCOPE.MTM_APPLICATION, appMysqlId, postMongoId, {
      opportunityId: oppMysqlId,
      postulantId: num(ml.postulant_ml),
    });
  }

  resultado.mongo.postulacionMTM = postMongoId || "(dry-run)";

  // —— Legalización MTM ——
  let legMongoId = await getMappedMongoId(LEGACY_SCOPE.MTM_LEGALIZATION, legalMysqlId);
  if (!legMongoId) {
    const ex = await LegalizacionMTM.findOne({ postulacionMTM: postMongoId }).select("_id").lean();
    if (ex?._id) legMongoId = ex._id;
  }

  const documentos = {};
  for (const d of docRows) {
    const def = docDefByMysqlId.get(num(d.document_monitoring_definition_id));
    const att = attachmentsByMysqlId.get(num(d.document_attached_id));
    if (!def?._id || !att?._id) {
      noteMissing(
        `Documento monitoring def ${d.document_monitoring_definition_id} o adjunto ${d.document_attached_id} sin match en Mongo.`
      );
      continue;
    }
    documentos[String(def._id)] = {
      key: att.filepath || "",
      originalName: att.name || "",
      size: null,
      estadoDocumento: mapMysqlLegalizacionDocumentoEstado(d.document_status),
      motivoRechazo: null,
    };
  }

  const estadoLegal = mapMysqlChangeStatusMonitoringLegalizedToLegalizacionEstado(ml.status);
  const historial = [];
  for (const row of bundle.change_status_monitoring_legalized || []) {
    const despues = row.status_legalized_after != null ? str(row.status_legalized_after) : "";
    if (!despues) continue;
    const antes = row.status_legalized_before != null ? str(row.status_legalized_before) : "";
    historial.push({
      estadoAnterior:
        antes !== "" ? mapMysqlChangeStatusMonitoringLegalizedToLegalizacionEstado(antes) : null,
      estadoNuevo: mapMysqlChangeStatusMonitoringLegalizedToLegalizacionEstado(despues),
      usuario: usersByMysqlId.get(num(row.user_id))?._id || null,
      fecha: date(row.change_status_date) || new Date(),
      detalle: [str(row.change_status_observation), str(row.change_status_observation_document)]
        .filter(Boolean)
        .join(" | "),
      ip: null,
    });
  }
  if (!historial.length) {
    historial.push({
      estadoAnterior: null,
      estadoNuevo: estadoLegal,
      usuario: null,
      fecha: date(ml.date_creation) || new Date(),
      detalle: `Migrado desde JSON resumen · MySQL status: ${str(ml.status) || "—"}`,
      ip: null,
    });
  }

  const legPayload = {
    postulacionMTM: postMongoId,
    estado: estadoLegal,
    eps: itemsByMysqlId.get(num(ml.eps))?._id || null,
    tipoCuenta: itemsByMysqlId.get(num(ml.account_type))?._id || null,
    banco: itemsByMysqlId.get(num(ml.fin_bank))?._id || null,
    numeroCuenta: str(ml.fin_account_number),
    documentos,
    enviadoRevisionAt: date(ml.date_creation),
    aprobadoAt: estadoLegal === "aprobada" ? date(ml.date_approval_ml) || date(ml.date_creation) : null,
    historial,
  };

  if (!legMongoId && !dryRun) {
    const created = await LegalizacionMTM.create(legPayload);
    legMongoId = created._id;
    await upsertLegacyMapping(LEGACY_SCOPE.MTM_LEGALIZATION, legalMysqlId, legMongoId, {});
  } else if (legMongoId && !dryRun) {
    await LegalizacionMTM.updateOne({ _id: legMongoId }, { $set: legPayload });
    await upsertLegacyMapping(LEGACY_SCOPE.MTM_LEGALIZATION, legalMysqlId, legMongoId, {});
  }

  resultado.mongo.legalizacionMTM = legMongoId || "(dry-run)";

  // —— Plan de trabajo ——
  const planRow = (bundle.monitoring_planes || [])[0];
  let planMongoId = null;
  if (planRow) {
    const planMysqlId = num(planRow.id);
    planMongoId = await getMappedMongoId(LEGACY_SCOPE.MTM_PLAN, planMysqlId);
    if (!planMongoId) {
      const ex = await PlanDeTrabajoMTM.findOne({ postulacionMTM: postMongoId }).select("_id").lean();
      if (ex?._id) planMongoId = ex._id;
    }

    const actividades = (planRow.cronograma || []).map((s) => ({
      fecha: date(s.date) || date(s.date_creation) || new Date(),
      tema: str(s.monitoring_theme) || "",
      estrategiasMetodologias: [str(s.monitoring_strategies), str(s.monitoring_activities)].filter(Boolean).join("\n\n"),
    }));

    const estadoPlan = mapMysqlMonitoringPlanStatusToPlanTrabajoMtmEstado(planRow.status);
    const docApprovedAt = date(planRow.date_approved);

    const planPayload = {
      postulacionMTM: postMongoId,
      estado: estadoPlan,
      facultad: str(vistaLeg?.academicos?.facultad?.nombre) || "",
      programa: str(vistaLeg?.academicos?.programa?.nombre) || "",
      asignaturaArea: str(vistaLeg?.academicos?.asignatura?.nombre) || "",
      periodo: str(vistaLeg?.academicos?.periodoAcademico?.texto) || "",
      codigoMonitor: str(data.vistaLegado?.estudiante?.codigosEstudiante?.[0]) || "",
      nombreMonitor: str(data.vistaLegado?.estudiante?.nombreCompleto) || "",
      telefono: str(data.vistaLegado?.estudiante?.telefonoMovil) || "",
      correoInstitucional: str(data.vistaLegado?.estudiante?.correoInstitucional) || "",
      justificacion: str(planRow.summary) || "",
      habilidadesGenerales: str(planRow.general_skills) || "",
      habilidadesEspecificas: str(planRow.specific_skills) || "",
      observacionesPlan: str(planRow.observations) || "",
      objetivoGeneral: str(planRow.general_objective) || "",
      objetivosEspecificos: str(planRow.specific_objectives) || "",
      actividades,
      coordinadorMonitoria: planUserLabel(usersByMysqlId, ml.user_coordinator) || str(ml.responsable) || "",
      profesorResponsable:
        planUserLabel(usersByMysqlId, ml.user_teacher) || str(ml.mail_responsable) || str(ml.responsable) || "",
      enviadoRevisionAt: estadoPlan === "enviado_revision" ? date(planRow.date_creation) : null,
      aprobadoPorProfesorAt: docApprovedAt || (estadoPlan === "aprobado" ? date(planRow.date_creation) : null),
      rechazadoAt: estadoPlan === "rechazado" ? date(planRow.date_creation) : null,
    };

    if (!planMongoId && !dryRun) {
      const created = await PlanDeTrabajoMTM.create(planPayload);
      planMongoId = created._id;
      await upsertLegacyMapping(LEGACY_SCOPE.MTM_PLAN, planMysqlId, planMongoId, {});
    } else if (planMongoId && !dryRun) {
      await PlanDeTrabajoMTM.updateOne({ _id: planMongoId }, { $set: planPayload });
      await upsertLegacyMapping(LEGACY_SCOPE.MTM_PLAN, planMysqlId, planMongoId, {});
    }
  }

  resultado.mongo.planDeTrabajoMTM = planMongoId || null;

  // —— Cronograma plan → SeguimientoMTM (uno por fila schedule) ——
  if (planRow && !dryRun) {
    for (const s of planRow.cronograma || []) {
      const schedLegacyId = num(s.id);
      if (!schedLegacyId) continue;
      if (await getMappedMongoId(LEGACY_SCOPE.MTM_PLAN_SCHEDULE, schedLegacyId)) continue;
      const inserted = await SeguimientoMTM.create({
        postulacionMTM: postMongoId,
        tipoActividad: str(s.monitoring_theme) || "",
        fecha: date(s.date) || date(s.date_creation) || new Date(),
        comentarios: str(s.monitoring_activities) || "",
        descripcion: str(s.monitoring_strategies) || "",
        estado: defaultEstadoSeguimientoMtmNuevo,
        creadoPor: null,
        actualizadoPor: null,
      });
      await upsertLegacyMapping(LEGACY_SCOPE.MTM_PLAN_SCHEDULE, schedLegacyId, inserted._id, {});
    }
  }

  // —— Bitácora actividades (monitoring_activity_log) ——
  if (!dryRun) {
    const actLogs = bundle.monitoring_activity_log || [];
    const needAtt = new Set();
    for (const row of actLogs) {
      const a1 = num(row.first_attachment);
      const a2 = num(row.second_attachment);
      if (a1 && !attachmentsByMysqlId.get(a1)) needAtt.add(a1);
      if (a2 && !attachmentsByMysqlId.get(a2)) needAtt.add(a2);
    }
    const needArr = [...needAtt];
    const sqlAttachmentByMysqlId = new Map();
    if (needArr.length > 0) {
      try {
        await connectMySQL();
        const ph = needArr.map(() => "?").join(",");
        const rowsSql = await mysqlQuery(`SELECT id, name, filepath FROM attachment WHERE id IN (${ph})`, needArr);
        for (const ar of rowsSql || []) {
          const aid = num(ar.id);
          if (aid)
            sqlAttachmentByMysqlId.set(aid, {
              filepath: str(ar.filepath),
              name: ar.name != null ? str(ar.name) : "",
            });
        }
      } catch (e) {
        noteMissing(`No se pudieron leer adjuntos MySQL para activity_log: ${e.message}`);
      }
    }

    for (const row of actLogs) {
      const logLegacyId = num(row.activity_log_id);
      if (!logLegacyId) continue;

      const tipoItem = itemsByMysqlId.get(num(row.activity_type));
      const tipoActividad = str(tipoItem?.value) || "Actividad monitoría (legado)";
      const estadoSeg = mapMysqlMonitoringActivityLogStatusToSeguimientoMtmEstado(row.status);
      const comentarios = comentariosFromMysqlActivityLogRow(row);
      const documentoSoporte = documentoSoporteFromActivityLogRow(
        attachmentsByMysqlId,
        row,
        sqlAttachmentByMysqlId
      );

      const dApr = date(row.date_approved_activity);
      const segPayload = {
        postulacionMTM: postMongoId,
        tipoActividad,
        fecha: date(row.activity_date) || date(row.date_creation) || new Date(),
        numeroEstudiantesConvocados: mtmNonNegativeNumberOrNull(row.called_student_count),
        numeroEstudiantesAtendidos: mtmNonNegativeNumberOrNull(row.student_count),
        cantidadHoras: mtmNonNegativeNumberOrNull(row.hour_count),
        comentarios,
        descripcion: null,
        documentoSoporte,
        estado: estadoSeg,
        aprobadoAt: estadoSeg === "aprobado" ? dApr || date(row.date_creation) : null,
      };

      const existingSegId = await getMappedMongoId(LEGACY_SCOPE.MTM_ACTIVITY_LOG, logLegacyId);
      if (existingSegId) {
        await SeguimientoMTM.updateOne({ _id: existingSegId }, { $set: segPayload });
      } else {
        const inserted = await SeguimientoMTM.create({
          ...segPayload,
          creadoPor: null,
          actualizadoPor: null,
        });
        await upsertLegacyMapping(LEGACY_SCOPE.MTM_ACTIVITY_LOG, logLegacyId, inserted._id, {});
      }
    }
  }

  const segCount = dryRun
    ? null
    : await SeguimientoMTM.countDocuments({ postulacionMTM: postMongoId });
  resultado.mongo.seguimientosMTMCount = segCount;

  return resultado;
}

async function main() {
  const jsonPath = path.isAbsolute(process.env.SEED_MONITORIA_JSON || "")
    ? process.env.SEED_MONITORIA_JSON
    : path.resolve(process.cwd(), process.env.SEED_MONITORIA_JSON || ".migration-runs/monitoria-legal-5861.json");

  if (!fs.existsSync(jsonPath)) {
    console.error(`No existe el JSON: ${jsonPath}`);
    process.exit(1);
  }

  const dryRun = process.env.SEED_MONITORIA_DRY_RUN === "1";
  console.log(`[seed-monitoria-json] JSON: ${jsonPath} dryRun=${dryRun}`);

  await connectDB();
  try {
    const data = await loadMonitoriaSummaryJson(jsonPath);
    const out = await seedMonitoriaFromSummaryJson(data, { dryRun });
    console.log(JSON.stringify(out, null, 2));
    if (!dryRun) {
      console.error(
        "\n[seed-monitoria-json] Listo. Compare en Mongo con el JSON (vistaLegado + tablas) y con JoinUp legado."
      );
    }
  } finally {
    await mongoose.connection.close();
    console.error("[seed-monitoria-json] Conexión Mongo cerrada.");
    try {
      await mysqlClosePool();
    } catch {
      /* pool no iniciado */
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
