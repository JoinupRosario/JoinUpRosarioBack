/**
 * Migración integral de oportunidades (prácticas + MTM) desde MySQL a MongoDB.
 *
 * Alcance (tablas MySQL — fuente canónica en tenant-1 / rosarioactualizado.sql):
 * - opportunity
 * - academic_practice
 * - opportunity_programs
 * - opportunity_language
 * - academic_practice_opportunity_language
 * - opportunity_application  (~25k filas en dump; PK id, uuid único)
 * - academic_practice_legalized
 * - document_practice
 * - study_working
 * - monitoring_legalized
 * - document_monitoring
 * - monitoring_plan
 * - monitoring_plan_schedule
 *
 * Archivo opcional de filas MySQL (auditoría / respaldo, no sustituye colecciones de negocio):
 * - Fase 11 opcional (**desactivada por defecto**): si `MIGRATION_MYSQL_DOMAIN_ARCHIVE=1`, copia filas de
 *   las tablas listadas en `OPPORTUNITY_MYSQL_ARCHIVE_TABLES` a `legacy_mysql_opportunity_domain` (solo
 *   tablas que el propio pipeline usa para entidades de negocio; sin dashboards ni vistas materializadas).
 * - Compatibilidad: `MIGRATION_SKIP_MYSQL_DOMAIN_ARCHIVE=0` también activa el archivo (mismo efecto que
 *   `MIGRATION_MYSQL_DOMAIN_ARCHIVE=1`).
 *
 * Alineación verificada con tenant-1 en rosarioactualizado.sql:
 * - opportunity / academic_practice / opportunity_application / study_working / academic_practice_legalized /
 *   document_practice / monitoring_legalized / document_monitoring / monitoring_plan / monitoring_plan_schedule.
 * - MTM: `opportunity` + LEFT JOIN `study_working` (misma PK que opportunity.id) para no perder filas si falta sw.
 * - Práctica: LEFT JOIN `academic_practice`; horas semanales: `ordinary_weekly_session` o, si es NULL, `dedication_hours`.
 *
 * Colecciones Mongo destino:
 * - opportunities (Opportunity)
 * - postulaciones_oportunidad (PostulacionOportunidad)
 * - legalizaciones_practica (LegalizacionPractica)
 * - oportunidadmtms (OportunidadMTM)
 * - postulaciones_mtm (PostulacionMTM)
 * - legalizaciones_mtm (LegalizacionMTM)
 * - planes_trabajo_mtm (PlanDeTrabajoMTM)
 * - seguimientos_mtm (SeguimientoMTM)
 * - legacy_entity_mappings (mapeo legacyId MySQL → ObjectId; idempotencia por scope)
 * - legacy_mysql_opportunity_domain (opt-in `MIGRATION_MYSQL_DOMAIN_ARCHIVE=1`; subconjunto mínimo alineado al pipeline)
 * - opportunity_status_change_logs (OpportunityStatusChangeLog): filas de change_status_opportunity + snapshot si aplica
 *
 * Estados canónicos en Mongo: única fuente `src/constants/domainEstados.js` (mismos arrays que `enum` en modelos).
 *
 * ── Tablas MySQL donde pueden existir VARIAS filas que en Mongo deben colapsar a UNA entidad
 *    (índice único en destino o misma clave natural). El script deduplica por lote + mapea
 *    legacyIds extra en legacy_entity_mappings:
 *
 * | MySQL                         | Colección Mongo              | Restricción / clave        |
 * |-------------------------------|------------------------------|----------------------------|
 * | opportunity (+ academic_*)    | opportunities / oportunidadmtms | Clave natural negocio  |
 * | opportunity_application       | postulaciones_*              | único (opp, postulante)  |
 * | academic_practice_legalized   | legalizaciones_practica      | único postulacionOportunidad |
 * | monitoring_legalized          | legalizaciones_mtm           | único postulacionMTM       |
 * | monitoring_plan               | planes_trabajo_mtm           | único postulacionMTM       |
 *
 * Tablas con N:1 hacia un solo documento pero sin riesgo E11000 (solo enriquecen o anidan):
 * - opportunity_programs, opportunity_language + academic_practice_opportunity_language → $set en Opportunity/MTM
 * - document_practice → objeto documentos dentro de una LegalizacionPractica
 * - document_monitoring → objeto documentos dentro de una LegalizacionMTM
 * - monitoring_plan_schedule → muchos SeguimientoMTM (sin índice único que impida varias filas)
 *
 * Empalme con producción (sin “normalizar” encima de lo existente):
 * - reconcileExistingMappings() arma claves naturales en memoria desde Mongo ya guardado y solo
 *   registra en legacy_entity_mappings / salta creación si ya existe equivalencia.
 * - No ejecuta updates masivos sobre oportunidades o postulaciones ya existentes.
 *
 * Notas:
 * - Como algunos esquemas destino no tienen mysqlId, se usa la colección
 *   legacy_entity_mappings para idempotencia y trazabilidad.
 * - Este script asume que ya se migraron catálogos base:
 *   companies, postulants, postulant_profiles, items, periodos, programs,
 *   attachments, document_practice_definitions, document_monitoring_definitions.
 *
 * Ejecutar (migración completa, sin tope MySQL por defecto):
 * node src/seeders/migrateOpportunitiesFromMySQL.js
 * npm run migrate:opportunities
 *
 * Opcional — prueba acotada: MIGRATION_MYSQL_ROW_LIMIT=N (0 = sin límite, por defecto).
 * Opcional — últimas N oportunidades por id: MIGRATION_RECENT_OPPORTUNITIES_FIRST=1 (requiere N>0).
 * Opcional — foco por ids MySQL: MIGRATION_FOCUS_PRACTICE_OPP_IDS=1,2,3 y/o MIGRATION_FOCUS_MTM_OPP_IDS=4,5
 *   (encadena postulaciones, legalizaciones, planes y cronograma solo para esos opportunity.id).
 * Opcional — saltar ramas: MIGRATION_SKIP_PRACTICE_OPPORTUNITIES_PIPELINE=1 / MIGRATION_SKIP_MTM_OPPORTUNITIES_PIPELINE=1
 * Opcional — no rellenar historialEstados desde change_status_opportunity ni el backfill desde opportunity.status:
 *   MIGRATION_SKIP_OPPORTUNITY_STATUS_HISTORY=1
 * Tras change_status_opportunity, las ofertas sin historial reciben una entrada inicial desde opportunity.status
 * (misma fuente que el campo estado al crear la oferta), para que toda oportunidad migrada tenga historial en Mongo.
 * Opcional — no volcar historial detallado legado (legalizaciones, plan práctica, programas, aprobaciones doc. MTM):
 *   MIGRATION_SKIP_LEGACY_DETAILED_HISTORY=1
 * Opcional — archivo fila-a-fila MySQL: MIGRATION_MYSQL_DOMAIN_ARCHIVE=1 (por defecto no se ejecuta)
 * Muestra con legalización en MySQL: node src/seeders/migrateOpportunitiesSampleConLegalizacion.js
 *
 * Logs (consola):
 * - Cada fase escribe líneas con prefijo [ISO] [migrate-opportunities].
 * - Al terminar: RESULTADO en stderr (línea única) para que se vea aunque stdout sea solo JSON.
 * - MIGRATION_LOG_FILE=ruta/migracion.log — append de esas mismas líneas (útil en Windows/IDE).
 *
 * Si MongoDB devuelve error de cuota (p. ej. "over your space quota, 512 MB"): el cluster está lleno;
 * sube de tier en Atlas, borra datos de prueba, o apunta MONGO_URI a un servidor con espacio (local/Docker).
 *
 * Reintentos Mongo (cortes DNS/red con Atlas), opcional:
 * - MIGRATION_MONGO_RETRIES (default 8)
 * - MIGRATION_MONGO_RETRY_BASE_MS (default 2500)
 */

import crypto from "crypto";
import fs from "fs";
import dotenv from "dotenv";
import mongoose from "mongoose";
import connectDB from "../config/db.js";
import { connectMySQL, query, closePool } from "../config/mysql.js";

import Opportunity from "../modules/opportunities/opportunity.model.js";
import OpportunityStatusChangeLog from "../modules/opportunities/opportunityStatusChangeLog.model.js";
import PostulacionOportunidad from "../modules/opportunities/postulacionOportunidad.model.js";
import LegalizacionPractica from "../modules/legalizacionPractica/legalizacionPractica.model.js";

import OportunidadMTM from "../modules/oportunidadesMTM/oportunidadMTM.model.js";
import PostulacionMTM from "../modules/oportunidadesMTM/postulacionMTM.model.js";
import LegalizacionMTM from "../modules/oportunidadesMTM/legalizacionMTM.model.js";
import PlanDeTrabajoMTM from "../modules/oportunidadesMTM/planDeTrabajoMTM.model.js";
import SeguimientoMTM from "../modules/oportunidadesMTM/seguimientoMTM.model.js";

import Company from "../modules/companies/company.model.js";
import Item from "../modules/shared/reference-data/models/item.schema.js";
import Periodo from "../modules/periodos/periodo.model.js";
import Country from "../modules/shared/location/models/country.schema.js";
import City from "../modules/shared/location/models/city.schema.js";
import Program from "../modules/program/model/program.model.js";
import Postulant from "../modules/postulants/models/postulants.schema.js";
import PostulantProfile from "../modules/postulants/models/profile/profile.schema.js";
import ProfileCv from "../modules/postulants/models/profile/profileCv.schema.js";
import Attachment from "../modules/shared/attachment/attachment.schema.js";
import User from "../modules/users/user.model.js";
import DocumentPracticeDefinition from "../modules/documentPracticeDefinition/documentPracticeDefinition.model.js";
import DocumentMonitoringDefinition from "../modules/documentMonitoringDefinition/documentMonitoringDefinition.model.js";

import {
  clampPracticeOpportunityEstado,
  clampOportunidadMtmEstado,
  clampLegalizacionEstado,
  clampPostulacionEstado,
  clampPlanTrabajoMtmEstado,
  clampDocEstadoDocumento,
  clampSeguimientoMtmEstado,
} from "../constants/domainEstados.js";

dotenv.config();

const LEGACY_SCOPE = Object.freeze({
  PRACTICE_OPPORTUNITY: "practice_opportunity",
  MTM_OPPORTUNITY: "mtm_opportunity",
  PRACTICE_APPLICATION: "practice_application",
  MTM_APPLICATION: "mtm_application",
  PRACTICE_LEGALIZATION: "practice_legalization",
  MTM_LEGALIZATION: "mtm_legalization",
  MTM_PLAN: "mtm_plan",
  MTM_PLAN_SCHEDULE: "mtm_plan_schedule",
});

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
const LegacyEntityMapping = mongoose.model(
  "LegacyEntityMapping",
  legacyEntityMappingSchema,
  "legacy_entity_mappings"
);

/** Copia 1:1 de filas MySQL; no sustituye entidades normalizadas. Solo corre si se activa explícitamente. */
const MYSQL_ARCHIVE_DOMAIN = "opportunity_pipeline_v1";
const RUN_MYSQL_DOMAIN_ARCHIVE =
  process.env.MIGRATION_MYSQL_DOMAIN_ARCHIVE === "1" ||
  process.env.MIGRATION_SKIP_MYSQL_DOMAIN_ARCHIVE === "0";

const legacyMysqlOpportunityDomainSchema = new mongoose.Schema(
  {
    domain: { type: String, required: true, index: true },
    tableName: { type: String, required: true, index: true },
    /** Clave estable dentro de la tabla (PK compuesta unida con |, o sha256 con prefijo h:). */
    pk: { type: String, required: true },
    row: { type: mongoose.Schema.Types.Mixed, required: true },
    opportunityMysqlId: { type: Number, default: null, index: true },
    opportunityApplicationMysqlId: { type: Number, default: null, index: true },
    postulantMysqlId: { type: Number, default: null, index: true },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);
legacyMysqlOpportunityDomainSchema.index(
  { domain: 1, tableName: 1, pk: 1 },
  { unique: true }
);
const LegacyMysqlOpportunityDomain = mongoose.model(
  "LegacyMysqlOpportunityDomain",
  legacyMysqlOpportunityDomainSchema,
  "legacy_mysql_opportunity_domain"
);

/**
 * Tablas MySQL volcadas a `legacy_mysql_opportunity_domain` **solo** si `MIGRATION_MYSQL_DOMAIN_ARCHIVE=1`.
 * Subconjunto estricto de lo que este script ya transforma a Mongo (sin dashboards, trazas, aprobaciones
 * sueltas, `document_practice_def_program`, etc.; esas definiciones viven en `document_practice_definitions`).
 *
 * pk: columnas de PK (orden importa). oppCols / appCols / postCols: columnas para índices de consulta.
 */
const OPPORTUNITY_MYSQL_ARCHIVE_TABLES = Object.freeze([
  { table: "opportunity", pk: ["id"], oppCols: ["id"] },
  { table: "academic_practice", pk: ["academic_practice_id"], oppCols: ["academic_practice_id"] },
  { table: "study_working", pk: ["study_working_id"], oppCols: ["study_working_id"] },
  { table: "opportunity_application", pk: ["id"], oppCols: ["opportunity_id"], appCols: ["id"], postCols: ["postulant_id"] },
  { table: "opportunity_programs", pk: ["opportunity_id", "program_id"], oppCols: ["opportunity_id"] },
  { table: "opportunity_language", pk: ["id"], oppCols: [] },
  { table: "academic_practice_opportunity_language", pk: ["academic_practice_id", "opportunity_language_id"], oppCols: ["academic_practice_id"] },
  { table: "academic_practice_legalized", pk: ["academic_practice_legalized_id"], oppCols: ["academic_practice_id"], postCols: ["postulant_apl"] },
  { table: "document_practice", pk: ["document_practice_definition_id", "academic_practice_legalized_id"], oppCols: [] },
  { table: "change_status_opportunity", pk: ["id"], oppCols: ["opportunity_id"] },
  { table: "monitoring_legalized", pk: ["monitoring_legalized_id"], oppCols: ["study_working_id"], postCols: ["postulant_ml"] },
  { table: "document_monitoring", pk: ["document_monitoring_definition_id", "monitoring_legalized_id"], oppCols: [] },
  { table: "monitoring_plan", pk: ["id"], oppCols: ["study_working_id"], postCols: ["postulant_id"] },
  { table: "monitoring_plan_schedule", pk: ["id"], oppCols: [] },
]);

const BATCH_SIZE = Number(process.env.MIGRATION_BATCH_SIZE || 500);
/** Tamaño de cada `insertMany` / `bulkWrite` hacia Mongo (puede ser mayor que BATCH_SIZE). */
const MONGO_WRITE_BATCH = Number(process.env.MIGRATION_MONGO_WRITE_BATCH || 1000);
const MYSQL_PAGE_SIZE = Number(process.env.MIGRATION_MYSQL_PAGE_SIZE || 2000);
const INTER_BATCH_SLEEP_MS = Number(process.env.MIGRATION_INTER_BATCH_SLEEP_MS || 75);
const MONGO_RETRIES = Number(process.env.MIGRATION_MONGO_RETRIES || 8);
const MONGO_RETRY_BASE_MS = Number(process.env.MIGRATION_MONGO_RETRY_BASE_MS || 2500);
const RUN_ID = `${new Date().toISOString()}__${crypto.randomBytes(4).toString("hex")}`;

/**
 * Tope de filas por consulta MySQL. 0 = sin límite (migración completa por defecto).
 */
const MIGRATION_MYSQL_ROW_LIMIT = (() => {
  const v = process.env.MIGRATION_MYSQL_ROW_LIMIT;
  if (v === undefined || v === "") return 0;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
})();

/** Últimas N oportunidades por id MySQL y datos hijos filtrados a esos ids (solo con N>0). */
const MIGRATION_RECENT_OPPORTUNITIES_FIRST =
  process.env.MIGRATION_RECENT_OPPORTUNITIES_FIRST === "1" && MIGRATION_MYSQL_ROW_LIMIT > 0;

function parseFocusOppIds(envVal) {
  if (envVal == null || String(envVal).trim() === "") return null;
  const ids = String(envVal)
    .split(/[,;\s]+/)
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0);
  const uniq = [...new Set(ids)];
  return uniq.length ? uniq : null;
}

/** Lista explícita de opportunity.id MySQL (práctica / MTM); prioridad sobre MIGRATION_RECENT_*. */
const FOCUS_PRACTICE_OPP_IDS = parseFocusOppIds(process.env.MIGRATION_FOCUS_PRACTICE_OPP_IDS);
const FOCUS_MTM_OPP_IDS = parseFocusOppIds(process.env.MIGRATION_FOCUS_MTM_OPP_IDS);

const SKIP_PRACTICE_OPPORTUNITIES_PIPELINE = process.env.MIGRATION_SKIP_PRACTICE_OPPORTUNITIES_PIPELINE === "1";
const SKIP_MTM_OPPORTUNITIES_PIPELINE = process.env.MIGRATION_SKIP_MTM_OPPORTUNITIES_PIPELINE === "1";
const SKIP_OPPORTUNITY_STATUS_HISTORY = process.env.MIGRATION_SKIP_OPPORTUNITY_STATUS_HISTORY === "1";
const SKIP_LEGACY_DETAILED_HISTORY = process.env.MIGRATION_SKIP_LEGACY_DETAILED_HISTORY === "1";

/** Añade LIMIT a un SELECT cuando MIGRATION_MYSQL_ROW_LIMIT > 0. */
function limitSql(sql) {
  if (!MIGRATION_MYSQL_ROW_LIMIT) return sql;
  const s = String(sql).trim().replace(/;\s*$/i, "");
  return `${s}\n    LIMIT ${MIGRATION_MYSQL_ROW_LIMIT}`;
}

/** Varias versiones de MySQL no permiten IN (SELECT … LIMIT n); se usa tabla derivada intermedia. */
function practiceRecentOppIdsSubquery() {
  const n = MIGRATION_MYSQL_ROW_LIMIT;
  return `(SELECT id FROM (SELECT id FROM opportunity WHERE opportunity_type = 'ACADEMIC_PRACTICE' ORDER BY id DESC LIMIT ${n}) AS _mq_pr_opp)`;
}

function mtmRecentOppIdsSubquery() {
  const n = MIGRATION_MYSQL_ROW_LIMIT;
  return `(SELECT id FROM (SELECT id FROM opportunity WHERE opportunity_type <> 'ACADEMIC_PRACTICE' ORDER BY id DESC LIMIT ${n}) AS _mq_mtm_opp)`;
}

function practiceOppOrderBySql() {
  if (FOCUS_PRACTICE_OPP_IDS?.length || MIGRATION_RECENT_OPPORTUNITIES_FIRST) return "ORDER BY o.id DESC";
  return "ORDER BY o.id ASC";
}

function mtmOppOrderBySql() {
  if (FOCUS_MTM_OPP_IDS?.length || MIGRATION_RECENT_OPPORTUNITIES_FIRST) return "ORDER BY o.id DESC";
  return "ORDER BY o.id ASC";
}

function sqlPracticeOppIdsInExpr() {
  if (FOCUS_PRACTICE_OPP_IDS?.length) return `(${FOCUS_PRACTICE_OPP_IDS.join(",")})`;
  if (MIGRATION_RECENT_OPPORTUNITIES_FIRST) return practiceRecentOppIdsSubquery();
  return null;
}

function sqlMtmOppIdsInExpr() {
  if (FOCUS_MTM_OPP_IDS?.length) return `(${FOCUS_MTM_OPP_IDS.join(",")})`;
  if (MIGRATION_RECENT_OPPORTUNITIES_FIRST) return mtmRecentOppIdsSubquery();
  return null;
}

function sqlFilterPracticeApplicationsByOppScope() {
  const ex = sqlPracticeOppIdsInExpr();
  if (!ex) return "";
  return `AND oa.opportunity_id IN ${ex}`;
}

function sqlFilterMtmApplicationsByOppScope() {
  const ex = sqlMtmOppIdsInExpr();
  if (!ex) return "";
  return `AND oa.opportunity_id IN ${ex}`;
}

