/**
 * Mapeo MySQL → Mongo por **tabla / columnas**, alineado a los enums de cada modelo Mongoose.
 * Cada `change_status_*` puede ampliarse con claves propias sin pasar por `clamp*` en el migrador.
 *
 * | Tabla / origen MySQL | Columnas típicas | Export |
 * |----------------------|------------------|--------|
 * | change_status_opportunity | status_before, status_after (práctica) | mapMysqlChangeStatusOpportunityToPracticeEstado |
 * | change_status_opportunity | status_* (MTM) | mapMysqlChangeStatusOpportunityToMtmEstado |
 * | opportunity | status | mapMysqlOpportunityTableStatusToPracticeEstado / …MtmEstado |
 * | change_status_legalized | status_legalized_* | mapMysqlChangeStatusLegalizedToLegalizacionEstado |
 * | change_status_monitoring_legalized | status_legalized_* | mapMysqlChangeStatusMonitoringLegalizedToLegalizacionEstado |
 * | monitoring_plan | status | mapMysqlMonitoringPlanStatusToPlanTrabajoMtmEstado |
 * | document_practice / document_monitoring / approval_monitoring_documents | document_status / approval_document_status_* | mapMysqlLegalizacionDocumentoEstado |
 * | opportunity_application | status, flags | mapMysqlOpportunityApplicationToPostulacionEstado |
 */

const OPPORTUNITY_PRACTICE_ESTADOS = Object.freeze([
  "Creada",
  "En Revisión",
  "Revisada",
  "Activa",
  "Rechazada",
  "Cerrada",
  "Vencida",
]);
const DEFAULT_OPPORTUNITY_PRACTICE_ESTADO = "Creada";

const OPORTUNIDAD_MTM_ESTADOS = Object.freeze(["Borrador", "Activa", "Inactiva"]);
const DEFAULT_OPORTUNIDAD_MTM_ESTADO = "Borrador";

const LEGALIZACION_ESTADOS = Object.freeze([
  "borrador",
  "en_revision",
  "aprobada",
  "rechazada",
  "en_ajuste",
]);
const DEFAULT_LEGALIZACION_ESTADO = "borrador";

const POSTULACION_ESTADOS = Object.freeze([
  "aplicado",
  "empresa_consulto_perfil",
  "empresa_descargo_hv",
  "seleccionado_empresa",
  "aceptado_estudiante",
  "rechazado",
]);
const DEFAULT_POSTULACION_ESTADO = "aplicado";

const PLAN_TRABAJO_MTM_ESTADOS = Object.freeze([
  "borrador",
  "enviado_revision",
  "aprobado",
  "rechazado",
]);
const DEFAULT_PLAN_TRABAJO_MTM_ESTADO = "borrador";

const DOC_ESTADO_DOCUMENTO = Object.freeze(["pendiente", "aprobado", "rechazado"]);
const DEFAULT_DOC_ESTADO_DOCUMENTO = "pendiente";

const DEFAULT_SEGUIMIENTO_MTM_ESTADO = "pendiente_revision";

function norm(raw) {
  return String(raw ?? "").trim();
}

function normKey(raw) {
  return norm(raw).toUpperCase().replace(/\s+/g, "_");
}

/** Si el string ya es una etiqueta Mongo del modelo, devolverla; si vacío, undefined (sigue el mapa legacy). */
function passThroughIfMongoLabel(raw, allowed) {
  const n = norm(raw);
  if (!n) return undefined;
  return allowed.includes(n) ? n : undefined;
}

/**
 * `opportunity.status` y `change_status_opportunity.status_*` (misma convención legacy en tenant antiguo).
 */
const MYSQL_OPPORTUNITY_ROW_TO_PRACTICE_MONGO = Object.freeze({
  CREATED: "Creada",
  CREATE: "Creada",
  REVIEW: "En Revisión",
  REVISED: "Revisada",
  ACTIVED: "Activa",
  ACTIVE: "Activa",
  ACTIVATED: "Activa",
  PUBLISHED: "Activa",
  APPROVED: "Activa",
  ACTIVADA: "Activa",
  CLOSED: "Cerrada",
  CERRADA: "Cerrada",
  REJECTED: "Rechazada",
  REJECT: "Rechazada",
});

/**
 * Misma tabla/columnas cuando la oferta es MTM (`OportunidadMTM.estado`).
 */
const MYSQL_OPPORTUNITY_ROW_TO_MTM_MONGO = Object.freeze({
  CREATED: "Borrador",
  CREATE: "Borrador",
  REVIEW: "Borrador",
  REVISED: "Borrador",
  DRAFT: "Borrador",
  ACTIVED: "Activa",
  ACTIVE: "Activa",
  ACTIVATED: "Activa",
  PUBLISHED: "Activa",
  APPROVED: "Activa",
  CLOSED: "Inactiva",
  REJECTED: "Inactiva",
  CANCEL: "Inactiva",
  CANCELLED: "Inactiva",
  INACTIVE: "Inactiva",
  EXPIRED: "Inactiva",
});