function limitSqlUnlessPracticeScoped(sql) {
  if (MIGRATION_RECENT_OPPORTUNITIES_FIRST || sqlPracticeOppIdsInExpr()) {
    return String(sql).trim().replace(/;\s*$/i, "");
  }
  return limitSql(sql);
}

function limitSqlUnlessMtmScoped(sql) {
  if (MIGRATION_RECENT_OPPORTUNITIES_FIRST || sqlMtmOppIdsInExpr()) {
    return String(sql).trim().replace(/;\s*$/i, "");
  }
  return limitSql(sql);
}

function limitSqlPracticeOppMain(sql) {
  if (FOCUS_PRACTICE_OPP_IDS?.length) return String(sql).trim().replace(/;\s*$/i, "");
  return limitSql(sql);
}

function limitSqlMtmOppMain(sql) {
  if (FOCUS_MTM_OPP_IDS?.length) return String(sql).trim().replace(/;\s*$/i, "");
  return limitSql(sql);
}

function limitSqlPracticeLegalChain(sql) {
  if (sqlPracticeOppIdsInExpr()) return String(sql).trim().replace(/;\s*$/i, "");
  return limitSql(sql);
}

function limitSqlMtmLegalChain(sql) {
  if (sqlMtmOppIdsInExpr()) return String(sql).trim().replace(/;\s*$/i, "");
  return limitSql(sql);
}

/**
 * Traza visible en consola y opcionalmente en archivo (MIGRATION_LOG_FILE).
 * useStderr: línea en stderr (p. ej. resultado final) por si algo consume solo stdout.
 */
function migrationLog(msg, { useStderr = false } = {}) {
  const line = `[${new Date().toISOString()}] [migrate-opportunities] ${msg}`;
  if (useStderr) console.error(line);
  else console.log(line);
  const path = process.env.MIGRATION_LOG_FILE;
  if (path) {
    try {
      fs.appendFileSync(path, `${line}\n`, "utf8");
    } catch (e) {
      console.error(`[migrate-opportunities] No se pudo escribir MIGRATION_LOG_FILE (${path}): ${e.message}`);
    }
  }
}

function isTransientMongoError(err) {
  if (!err) return false;
  const n = err.name || "";
  if (n === "MongoServerSelectionError" || n === "MongoNetworkError") return true;
  const msg = String(err.message || "");
  if (
    /ENOTFOUND|ETIMEDOUT|ECONNRESET|EAI_AGAIN|getaddrinfo|socket hang up|ReplicaSetNoPrimary|not primary|connection .* closed|timed out/i.test(
      msg
    )
  ) {
    return true;
  }
  if (err.errorLabels && typeof err.errorLabels.has === "function" && err.errorLabels.has("ResetPool")) {
    return true;
  }
  return false;
}

/** Cuota de almacenamiento del cluster (p. ej. Atlas M0 = 512 MB). No se soluciona reintentando. */
function isMongoStorageQuotaError(err) {
  const msg = String(err?.message || err?.errmsg || "");
  return /space quota|storage quota|over your space quota|quota.*exceeded|disk.*full/i.test(msg);
}

/**
 * Reintenta operaciones Mongo ante cortes DNS/red típicos de Atlas o Wi‑Fi inestable.
 */
async function withMongoRetry(label, fn) {
  let last;
  for (let attempt = 1; attempt <= MONGO_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (!isTransientMongoError(e) || attempt === MONGO_RETRIES) throw e;
      const wait = MONGO_RETRY_BASE_MS * 2 ** (attempt - 1);
      console.warn(
        `⚠️  Mongo (transitorio) [${label}] intento ${attempt}/${MONGO_RETRIES}, espero ${wait}ms: ${e.message}`
      );
      await sleep(Math.min(wait, 120_000));
    }
  }
  throw last;
}

const runQuery = (sql, params = []) =>
  query(sql, params).catch((err) => {
    if (err.message?.includes("doesn't exist") || err.code === "ER_NO_SUCH_TABLE") return [];
    throw err;
  });

function num(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function str(v) {
  return v == null ? null : String(v).trim();
}

/** Opportunity (práctica) exige minlength 60 en `funciones` (opportunity.model.js). */
const MIN_FUNCIONES_PRACTICA = 60;
function practicaFuncionesFromLegacy(raw) {
  const t = raw != null ? String(raw).trim() : "";
  if (t.length >= MIN_FUNCIONES_PRACTICA) return t;
  const prefijo =
    "[Migración] Funciones ausentes o texto corto en MySQL; la plataforma exige al menos 60 caracteres. ";
  const out = t ? `${prefijo}Origen: ${t}` : `${prefijo}Campo functions vacío en origen.`;
  return out.length >= MIN_FUNCIONES_PRACTICA ? out : out.padEnd(MIN_FUNCIONES_PRACTICA, ".");
}

/** OportunidadMTM: funciones/requisitos maxlength 250. */
function mtmTextoMax250(raw) {
  const s = raw != null ? String(raw).trim() : "";
  if (!s) return null;
  if (s.length <= 250) return s;
  return `${s.slice(0, 247)}...`;
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

function chunk(arr, size = BATCH_SIZE) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function forEachChunked(rows, fn, label = "batch") {
  const groups = chunk(rows, BATCH_SIZE);
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    for (const row of g) {
      await fn(row);
    }
    if (INTER_BATCH_SLEEP_MS > 0) await sleep(INTER_BATCH_SLEEP_MS);
    if ((i + 1) % 10 === 0) {
      console.log(`   ${label}: ${Math.min((i + 1) * BATCH_SIZE, rows.length)}/${rows.length}`);
    }
  }
}

async function queryPaged(baseSql, onRows) {
  const maxTotal = MIGRATION_MYSQL_ROW_LIMIT > 0 ? MIGRATION_MYSQL_ROW_LIMIT : null;
  const base = String(baseSql).trim().replace(/;\s*$/i, "");
  let offset = 0;
  let totalProcessed = 0;
  while (true) {
    const pageSize =
      maxTotal != null ? Math.min(MYSQL_PAGE_SIZE, maxTotal - totalProcessed) : MYSQL_PAGE_SIZE;
    if (pageSize <= 0) break;
    const sql = `${base} LIMIT ${pageSize} OFFSET ${offset}`;
    const rows = await runQuery(sql);
    if (!rows.length) break;
    await onRows(rows, offset);
    const n = rows.length;
    totalProcessed += n;
    offset += n;
    if (maxTotal != null && totalProcessed >= maxTotal) break;
    if (n < pageSize) break;
    if (INTER_BATCH_SLEEP_MS > 0) await sleep(INTER_BATCH_SLEEP_MS);
  }
}

/** Lee columna MySQL con nombre case-insensitive (mysql2 suele devolver minúsculas). */
function getRowCol(row, col) {
  if (row == null || col == null) return undefined;
  if (Object.prototype.hasOwnProperty.call(row, col)) return row[col];
  const target = String(col).toLowerCase();
  for (const k of Object.keys(row)) {
    if (k.toLowerCase() === target) return row[k];
  }
  return undefined;
}

function serializeMysqlCellForArchive(v) {
  if (v == null) return null;
  if (Buffer.isBuffer(v)) {
    return { __mysqlType: "Buffer", base64: v.toString("base64") };
  }
  if (v instanceof Date) return { __mysqlType: "Date", iso: v.toISOString() };
  if (typeof v === "bigint") return { __mysqlType: "BigInt", s: v.toString() };
  return v;
}

function buildArchiveRowPayload(row) {
  const out = {};
  for (const k of Object.keys(row).sort()) {
    out[k] = serializeMysqlCellForArchive(row[k]);
  }
  return out;
}

function computeArchivePk(spec, row) {
  if (spec.hashPk) {
    const payload = buildArchiveRowPayload(row);
    const h = crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
    return `h:${h}`;
  }
  return spec.pk.map((c) => String(getRowCol(row, c) ?? "")).join("|");
}

/** Primer entero > 0 entre columnas indicadas (p. ej. opportunity.id, postulant_id). */
function firstPositiveNumFromCols(row, cols) {
  if (!cols?.length) return null;
  for (const c of cols) {
    const v = num(getRowCol(row, c));
    if (v != null && v > 0) return v;
  }
  return null;
}

/** id de aplicación u otras FK que pueden ser ≤ 0 (dashboard “No aplicaron”). */
function firstSignedNumFromCols(row, cols) {
  if (!cols?.length) return null;
  for (const c of cols) {
    const raw = getRowCol(row, c);
    if (raw == null && raw !== 0) continue;
    const v = num(raw);
    if (v != null) return v;
  }
  return null;
}

async function migrateMysqlDomainArchiveForTable(spec, stats) {
  const tbl = spec.table.replace(/`/g, "");
  const order =
    spec.orderBySql ||
    (spec.pk?.length ? spec.pk.map((c) => `\`${String(c).replace(/`/g, "")}\` ASC`).join(", ") : "`id` ASC");
  const baseSql = `SELECT * FROM \`${tbl}\` ORDER BY ${order}`;

  let upserts = 0;
  await queryPaged(baseSql, async (rows) => {
    const ops = [];
    for (const row of rows) {
      const pk = computeArchivePk(spec, row);
      const payload = buildArchiveRowPayload(row);
      const estSize = JSON.stringify(payload).length;
      if (estSize > 14_000_000) {
        migrationLog(`mysql-archive: fila ~${estSize}B (límite BSON) tabla=${tbl} pk=${pk} — omitida`, {
          useStderr: true,
        });
        stats.mysqlDomainArchiveOversized++;
        continue;
      }
      const opportunityMysqlId = firstPositiveNumFromCols(row, spec.oppCols);
      const opportunityApplicationMysqlId = firstSignedNumFromCols(row, spec.appCols);
      const postulantMysqlId = firstPositiveNumFromCols(row, spec.postCols);

      ops.push({
        updateOne: {
          filter: { domain: MYSQL_ARCHIVE_DOMAIN, tableName: tbl, pk },
          update: {
            $set: {
              row: payload,
              opportunityMysqlId: opportunityMysqlId ?? null,
              opportunityApplicationMysqlId: opportunityApplicationMysqlId ?? null,
              postulantMysqlId: postulantMysqlId ?? null,
              meta: { runId: RUN_ID, archivedAt: new Date() },
            },
          },
          upsert: true,
        },
      });
    }
    const partSize = Math.min(MONGO_WRITE_BATCH, 500);
    for (const part of chunk(ops, partSize)) {
      if (!part.length) continue;
      await withMongoRetry(`LegacyMysqlOpportunityDomain.bulkWrite(${tbl})`, () =>
        LegacyMysqlOpportunityDomain.bulkWrite(part, { ordered: false })
      );
      upserts += part.length;
    }
    stats.mysqlDomainArchiveByTable[tbl] = (stats.mysqlDomainArchiveByTable[tbl] || 0) + rows.length;
  });

  migrationLog(`mysql-archive: ${tbl} — ${upserts} upserts (filas leídas acumuladas en stats)`);
}

async function migrateMysqlDomainArchives(stats) {
  if (!RUN_MYSQL_DOMAIN_ARCHIVE) {
    migrationLog(
      "Fase 11 omitida: archivo MySQL desactivado por defecto. Activa con MIGRATION_MYSQL_DOMAIN_ARCHIVE=1 (o MIGRATION_SKIP_MYSQL_DOMAIN_ARCHIVE=0)"
    );
    return;
  }
  migrationLog(
    `Fase 11/11: archivo fila-a-fila → legacy_mysql_opportunity_domain (${OPPORTUNITY_MYSQL_ARCHIVE_TABLES.length} tablas)...`
  );
  for (const spec of OPPORTUNITY_MYSQL_ARCHIVE_TABLES) {
    await migrateMysqlDomainArchiveForTable(spec, stats);
    if (INTER_BATCH_SLEEP_MS > 0) await sleep(INTER_BATCH_SLEEP_MS);
  }
  migrationLog("Fase 11/11: archivo MySQL OK");
}

function dayKey(v) {
  const d = date(v);
  return d ? d.toISOString().slice(0, 10) : "";
}

function strKey(v) {
  return String(v || "").trim().toLowerCase();
}

function buildPracticeOpportunityKey({
  company,
  nombreCargo,
  periodo,
  fechaVencimiento,
}) {
  return [String(company || ""), strKey(nombreCargo), String(periodo || ""), dayKey(fechaVencimiento)].join("|");
}

function buildMTMOpportunityKey({
  company,
  nombreCargo,
  periodo,
  fechaVencimiento,
}) {
  return [String(company || ""), strKey(nombreCargo), String(periodo || ""), dayKey(fechaVencimiento)].join("|");
}

/**
 * Estados canónicos práctica = enum `Opportunity.estado` / `historialEstados` (opportunity.model.js).
 * Una sola función para `opportunity.status` (MySQL) y `change_status_opportunity.status_*`.
 *
 * @param {string|null|undefined} raw
 * @param {{ nullable?: boolean }} opts - nullable: true → "" / NO_EXIST → null (historial); false → "Creada" por defecto
 */
function normalizePracticeEstadoFromMysql(raw, opts = {}) {
  const nullable = !!opts.nullable;
  const trimmed = String(raw ?? "").trim();
  const s = trimmed.toUpperCase().replace(/\s+/g, "_");
  if (nullable && (!trimmed || s === "NO_EXIST")) return null;

  let resolved = "Creada";
  if (s === "CREATED" || s === "CREATE") resolved = "Creada";
  else if (s === "REVIEW") resolved = "En Revisión";
  else if (s === "REVISED") resolved = "Revisada";
  else if (["ACTIVED", "ACTIVE", "ACTIVATED", "PUBLISHED", "APPROVED", "ACTIVADA"].includes(s)) resolved = "Activa";
  else if (s === "CLOSED" || s === "CERRADA") resolved = "Cerrada";
  else if (s === "REJECTED" || s === "REJECT") resolved = "Rechazada";
  else if (s.includes("OVERDUE") || s.includes("EXPIRED") || s.includes("VENCID")) resolved = "Vencida";
  else if (["ACTIVE", "ACTIVATED", "PUBLISHED", "APPROVED"].some((k) => s.includes(k))) resolved = "Activa";
  else if (s.includes("VENCID") || s.includes("OVERDUE")) resolved = "Vencida";
  else if (["CLOSED", "FINISHED", "CANCEL", "EXPIRED"].some((k) => s.includes(k))) resolved = "Cerrada";
  else if (s.includes("REJECT")) resolved = "Rechazada";
  else if (
    s.includes("PENDING_REVIEW") ||
    s.includes("IN_REVIEW") ||
    s.includes("UNDER_REVIEW") ||
    s.includes("EN_REVISION") ||
    s.includes("TO_REVIEW")
  ) {
    resolved = "En Revisión";
  }

  return clampPracticeOpportunityEstado(resolved);
}

function mapPracticeOpportunityStatus(raw) {
  return normalizePracticeEstadoFromMysql(raw, { nullable: false });
}

/**
 * Estados canónicos MTM = enum `OportunidadMTM.estado` / historial.
 */
function normalizeMtmEstadoFromMysql(raw, opts = {}) {
  const nullable = !!opts.nullable;
  const trimmed = String(raw ?? "").trim();
  const s = trimmed.toUpperCase().replace(/\s+/g, "_");
  if (nullable && (!trimmed || s === "NO_EXIST")) return null;

  let resolved = "Borrador";
  if (["CREATED", "REVIEW", "REVISED"].includes(s)) resolved = "Borrador";
  else if (["ACTIVED", "ACTIVE", "ACTIVATED", "PUBLISHED", "APPROVED"].includes(s)) resolved = "Activa";
  else if (["CLOSED", "REJECTED", "CANCEL", "INACTIVE", "EXPIRED"].includes(s)) resolved = "Inactiva";
  else if (["ACTIVE", "ACTIVATED", "PUBLISHED", "APPROVED"].some((k) => s.includes(k))) resolved = "Activa";
  else if (["CLOSED", "FINISHED", "CANCEL", "EXPIRED", "INACTIVE"].some((k) => s.includes(k))) resolved = "Inactiva";

  return clampOportunidadMtmEstado(resolved);
}

function mapMTMOpportunityStatus(raw) {
  return normalizeMtmEstadoFromMysql(raw, { nullable: false });
}

function mapApplicationStatus(row) {
  let r = "aplicado";
  if (bool(row.contracted)) r = "aceptado_estudiante";
  else {
    const s = (row.status || "").toUpperCase();
    if (s.includes("REJECT")) r = "rechazado";
    else if (s.includes("SELECT")) r = "seleccionado_empresa";
    else if (bool(row.downloaded)) r = "empresa_descargo_hv";
    else if (bool(row.viewed) || bool(row.revisedCompany)) r = "empresa_consulto_perfil";
  }
  return clampPostulacionEstado(r);
}

function mapLegalizacionPracticaStatus(raw) {
  const s = (raw || "").toUpperCase();
  let r = "borrador";
  if (s.includes("APPROV")) r = "aprobada";
  else if (s.includes("REJECT")) r = "rechazada";
  else if (s.includes("CANCEL")) r = "rechazada";
  else if (s.includes("ADJUST")) r = "en_ajuste";
  else if (s.includes("REVIEW")) r = "en_revision";
  return clampLegalizacionEstado(r);
}

function mapLegalizacionMTMStatus(raw) {
  const s = (raw || "").toUpperCase();
  let r = "borrador";
  if (s.includes("APPROV")) r = "aprobada";
  else if (s.includes("REJECT")) r = "rechazada";
  else if (s.includes("CANCEL")) r = "rechazada";
  else if (s.includes("ADJUST")) r = "en_ajuste";
  else if (s.includes("REVIEW")) r = "en_revision";
  return clampLegalizacionEstado(r);
}

/** `change_status_opportunity` → etiquetas alineadas con enum `Opportunity.historialEstados`. */
function mapMysqlChangeStatusToPracticeState(raw) {
  return normalizePracticeEstadoFromMysql(raw, { nullable: true });
}

/** Misma tabla → estados MTM (Borrador / Activa / Inactiva). */
function mapMysqlChangeStatusToMTMState(raw) {
  return normalizeMtmEstadoFromMysql(raw, { nullable: true });
}

function buildComentariosFromChangeStatusRow(row) {
  const parts = [];
  const c = str(getRowCol(row, "comment"));
  const r = str(getRowCol(row, "reason"));
  if (c) parts.push(c);
  if (r && r !== c) parts.push(r);
  if (getRowCol(row, "contract") != null) {
    parts.push(`Contrató: ${bool(getRowCol(row, "contract")) ? "Sí" : "No"}`);
  }
  const contracted = str(getRowCol(row, "contracted"));
  if (contracted) parts.push(`Contratados: ${contracted}`);
  const why = str(getRowCol(row, "why_no_contracted"));
  if (why) parts.push(`Por qué no contrató: ${why}`);
  return parts.length ? parts.join("\n") : null;
}

async function ensureUserEmailMap(maps) {
  if (maps.userByEmailLower) return;
  const users = await withMongoRetry("User.find (mapa email)", () =>
    User.find({ email: { $exists: true, $ne: "" } }).select("_id email").lean()
  );
  maps.userByEmailLower = new Map();
  for (const u of users) {
    const k = String(u.email || "").trim().toLowerCase();
    if (k) maps.userByEmailLower.set(k, u._id);
  }
}

function resolveUserIdFromCreatorEmail(maps, emailRaw, defaultUserId) {
  const k = String(emailRaw || "").trim().toLowerCase();
  if (!k) return defaultUserId;
  return maps.userByEmailLower?.get(k) || defaultUserId;
}

function resolveUserIdFromMysqlUserId(maps, userMysqlId, defaultUserId) {
  const uid = num(userMysqlId);
  if (uid == null || uid <= 0) return defaultUserId;
  return maps.usersByMysqlId?.get(uid)?._id || defaultUserId;
}

function buildHistorialPracticeFromChangeRows(rows, maps, defaultUserId) {
  const out = [];
  for (const row of rows) {
    const estadoAnterior = mapMysqlChangeStatusToPracticeState(getRowCol(row, "status_before"));
    const estadoNuevo = mapMysqlChangeStatusToPracticeState(getRowCol(row, "status_after"));
    if (!estadoNuevo) continue;
    const comentarios = buildComentariosFromChangeStatusRow(row);
    const cambiadoPor = resolveUserIdFromCreatorEmail(maps, getRowCol(row, "user_creator"), defaultUserId);
    const entry = {
      estadoNuevo,
      cambiadoPor,
      fechaCambio: date(getRowCol(row, "date")) || new Date(),
      motivo: str(getRowCol(row, "reason")) || null,
      comentarios: comentarios || null,
    };
    if (estadoAnterior) entry.estadoAnterior = estadoAnterior;
    out.push(entry);
  }
  return out;
}

function buildHistorialMtmFromChangeRows(rows, maps, defaultUserId) {
  const out = [];
  for (const row of rows) {
    const estadoAnterior = mapMysqlChangeStatusToMTMState(getRowCol(row, "status_before"));
    const estadoNuevo = mapMysqlChangeStatusToMTMState(getRowCol(row, "status_after"));
    if (!estadoNuevo) continue;
    const extra = buildComentariosFromChangeStatusRow(row);
    const r = str(getRowCol(row, "reason"));
    const motivo = [r, extra].filter(Boolean).join(" | ").slice(0, 500) || null;
    const entry = {
      estadoNuevo,
      cambiadoPor: resolveUserIdFromCreatorEmail(maps, getRowCol(row, "user_creator"), defaultUserId),
      fechaCambio: date(getRowCol(row, "date")) || new Date(),
      motivo,
    };
    if (estadoAnterior) entry.estadoAnterior = estadoAnterior;
    out.push(entry);
  }
  return out;
}

/** Una fila MySQL `change_status_opportunity` → documento en `opportunity_status_change_logs`. */
function buildChangeStatusLogDocFromMysqlChangeRow(row, maps, defaultUserId) {
  const oid = num(getRowCol(row, "opportunity_id"));
  if (oid == null) return null;
  const practiceMongoId = getLegacyMongoId(maps, LEGACY_SCOPE.PRACTICE_OPPORTUNITY, oid);
  const mtmMongoId = getLegacyMongoId(maps, LEGACY_SCOPE.MTM_OPPORTUNITY, oid);
  const dominio = practiceMongoId ? "practica" : mtmMongoId ? "mtm" : null;
  if (!dominio) return null;

  let estadoAnterior =
    dominio === "practica"
      ? mapMysqlChangeStatusToPracticeState(getRowCol(row, "status_before"))
      : mapMysqlChangeStatusToMTMState(getRowCol(row, "status_before"));
  let estadoNuevo =
    dominio === "practica"
      ? mapMysqlChangeStatusToPracticeState(getRowCol(row, "status_after"))
      : mapMysqlChangeStatusToMTMState(getRowCol(row, "status_after"));
  if (!estadoNuevo) {
    estadoNuevo =
      dominio === "practica"
        ? mapPracticeOpportunityStatus(getRowCol(row, "status_after"))
        : mapMTMOpportunityStatus(getRowCol(row, "status_after"));
  }
  if (estadoAnterior != null && estadoAnterior !== "") {
    estadoAnterior =
      dominio === "practica"
        ? clampPracticeOpportunityEstado(estadoAnterior)
        : clampOportunidadMtmEstado(estadoAnterior);
  } else {
    estadoAnterior = null;
  }
  estadoNuevo =
    dominio === "practica"
      ? clampPracticeOpportunityEstado(estadoNuevo)
      : clampOportunidadMtmEstado(estadoNuevo);

  const mysqlRowId = num(getRowCol(row, "id"));
  if (mysqlRowId == null) return null;

  const hasContrato =
    getRowCol(row, "contract") != null ||
    (getRowCol(row, "contracted") != null && String(getRowCol(row, "contracted")).trim() !== "") ||
    (getRowCol(row, "why_no_contracted") != null && String(getRowCol(row, "why_no_contracted")).trim() !== "");

  return {
    mysqlRowId,
    snapshotKey: null,
    opportunityMysqlId: oid,
    dominio,
    origen: "mysql_change_status_opportunity",
    opportunity: practiceMongoId || null,
    oportunidadMtm: mtmMongoId || null,
    fecha: date(getRowCol(row, "date")) || new Date(),
    statusBeforeRaw: str(getRowCol(row, "status_before")) || null,
    statusAfterRaw: str(getRowCol(row, "status_after")) || null,
    estadoAnteriorMongo: estadoAnterior,
    estadoNuevoMongo: estadoNuevo,
    motivo: str(getRowCol(row, "reason")) || null,
    userCreatorRaw: str(getRowCol(row, "user_creator")) || null,
    comentario: str(getRowCol(row, "comment")) || null,
    contratoLegado: hasContrato
      ? {
          contract: getRowCol(row, "contract"),
          contracted: str(getRowCol(row, "contracted")) || null,
          whyNoContracted: str(getRowCol(row, "why_no_contracted")) || null,
        }
      : null,
    cambiadoPor: resolveUserIdFromCreatorEmail(maps, getRowCol(row, "user_creator"), defaultUserId),
    meta: { runId: RUN_ID, migration: "migrateOpportunitiesFromMySQL" },
  };
}

/** Instantánea desde fila `opportunity` cuando no hay historial previo (ni en documento ni vía change_log). */
function buildSnapshotStatusLogDoc(row, maps, defaultUserId, dominio) {
  const oid = num(row.id);
  if (oid == null) return null;
  const practiceMongoId =
    dominio === "practica" ? getLegacyMongoId(maps, LEGACY_SCOPE.PRACTICE_OPPORTUNITY, oid) : null;
  const mtmMongoId = dominio === "mtm" ? getLegacyMongoId(maps, LEGACY_SCOPE.MTM_OPPORTUNITY, oid) : null;
  const mid = practiceMongoId || mtmMongoId;
  if (!mid) return null;
  const snapshotKey = dominio === "practica" ? `snapshot_practica_${oid}` : `snapshot_mtm_${oid}`;
  const estadoNuevo =
    dominio === "practica"
      ? mapPracticeOpportunityStatus(row.status)
      : mapMTMOpportunityStatus(row.status);
  return {
    mysqlRowId: null,
    snapshotKey,
    opportunityMysqlId: oid,
    dominio,
    origen: "mysql_opportunity_snapshot",
    opportunity: practiceMongoId || null,
    oportunidadMtm: mtmMongoId || null,
    fecha: date(row.date_creation) || new Date(),
    statusBeforeRaw: null,
    statusAfterRaw: str(row.status) || null,
    estadoAnteriorMongo: null,
    estadoNuevoMongo: estadoNuevo,
    motivo: null,
    userCreatorRaw: str(row.user_creator) || null,
    comentario: null,
    contratoLegado: null,
    cambiadoPor: resolveUserIdFromCreatorEmail(maps, row.user_creator, defaultUserId),
    meta: { runId: RUN_ID, migration: "migrateOpportunitiesFromMySQL" },
  };
}

async function bulkUpsertOpportunityStatusChangeLogs(docs, stats, statKey) {
  if (!docs?.length) return;
  const ops = docs.map((d) => ({
    updateOne: {
      filter: d.mysqlRowId != null ? { mysqlRowId: d.mysqlRowId } : { snapshotKey: d.snapshotKey },
      update: { $set: d },
      upsert: true,
    },
  }));
  for (const part of chunk(ops, 500)) {
    if (!part.length) continue;
    await withMongoRetry("OpportunityStatusChangeLog.bulkWrite", () =>
      OpportunityStatusChangeLog.bulkWrite(part, { ordered: false })
    );
    stats[statKey] += part.length;
  }
}

function sqlChangeStatusOpportunityWhereClause() {
  const parts = [];
  if (FOCUS_PRACTICE_OPP_IDS?.length) {
    parts.push(`opportunity_id IN (${FOCUS_PRACTICE_OPP_IDS.join(",")})`);
  }
  if (FOCUS_MTM_OPP_IDS?.length) {
    parts.push(`opportunity_id IN (${FOCUS_MTM_OPP_IDS.join(",")})`);
  }
  if (
    MIGRATION_RECENT_OPPORTUNITIES_FIRST &&
    !FOCUS_PRACTICE_OPP_IDS?.length &&
    !FOCUS_MTM_OPP_IDS?.length
  ) {
    const sub = [];
    const pEx = sqlPracticeOppIdsInExpr();
    const mEx = sqlMtmOppIdsInExpr();
    if (pEx) sub.push(`opportunity_id IN ${pEx}`);
    if (mEx) sub.push(`opportunity_id IN ${mEx}`);
    if (sub.length) parts.push(`(${sub.join(" OR ")})`);
  }
  if (!parts.length) return "";
  return ` WHERE (${parts.join(" OR ")})`;
}

function sqlScopePracticeLegalizedIds(aliasTable = "c") {
  const exP = sqlPracticeOppIdsInExpr();
  if (!exP) return "";
  return `AND ${aliasTable}.academic_practice_legalized_id IN (
    SELECT academic_practice_legalized_id FROM academic_practice_legalized WHERE academic_practice_id IN ${exP}
  )`;
}

function sqlScopeMonitoringLegalizedIds(aliasTable = "c") {
  const exM = sqlMtmOppIdsInExpr();
  if (!exM) return "";
  return `AND ${aliasTable}.monitoring_legalized_id IN (
    SELECT monitoring_legalized_id FROM monitoring_legalized WHERE study_working_id IN ${exM}
  )`;
}

function sqlScopeAcademicPracticeOppIds(aliasCol = "academic_practice_id") {
  const exP = sqlPracticeOppIdsInExpr();
  if (!exP) return "";
  return `AND ${aliasCol} IN ${exP}`;
}

function buildHistorialLegalizacionPracticaFromMysql(rows, maps, defaultUserId) {
  const out = [];
  for (const row of rows) {
    const rawBefore = getRowCol(row, "status_legalized_before");
    const rawAfter = getRowCol(row, "status_legalized_after");
    const antes =
      rawBefore == null || String(rawBefore).trim() === "" ? null : mapLegalizacionPracticaStatus(rawBefore);
    const despues = mapLegalizacionPracticaStatus(rawAfter);
    const obs = [
      str(getRowCol(row, "change_status_observation")),
      str(getRowCol(row, "change_status_observation_document")),
    ]
      .filter(Boolean)
      .join(" | ");
    const legado = `MySQL ${str(getRowCol(row, "status_legalized_before"))} → ${str(getRowCol(row, "status_legalized_after"))}`;
    out.push({
      estadoAnterior: antes,
      estadoNuevo: despues,
      usuario: resolveUserIdFromMysqlUserId(maps, getRowCol(row, "user_id"), defaultUserId),
      fecha: date(getRowCol(row, "change_status_date")) || new Date(),
      detalle: obs || legado,
      ip: null,
    });
  }
  return out;
}

function buildHistorialLegalizacionMtmFromMysql(rows, maps, defaultUserId) {
  const out = [];
  for (const row of rows) {
    const rawBefore = getRowCol(row, "status_legalized_before");
    const rawAfter = getRowCol(row, "status_legalized_after");
    const antes =
      rawBefore == null || String(rawBefore).trim() === "" ? null : mapLegalizacionMTMStatus(rawBefore);
    const despues = mapLegalizacionMTMStatus(rawAfter);
    const obs = [
      str(getRowCol(row, "change_status_observation")),
      str(getRowCol(row, "change_status_observation_document")),
    ]
      .filter(Boolean)
      .join(" | ");
    const legado = `MySQL ${str(getRowCol(row, "status_legalized_before"))} → ${str(getRowCol(row, "status_legalized_after"))}`;
    out.push({
      estadoAnterior: antes,
      estadoNuevo: despues,
      usuario: resolveUserIdFromMysqlUserId(maps, getRowCol(row, "user_id"), defaultUserId),
      fecha: date(getRowCol(row, "change_status_date")) || new Date(),
      detalle: obs || legado,
      ip: null,
    });
  }
  return out;
}

function buildHistorialPlanTrabajoPracticaFromMysqlRows(rows, fuenteTabla, maps, defaultUserId) {
  return rows.map((row) => ({
    fuenteTablaMysql: fuenteTabla,
    fecha: date(getRowCol(row, "change_status_date")) || new Date(),
    tipoCambio: str(getRowCol(row, "change_type")) || null,
    datosAntes: str(getRowCol(row, "status_data_plan_before")) || str(getRowCol(row, "status_plan_before")) || null,
    datosDespues: str(getRowCol(row, "status_data_plan_after")) || str(getRowCol(row, "status_plan_after")) || null,
    observacion: str(getRowCol(row, "change_status_observation")) || null,
    usuario: resolveUserIdFromMysqlUserId(maps, getRowCol(row, "user_id"), defaultUserId),
  }));
}

/**
 * Historial “espejo” legado: legalizaciones práctica/MTM, plan de práctica (practice_plan),
 * aprobación por programa en la oferta, y aprobaciones por documento en monitoría.
 * Idempotente: reemplaza los arreglos afectados en cada corrida.
 */