function fuzzyPracticeFromMysqlKey(s) {
  if (!s || s === "NO_EXIST") return null;
  if (s.includes("OVERDUE") || s.includes("EXPIRED") || s.includes("VENCID")) return "Vencida";
  if (["ACTIVE", "ACTIVATED", "PUBLISHED", "APPROVED"].some((k) => s.includes(k))) return "Activa";
  if (["CLOSED", "FINISHED", "CANCEL"].some((k) => s.includes(k)) && !s.includes("REJECT")) return "Cerrada";
  if (s.includes("REJECT")) return "Rechazada";
  if (
    s.includes("PENDING_REVIEW") ||
    s.includes("IN_REVIEW") ||
    s.includes("UNDER_REVIEW") ||
    s.includes("EN_REVISION") ||
    s.includes("TO_REVIEW")
  ) {
    return "En Revisión";
  }
  return null;
}

function fuzzyMtmFromMysqlKey(s) {
  if (!s || s === "NO_EXIST") return null;
  if (["ACTIVE", "ACTIVATED", "PUBLISHED", "APPROVED"].some((k) => s.includes(k))) return "Activa";
  if (["CLOSED", "FINISHED", "CANCEL", "EXPIRED", "INACTIVE"].some((k) => s.includes(k))) return "Inactiva";
  return null;
}

/**
 * @param {string|null|undefined} raw
 * @param {{ nullable?: boolean }} opts
 */
export function mapMysqlChangeStatusOpportunityToPracticeEstado(raw, opts = {}) {
  const nullable = !!opts.nullable;
  const n = norm(raw);
  if (nullable && (!n || normKey(raw) === "NO_EXIST")) return null;

  const labeled = passThroughIfMongoLabel(raw, OPPORTUNITY_PRACTICE_ESTADOS);
  if (labeled !== undefined) return labeled;

  const k = normKey(raw);
  const direct = MYSQL_OPPORTUNITY_ROW_TO_PRACTICE_MONGO[k];
  if (direct) return direct;

  const fuzzy = fuzzyPracticeFromMysqlKey(k);
  if (fuzzy && OPPORTUNITY_PRACTICE_ESTADOS.includes(fuzzy)) return fuzzy;

  return nullable ? null : DEFAULT_OPPORTUNITY_PRACTICE_ESTADO;
}

export function mapMysqlOpportunityTableStatusToPracticeEstado(raw) {
  const v = mapMysqlChangeStatusOpportunityToPracticeEstado(raw, { nullable: false });
  return v || DEFAULT_OPPORTUNITY_PRACTICE_ESTADO;
}

export function mapMysqlChangeStatusOpportunityToMtmEstado(raw, opts = {}) {
  const nullable = !!opts.nullable;
  const n = norm(raw);
  if (nullable && (!n || normKey(raw) === "NO_EXIST")) return null;

  const labeled = passThroughIfMongoLabel(raw, OPORTUNIDAD_MTM_ESTADOS);
  if (labeled !== undefined) return labeled;

  const k = normKey(raw);
  const direct = MYSQL_OPPORTUNITY_ROW_TO_MTM_MONGO[k];
  if (direct) return direct;

  const fuzzy = fuzzyMtmFromMysqlKey(k);
  if (fuzzy && OPORTUNIDAD_MTM_ESTADOS.includes(fuzzy)) return fuzzy;

  return nullable ? null : DEFAULT_OPORTUNIDAD_MTM_ESTADO;
}

export function mapMysqlOpportunityTableStatusToMtmEstado(raw) {
  const v = mapMysqlChangeStatusOpportunityToMtmEstado(raw, { nullable: false });
  return v || DEFAULT_OPORTUNIDAD_MTM_ESTADO;
}

function mysqlRowBool(v) {
  if (v == null) return false;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (Buffer.isBuffer(v)) return v[0] === 1;
  const s = String(v).toLowerCase();
  return s === "1" || s === "true";
}

/** `opportunity_application` (no es change_status; mismo archivo de migración). */
export function mapMysqlOpportunityApplicationToPostulacionEstado(row) {
  let r = "aplicado";
  if (mysqlRowBool(row?.contracted)) r = "aceptado_estudiante";
  else {
    const s = String(row?.status || "").toUpperCase();
    if (s.includes("REJECT")) r = "rechazado";
    else if (s.includes("SELECT")) r = "seleccionado_empresa";
    else if (mysqlRowBool(row?.downloaded)) r = "empresa_descargo_hv";
    else if (mysqlRowBool(row?.viewed) || mysqlRowBool(row?.revisedCompany)) r = "empresa_consulto_perfil";
  }
  return POSTULACION_ESTADOS.includes(r) ? r : DEFAULT_POSTULACION_ESTADO;
}

/**
 * `change_status_legalized` y `change_status_monitoring_legalized`: columnas status_legalized_before/after.
 */