async function migrateLegacyDetailedMirrorHistoriales(maps, stats) {
  if (SKIP_LEGACY_DETAILED_HISTORY) {
    migrationLog("Historial detallado legado omitido (MIGRATION_SKIP_LEGACY_DETAILED_HISTORY=1)");
    return;
  }
  if (SKIP_PRACTICE_OPPORTUNITIES_PIPELINE && SKIP_MTM_OPPORTUNITIES_PIPELINE) {
    migrationLog("Historial detallado legado omitido (pipelines práctica y MTM desactivados)");
    return;
  }
  migrationLog("Fase: historial detallado legado (espejo plataforma anterior)...");
  const defaultUserId = (
    await withMongoRetry("User.findOne(default historial legado)", () => User.findOne({}).select("_id").lean())
  )?._id;
  if (!defaultUserId) {
    migrationLog("Historial legado: sin User en Mongo; se omite la fase", { useStderr: true });
    return;
  }
  await ensureUserEmailMap(maps);

  if (!SKIP_PRACTICE_OPPORTUNITIES_PIPELINE) {
  const scopeProg = sqlScopeAcademicPracticeOppIds("academic_practice_id");
  const sqlProg = limitSqlPracticeLegalChain(`
    SELECT id, program_id, academic_practice_id, status, comment, \`date\`, user_updater
    FROM change_status_approval_program_academic_practice
    WHERE 1=1 ${scopeProg}
    ORDER BY academic_practice_id ASC, \`date\` ASC, id ASC
  `);

  let pendingOpp = null;
  let progRows = [];
  const flushProg = async () => {
    if (pendingOpp == null || !progRows.length) return;
    const mysqlOppId = pendingOpp;
    const rows = progRows;
    pendingOpp = null;
    progRows = [];
    const mongoId = getLegacyMongoId(maps, LEGACY_SCOPE.PRACTICE_OPPORTUNITY, mysqlOppId);
    if (!mongoId) return;
    try {
      const historialAprobacionProgramas = rows.map((r) => ({
        programIdMysql: num(r.program_id) || 0,
        programa: maps.programsByMysqlId.get(num(r.program_id))?._id || null,
        estadoMysql: str(r.status) || "",
        comentario: str(r.comment) || null,
        fecha: date(getRowCol(r, "date")) || new Date(),
        usuarioLegacy: str(r.user_updater) || null,
        cambiadoPor: resolveUserIdFromCreatorEmail(maps, r.user_updater, defaultUserId),
      }));
      await withMongoRetry(`Opportunity.historialAprobacionProgramas mysqlOpp=${mysqlOppId}`, () =>
        Opportunity.updateOne({ _id: mongoId }, { $set: { historialAprobacionProgramas } })
      );
      stats.legacyProgramApprovalHistorialUpdated++;
    } catch (e) {
      stats.legacyDetailedHistoryErrors++;
      migrationLog(`historial programas academic_practice_id=${mysqlOppId}: ${e.message}`, { useStderr: true });
    }
  };

  await queryPaged(sqlProg, async (rows) => {
    for (const row of rows) {
      const aid = num(getRowCol(row, "academic_practice_id"));
      if (aid == null) continue;
      if (pendingOpp !== null && aid !== pendingOpp) await flushProg();
      pendingOpp = aid;
      progRows.push(row);
    }
  });
  await flushProg();

  const scopeLeg = sqlScopePracticeLegalizedIds("c");
  const sqlLeg = limitSqlPracticeLegalChain(`
    SELECT c.change_status_legalized_id, c.academic_practice_legalized_id, c.user_id, c.change_status_date,
      c.status_legalized_before, c.status_legalized_after, c.change_status_observation, c.change_status_observation_document
    FROM change_status_legalized c
    WHERE 1=1 ${scopeLeg}
    ORDER BY c.academic_practice_legalized_id ASC, c.change_status_date ASC, c.change_status_legalized_id ASC
  `);

  let pendingApl = null;
  let legRows = [];
  const flushLeg = async () => {
    if (pendingApl == null || !legRows.length) return;
    const aplId = pendingApl;
    const rows = legRows;
    pendingApl = null;
    legRows = [];
    const mongoId = getLegacyMongoId(maps, LEGACY_SCOPE.PRACTICE_LEGALIZATION, aplId);
    if (!mongoId) return;
    try {
      const historial = buildHistorialLegalizacionPracticaFromMysql(rows, maps, defaultUserId);
      if (!historial.length) return;
      await withMongoRetry(`LegalizacionPractica.historial apl=${aplId}`, () =>
        LegalizacionPractica.updateOne({ _id: mongoId }, { $set: { historial } })
      );
      stats.legacyPracticeLegalHistorialUpdated++;
    } catch (e) {
      stats.legacyDetailedHistoryErrors++;
      migrationLog(`historial change_status_legalized apl=${aplId}: ${e.message}`, { useStderr: true });
    }
  };

  await queryPaged(sqlLeg, async (rows) => {
    for (const row of rows) {
      const lid = num(getRowCol(row, "academic_practice_legalized_id"));
      if (lid == null) continue;
      if (pendingApl !== null && lid !== pendingApl) await flushLeg();
      pendingApl = lid;
      legRows.push(row);
    }
  });
  await flushLeg();

  const scopePp = sqlPracticeOppIdsInExpr()
    ? `WHERE pp.academic_practice_id IN ${sqlPracticeOppIdsInExpr()}`
    : "";
  const sqlCpp = limitSqlPracticeLegalChain(`
    SELECT cs.id, cs.practice_plan_id, cs.user_id, cs.change_type, cs.change_status_date,
      cs.status_data_plan_before, cs.status_data_plan_after, cs.change_status_observation,
      pp.academic_practice_legalized_id
    FROM change_status_practice_plan cs
    INNER JOIN practice_plan pp ON pp.id = cs.practice_plan_id
    ${scopePp}
    ORDER BY pp.academic_practice_legalized_id ASC, cs.change_status_date ASC, cs.id ASC
  `);

  let pendingPp = null;
  let cppRows = [];
  const flushCpp = async () => {
    if (pendingPp == null || !cppRows.length) return;
    const aplId = pendingPp;
    const rows = cppRows;
    pendingPp = null;
    cppRows = [];
    const mongoId = getLegacyMongoId(maps, LEGACY_SCOPE.PRACTICE_LEGALIZATION, aplId);
    if (!mongoId) return;
    try {
      const chunkHist = buildHistorialPlanTrabajoPracticaFromMysqlRows(
        rows,
        "change_status_practice_plan",
        maps,
        defaultUserId
      );
      const leg = await withMongoRetry("LegalizacionPractica.findOne(plan hist)", () =>
        LegalizacionPractica.findById(mongoId).select("historialPlanTrabajoPractica").lean()
      );
      const prev = Array.isArray(leg?.historialPlanTrabajoPractica) ? leg.historialPlanTrabajoPractica : [];
      const onlyOther = prev.filter((x) => x?.fuenteTablaMysql !== "change_status_practice_plan");
      const historialPlanTrabajoPractica = onlyOther.concat(chunkHist);
      await withMongoRetry(`LegalizacionPractica.historialPlan cpp apl=${aplId}`, () =>
        LegalizacionPractica.updateOne({ _id: mongoId }, { $set: { historialPlanTrabajoPractica } })
      );
      stats.legacyPracticePlanHistorialUpdated++;
    } catch (e) {
      stats.legacyDetailedHistoryErrors++;
      migrationLog(`historial change_status_practice_plan apl=${aplId}: ${e.message}`, { useStderr: true });
    }
  };

  await queryPaged(sqlCpp, async (rows) => {
    for (const row of rows) {
      const lid = num(getRowCol(row, "academic_practice_legalized_id"));
      if (lid == null) continue;
      if (pendingPp !== null && lid !== pendingPp) await flushCpp();
      pendingPp = lid;
      cppRows.push(row);
    }
  });
  await flushCpp();

  const sqlCmp = limitSqlPracticeLegalChain(`
    SELECT cs.id, cs.monitoring_plan_id, cs.user_id, cs.change_status_date,
      cs.status_plan_before, cs.status_plan_after, cs.change_status_observation,
      pp.academic_practice_legalized_id
    FROM change_status_monitoring_plan cs
    INNER JOIN practice_plan pp ON pp.id = cs.monitoring_plan_id
    ${scopePp}
    ORDER BY pp.academic_practice_legalized_id ASC, cs.change_status_date ASC, cs.id ASC
  `);

  let pendingCmp = null;
  let cmpRows = [];
  const flushCmp = async () => {
    if (pendingCmp == null || !cmpRows.length) return;
    const aplId = pendingCmp;
    const rows = cmpRows;
    pendingCmp = null;
    cmpRows = [];
    const mongoId = getLegacyMongoId(maps, LEGACY_SCOPE.PRACTICE_LEGALIZATION, aplId);
    if (!mongoId) return;
    try {
      const chunkHist = buildHistorialPlanTrabajoPracticaFromMysqlRows(
        rows,
        "change_status_monitoring_plan",
        maps,
        defaultUserId
      );
      const leg = await withMongoRetry("LegalizacionPractica.findOne(cmp hist)", () =>
        LegalizacionPractica.findById(mongoId).select("historialPlanTrabajoPractica").lean()
      );
      const prev = Array.isArray(leg?.historialPlanTrabajoPractica) ? leg.historialPlanTrabajoPractica : [];
      const onlyOther = prev.filter((x) => x?.fuenteTablaMysql !== "change_status_monitoring_plan");
      const historialPlanTrabajoPractica = onlyOther.concat(chunkHist);
      await withMongoRetry(`LegalizacionPractica.historialPlan cmp apl=${aplId}`, () =>
        LegalizacionPractica.updateOne({ _id: mongoId }, { $set: { historialPlanTrabajoPractica } })
      );
      stats.legacyPracticePlanMonitoringHistorialUpdated++;
    } catch (e) {
      stats.legacyDetailedHistoryErrors++;
      migrationLog(`historial change_status_monitoring_plan apl=${aplId}: ${e.message}`, { useStderr: true });
    }
  };

  await queryPaged(sqlCmp, async (rows) => {
    for (const row of rows) {
      const lid = num(getRowCol(row, "academic_practice_legalized_id"));
      if (lid == null) continue;
      if (pendingCmp !== null && lid !== pendingCmp) await flushCmp();
      pendingCmp = lid;
      cmpRows.push(row);
    }
  });
  await flushCmp();
  }

  if (!SKIP_MTM_OPPORTUNITIES_PIPELINE) {
  const scopeMtm = sqlScopeMonitoringLegalizedIds("c");
  const sqlMtm = limitSqlMtmLegalChain(`
    SELECT c.change_status_monitoring_legalized_id, c.monitoring_legalized_id, c.user_id, c.change_status_date,
      c.status_legalized_before, c.status_legalized_after, c.change_status_observation, c.change_status_observation_document
    FROM change_status_monitoring_legalized c
    WHERE 1=1 ${scopeMtm}
    ORDER BY c.monitoring_legalized_id ASC, c.change_status_date ASC, c.change_status_monitoring_legalized_id ASC
  `);

  let pendingMl = null;
  let mtmLegRows = [];
  const flushMtmLeg = async () => {
    if (pendingMl == null || !mtmLegRows.length) return;
    const mlId = pendingMl;
    const rows = mtmLegRows;
    pendingMl = null;
    mtmLegRows = [];
    const mongoId = getLegacyMongoId(maps, LEGACY_SCOPE.MTM_LEGALIZATION, mlId);
    if (!mongoId) return;
    try {
      const historial = buildHistorialLegalizacionMtmFromMysql(rows, maps, defaultUserId);
      if (!historial.length) return;
      await withMongoRetry(`LegalizacionMTM.historial ml=${mlId}`, () =>
        LegalizacionMTM.updateOne({ _id: mongoId }, { $set: { historial } })
      );
      stats.legacyMtmLegalHistorialUpdated++;
    } catch (e) {
      stats.legacyDetailedHistoryErrors++;
      migrationLog(`historial change_status_monitoring_legalized ml=${mlId}: ${e.message}`, { useStderr: true });
    }
  };

  await queryPaged(sqlMtm, async (rows) => {
    for (const row of rows) {
      const lid = num(getRowCol(row, "monitoring_legalized_id"));
      if (lid == null) continue;
      if (pendingMl !== null && lid !== pendingMl) await flushMtmLeg();
      pendingMl = lid;
      mtmLegRows.push(row);
    }
  });
  await flushMtmLeg();

  const scopeAdoc = sqlScopeMonitoringLegalizedIds("a");
  const sqlAdoc = limitSqlMtmLegalChain(`
    SELECT a.approval_document_id, a.document_monitoring_definition_id, a.monitoring_legalized_id, a.user_id, a.user_ip,
      a.approval_date, a.approval_document_status_before, a.approval_document_status_after, a.approval_observation
    FROM approval_monitoring_documents a
    WHERE 1=1 ${scopeAdoc}
    ORDER BY a.monitoring_legalized_id ASC, a.document_monitoring_definition_id ASC, a.approval_date ASC, a.approval_document_id ASC
  `);

  let pendingAdoc = null;
  let adocRows = [];
  const flushAdoc = async () => {
    if (pendingAdoc == null || !adocRows.length) return;
    const mlId = pendingAdoc;
    const rows = adocRows;
    pendingAdoc = null;
    adocRows = [];
    const mongoId = getLegacyMongoId(maps, LEGACY_SCOPE.MTM_LEGALIZATION, mlId);
    if (!mongoId) return;
    try {
      const doc = await withMongoRetry("LegalizacionMTM.findOne(approval doc)", () =>
        LegalizacionMTM.findById(mongoId).select("documentos").lean()
      );
      const documentos =
        doc?.documentos && typeof doc.documentos === "object" && !Array.isArray(doc.documentos)
          ? { ...doc.documentos }
          : {};
      const byDef = new Map();
      for (const r of rows) {
        const defMysql = num(r.document_monitoring_definition_id);
        const defMongo = maps.mtmDocDefByMysqlId.get(defMysql)?._id;
        if (!defMongo) continue;
        const k = String(defMongo);
        if (!byDef.has(k)) byDef.set(k, []);
        byDef.get(k).push(r);
      }
      for (const [k, defRows] of byDef) {
        const entry = documentos[k] && typeof documentos[k] === "object" ? { ...documentos[k] } : {};
        const historialAprobacionesLegado = defRows.map((r) => ({
          fecha: date(getRowCol(r, "approval_date")) || new Date(),
          estadoAntes: str(r.approval_document_status_before) || null,
          estadoDespues: str(r.approval_document_status_after) || null,
          estadoDespuesCanon: mapDocStatus(r.approval_document_status_after),
          observacion: str(r.approval_observation) || null,
          usuario: resolveUserIdFromMysqlUserId(maps, getRowCol(r, "user_id"), defaultUserId),
          ip: str(r.user_ip) || null,
          mysqlId: num(r.approval_document_id),
        }));
        entry.historialAprobacionesLegado = historialAprobacionesLegado;
        documentos[k] = entry;
      }
      await withMongoRetry(`LegalizacionMTM.documentos aprobaciones ml=${mlId}`, () =>
        LegalizacionMTM.updateOne({ _id: mongoId }, { $set: { documentos } })
      );
      stats.legacyMtmDocApprovalHistorialUpdated++;
    } catch (e) {
      stats.legacyDetailedHistoryErrors++;
      migrationLog(`historial approval_monitoring_documents ml=${mlId}: ${e.message}`, { useStderr: true });
    }
  };

  await queryPaged(sqlAdoc, async (rows) => {
    for (const row of rows) {
      const lid = num(getRowCol(row, "monitoring_legalized_id"));
      if (lid == null) continue;
      if (pendingAdoc !== null && lid !== pendingAdoc) await flushAdoc();
      pendingAdoc = lid;
      adocRows.push(row);
    }
  });
  await flushAdoc();
  }

  migrationLog(
    `Historial legado OK: legal práctica ${stats.legacyPracticeLegalHistorialUpdated}, plan práctica ${stats.legacyPracticePlanHistorialUpdated}, plan (monitoring_plan→pp) ${stats.legacyPracticePlanMonitoringHistorialUpdated}, programas ${stats.legacyProgramApprovalHistorialUpdated}, legal MTM ${stats.legacyMtmLegalHistorialUpdated}, aprob. doc MTM ${stats.legacyMtmDocApprovalHistorialUpdated}, errores ${stats.legacyDetailedHistoryErrors}`
  );
}

/**
 * Ofertas que siguen sin `historialEstados` tras volcar change_status_opportunity: una entrada desde
 * `opportunity.status` + `date_creation` (alineada al enum de Opportunity / OportunidadMTM).
 */
async function backfillHistorialEstadosOportunidadesSinChangeLog(maps, stats, defaultUserId) {
  if (!defaultUserId) return;

  async function flushPracticeBatch(mysqlRows) {
    if (!mysqlRows.length) return;
    const byMongo = new Map();
    const mongoIds = [];
    for (const row of mysqlRows) {
      const mid = getLegacyMongoId(maps, LEGACY_SCOPE.PRACTICE_OPPORTUNITY, num(row.id));
      if (!mid) continue;
      mongoIds.push(mid);
      byMongo.set(String(mid), row);
    }
    if (!mongoIds.length) return;
    const existing = await withMongoRetry("Opportunity.find historial backfill", () =>
      Opportunity.find({ _id: { $in: mongoIds } })
        .select("historialEstados")
        .lean()
    );
    const ops = [];
    for (const doc of existing) {
      if (Array.isArray(doc.historialEstados) && doc.historialEstados.length > 0) continue;
      const row = byMongo.get(String(doc._id));
      if (!row) continue;
      const entry = {
        estadoNuevo: mapPracticeOpportunityStatus(row.status),
        cambiadoPor: resolveUserIdFromCreatorEmail(maps, row.user_creator, defaultUserId),
        fechaCambio: date(row.date_creation) || new Date(),
        motivo: null,
        comentarios: null,
      };
      ops.push({
        updateOne: {
          filter: { _id: doc._id },
          update: { $set: { historialEstados: [entry] } },
        },
      });
    }
    const snapshotDocs = [];
    for (const doc of existing) {
      if (Array.isArray(doc.historialEstados) && doc.historialEstados.length > 0) continue;
      const row = byMongo.get(String(doc._id));
      if (!row) continue;
      const snap = buildSnapshotStatusLogDoc(row, maps, defaultUserId, "practica");
      if (snap) snapshotDocs.push(snap);
    }
    await bulkUpsertOpportunityStatusChangeLogs(
      snapshotDocs,
      stats,
      "opportunityStatusChangeLogsSnapshots"
    );
    for (const part of chunk(ops, 500)) {
      if (!part.length) continue;
      await withMongoRetry("Opportunity.bulkWrite historial backfill", () =>
        Opportunity.bulkWrite(part, { ordered: false })
      );
      stats.practiceStatusHistoryBackfilled += part.length;
    }
  }

  async function flushMtmBatch(mysqlRows) {
    if (!mysqlRows.length) return;
    const byMongo = new Map();
    const mongoIds = [];
    for (const row of mysqlRows) {
      const mid = getLegacyMongoId(maps, LEGACY_SCOPE.MTM_OPPORTUNITY, num(row.id));
      if (!mid) continue;
      mongoIds.push(mid);
      byMongo.set(String(mid), row);
    }
    if (!mongoIds.length) return;
    const existing = await withMongoRetry("OportunidadMTM.find historial backfill", () =>
      OportunidadMTM.find({ _id: { $in: mongoIds } })
        .select("historialEstados")
        .lean()
    );
    const ops = [];
    for (const doc of existing) {
      if (Array.isArray(doc.historialEstados) && doc.historialEstados.length > 0) continue;
      const row = byMongo.get(String(doc._id));
      if (!row) continue;
      const entry = {
        estadoNuevo: mapMTMOpportunityStatus(row.status),
        cambiadoPor: resolveUserIdFromCreatorEmail(maps, row.user_creator, defaultUserId),
        fechaCambio: date(row.date_creation) || new Date(),
        motivo: null,
      };
      ops.push({
        updateOne: {
          filter: { _id: doc._id },
          update: { $set: { historialEstados: [entry] } },
        },
      });
    }
    const snapshotDocsMtm = [];
    for (const doc of existing) {
      if (Array.isArray(doc.historialEstados) && doc.historialEstados.length > 0) continue;
      const row = byMongo.get(String(doc._id));
      if (!row) continue;
      const snap = buildSnapshotStatusLogDoc(row, maps, defaultUserId, "mtm");
      if (snap) snapshotDocsMtm.push(snap);
    }
    await bulkUpsertOpportunityStatusChangeLogs(
      snapshotDocsMtm,
      stats,
      "opportunityStatusChangeLogsSnapshots"
    );
    for (const part of chunk(ops, 500)) {
      if (!part.length) continue;
      await withMongoRetry("OportunidadMTM.bulkWrite historial backfill", () =>
        OportunidadMTM.bulkWrite(part, { ordered: false })
      );
      stats.mtmStatusHistoryBackfilled += part.length;
    }
  }

  const sqlPr = limitSqlPracticeOppMain(`
    SELECT o.id, o.status, o.date_creation, o.user_creator
    FROM opportunity o
    WHERE o.opportunity_type = 'ACADEMIC_PRACTICE'
    ${FOCUS_PRACTICE_OPP_IDS?.length ? `AND o.id IN (${FOCUS_PRACTICE_OPP_IDS.join(",")})` : ""}
    ${practiceOppOrderBySql()}
  `);
  const sqlMtm = limitSqlMtmOppMain(`
    SELECT o.id, o.status, o.date_creation, o.user_creator
    FROM opportunity o
    WHERE o.opportunity_type <> 'ACADEMIC_PRACTICE'
    ${FOCUS_MTM_OPP_IDS?.length ? `AND o.id IN (${FOCUS_MTM_OPP_IDS.join(",")})` : ""}
    ${mtmOppOrderBySql()}
  `);

  migrationLog("Fase: backfill historialEstados desde opportunity.status (ofertas aún sin historial)...");

  if (!SKIP_PRACTICE_OPPORTUNITIES_PIPELINE) {
    await queryPaged(sqlPr, async (rows) => {
      await flushPracticeBatch(rows);
    });
  }
  if (!SKIP_MTM_OPPORTUNITIES_PIPELINE) {
    await queryPaged(sqlMtm, async (rows) => {
      await flushMtmBatch(rows);
    });
  }

  migrationLog(
    `Backfill historial ofertas: práctica +${stats.practiceStatusHistoryBackfilled}, MTM +${stats.mtmStatusHistoryBackfilled}`
  );
}

/**
 * `change_status_opportunity` (MySQL) → `historialEstados` en Opportunity y/o OportunidadMTM.
 * Idempotente en re-ejecución: sobrescribe el arreglo con el historial legado.
 */
async function migrateOpportunityStatusHistoryFromMySQL(maps, stats) {
  if (SKIP_OPPORTUNITY_STATUS_HISTORY) {
    migrationLog("Historial de estados de oportunidad omitido (MIGRATION_SKIP_OPPORTUNITY_STATUS_HISTORY=1)");
    return;
  }
  migrationLog("Fase: change_status_opportunity → historialEstados (práctica / MTM)...");
  const defaultUserId = (
    await withMongoRetry("User.findOne(default historial)", () => User.findOne({}).select("_id").lean())
  )?._id;
  if (!defaultUserId) {
    migrationLog("Historial estados: no hay ningún User en Mongo; se omite la fase", { useStderr: true });
    return;
  }
  await ensureUserEmailMap(maps);

  let pendingMysqlOppId = null;
  let pendingRows = [];

  const flushGroup = async () => {
    if (pendingMysqlOppId == null || !pendingRows.length) return;
    const mysqlOppId = pendingMysqlOppId;
    const rows = pendingRows;
    pendingMysqlOppId = null;
    pendingRows = [];

    const practiceMongoId = getLegacyMongoId(maps, LEGACY_SCOPE.PRACTICE_OPPORTUNITY, mysqlOppId);
    const mtmMongoId = getLegacyMongoId(maps, LEGACY_SCOPE.MTM_OPPORTUNITY, mysqlOppId);

    try {
      const logDocs = rows
        .map((r) => buildChangeStatusLogDocFromMysqlChangeRow(r, maps, defaultUserId))
        .filter(Boolean);
      await bulkUpsertOpportunityStatusChangeLogs(logDocs, stats, "opportunityStatusChangeLogsFromMysql");

      if (practiceMongoId) {
        const historial = buildHistorialPracticeFromChangeRows(rows, maps, defaultUserId);
        if (historial.length) {
          await withMongoRetry(`Opportunity.historialEstados mysqlOpp=${mysqlOppId}`, () =>
            Opportunity.updateOne({ _id: practiceMongoId }, { $set: { historialEstados: historial } })
          );
          stats.practiceStatusHistoryUpdated++;
        }
      }
      if (mtmMongoId) {
        const historialMtm = buildHistorialMtmFromChangeRows(rows, maps, defaultUserId);
        if (historialMtm.length) {
          await withMongoRetry(`OportunidadMTM.historialEstados mysqlOpp=${mysqlOppId}`, () =>
            OportunidadMTM.updateOne({ _id: mtmMongoId }, { $set: { historialEstados: historialMtm } })
          );
          stats.mtmStatusHistoryUpdated++;
        }
      }
      if (!practiceMongoId && !mtmMongoId) {
        stats.statusHistorySkippedNoOpportunity++;
      }
    } catch (e) {
      stats.statusHistoryErrors++;
      migrationLog(`Historial estados opportunity_id=${mysqlOppId}: ${e.message}`, { useStderr: true });
    }
  };

  const where = sqlChangeStatusOpportunityWhereClause();
  const baseSql = `
    SELECT id, opportunity_id, status_before, status_after, reason, \`date\`, contract, contracted, why_no_contracted, user_creator, comment
    FROM change_status_opportunity${where}
    ORDER BY opportunity_id ASC, \`date\` ASC, id ASC
  `;

  await queryPaged(baseSql, async (rows) => {
    for (const row of rows) {
      const oid = num(getRowCol(row, "opportunity_id"));
      if (oid == null) continue;
      if (pendingMysqlOppId !== null && oid !== pendingMysqlOppId) {
        await flushGroup();
      }
      pendingMysqlOppId = oid;
      pendingRows.push(row);
    }
  });
  await flushGroup();

  await backfillHistorialEstadosOportunidadesSinChangeLog(maps, stats, defaultUserId);

  migrationLog(
    `Historial estados OK: práctica ${stats.practiceStatusHistoryUpdated} (change_log), MTM ${stats.mtmStatusHistoryUpdated} (change_log), backfill práctica ${stats.practiceStatusHistoryBackfilled}, backfill MTM ${stats.mtmStatusHistoryBackfilled}, logs MySQL ${stats.opportunityStatusChangeLogsFromMysql}, snapshots ${stats.opportunityStatusChangeLogsSnapshots}, sin mapping ${stats.statusHistorySkippedNoOpportunity}, errores ${stats.statusHistoryErrors}`
  );
}

function mapDocStatus(raw) {
  const s = (raw || "").toUpperCase();
  let r = "pendiente";
  if (s.includes("APPROV")) r = "aprobado";
  else if (s.includes("REJECT")) r = "rechazado";
  return clampDocEstadoDocumento(r);
}

function token() {
  return crypto.randomBytes(24).toString("hex");
}

async function preloadMaps() {
  const [
    companies,
    items,
    periodos,
    countries,
    cities,
    programs,
    postulants,
    profiles,
    users,
    attachments,
    practiceDocDefs,
    mtmDocDefs,
    legacyRows,
    cvs,
  ] = await withMongoRetry("preloadMaps", () =>
    Promise.all([
      Company.find({ mysqlId: { $exists: true } }).select("_id mysqlId").lean(),
      Item.find({ mysqlId: { $exists: true } }).select("_id mysqlId value").lean(),
      Periodo.find({ mysqlId: { $exists: true } }).select("_id mysqlId").lean(),
      Country.find({ mysqlId: { $exists: true } }).select("_id mysqlId").lean(),
      City.find({ mysqlId: { $exists: true } }).select("_id mysqlId").lean(),
      Program.find({ mysqlId: { $exists: true } }).select("_id mysqlId level name").lean(),
      Postulant.find({ mysqlId: { $exists: true } }).select("_id mysqlId").lean(),
      PostulantProfile.find({ mysqlId: { $exists: true } }).select("_id mysqlId postulantId").lean(),
      User.find({ mysqlId: { $exists: true } }).select("_id mysqlId email").lean(),
      Attachment.find({ mysqlId: { $exists: true } }).select("_id mysqlId name filepath").lean(),
      DocumentPracticeDefinition.find({ mysqlId: { $exists: true } }).select("_id mysqlId").lean(),
      DocumentMonitoringDefinition.find({ mysqlId: { $exists: true } }).select("_id mysqlId").lean(),
      LegacyEntityMapping.find({}).select("scope legacyId mongoId meta").lean(),
      ProfileCv.find({}).select("profileId attachmentId").lean(),
    ])
  );

  const toMap = (rows, key = "mysqlId") => new Map(rows.map((r) => [num(r[key]), r]));

  const maps = {
    companiesByMysqlId: toMap(companies),
    itemsByMysqlId: toMap(items),
    periodosByMysqlId: toMap(periodos),
    countriesByMysqlId: toMap(countries),
    citiesByMysqlId: toMap(cities),
    programsByMysqlId: toMap(programs),
    postulantsByMysqlId: toMap(postulants),
    profilesByMysqlId: toMap(profiles),
    usersByMysqlId: toMap(users),
    attachmentsByMysqlId: toMap(attachments),
    practiceDocDefByMysqlId: toMap(practiceDocDefs),
    mtmDocDefByMysqlId: toMap(mtmDocDefs),
    legacyByScopeAndId: new Map(legacyRows.map((r) => [`${r.scope}:${r.legacyId}`, r])),
    profileByAttachmentMongoId: new Map(
      cvs.map((r) => [String(r.attachmentId), String(r.profileId)])
    ),
  };

  return maps;
}

async function reconcileExistingMappings(maps) {
  const [practiceOpps, mtmOpps, practiceApps, mtmApps, practiceLegals, mtmLegals, mtmPlans] =
    await withMongoRetry("reconcileExistingMappings", () =>
      Promise.all([
        Opportunity.find({ tipo: "practica" }).select("_id company nombreCargo periodo fechaVencimiento").lean(),
        OportunidadMTM.find({}).select("_id company nombreCargo periodo fechaVencimiento").lean(),
        PostulacionOportunidad.find({}).select("_id opportunity postulant").lean(),
        PostulacionMTM.find({}).select("_id oportunidadMTM postulant").lean(),
        LegalizacionPractica.find({}).select("_id postulacionOportunidad").lean(),
        LegalizacionMTM.find({}).select("_id postulacionMTM").lean(),
        PlanDeTrabajoMTM.find({}).select("_id postulacionMTM").lean(),
      ])
    );

  maps.practiceOpportunityByNaturalKey = new Map(
    practiceOpps.map((o) => [
      buildPracticeOpportunityKey({
        company: o.company,
        nombreCargo: o.nombreCargo,
        periodo: o.periodo,
        fechaVencimiento: o.fechaVencimiento,
      }),
      o._id,
    ])
  );
  maps.mtmOpportunityByNaturalKey = new Map(
    mtmOpps.map((o) => [
      buildMTMOpportunityKey({
        company: o.company,
        nombreCargo: o.nombreCargo,
        periodo: o.periodo,
        fechaVencimiento: o.fechaVencimiento,
      }),
      o._id,
    ])
  );
  maps.practiceApplicationByNaturalKey = new Map(
    practiceApps.map((a) => [`${String(a.opportunity)}|${String(a.postulant)}`, a._id])
  );
  maps.mtmApplicationByNaturalKey = new Map(
    mtmApps.map((a) => [`${String(a.oportunidadMTM)}|${String(a.postulant)}`, a._id])
  );
  maps.practiceLegalByPostulacion = new Map(
    practiceLegals.map((l) => [String(l.postulacionOportunidad), l._id])
  );
  maps.mtmLegalByPostulacion = new Map(
    mtmLegals.map((l) => [String(l.postulacionMTM), l._id])
  );
  maps.mtmPlanByPostulacion = new Map(mtmPlans.map((p) => [String(p.postulacionMTM), p._id]));
}

async function upsertLegacyMapping(scope, legacyId, mongoId, meta = {}) {
  if (legacyId == null || !mongoId) return;
  await withMongoRetry("LegacyEntityMapping.updateOne", () =>
    LegacyEntityMapping.updateOne(
      { scope, legacyId: num(legacyId) },
      { $set: { mongoId, meta: { ...meta, runId: RUN_ID } } },
      { upsert: true }
    )
  );
}

/** Varios mapeos legacy en un solo round-trip a Mongo. */
async function bulkUpsertLegacyMappings(entries) {
  if (!entries?.length) return;
  const chunks = chunk(entries, MONGO_WRITE_BATCH);
  for (const part of chunks) {
    const ops = part.map((m) => ({
      updateOne: {
        filter: { scope: m.scope, legacyId: num(m.legacyId) },
        update: { $set: { mongoId: m.mongoId, meta: { ...m.meta, runId: RUN_ID } } },
        upsert: true,
      },
    }));
    await withMongoRetry("LegacyEntityMapping.bulkWrite", () =>
      LegacyEntityMapping.bulkWrite(ops, { ordered: false })
    );
  }
}

async function buildProfileIdByPostulantMap(postulantMongoIds) {
  const ids = [...new Set(postulantMongoIds.filter(Boolean).map((id) => String(id)))];
  if (!ids.length) return new Map();
  const oidList = ids.map((id) => new mongoose.Types.ObjectId(id));
  const profs = await withMongoRetry("PostulantProfile.find(in)", () =>
    PostulantProfile.find({ postulantId: { $in: oidList } })
      .select("_id postulantId")
      .sort({ _id: 1 })
      .lean()
  );
  const m = new Map();
  for (const p of profs) {
    const k = String(p.postulantId);
    if (!m.has(k)) m.set(k, p._id);
  }
  return m;
}

function getLegacyMongoId(maps, scope, legacyId) {
  const row = maps.legacyByScopeAndId.get(`${scope}:${legacyId}`);
  return row ? row.mongoId : null;
}

function createRollbackContext() {
  return {
    practiceOpportunities: [],
    mtmOpportunities: [],
    practiceApplications: [],
    mtmApplications: [],
    practiceLegalizations: [],
    mtmLegalizations: [],
    mtmPlans: [],
    mtmSchedule: [],
  };
}

function trackCreated(ctx, key, id) {
  if (!id) return;
  ctx[key].push(id);
}

async function rollbackCreatedDocuments(ctx) {
  console.log(`\n↩️  Iniciando rollback de la corrida ${RUN_ID}...`);
  await withMongoRetry("rollback SeguimientoMTM", () =>
    SeguimientoMTM.deleteMany({ _id: { $in: ctx.mtmSchedule } })
  );
  await withMongoRetry("rollback PlanDeTrabajoMTM", () =>
    PlanDeTrabajoMTM.deleteMany({ _id: { $in: ctx.mtmPlans } })
  );
  await withMongoRetry("rollback LegalizacionMTM", () =>
    LegalizacionMTM.deleteMany({ _id: { $in: ctx.mtmLegalizations } })
  );
  await withMongoRetry("rollback LegalizacionPractica", () =>
    LegalizacionPractica.deleteMany({ _id: { $in: ctx.practiceLegalizations } })
  );
  await withMongoRetry("rollback PostulacionMTM", () =>
    PostulacionMTM.deleteMany({ _id: { $in: ctx.mtmApplications } })
  );
  await withMongoRetry("rollback PostulacionOportunidad", () =>
    PostulacionOportunidad.deleteMany({ _id: { $in: ctx.practiceApplications } })
  );
  await withMongoRetry("rollback OportunidadMTM", () =>
    OportunidadMTM.deleteMany({ _id: { $in: ctx.mtmOpportunities } })
  );
  await withMongoRetry("rollback Opportunity", () =>
    Opportunity.deleteMany({ _id: { $in: ctx.practiceOpportunities } })
  );
  await withMongoRetry("rollback LegacyEntityMapping", () =>
    LegacyEntityMapping.deleteMany({ "meta.runId": RUN_ID })
  );
  await withMongoRetry("rollback OpportunityStatusChangeLog", () =>
    OpportunityStatusChangeLog.deleteMany({ "meta.runId": RUN_ID })
  );
  console.log("✅ Rollback completado.");
}

async function migratePracticeOpportunities(maps, stats, rollbackCtx) {
  const rows = await runQuery(
    limitSqlPracticeOppMain(`
    SELECT
      o.id, o.company_id, o.closing_offer_date, o.job_title, o.functions, o.additional_requirements,
      o.number_of_vacants, o.user_creator, o.date_creation, o.user_updater, o.date_update,
      o.status, o.date_activate, o.opportunity_type,
      ap.ordinary_weekly_session, ap.dedication_hours, ap.dedication, ap.period, ap.contract_type, ap.is_paid,
      ap.salary_range_min, ap.salary_range_is_confidentiality, ap.country, ap.job_area,
      ap.extra_info_url, ap.date_start_practice, ap.date_end_practice, ap.cumulative_average,
      ap.horary_text
    FROM opportunity o
    LEFT JOIN academic_practice ap ON ap.academic_practice_id = o.id
    WHERE o.opportunity_type = 'ACADEMIC_PRACTICE'
    ${FOCUS_PRACTICE_OPP_IDS?.length ? `AND o.id IN (${FOCUS_PRACTICE_OPP_IDS.join(",")})` : ""}
    ${practiceOppOrderBySql()}
  `)
  );

  const defaultCreator =
    (await withMongoRetry("User.findOne(creadoPor)", () => User.findOne({}).select("_id").lean()))?._id ||
    null;

  async function processRowBatch(rowBatch) {
    const mappingOnly = [];
    const toCreate = [];
    const queuedNaturalKeysThisBatch = new Set();
    const duplicateOppSameNaturalKey = [];

    for (const row of rowBatch) {
      const legacyId = num(row.id);
      if (getLegacyMongoId(maps, LEGACY_SCOPE.PRACTICE_OPPORTUNITY, legacyId)) {
        stats.practiceOpportunitiesSkipped++;
        continue;
      }

      const company = maps.companiesByMysqlId.get(num(row.company_id));
      if (!company?._id) {
        stats.practiceOpportunitiesErrors++;
        continue;
      }

      const periodoId = maps.periodosByMysqlId.get(num(row.period))?._id || null;
      const fechaVencimiento = date(row.closing_offer_date);
      const naturalKey = buildPracticeOpportunityKey({
        company: company._id,
        nombreCargo: str(row.job_title) || "Oferta sin nombre",
        periodo: periodoId,
        fechaVencimiento,
      });
      const existingByNatural = maps.practiceOpportunityByNaturalKey?.get(naturalKey);
      if (existingByNatural) {
        mappingOnly.push({
          scope: LEGACY_SCOPE.PRACTICE_OPPORTUNITY,
          legacyId,
          mongoId: existingByNatural,
          meta: { source: "opportunity", matchedBy: "natural_key" },
        });
        maps.legacyByScopeAndId.set(`${LEGACY_SCOPE.PRACTICE_OPPORTUNITY}:${legacyId}`, {
          mongoId: existingByNatural,
        });
        stats.practiceOpportunitiesSkipped++;
        continue;
      }

      if (queuedNaturalKeysThisBatch.has(naturalKey)) {
        duplicateOppSameNaturalKey.push({ legacyId, naturalKey, opportunity_type: row.opportunity_type });
        continue;
      }

      const creator = Array.from(maps.usersByMysqlId.values()).find(
        (u) => u.email?.toLowerCase() === String(row.user_creator || "").toLowerCase()
      );

      const ows = num(row.ordinary_weekly_session);
      const dhRaw = row.dedication_hours;
      const dh =
        dhRaw != null && Number.isFinite(Number(dhRaw)) ? Math.round(Number(dhRaw)) : null;
      const horasSemana = ows != null ? ows : dh;

      queuedNaturalKeysThisBatch.add(naturalKey);
      toCreate.push({
        legacyId,
        naturalKey,
        opportunity_type: row.opportunity_type,
        mongoDoc: {
          tipo: "practica",
          company: company._id,
          nombreCargo: str(row.job_title) || "Oferta sin nombre",
          funciones: practicaFuncionesFromLegacy(row.functions),
          requisitos: str(row.additional_requirements) || "Sin requisitos",
          vacantes: num(row.number_of_vacants) || 1,
          fechaVencimiento,
          tipoVinculacion: maps.itemsByMysqlId.get(num(row.contract_type))?._id || null,
          periodo: periodoId,
          pais: maps.countriesByMysqlId.get(num(row.country))?._id || null,
          ciudad: null,
          dedicacion: maps.itemsByMysqlId.get(num(row.dedication))?._id || null,
          jornadaOrdinariaSemanal: horasSemana,
          jornadaSemanalPractica: horasSemana,
          fechaInicioPractica: date(row.date_start_practice),
          fechaFinPractica: date(row.date_end_practice),
          horario: str(row.horary_text),
          areaDesempeno: maps.itemsByMysqlId.get(num(row.job_area))?._id || null,
          enlacesFormatoEspecificos: str(row.extra_info_url),
          auxilioEconomico: bool(row.is_paid),
          requiereConfidencialidad: bool(row.salary_range_is_confidentiality),
          apoyoEconomico: num(row.salary_range_min),
          promedioMinimoRequerido: row.cumulative_average != null ? String(row.cumulative_average) : null,
          estado: mapPracticeOpportunityStatus(row.status),
          fechaCreacion: date(row.date_creation) || new Date(),
          fechaActivacion: date(row.date_activate),
          creadoPor: creator?._id || defaultCreator,
        },
      });
    }

    if (mappingOnly.length) await bulkUpsertLegacyMappings(mappingOnly);

    for (const sc of chunk(toCreate, MONGO_WRITE_BATCH)) {
      if (!sc.length) continue;
      const inserted = await withMongoRetry("Opportunity.insertMany", () =>
        Opportunity.insertMany(
          sc.map((x) => x.mongoDoc),
          { ordered: true }
        )
      );
      const mapEntries = sc.map((x, i) => ({
        scope: LEGACY_SCOPE.PRACTICE_OPPORTUNITY,
        legacyId: x.legacyId,
        mongoId: inserted[i]._id,
        meta: { source: "opportunity", opportunityType: x.opportunity_type },
      }));
      await bulkUpsertLegacyMappings(mapEntries);
      for (let i = 0; i < sc.length; i++) {
        const x = sc[i];
        const id = inserted[i]._id;
        maps.legacyByScopeAndId.set(`${LEGACY_SCOPE.PRACTICE_OPPORTUNITY}:${x.legacyId}`, { mongoId: id });
        maps.practiceOpportunityByNaturalKey?.set(x.naturalKey, id);
        trackCreated(rollbackCtx, "practiceOpportunities", id);
        stats.practiceOpportunitiesCreated++;
      }
    }

    for (const d of duplicateOppSameNaturalKey) {
      const mongoId = maps.practiceOpportunityByNaturalKey?.get(d.naturalKey);
      if (!mongoId) {
        stats.practiceOpportunitiesErrors++;
        continue;
      }
      await bulkUpsertLegacyMappings([
        {
          scope: LEGACY_SCOPE.PRACTICE_OPPORTUNITY,
          legacyId: d.legacyId,
          mongoId,
          meta: {
            source: "opportunity",
            matchedBy: "duplicate_mysql_row_same_natural_key",
            opportunityType: d.opportunity_type,
          },
        },
      ]);
      maps.legacyByScopeAndId.set(`${LEGACY_SCOPE.PRACTICE_OPPORTUNITY}:${d.legacyId}`, { mongoId });
      stats.practiceOpportunitiesSkipped++;
    }
  }

  for (const part of chunk(rows, BATCH_SIZE)) {
    await processRowBatch(part);
    await sleep(INTER_BATCH_SLEEP_MS);
  }
}

async function enrichPracticeProgramsAndLanguages(maps, stats) {
  const exP = sqlPracticeOppIdsInExpr();
  const progSql = exP
    ? `SELECT opportunity_id, program_id FROM opportunity_programs WHERE opportunity_id IN ${exP}`
    : `SELECT opportunity_id, program_id FROM opportunity_programs`;
  const olSql = exP
    ? `SELECT academic_practice_id, opportunity_language_id FROM academic_practice_opportunity_language WHERE academic_practice_id IN ${exP}`
    : `SELECT academic_practice_id, opportunity_language_id FROM academic_practice_opportunity_language`;

  const [programRows, oppLangRows, langRows] = await Promise.all([
    runQuery(limitSqlUnlessPracticeScoped(progSql)),
    runQuery(limitSqlUnlessPracticeScoped(olSql)),
    runQuery(limitSqlUnlessPracticeScoped(`SELECT id, language_id, level_id FROM opportunity_language`)),
  ]);

  const langsById = new Map(langRows.map((r) => [num(r.id), r]));
  const byOppProgram = new Map();
  const byOppLanguage = new Map();

  for (const r of programRows) {
    const id = num(r.opportunity_id);
    if (!byOppProgram.has(id)) byOppProgram.set(id, []);
    byOppProgram.get(id).push(num(r.program_id));
  }
  for (const r of oppLangRows) {
    const id = num(r.academic_practice_id);
    if (!byOppLanguage.has(id)) byOppLanguage.set(id, []);
    byOppLanguage.get(id).push(num(r.opportunity_language_id));
  }

  const programOps = [];
  for (const [legacyOppId, programIds] of byOppProgram.entries()) {
    const oppMongoId = getLegacyMongoId(maps, LEGACY_SCOPE.PRACTICE_OPPORTUNITY, legacyOppId);
    if (!oppMongoId) continue;
    const programs = programIds
      .map((pid) => maps.programsByMysqlId.get(pid))
      .filter(Boolean)
      .map((p) => ({ level: p.level || "PREGRADO", program: p.name || "Programa" }));
    if (programs.length) {
      programOps.push({
        updateOne: {
          filter: { _id: oppMongoId },
          update: { $set: { formacionAcademica: programs } },
        },
      });
    }
  }
  for (const part of chunk(programOps, MONGO_WRITE_BATCH)) {
    if (!part.length) continue;
    await withMongoRetry("Opportunity.bulkWrite(formacionAcademica)", () =>
      Opportunity.bulkWrite(part, { ordered: false })
    );
    stats.practiceProgramsEnriched += part.length;
  }

  const idiomaOps = [];
  for (const [legacyOppId, olIds] of byOppLanguage.entries()) {
    const oppMongoId = getLegacyMongoId(maps, LEGACY_SCOPE.PRACTICE_OPPORTUNITY, legacyOppId);
    if (!oppMongoId) continue;
    const idiomas = [];
    for (const olid of olIds) {
      const row = langsById.get(olid);
      if (!row) continue;
      const lang = maps.itemsByMysqlId.get(num(row.language_id));
      const lvl = maps.itemsByMysqlId.get(num(row.level_id));
      if (!lang || !lvl) continue;
      const levelRaw = (lvl.value || "").toString().toUpperCase();
      const levelMap = {
        A1: "A1", A2: "A2", B1: "B1", B2: "B2", C1: "C1", C2: "C2",
        NATIVO: "Nativo", NATIVE: "Nativo",
      };
      idiomas.push({
        language: String(lang.value || "Idioma"),
        level: levelMap[levelRaw] || "B1",
      });
    }
    if (idiomas.length) {
      idiomaOps.push({
        updateOne: {
          filter: { _id: oppMongoId },
          update: { $set: { idiomas } },
        },
      });
    }
  }
  for (const part of chunk(idiomaOps, MONGO_WRITE_BATCH)) {
    if (!part.length) continue;
    await withMongoRetry("Opportunity.bulkWrite(idiomas)", () =>
      Opportunity.bulkWrite(part, { ordered: false })
    );
    stats.practiceLanguagesEnriched += part.length;
  }
}