const MYSQL_LEGALIZED_STATUS_TO_MONGO = Object.freeze({
  DRAFT: "borrador",
  BORRADOR: "borrador",
  IN_REVIEW: "en_revision",
  REVIEW: "en_revision",
  EN_REVISION: "en_revision",
  PENDING_REVIEW: "en_revision",
  APPROVED: "aprobada",
  APROBADA: "aprobada",
  LEGALIZED: "aprobada",
  REJECTED: "rechazada",
  RECHAZADA: "rechazada",
  CANCELLED: "rechazada",
  CANCELED: "rechazada",
  ADJUSTMENT: "en_ajuste",
  IN_ADJUSTMENT: "en_ajuste",
  EN_AJUSTE: "en_ajuste",
});

function fuzzyLegalizacionFromUpper(s) {
  if (s.includes("APPROV")) return "aprobada";
  if (s.includes("REJECT")) return "rechazada";
  if (s.includes("CANCEL")) return "rechazada";
  if (s.includes("ADJUST")) return "en_ajuste";
  if (s.includes("REVIEW")) return "en_revision";
  return "borrador";
}

export function mapMysqlChangeStatusLegalizedToLegalizacionEstado(raw) {
  const labeled = passThroughIfMongoLabel(raw, LEGALIZACION_ESTADOS);
  if (labeled !== undefined) return labeled;

  const k = normKey(raw);
  if (!k) return DEFAULT_LEGALIZACION_ESTADO;
  const direct = MYSQL_LEGALIZED_STATUS_TO_MONGO[k];
  if (direct && LEGALIZACION_ESTADOS.includes(direct)) return direct;

  const fuzzy = fuzzyLegalizacionFromUpper(k);
  return LEGALIZACION_ESTADOS.includes(fuzzy) ? fuzzy : DEFAULT_LEGALIZACION_ESTADO;
}

/** Misma semántica que práctica; tabla distinta en MySQL (monitoring). */
export function mapMysqlChangeStatusMonitoringLegalizedToLegalizacionEstado(raw) {
  return mapMysqlChangeStatusLegalizedToLegalizacionEstado(raw);
}

/**
 * `monitoring_plan.status` → `PlanDeTrabajoMTM.estado`.
 */
const MYSQL_MONITORING_PLAN_STATUS_TO_MONGO = Object.freeze({
  DRAFT: "borrador",
  BORRADOR: "borrador",
  IN_REVIEW: "enviado_revision",
  REVIEW: "enviado_revision",
  PENDING_REVIEW: "enviado_revision",
  SENT_REVIEW: "enviado_revision",
  APPROVED: "aprobado",
  APROBADO: "aprobado",
  REJECTED: "rechazado",
  RECHAZADO: "rechazado",
});

function fuzzyPlanTrabajoMtmFromUpper(s) {
  if (s.includes("APPROV")) return "aprobado";
  if (s.includes("REJECT")) return "rechazado";
  if (s.includes("REVIEW")) return "enviado_revision";
  return "borrador";
}

export function mapMysqlMonitoringPlanStatusToPlanTrabajoMtmEstado(raw) {
  const labeled = passThroughIfMongoLabel(raw, PLAN_TRABAJO_MTM_ESTADOS);
  if (labeled !== undefined) return labeled;

  const k = normKey(raw);
  if (!k) return DEFAULT_PLAN_TRABAJO_MTM_ESTADO;
  const direct = MYSQL_MONITORING_PLAN_STATUS_TO_MONGO[k];
  if (direct && PLAN_TRABAJO_MTM_ESTADOS.includes(direct)) return direct;

  const fuzzy = fuzzyPlanTrabajoMtmFromUpper(k);
  return PLAN_TRABAJO_MTM_ESTADOS.includes(fuzzy) ? fuzzy : DEFAULT_PLAN_TRABAJO_MTM_ESTADO;
}

/**
 * `approval_monitoring_documents.approval_document_status_*` → estado documento en Mixed legalización MTM.
 */
const MYSQL_APPROVAL_DOC_STATUS_TO_MONGO = Object.freeze({
  PENDING: "pendiente",
  PENDIENTE: "pendiente",
  APPROVED: "aprobado",
  APROBADO: "aprobado",
  REJECTED: "rechazado",
  RECHAZADO: "rechazado",
});

/**
 * Documentos en legalización (Mixed): `document_practice` / `document_monitoring` / `approval_monitoring_documents`.
 */
export function mapMysqlLegalizacionDocumentoEstado(raw) {
  const labeled = passThroughIfMongoLabel(raw, DOC_ESTADO_DOCUMENTO);
  if (labeled !== undefined) return labeled;

  const k = normKey(raw);
  if (!k) return DEFAULT_DOC_ESTADO_DOCUMENTO;
  const direct = MYSQL_APPROVAL_DOC_STATUS_TO_MONGO[k];
  if (direct && DOC_ESTADO_DOCUMENTO.includes(direct)) return direct;

  const s = k;
  if (s.includes("APPROV")) return "aprobado";
  if (s.includes("REJECT")) return "rechazado";
  return DEFAULT_DOC_ESTADO_DOCUMENTO;
}

export { DEFAULT_SEGUIMIENTO_MTM_ESTADO as defaultEstadoSeguimientoMtmNuevo };