async function migratePracticeApplications(maps, stats, rollbackCtx) {
  await queryPaged(
    `
    SELECT
      oa.id, oa.opportunity_id, oa.postulant_id, oa.postulant_cv, oa.status, oa.viewed, oa.revisedCompany,
      oa.downloaded, oa.contracted, oa.date_creation, oa.tutor_name, oa.tutor_lastname, oa.tutor_identification_type,
      oa.tutor_identification, oa.tutor_email, oa.tutor_position, oa.company_arl, oa.practice_start_date
    FROM opportunity_application oa
    INNER JOIN opportunity o ON o.id = oa.opportunity_id
    WHERE o.opportunity_type = 'ACADEMIC_PRACTICE'
    ${sqlFilterPracticeApplicationsByOppScope()}
    ORDER BY oa.id
    `,
    async (rows, offset) => {
      const postulantMongoIds = [];
      for (const row of rows) {
        const p = maps.postulantsByMysqlId.get(num(row.postulant_id))?._id;
        if (p) postulantMongoIds.push(p);
      }
      const profileByPostulant = await buildProfileIdByPostulantMap(postulantMongoIds);

      for (const sub of chunk(rows, BATCH_SIZE)) {
        const mappingOnly = [];
        const toCreate = [];
        /** Evita E11000: varias filas MySQL con el mismo (opp, postulante) en un mismo sub-lote. */
        const queuedNaturalKeysThisSub = new Set();
        const duplicateMysqlRowsSamePair = [];

        for (const row of sub) {
          const legacyId = num(row.id);
          if (getLegacyMongoId(maps, LEGACY_SCOPE.PRACTICE_APPLICATION, legacyId)) {
            stats.practiceApplicationsSkipped++;
            continue;
          }

          const opportunity = getLegacyMongoId(maps, LEGACY_SCOPE.PRACTICE_OPPORTUNITY, num(row.opportunity_id));
          const postulant = maps.postulantsByMysqlId.get(num(row.postulant_id))?._id;
          if (!opportunity || !postulant) {
            stats.practiceApplicationsErrors++;
            continue;
          }

          const appNaturalKey = `${String(opportunity)}|${String(postulant)}`;
          const existingByNatural = maps.practiceApplicationByNaturalKey?.get(appNaturalKey);
          if (existingByNatural) {
            mappingOnly.push({
              scope: LEGACY_SCOPE.PRACTICE_APPLICATION,
              legacyId,
              mongoId: existingByNatural,
              meta: { source: "opportunity_application", matchedBy: "natural_key" },
            });
            maps.legacyByScopeAndId.set(`${LEGACY_SCOPE.PRACTICE_APPLICATION}:${legacyId}`, {
              mongoId: existingByNatural,
            });
            stats.practiceApplicationsSkipped++;
            continue;
          }

          if (queuedNaturalKeysThisSub.has(appNaturalKey)) {
            duplicateMysqlRowsSamePair.push({ legacyId, appNaturalKey });
            continue;
          }

          const attachment = maps.attachmentsByMysqlId.get(num(row.postulant_cv));
          const profileIdFromCv = attachment?._id
            ? maps.profileByAttachmentMongoId.get(String(attachment._id))
            : null;
          const postulantProfile =
            (profileIdFromCv && mongoose.Types.ObjectId.isValid(profileIdFromCv) ? profileIdFromCv : null) ||
            profileByPostulant.get(String(postulant));
          if (!postulantProfile) {
            stats.practiceApplicationsErrors++;
            continue;
          }

          queuedNaturalKeysThisSub.add(appNaturalKey);
          const estado = mapApplicationStatus(row);
          toCreate.push({
            legacyId,
            row,
            appNaturalKey,
            mongoDoc: {
              postulant,
              opportunity,
              postulantProfile,
              estado,
              fechaAplicacion: date(row.date_creation) || new Date(),
              empresaConsultoPerfilAt:
                bool(row.viewed) || bool(row.revisedCompany) ? date(row.date_creation) || new Date() : null,
              empresaDescargoHvAt: bool(row.downloaded) ? date(row.date_creation) || new Date() : null,
              seleccionadoAt: estado === "seleccionado_empresa" ? date(row.date_creation) || new Date() : null,
              aceptadoEstudianteAt: estado === "aceptado_estudiante" ? date(row.date_creation) || new Date() : null,
              rechazadoAt: estado === "rechazado" ? date(row.date_creation) || new Date() : null,
              comentarios: null,
            },
          });
        }

        if (mappingOnly.length) await bulkUpsertLegacyMappings(mappingOnly);

        for (const wc of chunk(toCreate, MONGO_WRITE_BATCH)) {
          if (!wc.length) continue;
          const inserted = await withMongoRetry("PostulacionOportunidad.insertMany", () =>
            PostulacionOportunidad.insertMany(
              wc.map((x) => x.mongoDoc),
              { ordered: true }
            )
          );
          const mapEntries = wc.map((x, i) => ({
            scope: LEGACY_SCOPE.PRACTICE_APPLICATION,
            legacyId: x.legacyId,
            mongoId: inserted[i]._id,
            meta: {
              source: "opportunity_application",
              opportunityId: num(x.row.opportunity_id),
              postulantId: num(x.row.postulant_id),
              tutor: {
                tutor_name: x.row.tutor_name,
                tutor_lastname: x.row.tutor_lastname,
                tutor_identification_type: x.row.tutor_identification_type,
                tutor_identification: x.row.tutor_identification,
                tutor_email: x.row.tutor_email,
                tutor_position: x.row.tutor_position,
                company_arl: x.row.company_arl,
                practice_start_date: x.row.practice_start_date,
              },
            },
          }));
          await bulkUpsertLegacyMappings(mapEntries);
          for (let i = 0; i < wc.length; i++) {
            const x = wc[i];
            const id = inserted[i]._id;
            maps.legacyByScopeAndId.set(`${LEGACY_SCOPE.PRACTICE_APPLICATION}:${x.legacyId}`, { mongoId: id });
            maps.practiceApplicationByNaturalKey?.set(x.appNaturalKey, id);
            trackCreated(rollbackCtx, "practiceApplications", id);
            stats.practiceApplicationsCreated++;
          }
        }

        for (const d of duplicateMysqlRowsSamePair) {
          const mongoId = maps.practiceApplicationByNaturalKey?.get(d.appNaturalKey);
          if (!mongoId) {
            stats.practiceApplicationsErrors++;
            continue;
          }
          await bulkUpsertLegacyMappings([
            {
              scope: LEGACY_SCOPE.PRACTICE_APPLICATION,
              legacyId: d.legacyId,
              mongoId,
              meta: {
                source: "opportunity_application",
                matchedBy: "duplicate_mysql_row_same_opp_postulant",
              },
            },
          ]);
          maps.legacyByScopeAndId.set(`${LEGACY_SCOPE.PRACTICE_APPLICATION}:${d.legacyId}`, {
            mongoId,
          });
          stats.practiceApplicationsSkipped++;
        }

        await sleep(INTER_BATCH_SLEEP_MS);
      }
    }
  );
}

async function migratePracticeLegalizationsAndDocs(maps, stats, rollbackCtx) {
  const exP = sqlPracticeOppIdsInExpr();
  const legalPrWhere = exP ? `WHERE academic_practice_id IN ${exP}` : "";
  const legalPrOrder = exP || MIGRATION_RECENT_OPPORTUNITIES_FIRST ? "DESC" : "ASC";
  const docsPrWhere = exP
    ? `WHERE academic_practice_legalized_id IN (
      SELECT academic_practice_legalized_id FROM academic_practice_legalized
      WHERE academic_practice_id IN ${exP}
    )`
    : "";

  const [legalizaciones, docs, oaRows] = await Promise.all([
    runQuery(
      limitSqlPracticeLegalChain(`
    SELECT
      academic_practice_legalized_id, academic_practice_id, postulant_apl, status_apl, date_creation
    FROM academic_practice_legalized
    ${legalPrWhere}
    ORDER BY academic_practice_legalized_id ${legalPrOrder}
  `)
    ),
    runQuery(
      limitSqlPracticeLegalChain(`
    SELECT
      document_practice_definition_id, academic_practice_legalized_id, document_attached_id, document_status
    FROM document_practice
    ${docsPrWhere}
  `)
    ),
    runQuery(
      limitSqlPracticeLegalChain(`
    SELECT oa.id, oa.opportunity_id, oa.postulant_id
    FROM opportunity_application oa
    INNER JOIN opportunity o ON o.id = oa.opportunity_id
    WHERE o.opportunity_type = 'ACADEMIC_PRACTICE'
    ${sqlFilterPracticeApplicationsByOppScope()}
    ORDER BY oa.id
  `)
    ),
  ]);

  const oaKeyToAppId = new Map();
  for (const r of oaRows) {
    const k = `${num(r.opportunity_id)}|${num(r.postulant_id)}`;
    if (!oaKeyToAppId.has(k)) oaKeyToAppId.set(k, num(r.id));
  }

  const docsByLegalizacion = new Map();
  for (const d of docs) {
    const id = num(d.academic_practice_legalized_id);
    if (!docsByLegalizacion.has(id)) docsByLegalizacion.set(id, []);
    docsByLegalizacion.get(id).push(d);
  }

  async function processLegalBatch(rowBatch) {
    const mappingOnly = [];
    const toCreate = [];
    /** Una legalización Mongo por postulación; varias filas MySQL pueden apuntar al mismo par. */
    const queuedPostulacionThisBatch = new Set();
    const duplicateLegalSamePostulacion = [];

    for (const l of rowBatch) {
      const legacyId = num(l.academic_practice_legalized_id);
      if (getLegacyMongoId(maps, LEGACY_SCOPE.PRACTICE_LEGALIZATION, legacyId)) {
        stats.practiceLegalizationsSkipped++;
        continue;
      }

      const appLegacyId = oaKeyToAppId.get(`${num(l.academic_practice_id)}|${num(l.postulant_apl)}`);
      const postulacionMongo = appLegacyId
        ? getLegacyMongoId(maps, LEGACY_SCOPE.PRACTICE_APPLICATION, appLegacyId)
        : null;
      if (!postulacionMongo) {
        stats.practiceLegalizationsErrors++;
        continue;
      }
      const postKey = String(postulacionMongo);
      const existingLegal = maps.practiceLegalByPostulacion?.get(postKey);
      if (existingLegal) {
        mappingOnly.push({
          scope: LEGACY_SCOPE.PRACTICE_LEGALIZATION,
          legacyId,
          mongoId: existingLegal,
          meta: { source: "academic_practice_legalized", matchedBy: "postulacionOportunidad" },
        });
        maps.legacyByScopeAndId.set(`${LEGACY_SCOPE.PRACTICE_LEGALIZATION}:${legacyId}`, {
          mongoId: existingLegal,
        });
        stats.practiceLegalizationsSkipped++;
        continue;
      }

      if (queuedPostulacionThisBatch.has(postKey)) {
        duplicateLegalSamePostulacion.push({ legacyId, postulacionMongo });
        continue;
      }

      const documentosLegacy = docsByLegalizacion.get(legacyId) || [];
      const documentos = {};
      for (const dl of documentosLegacy) {
        const def = maps.practiceDocDefByMysqlId.get(num(dl.document_practice_definition_id));
        const att = maps.attachmentsByMysqlId.get(num(dl.document_attached_id));
        if (!def?._id || !att?._id) continue;
        documentos[String(def._id)] = {
          key: att.filepath || "",
          originalName: att.name || "",
          size: null,
          estadoDocumento: mapDocStatus(dl.document_status),
          motivoRechazo: null,
        };
      }

      const estado = mapLegalizacionPracticaStatus(l.status_apl);
      queuedPostulacionThisBatch.add(postKey);
      toCreate.push({ legacyId, postulacionMongo, l, estado, documentos });
    }

    if (mappingOnly.length) await bulkUpsertLegacyMappings(mappingOnly);

    for (const wc of chunk(toCreate, MONGO_WRITE_BATCH)) {
      if (!wc.length) continue;
      const mongoDocs = wc.map((x) => ({
        postulacionOportunidad: x.postulacionMongo,
        estado: x.estado,
        acuerdoTresFirmasCompletas: false,
        documentos: x.documentos,
        enviadoRevisionAt: x.estado === "en_revision" ? date(x.l.date_creation) : null,
        aprobadoAt: x.estado === "aprobada" ? date(x.l.date_creation) : null,
        rechazadoAt: x.estado === "rechazada" ? date(x.l.date_creation) : null,
        historial: [
          {
            estadoAnterior: null,
            estadoNuevo: x.estado,
            fecha: date(x.l.date_creation) || new Date(),
            detalle: "Migrado desde academic_practice_legalized",
          },
        ],
      }));
      const inserted = await withMongoRetry("LegalizacionPractica.insertMany", () =>
        LegalizacionPractica.insertMany(mongoDocs, { ordered: true })
      );
      const mapEntries = wc.map((x, i) => ({
        scope: LEGACY_SCOPE.PRACTICE_LEGALIZATION,
        legacyId: x.legacyId,
        mongoId: inserted[i]._id,
        meta: { source: "academic_practice_legalized" },
      }));
      await bulkUpsertLegacyMappings(mapEntries);
      for (let i = 0; i < wc.length; i++) {
        const x = wc[i];
        const id = inserted[i]._id;
        maps.legacyByScopeAndId.set(`${LEGACY_SCOPE.PRACTICE_LEGALIZATION}:${x.legacyId}`, { mongoId: id });
        maps.practiceLegalByPostulacion?.set(String(x.postulacionMongo), id);
        trackCreated(rollbackCtx, "practiceLegalizations", id);
        stats.practiceLegalizationsCreated++;
      }
    }

    for (const d of duplicateLegalSamePostulacion) {
      const mongoId = maps.practiceLegalByPostulacion?.get(String(d.postulacionMongo));
      if (!mongoId) {
        stats.practiceLegalizationsErrors++;
        continue;
      }
      await bulkUpsertLegacyMappings([
        {
          scope: LEGACY_SCOPE.PRACTICE_LEGALIZATION,
          legacyId: d.legacyId,
          mongoId,
          meta: {
            source: "academic_practice_legalized",
            matchedBy: "duplicate_mysql_row_same_postulacion",
          },
        },
      ]);
      maps.legacyByScopeAndId.set(`${LEGACY_SCOPE.PRACTICE_LEGALIZATION}:${d.legacyId}`, {
        mongoId,
      });
      stats.practiceLegalizationsSkipped++;
    }
  }

  for (const part of chunk(legalizaciones, BATCH_SIZE)) {
    await processLegalBatch(part);
    await sleep(INTER_BATCH_SLEEP_MS);
  }
}

async function migrateMTMOpportunities(maps, stats, rollbackCtx) {
  const rows = await runQuery(
    limitSqlMtmOppMain(`
    SELECT
      o.id, o.company_id, o.closing_offer_date, o.job_title, o.functions, o.additional_requirements,
      o.number_of_vacants, o.user_creator, o.status, o.date_creation,
      sw.dedication_hours, sw.remuneration_hour_per_week, sw.contract_type, sw.category, sw.period_sw,
      sw.cumulative_average, sw.teacher_responsable, sw.monitoring_group
    FROM opportunity o
    LEFT JOIN study_working sw ON sw.study_working_id = o.id
    WHERE o.opportunity_type <> 'ACADEMIC_PRACTICE'
    ${FOCUS_MTM_OPP_IDS?.length ? `AND o.id IN (${FOCUS_MTM_OPP_IDS.join(",")})` : ""}
    ${mtmOppOrderBySql()}
  `)
  );

  async function processMtmOppBatch(rowBatch) {
    const mappingOnly = [];
    const toCreate = [];
    const queuedNaturalKeysThisBatch = new Set();
    const duplicateOppSameNaturalKey = [];

    for (const row of rowBatch) {
      const legacyId = num(row.id);
      if (getLegacyMongoId(maps, LEGACY_SCOPE.MTM_OPPORTUNITY, legacyId)) {
        stats.mtmOpportunitiesSkipped++;
        continue;
      }
      const company = maps.companiesByMysqlId.get(num(row.company_id))?._id || null;
      const periodoId = maps.periodosByMysqlId.get(num(row.period_sw))?._id || null;
      const fechaVencimiento = date(row.closing_offer_date);
      const naturalKey = buildMTMOpportunityKey({
        company,
        nombreCargo: str(row.job_title) || "Monitoria sin nombre",
        periodo: periodoId,
        fechaVencimiento,
      });
      const existingByNatural = maps.mtmOpportunityByNaturalKey?.get(naturalKey);
      if (existingByNatural) {
        mappingOnly.push({
          scope: LEGACY_SCOPE.MTM_OPPORTUNITY,
          legacyId,
          mongoId: existingByNatural,
          meta: { source: "opportunity+study_working", matchedBy: "natural_key" },
        });
        maps.legacyByScopeAndId.set(`${LEGACY_SCOPE.MTM_OPPORTUNITY}:${legacyId}`, { mongoId: existingByNatural });
        stats.mtmOpportunitiesSkipped++;
        continue;
      }

      if (queuedNaturalKeysThisBatch.has(naturalKey)) {
        duplicateOppSameNaturalKey.push({ legacyId, naturalKey });
        continue;
      }

      const creator = Array.from(maps.usersByMysqlId.values()).find(
        (u) => u.email?.toLowerCase() === String(row.user_creator || "").toLowerCase()
      );

      queuedNaturalKeysThisBatch.add(naturalKey);
      toCreate.push({
        legacyId,
        naturalKey,
        mongoDoc: {
          company,
          nombreCargo: str(row.job_title) || "Monitoria sin nombre",
          dedicacionHoras: maps.itemsByMysqlId.get(num(row.dedication_hours))?._id || null,
          valorPorHora: maps.itemsByMysqlId.get(num(row.remuneration_hour_per_week))?._id || null,
          tipoVinculacion: maps.itemsByMysqlId.get(num(row.contract_type))?._id || null,
          categoria: maps.itemsByMysqlId.get(num(row.category))?._id || null,
          periodo: periodoId,
          vacantes: num(row.number_of_vacants) || 1,
          fechaVencimiento,
          promedioMinimo: num(row.cumulative_average),
          nombreProfesor: str(row.teacher_responsable),
          grupo: row.monitoring_group != null ? String(row.monitoring_group) : null,
          funciones: mtmTextoMax250(row.functions),
          requisitos: mtmTextoMax250(row.additional_requirements),
          estado: mapMTMOpportunityStatus(row.status),
          creadoPor: creator?._id || null,
        },
      });
    }

    if (mappingOnly.length) await bulkUpsertLegacyMappings(mappingOnly);

    for (const sc of chunk(toCreate, MONGO_WRITE_BATCH)) {
      if (!sc.length) continue;
      const inserted = await withMongoRetry("OportunidadMTM.insertMany", () =>
        OportunidadMTM.insertMany(
          sc.map((x) => x.mongoDoc),
          { ordered: true }
        )
      );
      const mapEntries = sc.map((x, i) => ({
        scope: LEGACY_SCOPE.MTM_OPPORTUNITY,
        legacyId: x.legacyId,
        mongoId: inserted[i]._id,
        meta: { source: "opportunity+study_working" },
      }));
      await bulkUpsertLegacyMappings(mapEntries);
      for (let i = 0; i < sc.length; i++) {
        const x = sc[i];
        const id = inserted[i]._id;
        maps.legacyByScopeAndId.set(`${LEGACY_SCOPE.MTM_OPPORTUNITY}:${x.legacyId}`, { mongoId: id });
        maps.mtmOpportunityByNaturalKey?.set(x.naturalKey, id);
        trackCreated(rollbackCtx, "mtmOpportunities", id);
        stats.mtmOpportunitiesCreated++;
      }
    }

    for (const d of duplicateOppSameNaturalKey) {
      const mongoId = maps.mtmOpportunityByNaturalKey?.get(d.naturalKey);
      if (!mongoId) {
        stats.mtmOpportunitiesErrors++;
        continue;
      }
      await bulkUpsertLegacyMappings([
        {
          scope: LEGACY_SCOPE.MTM_OPPORTUNITY,
          legacyId: d.legacyId,
          mongoId,
          meta: {
            source: "opportunity+study_working",
            matchedBy: "duplicate_mysql_row_same_natural_key",
          },
        },
      ]);
      maps.legacyByScopeAndId.set(`${LEGACY_SCOPE.MTM_OPPORTUNITY}:${d.legacyId}`, { mongoId });
      stats.mtmOpportunitiesSkipped++;
    }
  }

  for (const part of chunk(rows, BATCH_SIZE)) {
    await processMtmOppBatch(part);
    await sleep(INTER_BATCH_SLEEP_MS);
  }
}

async function enrichMTMPrograms(maps, stats) {
  const exM = sqlMtmOppIdsInExpr();
  const progSqlMtm = exM
    ? `SELECT opportunity_id, program_id FROM opportunity_programs WHERE opportunity_id IN ${exM}`
    : `SELECT opportunity_id, program_id FROM opportunity_programs`;
  const rows = await runQuery(limitSqlUnlessMtmScoped(progSqlMtm));
  const byOpp = new Map();
  for (const r of rows) {
    const oid = num(r.opportunity_id);
    if (!byOpp.has(oid)) byOpp.set(oid, []);
    byOpp.get(oid).push(num(r.program_id));
  }
  const mtmProgramOps = [];
  for (const [legacyOppId, pids] of byOpp.entries()) {
    const opMongo = getLegacyMongoId(maps, LEGACY_SCOPE.MTM_OPPORTUNITY, legacyOppId);
    if (!opMongo) continue;
    const programIds = pids
      .map((pid) => maps.programsByMysqlId.get(pid)?._id)
      .filter(Boolean);
    if (!programIds.length) continue;
    mtmProgramOps.push({
      updateOne: {
        filter: { _id: opMongo },
        update: { $set: { programas: [...new Set(programIds)] } },
      },
    });
  }
  for (const part of chunk(mtmProgramOps, MONGO_WRITE_BATCH)) {
    if (!part.length) continue;
    await withMongoRetry("OportunidadMTM.bulkWrite(programas)", () =>
      OportunidadMTM.bulkWrite(part, { ordered: false })
    );
    stats.mtmProgramsEnriched += part.length;
  }
}

async function migrateMTMApplications(maps, stats, rollbackCtx) {
  await queryPaged(
    `
    SELECT
      oa.id, oa.opportunity_id, oa.postulant_id, oa.postulant_cv, oa.status, oa.viewed,
      oa.revisedCompany, oa.downloaded, oa.contracted, oa.date_creation
    FROM opportunity_application oa
    INNER JOIN opportunity o ON o.id = oa.opportunity_id
    WHERE o.opportunity_type <> 'ACADEMIC_PRACTICE'
    ${sqlFilterMtmApplicationsByOppScope()}
    ORDER BY oa.id
    `,
    async (rows, offset) => {
      const postulantMongoIds = [];
      for (const row of rows) {
        const p = maps.postulantsByMysqlId.get(num(row.postulant_id))?._id;
        if (p) postulantMongoIds.push(p);
      }
      const profileByPostulant = await buildProfileIdByPostulantMap(postulantMongoIds);

      for (const sub of chunk(rows, BATCH_SIZE)) {
        const mappingOnly = [];
        const toCreate = [];
        const queuedNaturalKeysThisSub = new Set();
        const duplicateMysqlRowsSamePair = [];

        for (const row of sub) {
          const oppMtm = getLegacyMongoId(maps, LEGACY_SCOPE.MTM_OPPORTUNITY, num(row.opportunity_id));
          if (!oppMtm) continue;
          const legacyId = num(row.id);
          if (getLegacyMongoId(maps, LEGACY_SCOPE.MTM_APPLICATION, legacyId)) {
            stats.mtmApplicationsSkipped++;
            continue;
          }

          const postulant = maps.postulantsByMysqlId.get(num(row.postulant_id))?._id;
          if (!postulant) {
            stats.mtmApplicationsErrors++;
            continue;
          }
          const appNaturalKey = `${String(oppMtm)}|${String(postulant)}`;
          const existingByNatural = maps.mtmApplicationByNaturalKey?.get(appNaturalKey);
          if (existingByNatural) {
            mappingOnly.push({
              scope: LEGACY_SCOPE.MTM_APPLICATION,
              legacyId,
              mongoId: existingByNatural,
              meta: { source: "opportunity_application", matchedBy: "natural_key" },
            });
            maps.legacyByScopeAndId.set(`${LEGACY_SCOPE.MTM_APPLICATION}:${legacyId}`, {
              mongoId: existingByNatural,
            });
            stats.mtmApplicationsSkipped++;
            continue;
          }

          if (queuedNaturalKeysThisSub.has(appNaturalKey)) {
            duplicateMysqlRowsSamePair.push({ legacyId, appNaturalKey });
            continue;
          }

          const attachment = maps.attachmentsByMysqlId.get(num(row.postulant_cv));
          const profileIdFromCv = attachment?._id
            ? maps.profileByAttachmentMongoId.get(String(attachment._id))
            : null;
          const postulantProfile =
            (profileIdFromCv && mongoose.Types.ObjectId.isValid(profileIdFromCv) ? profileIdFromCv : null) ||
            profileByPostulant.get(String(postulant));
          if (!postulantProfile) {
            stats.mtmApplicationsErrors++;
            continue;
          }

          queuedNaturalKeysThisSub.add(appNaturalKey);
          const estado = mapApplicationStatus(row);
          toCreate.push({
            legacyId,
            row,
            appNaturalKey,
            mongoDoc: {
              postulant,
              oportunidadMTM: oppMtm,
              postulantProfile,
              estado,
              fechaAplicacion: date(row.date_creation) || new Date(),
              empresaConsultoPerfilAt:
                bool(row.viewed) || bool(row.revisedCompany) ? date(row.date_creation) || new Date() : null,
              empresaDescargoHvAt: bool(row.downloaded) ? date(row.date_creation) || new Date() : null,
              seleccionadoAt: estado === "seleccionado_empresa" ? date(row.date_creation) || new Date() : null,
              aceptadoEstudianteAt: estado === "aceptado_estudiante" ? date(row.date_creation) || new Date() : null,
              rechazadoAt: estado === "rechazado" ? date(row.date_creation) || new Date() : null,
              linkAsistenciaToken: token(),
            },
          });
        }

        if (mappingOnly.length) await bulkUpsertLegacyMappings(mappingOnly);

        for (const wc of chunk(toCreate, MONGO_WRITE_BATCH)) {
          if (!wc.length) continue;
          const inserted = await withMongoRetry("PostulacionMTM.insertMany", () =>
            PostulacionMTM.insertMany(
              wc.map((x) => x.mongoDoc),
              { ordered: true }
            )
          );
          const mapEntries = wc.map((x, i) => ({
            scope: LEGACY_SCOPE.MTM_APPLICATION,
            legacyId: x.legacyId,
            mongoId: inserted[i]._id,
            meta: {
              source: "opportunity_application",
              opportunityId: num(x.row.opportunity_id),
              postulantId: num(x.row.postulant_id),
            },
          }));
          await bulkUpsertLegacyMappings(mapEntries);
          for (let i = 0; i < wc.length; i++) {
            const x = wc[i];
            const id = inserted[i]._id;
            maps.legacyByScopeAndId.set(`${LEGACY_SCOPE.MTM_APPLICATION}:${x.legacyId}`, { mongoId: id });
            maps.mtmApplicationByNaturalKey?.set(x.appNaturalKey, id);
            trackCreated(rollbackCtx, "mtmApplications", id);
            stats.mtmApplicationsCreated++;
          }
        }

        for (const d of duplicateMysqlRowsSamePair) {
          const mongoId = maps.mtmApplicationByNaturalKey?.get(d.appNaturalKey);
          if (!mongoId) {
            stats.mtmApplicationsErrors++;
            continue;
          }
          await bulkUpsertLegacyMappings([
            {
              scope: LEGACY_SCOPE.MTM_APPLICATION,
              legacyId: d.legacyId,
              mongoId,
              meta: {
                source: "opportunity_application",
                matchedBy: "duplicate_mysql_row_same_opp_postulant",
              },
            },
          ]);
          maps.legacyByScopeAndId.set(`${LEGACY_SCOPE.MTM_APPLICATION}:${d.legacyId}`, {
            mongoId,
          });
          stats.mtmApplicationsSkipped++;
        }

        await sleep(INTER_BATCH_SLEEP_MS);
      }
    }
  );
}

async function migrateMTMLegalizationsAndDocs(maps, stats, rollbackCtx) {
  const exM = sqlMtmOppIdsInExpr();
  const mtmLegWhere = exM ? `WHERE study_working_id IN ${exM}` : "";
  const mtmLegOrder = exM || MIGRATION_RECENT_OPPORTUNITIES_FIRST ? "DESC" : "ASC";
  const mtmDocsWhere = exM
    ? `WHERE monitoring_legalized_id IN (
      SELECT monitoring_legalized_id FROM monitoring_legalized
      WHERE study_working_id IN ${exM}
    )`
    : "";

  const [legalizaciones, docs, oaRows] = await Promise.all([
    runQuery(
      limitSqlMtmLegalChain(`
      SELECT
        monitoring_legalized_id, study_working_id, postulant_ml, status, date_creation,
        eps, account_type, fin_bank, fin_account_number
      FROM monitoring_legalized
      ${mtmLegWhere}
      ORDER BY monitoring_legalized_id ${mtmLegOrder}
    `)
    ),
    runQuery(
      limitSqlMtmLegalChain(`
      SELECT
        monitoring_legalized_id, document_monitoring_definition_id, document_attached_id, document_status
      FROM document_monitoring
      ${mtmDocsWhere}
    `)
    ),
    runQuery(
      limitSqlMtmLegalChain(`
      SELECT oa.id, oa.opportunity_id, oa.postulant_id
      FROM opportunity_application oa
      INNER JOIN opportunity o ON o.id = oa.opportunity_id
      WHERE o.opportunity_type <> 'ACADEMIC_PRACTICE'
      ${sqlFilterMtmApplicationsByOppScope()}
      ORDER BY oa.id
    `)
    ),
  ]);

  const mtmOaKeyToAppId = new Map();
  for (const r of oaRows) {
    const k = `${num(r.opportunity_id)}|${num(r.postulant_id)}`;
    if (!mtmOaKeyToAppId.has(k)) mtmOaKeyToAppId.set(k, num(r.id));
  }

  const docsByLegal = new Map();
  for (const d of docs) {
    const id = num(d.monitoring_legalized_id);
    if (!docsByLegal.has(id)) docsByLegal.set(id, []);
    docsByLegal.get(id).push(d);
  }

  async function processMtmLegalBatch(rowBatch) {
    const mappingOnly = [];
    const toCreate = [];
    const queuedPostulacionThisBatch = new Set();
    const duplicateLegalSamePostulacion = [];

    for (const l of rowBatch) {
      const legacyId = num(l.monitoring_legalized_id);
      if (getLegacyMongoId(maps, LEGACY_SCOPE.MTM_LEGALIZATION, legacyId)) {
        stats.mtmLegalizationsSkipped++;
        continue;
      }

      const appLegacyId = mtmOaKeyToAppId.get(`${num(l.study_working_id)}|${num(l.postulant_ml)}`);
      const postulacionMTM = appLegacyId
        ? getLegacyMongoId(maps, LEGACY_SCOPE.MTM_APPLICATION, appLegacyId)
        : null;
      if (!postulacionMTM) {
        stats.mtmLegalizationsErrors++;
        continue;
      }
      const postKey = String(postulacionMTM);
      const existingLegal = maps.mtmLegalByPostulacion?.get(postKey);
      if (existingLegal) {
        mappingOnly.push({
          scope: LEGACY_SCOPE.MTM_LEGALIZATION,
          legacyId,
          mongoId: existingLegal,
          meta: { source: "monitoring_legalized", matchedBy: "postulacionMTM" },
        });
        maps.legacyByScopeAndId.set(`${LEGACY_SCOPE.MTM_LEGALIZATION}:${legacyId}`, { mongoId: existingLegal });
        stats.mtmLegalizationsSkipped++;
        continue;
      }

      if (queuedPostulacionThisBatch.has(postKey)) {
        duplicateLegalSamePostulacion.push({ legacyId, postulacionMTM });
        continue;
      }

      const documentos = {};
      for (const d of docsByLegal.get(legacyId) || []) {
        const def = maps.mtmDocDefByMysqlId.get(num(d.document_monitoring_definition_id));
        const att = maps.attachmentsByMysqlId.get(num(d.document_attached_id));
        if (!def?._id || !att?._id) continue;
        documentos[String(def._id)] = {
          key: att.filepath || "",
          originalName: att.name || "",
          size: null,
          estadoDocumento: mapDocStatus(d.document_status),
          motivoRechazo: null,
        };
      }

      queuedPostulacionThisBatch.add(postKey);
      toCreate.push({ legacyId, postulacionMTM, l, documentos });
    }

    if (mappingOnly.length) await bulkUpsertLegacyMappings(mappingOnly);

    for (const wc of chunk(toCreate, MONGO_WRITE_BATCH)) {
      if (!wc.length) continue;
      const mongoDocs = wc.map((x) => ({
        postulacionMTM: x.postulacionMTM,
        estado: mapLegalizacionMTMStatus(x.l.status),
        eps: maps.itemsByMysqlId.get(num(x.l.eps))?._id || null,
        tipoCuenta: maps.itemsByMysqlId.get(num(x.l.account_type))?._id || null,
        banco: maps.itemsByMysqlId.get(num(x.l.fin_bank))?._id || null,
        numeroCuenta: str(x.l.fin_account_number),
        documentos: x.documentos,
        enviadoRevisionAt: date(x.l.date_creation),
        historial: [
          {
            estadoAnterior: null,
            estadoNuevo: mapLegalizacionMTMStatus(x.l.status),
            usuario: null,
            fecha: date(x.l.date_creation) || new Date(),
            detalle: "Migrado desde monitoring_legalized",
            ip: null,
          },
        ],
      }));
      const inserted = await withMongoRetry("LegalizacionMTM.insertMany", () =>
        LegalizacionMTM.insertMany(mongoDocs, { ordered: true })
      );
      const mapEntries = wc.map((x, i) => ({
        scope: LEGACY_SCOPE.MTM_LEGALIZATION,
        legacyId: x.legacyId,
        mongoId: inserted[i]._id,
        meta: { source: "monitoring_legalized" },
      }));
      await bulkUpsertLegacyMappings(mapEntries);
      for (let i = 0; i < wc.length; i++) {
        const x = wc[i];
        const id = inserted[i]._id;
        maps.legacyByScopeAndId.set(`${LEGACY_SCOPE.MTM_LEGALIZATION}:${x.legacyId}`, { mongoId: id });
        maps.mtmLegalByPostulacion?.set(String(x.postulacionMTM), id);
        trackCreated(rollbackCtx, "mtmLegalizations", id);
        stats.mtmLegalizationsCreated++;
      }
    }

    for (const d of duplicateLegalSamePostulacion) {
      const mongoId = maps.mtmLegalByPostulacion?.get(String(d.postulacionMTM));
      if (!mongoId) {
        stats.mtmLegalizationsErrors++;
        continue;
      }
      await bulkUpsertLegacyMappings([
        {
          scope: LEGACY_SCOPE.MTM_LEGALIZATION,
          legacyId: d.legacyId,
          mongoId,
          meta: {
            source: "monitoring_legalized",
            matchedBy: "duplicate_mysql_row_same_postulacion",
          },
        },
      ]);
      maps.legacyByScopeAndId.set(`${LEGACY_SCOPE.MTM_LEGALIZATION}:${d.legacyId}`, { mongoId });
      stats.mtmLegalizationsSkipped++;
    }
  }

  for (const part of chunk(legalizaciones, BATCH_SIZE)) {
    await processMtmLegalBatch(part);
    await sleep(INTER_BATCH_SLEEP_MS);
  }
}

async function migrateMTMPlansAndSchedule(maps, stats, rollbackCtx) {
  const exM = sqlMtmOppIdsInExpr();
  const planWhere = exM
    ? `WHERE monitoring_legalized_id IN (
      SELECT monitoring_legalized_id FROM monitoring_legalized
      WHERE study_working_id IN ${exM}
    )`
    : "";
  const planOrder = exM || MIGRATION_RECENT_OPPORTUNITIES_FIRST ? "DESC" : "ASC";
  const schedWhere = exM
    ? `WHERE monitoring_plan_id IN (
      SELECT id FROM monitoring_plan
      WHERE monitoring_legalized_id IN (
        SELECT monitoring_legalized_id FROM monitoring_legalized
        WHERE study_working_id IN ${exM}
      )
    )`
    : "";
  const schedOrder = exM || MIGRATION_RECENT_OPPORTUNITIES_FIRST ? "DESC" : "ASC";

  const [plans, schedule] = await Promise.all([
    runQuery(
      limitSqlMtmLegalChain(`
      SELECT id, monitoring_legalized_id, summary, general_objective, specific_objectives, status, date_creation
      FROM monitoring_plan
      ${planWhere}
      ORDER BY id ${planOrder}
    `)
    ),
    runQuery(
      limitSqlMtmLegalChain(`
      SELECT id, monitoring_plan_id, date, monitoring_theme, monitoring_strategies, monitoring_activities, date_creation
      FROM monitoring_plan_schedule
      ${schedWhere}
      ORDER BY id ${schedOrder}
    `)
    ),
  ]);

  function planEstadoFromRow(p) {
    const status = String(p.status || "").toUpperCase();
    let estado = "borrador";
    if (status.includes("APPROV")) estado = "aprobado";
    else if (status.includes("REJECT")) estado = "rechazado";
    else if (status.includes("REVIEW")) estado = "enviado_revision";
    return clampPlanTrabajoMtmEstado(estado);
  }

  async function processPlanBatch(planBatch) {
    const legalMongoIds = [
      ...new Set(
        planBatch
          .map((p) => getLegacyMongoId(maps, LEGACY_SCOPE.MTM_LEGALIZATION, num(p.monitoring_legalized_id)))
          .filter(Boolean)
          .map((id) => String(id))
      ),
    ];
    const legalOid = legalMongoIds.map((id) => new mongoose.Types.ObjectId(id));
    const legalsLean =
      legalOid.length > 0
        ? await withMongoRetry("LegalizacionMTM.find($in plans)", () =>
            LegalizacionMTM.find({ _id: { $in: legalOid } }).select("_id postulacionMTM").lean()
          )
        : [];
    const postByLegalMongo = new Map(legalsLean.map((x) => [String(x._id), x.postulacionMTM]));

    const mappingOnly = [];
    const toCreate = [];
    const queuedPostulacionPlanBatch = new Set();
    const duplicatePlanSamePostulacion = [];

    for (const p of planBatch) {
      const legacyId = num(p.id);
      if (getLegacyMongoId(maps, LEGACY_SCOPE.MTM_PLAN, legacyId)) {
        stats.mtmPlansSkipped++;
        continue;
      }
      const legalMongoId = getLegacyMongoId(maps, LEGACY_SCOPE.MTM_LEGALIZATION, num(p.monitoring_legalized_id));
      if (!legalMongoId) {
        stats.mtmPlansErrors++;
        continue;
      }
      const postulacionMTM = postByLegalMongo.get(String(legalMongoId));
      if (!postulacionMTM) {
        stats.mtmPlansErrors++;
        continue;
      }
      const postKey = String(postulacionMTM);
      const existingPlan = maps.mtmPlanByPostulacion?.get(postKey);
      if (existingPlan) {
        mappingOnly.push({
          scope: LEGACY_SCOPE.MTM_PLAN,
          legacyId,
          mongoId: existingPlan,
          meta: { source: "monitoring_plan", matchedBy: "postulacionMTM" },
        });
        maps.legacyByScopeAndId.set(`${LEGACY_SCOPE.MTM_PLAN}:${legacyId}`, { mongoId: existingPlan });
        stats.mtmPlansSkipped++;
        continue;
      }

      if (queuedPostulacionPlanBatch.has(postKey)) {
        duplicatePlanSamePostulacion.push({ legacyId, postulacionMTM });
        continue;
      }

      const estado = planEstadoFromRow(p);
      queuedPostulacionPlanBatch.add(postKey);
      toCreate.push({
        legacyId,
        postulacionMTM,
        mongoDoc: {
          postulacionMTM,
          estado,
          justificacion: str(p.summary) || "",
          objetivoGeneral: str(p.general_objective) || "",
          objetivosEspecificos: str(p.specific_objectives) || "",
          enviadoRevisionAt: estado === "enviado_revision" ? date(p.date_creation) : null,
          aprobadoPorProfesorAt: estado === "aprobado" ? date(p.date_creation) : null,
          rechazadoAt: estado === "rechazado" ? date(p.date_creation) : null,
        },
      });
    }

    if (mappingOnly.length) await bulkUpsertLegacyMappings(mappingOnly);

    for (const wc of chunk(toCreate, MONGO_WRITE_BATCH)) {
      if (!wc.length) continue;
      const inserted = await withMongoRetry("PlanDeTrabajoMTM.insertMany", () =>
        PlanDeTrabajoMTM.insertMany(
          wc.map((x) => x.mongoDoc),
          { ordered: true }
        )
      );
      const mapEntries = wc.map((x, i) => ({
        scope: LEGACY_SCOPE.MTM_PLAN,
        legacyId: x.legacyId,
        mongoId: inserted[i]._id,
        meta: { source: "monitoring_plan" },
      }));
      await bulkUpsertLegacyMappings(mapEntries);
      for (let i = 0; i < wc.length; i++) {
        const x = wc[i];
        const id = inserted[i]._id;
        maps.legacyByScopeAndId.set(`${LEGACY_SCOPE.MTM_PLAN}:${x.legacyId}`, { mongoId: id });
        maps.mtmPlanByPostulacion?.set(String(x.postulacionMTM), id);
        trackCreated(rollbackCtx, "mtmPlans", id);
        stats.mtmPlansCreated++;
      }
    }

    for (const d of duplicatePlanSamePostulacion) {
      const mongoId = maps.mtmPlanByPostulacion?.get(String(d.postulacionMTM));
      if (!mongoId) {
        stats.mtmPlansErrors++;
        continue;
      }
      await bulkUpsertLegacyMappings([
        {
          scope: LEGACY_SCOPE.MTM_PLAN,
          legacyId: d.legacyId,
          mongoId,
          meta: {
            source: "monitoring_plan",
            matchedBy: "duplicate_mysql_row_same_postulacion",
          },
        },
      ]);
      maps.legacyByScopeAndId.set(`${LEGACY_SCOPE.MTM_PLAN}:${d.legacyId}`, { mongoId });
      stats.mtmPlansSkipped++;
    }
  }

  for (const part of chunk(plans, BATCH_SIZE)) {
    await processPlanBatch(part);
    await sleep(INTER_BATCH_SLEEP_MS);
  }

  async function processScheduleBatch(schedBatch) {
    const planMongoIds = [
      ...new Set(
        schedBatch
          .map((s) => getLegacyMongoId(maps, LEGACY_SCOPE.MTM_PLAN, num(s.monitoring_plan_id)))
          .filter(Boolean)
          .map((id) => String(id))
      ),
    ];
    const planOid = planMongoIds.map((id) => new mongoose.Types.ObjectId(id));
    const plansLean =
      planOid.length > 0
        ? await withMongoRetry("PlanDeTrabajoMTM.find($in schedule)", () =>
            PlanDeTrabajoMTM.find({ _id: { $in: planOid } }).select("_id postulacionMTM").lean()
          )
        : [];
    const postByPlanMongo = new Map(plansLean.map((x) => [String(x._id), x.postulacionMTM]));

    const toCreate = [];

    for (const s of schedBatch) {
      const legacyId = num(s.id);
      if (getLegacyMongoId(maps, LEGACY_SCOPE.MTM_PLAN_SCHEDULE, legacyId)) {
        stats.mtmScheduleSkipped++;
        continue;
      }
      const planMongoId = getLegacyMongoId(maps, LEGACY_SCOPE.MTM_PLAN, num(s.monitoring_plan_id));
      if (!planMongoId) {
        stats.mtmScheduleErrors++;
        continue;
      }
      const postulacionMTM = postByPlanMongo.get(String(planMongoId));
      if (!postulacionMTM) {
        stats.mtmScheduleErrors++;
        continue;
      }

      toCreate.push({
        legacyId,
        mongoDoc: {
          postulacionMTM,
          tipoActividad: str(s.monitoring_theme) || "",
          fecha: date(s.date) || date(s.date_creation) || new Date(),
          comentarios: str(s.monitoring_activities) || "",
          descripcion: str(s.monitoring_strategies) || "",
          estado: clampSeguimientoMtmEstado("pendiente_revision"),
          creadoPor: null,
          actualizadoPor: null,
        },
      });
    }

    for (const wc of chunk(toCreate, MONGO_WRITE_BATCH)) {
      if (!wc.length) continue;
      const inserted = await withMongoRetry("SeguimientoMTM.insertMany", () =>
        SeguimientoMTM.insertMany(
          wc.map((x) => x.mongoDoc),
          { ordered: true }
        )
      );
      const mapEntries = wc.map((x, i) => ({
        scope: LEGACY_SCOPE.MTM_PLAN_SCHEDULE,
        legacyId: x.legacyId,
        mongoId: inserted[i]._id,
        meta: { source: "monitoring_plan_schedule" },
      }));
      await bulkUpsertLegacyMappings(mapEntries);
      for (let i = 0; i < wc.length; i++) {
        const x = wc[i];
        const id = inserted[i]._id;
        maps.legacyByScopeAndId.set(`${LEGACY_SCOPE.MTM_PLAN_SCHEDULE}:${x.legacyId}`, { mongoId: id });
        trackCreated(rollbackCtx, "mtmSchedule", id);
        stats.mtmScheduleCreated++;
      }
    }
  }

  for (const part of chunk(schedule, BATCH_SIZE)) {
    await processScheduleBatch(part);
    await sleep(INTER_BATCH_SLEEP_MS);
  }
}

async function migrate() {
  console.log("🔄 Iniciando migración integral de oportunidades (MySQL → MongoDB)");
  console.log(`🧾 RunId: ${RUN_ID}`);
  migrationLog(`=== INICIO corrida runId=${RUN_ID} ===`);

  await connectDB();
  const mongoDb = mongoose.connection.db?.databaseName ?? "?";
  migrationLog(`MongoDB conectado: host=${mongoose.connection.host} database=${mongoDb}`);

  await connectMySQL();
  const mysqlHost = process.env.MYSQL_HOST || "127.0.0.1";
  const mysqlDb = process.env.MYSQL_DATABASE || "tenant-1";
  migrationLog(`MySQL: host=${mysqlHost} database=${mysqlDb} (verifica que sea la fuente esperada)`);
  if (MIGRATION_MYSQL_ROW_LIMIT > 0) {
    migrationLog(
      `MySQL: MIGRATION_MYSQL_ROW_LIMIT=${MIGRATION_MYSQL_ROW_LIMIT} (0 en env = migración completa sin tope)`
    );
  }
  if (MIGRATION_RECENT_OPPORTUNITIES_FIRST) {
    migrationLog(
      `MySQL: últimas ${MIGRATION_MYSQL_ROW_LIMIT} oportunidades por id (práctica y MTM) y datos filtrados a esos ids`
    );
  }
  if (FOCUS_PRACTICE_OPP_IDS?.length) {
    migrationLog(`MySQL: foco práctica opportunity.id = [${FOCUS_PRACTICE_OPP_IDS.join(", ")}]`);
  }
  if (FOCUS_MTM_OPP_IDS?.length) {
    migrationLog(`MySQL: foco MTM opportunity.id = [${FOCUS_MTM_OPP_IDS.join(", ")}]`);
  }
  if (SKIP_PRACTICE_OPPORTUNITIES_PIPELINE) migrationLog("Saltando pipeline práctica (MIGRATION_SKIP_PRACTICE_OPPORTUNITIES_PIPELINE=1)");
  if (SKIP_MTM_OPPORTUNITIES_PIPELINE) migrationLog("Saltando pipeline MTM (MIGRATION_SKIP_MTM_OPPORTUNITIES_PIPELINE=1)");
  if (!RUN_MYSQL_DOMAIN_ARCHIVE) {
    migrationLog("Sin archivo masivo MySQL (defecto: solo entidades normalizadas; ver MIGRATION_MYSQL_DOMAIN_ARCHIVE)");
  }

  const rollbackCtx = createRollbackContext();

  const stats = {
    practiceOpportunitiesCreated: 0,
    practiceOpportunitiesSkipped: 0,
    practiceOpportunitiesErrors: 0,
    practiceProgramsEnriched: 0,
    practiceLanguagesEnriched: 0,
    practiceApplicationsCreated: 0,
    practiceApplicationsSkipped: 0,
    practiceApplicationsErrors: 0,
    practiceLegalizationsCreated: 0,
    practiceLegalizationsSkipped: 0,
    practiceLegalizationsErrors: 0,
    mtmOpportunitiesCreated: 0,
    mtmOpportunitiesSkipped: 0,
    mtmOpportunitiesErrors: 0,
    mtmProgramsEnriched: 0,
    mtmApplicationsCreated: 0,
    mtmApplicationsSkipped: 0,
    mtmApplicationsErrors: 0,
    mtmLegalizationsCreated: 0,
    mtmLegalizationsSkipped: 0,
    mtmLegalizationsErrors: 0,
    mtmPlansCreated: 0,
    mtmPlansSkipped: 0,
    mtmPlansErrors: 0,
    mtmScheduleCreated: 0,
    mtmScheduleSkipped: 0,
    mtmScheduleErrors: 0,
    practiceStatusHistoryUpdated: 0,
    mtmStatusHistoryUpdated: 0,
    practiceStatusHistoryBackfilled: 0,
    mtmStatusHistoryBackfilled: 0,
    opportunityStatusChangeLogsFromMysql: 0,
    opportunityStatusChangeLogsSnapshots: 0,
    statusHistorySkippedNoOpportunity: 0,
    statusHistoryErrors: 0,
    legacyPracticeLegalHistorialUpdated: 0,
    legacyPracticePlanHistorialUpdated: 0,
    legacyPracticePlanMonitoringHistorialUpdated: 0,
    legacyProgramApprovalHistorialUpdated: 0,
    legacyMtmLegalHistorialUpdated: 0,
    legacyMtmDocApprovalHistorialUpdated: 0,
    legacyDetailedHistoryErrors: 0,
    mysqlDomainArchiveByTable: {},
    mysqlDomainArchiveOversized: 0,
  };

  try {
    migrationLog("Fase 1/11: preloadMaps...");
    const maps = await preloadMaps();
    migrationLog("Fase 1/11: preloadMaps OK");

    migrationLog("Fase 2/11: reconcileExistingMappings...");
    await reconcileExistingMappings(maps);
    migrationLog("Fase 2/11: reconcileExistingMappings OK");

    if (!SKIP_PRACTICE_OPPORTUNITIES_PIPELINE) {
      migrationLog("Fase 3/11: migratePracticeOpportunities...");
      await migratePracticeOpportunities(maps, stats, rollbackCtx);
      migrationLog("Fase 3/11: migratePracticeOpportunities OK");

      migrationLog("Fase 4/11: enrichPracticeProgramsAndLanguages...");
      await enrichPracticeProgramsAndLanguages(maps, stats);
      migrationLog("Fase 4/11: enrichPracticeProgramsAndLanguages OK");

      migrationLog("Fase 5/11: migratePracticeApplications...");
      await migratePracticeApplications(maps, stats, rollbackCtx);
      migrationLog("Fase 5/11: migratePracticeApplications OK");

      migrationLog("Fase 6/11: migratePracticeLegalizationsAndDocs...");
      await migratePracticeLegalizationsAndDocs(maps, stats, rollbackCtx);
      migrationLog("Fase 6/11: migratePracticeLegalizationsAndDocs OK");
    } else {
      migrationLog("Fases 3–6 omitidas (pipeline práctica desactivada)");
    }

    if (!SKIP_MTM_OPPORTUNITIES_PIPELINE) {
      migrationLog("Fase 7/11: migrateMTMOpportunities...");
      await migrateMTMOpportunities(maps, stats, rollbackCtx);
      migrationLog("Fase 7/11: migrateMTMOpportunities OK");

      migrationLog("Fase 8/11: enrichMTMPrograms...");
      await enrichMTMPrograms(maps, stats);
      migrationLog("Fase 8/11: enrichMTMPrograms OK");

      migrationLog("Fase 9/11: migrateMTMApplications + legalizaciones...");
      await migrateMTMApplications(maps, stats, rollbackCtx);
      await migrateMTMLegalizationsAndDocs(maps, stats, rollbackCtx);
      migrationLog("Fase 9/11: migrateMTMApplications + legalizaciones OK");

      migrationLog("Fase 10/11: migrateMTMPlansAndSchedule...");
      await migrateMTMPlansAndSchedule(maps, stats, rollbackCtx);
      migrationLog("Fase 10/11: migrateMTMPlansAndSchedule OK");
    } else {
      migrationLog("Fases 7–10 omitidas (pipeline MTM desactivada)");
    }

    migrationLog("Historial detallado legado (legalizaciones, programas, planes práctica, aprob. doc. MTM)...");
    await migrateLegacyDetailedMirrorHistoriales(maps, stats);
    migrationLog("Historial detallado legado OK");

    migrationLog("Historial de estados (change_status_opportunity)...");
    await migrateOpportunityStatusHistoryFromMySQL(maps, stats);
    migrationLog("Historial de estados OK");

    await migrateMysqlDomainArchives(stats);
  } catch (err) {
    migrationLog(`ERROR durante migración (rollback de docs creados en esta corrida): ${err.message}`, {
      useStderr: true,
    });
    await rollbackCreatedDocuments(rollbackCtx);
    throw err;
  }

  printMigrationSummary(stats, RUN_ID);
}

/** Resumen multilínea + línea RESULTADO en stderr (ver migrationLog). */
function printMigrationSummary(stats, runId) {
  const s = stats;
  const text = `
======================================================================
  MIGRACIÓN OPORTUNIDADES (MySQL → Mongo) — COMPLETADA SIN ERRORES FATALES
======================================================================
  RunId (trazabilidad / rollback): ${runId}

  Prácticas — oportunidades      creadas: ${s.practiceOpportunitiesCreated}
                               omitidas: ${s.practiceOpportunitiesSkipped}
                                errores: ${s.practiceOpportunitiesErrors}
  Prácticas — programas enriquecidos:   ${s.practiceProgramsEnriched}
  Prácticas — idiomas enriquecidos:      ${s.practiceLanguagesEnriched}
  Prácticas — postulaciones      creadas: ${s.practiceApplicationsCreated}
                               omitidas: ${s.practiceApplicationsSkipped}
                                errores: ${s.practiceApplicationsErrors}
  Prácticas — legalizaciones     creadas: ${s.practiceLegalizationsCreated}
                               omitidas: ${s.practiceLegalizationsSkipped}
                                errores: ${s.practiceLegalizationsErrors}

  MTM — oportunidades            creadas: ${s.mtmOpportunitiesCreated}
                               omitidas: ${s.mtmOpportunitiesSkipped}
                                errores: ${s.mtmOpportunitiesErrors}
  MTM — programas enriquecidos:           ${s.mtmProgramsEnriched}
  MTM — postulaciones            creadas: ${s.mtmApplicationsCreated}
                               omitidas: ${s.mtmApplicationsSkipped}
                                errores: ${s.mtmApplicationsErrors}
  MTM — legalizaciones           creadas: ${s.mtmLegalizationsCreated}
                               omitidas: ${s.mtmLegalizationsSkipped}
                                errores: ${s.mtmLegalizationsErrors}
  MTM — planes trabajo           creadas: ${s.mtmPlansCreated}
                               omitidas: ${s.mtmPlansSkipped}
                                errores: ${s.mtmPlansErrors}
  MTM — cronograma (seguim.)     creadas: ${s.mtmScheduleCreated}
                               omitidas: ${s.mtmScheduleSkipped}
                                errores: ${s.mtmScheduleErrors}

  Historial estados (change_status_opportunity + backfill opportunity.status):
    práctica — vía change_log:               ${s.practiceStatusHistoryUpdated}
    práctica — backfill (sin historial previo): ${s.practiceStatusHistoryBackfilled}
    MTM — vía change_log:                    ${s.mtmStatusHistoryUpdated}
    MTM — backfill (sin historial previo):   ${s.mtmStatusHistoryBackfilled}
    colección opportunity_status_change_logs — filas change_status: ${s.opportunityStatusChangeLogsFromMysql}
    colección opportunity_status_change_logs — snapshots:        ${s.opportunityStatusChangeLogsSnapshots}
    sin mapping a Mongo (id MySQL huérfano): ${s.statusHistorySkippedNoOpportunity}
    errores al escribir historial:          ${s.statusHistoryErrors}

  Historial legado (espejo — change_status_* / approval_*):
    legalizaciones práctica actualizadas:    ${s.legacyPracticeLegalHistorialUpdated}
    plan trabajo práctica (cpp):            ${s.legacyPracticePlanHistorialUpdated}
    plan trabajo práctica (cmp→pp):        ${s.legacyPracticePlanMonitoringHistorialUpdated}
    aprobación programas / oferta:          ${s.legacyProgramApprovalHistorialUpdated}
    legalizaciones MTM actualizadas:        ${s.legacyMtmLegalHistorialUpdated}
    aprobaciones documento MTM (por legal): ${s.legacyMtmDocApprovalHistorialUpdated}
    errores historial legado:               ${s.legacyDetailedHistoryErrors}

  Archivo MySQL (legacy_mysql_opportunity_domain):
    filas omitidas por tamaño BSON: ${s.mysqlDomainArchiveOversized}
    filas leídas por tabla: ${Object.entries(s.mysqlDomainArchiveByTable || {})
      .map(([t, n]) => `${t}=${n}`)
      .join(", ") || "(ninguna / fase desactivada)"}

  Omitidas = ya en legacy_entity_mappings o misma clave natural en Mongo.
  Creadas  = documentos nuevos en esta corrida.
======================================================================
`;
  console.log(text.trim());

  const oneLine = `RESULTADO: OK | runId=${runId} | practOpp +${s.practiceOpportunitiesCreated} ~${s.practiceOpportunitiesSkipped} err=${s.practiceOpportunitiesErrors} | postPract +${s.practiceApplicationsCreated} | mtmOpp +${s.mtmOpportunitiesCreated} ~${s.mtmOpportunitiesSkipped} | postMtm +${s.mtmApplicationsCreated}`;
  migrationLog(oneLine, { useStderr: true });

  if (process.env.MIGRATION_PRINT_JSON === "1") {
    console.log(JSON.stringify({ ok: true, runId, stats: s }, null, 2));
  }
}

migrate()
  .catch((err) => {
    console.error("❌ Error migrando oportunidades:", err);
    const msg = err?.message || String(err);
    migrationLog(`RESULTADO: ERROR | runId=${RUN_ID} | ${msg}`, { useStderr: true });
    if (isMongoStorageQuotaError(err)) {
      migrationLog(
        "MongoDB: cuota de disco llena (típico Atlas M0 = 512 MB). Opciones: ampliar cluster en Atlas, eliminar colecciones de prueba, compactar, o usar otro MONGO_URI (local/Docker) con más espacio. La migración no puede continuar hasta liberar o ampliar almacenamiento.",
        { useStderr: true }
      );
    }
    if (err?.stack) console.error(err.stack);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await closePool();
      await mongoose.disconnect();
    } catch (closeErr) {
      migrationLog(`Al cerrar conexiones: ${closeErr.message}`, { useStderr: true });
    }
    const code = process.exitCode ?? 0;
    migrationLog(`=== FIN proceso (exitCode=${code}) ===`, { useStderr: true });
  });

